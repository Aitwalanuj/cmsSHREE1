'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

let getStore = null;
let connectLambda = null;
try {
  ({ getStore, connectLambda } = require('@netlify/blobs'));
} catch (error) {
  getStore = null;
  connectLambda = null;
}


let FILE_CONFIG = {};
try {
  // Git-based fallback token. Keep this file inside netlify/functions so it is
  // bundled with the function and is not published as a public browser file.
  FILE_CONFIG = require('./cms-config.json');
} catch (error) {
  FILE_CONFIG = {};
}

function expectedAdminToken() {
  return process.env.CMS_ADMIN_TOKEN || FILE_CONFIG.admin_token || 'change-this-admin-token';
}

const DATA_KEY = 'content';
const IMAGE_PREFIX = 'image:';
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const FALLBACK_DIR = path.join(os.tmpdir(), 'luxe-boutique-cms');
const FALLBACK_DATA = path.join(FALLBACK_DIR, 'content.json');
const FALLBACK_IMAGES = path.join(FALLBACK_DIR, 'images');

const DEFAULT_DATA = {
  version: 2,
  updated_at: new Date().toISOString(),
  settings: {
    site_name: 'SHREE',
    topbar_text: 'New boutique catalogue: browse categories, inquire online, Instagram, or WhatsApp us directly.',
    hero_title: 'Boutique Styles, Curated by Category',
    hero_text: 'Upload your own high-quality products and gallery images from the CMS. The website updates from the CMS after saving.',
    hero_image: '',
    whatsapp_number: '9779868800001',
    instagram_url: '',
    default_message: 'Hello, I want to inquire about your boutique products.',
    contact_heading: 'Contact SHREE',
    contact_text: 'Use the inquiry form, Instagram, or WhatsApp for direct messages.',
    fonts: {
      body: 'Poppins, Arial, sans-serif',
      heading: 'Playfair Display, Georgia, serif',
      nav: 'Poppins, Arial, sans-serif',
      button: 'Poppins, Arial, sans-serif',
      body_size: '16px',
      heading_weight: '700'
    }
  },
  categories: [
    { id: 'cat_new', name: 'New Arrivals', slug: 'new-arrivals', description: 'Latest boutique additions.', image: '', hidden: false, sort_order: 1 },
    { id: 'cat_dresses', name: 'Dresses', slug: 'dresses', description: 'Boutique dresses for day and evening.', image: '', hidden: false, sort_order: 2 },
    { id: 'cat_kurtis', name: 'Kurtis', slug: 'kurtis', description: 'Kurtis and kurti sets.', image: '', hidden: false, sort_order: 3 },
    { id: 'cat_sarees', name: 'Sarees', slug: 'sarees', description: 'Festive and party sarees.', image: '', hidden: false, sort_order: 4 },
    { id: 'cat_tops', name: 'Tops', slug: 'tops', description: 'Everyday and statement tops.', image: '', hidden: false, sort_order: 5 },
    { id: 'cat_coord', name: 'Co-ord Sets', slug: 'co-ord-sets', description: 'Matching two-piece sets.', image: '', hidden: false, sort_order: 6 }
  ],
  products: [
    { id: 'prod_001', title: 'Sample Product - Replace From CMS', slug: 'sample-product', excerpt: 'Edit or delete this sample product from the CMS.', content: 'Use the CMS product form to add price, discount, sizes, colors, main image, and multiple gallery images. The website will update from saved CMS data.', price: '', compare_price: '', discount_label: '', discount_percent: '', sku: '', fabric: '', sizes: ['S', 'M', 'L', 'XL'], colors: [{ name: 'Black', hex: '#111111' }, { name: 'White', hex: '#ffffff' }], stock_qty: 0, stock_status: 'instock', stock_label: 'In Stock', image: '', gallery: [], category_slugs: ['new-arrivals'], featured: false, new_arrival: true, hidden: true, sort_order: 1 }
  ],
  blogs: [],
  inquiries: []
};

function response(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
      'x-content-type-options': 'nosniff',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'Content-Type, Authorization, X-Cms-Token, X-Luxe-Token',
      ...headers
    },
    body: JSON.stringify(body)
  };
}

function text(value, max = 5000) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]+/g, '').trim().slice(0, max);
}

function slugify(value) {
  return text(value, 160).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `item-${Date.now().toString(36)}`;
}

function bool(value) {
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'on';
}

function safeTokenCompare(provided, expected) {
  if (!provided || !expected) return false;
  const a = crypto.createHash('sha256').update(String(provided)).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function tokenFromEvent(event) {
  const headers = event.headers || {};
  const auth = headers.authorization || headers.Authorization || '';
  if (/^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
  return (
    headers['x-cms-token'] || headers['X-Cms-Token'] ||
    headers['x-luxe-token'] || headers['X-Luxe-Token'] ||
    (event.queryStringParameters || {}).token || ''
  ).trim();
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(String(value || ''), 'base64url').toString('utf8');
}

function sessionSecret() {
  return (
    process.env.CMS_SESSION_SECRET ||
    process.env.CMS_ADMIN_TOKEN ||
    FILE_CONFIG.admin_token ||
    process.env.SITE_ID ||
    'luxe-boutique-cms-session-secret'
  );
}

function signSession(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', sessionSecret())
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifySession(token) {
  try {
    const [header, payload, signature] = String(token || '').split('.');
    if (!header || !payload || !signature) return null;
    const expectedSignature = crypto
      .createHmac('sha256', sessionSecret())
      .update(`${header}.${payload}`)
      .digest('base64url');
    const a = Buffer.from(signature);
    const b = Buffer.from(expectedSignature);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const data = JSON.parse(base64UrlDecode(payload));
    if (data.type !== 'luxe-cms-session') return null;
    if (!data.exp || Number(data.exp) < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch (error) {
    return null;
  }
}

function createSession(authData) {
  const now = Math.floor(Date.now() / 1000);
  const ttl = Number(process.env.CMS_SESSION_TTL_SECONDS || FILE_CONFIG.session_ttl_seconds || 7 * 24 * 60 * 60);
  const payload = {
    type: 'luxe-cms-session',
    auth: authData.auth || 'cms',
    login: authData.login || 'admin',
    name: authData.name || '',
    iat: now,
    exp: now + Math.max(300, ttl)
  };
  return { token: signSession(payload), payload };
}

function parseList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function githubConfig() {
  const github = FILE_CONFIG.github || {};
  return {
    allowedUsers: parseList(process.env.GITHUB_ALLOWED_USERS || github.allowed_users || FILE_CONFIG.github_allowed_users),
    // Repo checking is OFF by default because many fine-grained GitHub tokens
    // are valid but intentionally have no repository write permissions. This
    // CMS uses GitHub only as a one-time login verifier; it does not need repo
    // access to edit CMS content.
    requireRepoAccess: bool(process.env.GITHUB_REQUIRE_REPO_ACCESS || github.require_repo_access || FILE_CONFIG.github_require_repo_access),
    repo: text(process.env.GITHUB_REPO_FULL_NAME || process.env.GITHUB_REPOSITORY || github.repo || FILE_CONFIG.github_repo_full_name || FILE_CONFIG.github_repo, 180)
  };
}

async function githubRequest(apiPath, token) {
  const https = require('https');
  const pathName = String(apiPath || '/user').startsWith('/') ? apiPath : `/${apiPath}`;
  const options = {
    hostname: 'api.github.com',
    path: pathName,
    method: 'GET',
    headers: {
      'accept': 'application/vnd.github+json',
      'authorization': `Bearer ${token}`,
      'user-agent': 'luxe-boutique-cms-netlify',
      'x-github-api-version': '2022-11-28'
    }
  };

  return await new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        let json = {};
        try { json = raw ? JSON.parse(raw) : {}; } catch (error) { json = {}; }
        resolve({ status: res.statusCode || 0, json });
      });
    });
    req.setTimeout(10000, () => req.destroy(new Error('GitHub token check timed out.')));
    req.on('error', reject);
    req.end();
  });
}

async function validateGithubToken(token) {
  if (!token || token.length < 20) {
    throw new Error('Paste a valid GitHub personal access token.');
  }

  const cfg = githubConfig();
  let userResult = null;
  let login = 'github-user';
  let userPayload = {};

  // Best case: /user returns the GitHub username. Some fine-grained tokens
  // without profile/account permissions can be valid but still fail /user, so
  // v6 also falls back to /rate_limit to verify the token itself.
  userResult = await githubRequest('/user', token);
  if (userResult.status >= 200 && userResult.status < 300 && userResult.json.login) {
    userPayload = userResult.json || {};
    login = String(userPayload.login || 'github-user');
  } else {
    const rateResult = await githubRequest('/rate_limit', token);
    if (rateResult.status < 200 || rateResult.status >= 300) {
      const message = userResult?.json?.message || rateResult?.json?.message || 'Bad credentials';
      throw new Error(`GitHub token rejected: ${message}. Generate a new token and paste the full token.`);
    }
    // Token is valid, but GitHub did not expose profile information for this
    // fine-grained token. Accept it because the user asked for GitHub Developer
    // tokens to work as one-time CMS login tokens.
    login = 'github-token';
    userPayload = {};
  }

  if (cfg.allowedUsers.length) {
    if (login === 'github-token') {
      throw new Error('This token is valid, but GitHub did not expose the username. Remove GITHUB_ALLOWED_USERS or create a token with profile/user read permission.');
    }
    const allowed = cfg.allowedUsers.map((item) => item.toLowerCase());
    if (!allowed.includes(login.toLowerCase())) {
      throw new Error(`GitHub user ${login} is not allowed to access this CMS.`);
    }
  }

  if (cfg.requireRepoAccess && cfg.repo) {
    const repoResult = await githubRequest(`/repos/${cfg.repo}`, token);
    if (repoResult.status < 200 || repoResult.status >= 300) {
      throw new Error(`This GitHub token cannot access repository ${cfg.repo}.`);
    }
  }

  return {
    login,
    name: userPayload.name || '',
    id: userPayload.id || '',
    avatar_url: userPayload.avatar_url || ''
  };
}

function isAdmin(event) {
  const provided = tokenFromEvent(event);
  if (verifySession(provided)) return true;
  return safeTokenCompare(provided, expectedAdminToken());
}

function endpointFromEvent(event) {
  const qsEndpoint = (event.queryStringParameters || {}).endpoint;
  if (qsEndpoint) return String(qsEndpoint).replace(/^\/+/, '');
  const rawPath = String(event.path || '').replace(/\/+$/, '');
  const pieces = [
    '/.netlify/functions/cms-api/',
    '/api/'
  ];
  for (const marker of pieces) {
    const index = rawPath.indexOf(marker);
    if (index !== -1) return rawPath.slice(index + marker.length).replace(/^\/+/, '');
  }
  return '';
}

function baseUrl(event) {
  const headers = event.headers || {};
  const proto = headers['x-forwarded-proto'] || headers['X-Forwarded-Proto'] || 'https';
  const host = headers.host || headers.Host || '';
  return host ? `${proto}://${host}` : '';
}

function parseJson(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  try { return JSON.parse(raw); } catch (error) { return {}; }
}

async function store() {
  if (!getStore) return null;
  try {
    return getStore('luxe-boutique-cms');
  } catch (error) {
    // If Netlify Blobs is not available, use temporary filesystem fallback
    // instead of crashing the CMS. On real Netlify Functions, connectLambda()
    // prepares the Blobs context before this function is called.
    if (/environment has not been configured|MissingBlobsEnvironmentError/i.test(error.message || '')) {
      return null;
    }
    throw error;
  }
}

function mergeData(data) {
  const out = { ...DEFAULT_DATA, ...(data && typeof data === 'object' ? data : {}) };
  out.settings = { ...DEFAULT_DATA.settings, ...(out.settings || {}) };
  out.settings.fonts = { ...DEFAULT_DATA.settings.fonts, ...((out.settings && out.settings.fonts) || {}) };
  out.categories = Array.isArray(out.categories) ? out.categories : [];
  out.products = Array.isArray(out.products) ? out.products : [];
  out.blogs = Array.isArray(out.blogs) ? out.blogs : [];
  out.inquiries = Array.isArray(out.inquiries) ? out.inquiries : [];
  return out;
}

async function loadData() {
  const s = await store();
  if (s) {
    const data = await s.get(DATA_KEY, { type: 'json' }).catch(() => null);
    if (data) return mergeData(data);
    await s.setJSON(DATA_KEY, DEFAULT_DATA);
    return mergeData(DEFAULT_DATA);
  }
  fs.mkdirSync(FALLBACK_DIR, { recursive: true });
  if (!fs.existsSync(FALLBACK_DATA)) {
    fs.writeFileSync(FALLBACK_DATA, JSON.stringify(DEFAULT_DATA, null, 2));
  }
  return mergeData(JSON.parse(fs.readFileSync(FALLBACK_DATA, 'utf8')));
}

async function saveData(data) {
  const saved = mergeData(data);
  saved.version = 2;
  saved.updated_at = new Date().toISOString();
  const s = await store();
  if (s) {
    await s.setJSON(DATA_KEY, saved);
  } else {
    fs.mkdirSync(FALLBACK_DIR, { recursive: true });
    fs.writeFileSync(FALLBACK_DATA, JSON.stringify(saved, null, 2));
  }
  return saved;
}

function visible(items, includeHidden = false) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => includeHidden || !item.hidden)
    .sort((a, b) => Number(a.sort_order || 999) - Number(b.sort_order || 999));
}

function publicCategory(category, data, includeHidden = false) {
  const slug = category.slug;
  const count = visible(data.products, includeHidden).filter((product) => (product.category_slugs || []).includes(slug)).length;
  return { ...category, count };
}

function publicProduct(product, data) {
  const categories = (product.category_slugs || [])
    .map((slug) => data.categories.find((category) => category.slug === slug && !category.hidden))
    .filter(Boolean)
    .map((category) => ({ name: category.name, slug: category.slug }));
  return { ...product, categories };
}


function sanitizeInquiry(body) {
  const now = new Date().toISOString();
  return {
    id: `inq_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`,
    created_at: now,
    status: 'new',
    name: text(body.name, 160),
    phone: text(body.phone, 80),
    email: text(body.email, 180),
    product_slug: (body.product_slug || body.product) ? slugify(body.product_slug || body.product) : '',
    product_title: text(body.product_title || body.product || '', 240),
    size: text(body.size, 80),
    color: text(body.color, 120),
    message: text(body.message, 2500),
    source: text(body.source || 'website', 80)
  };
}

function safeFilename(filename) {
  const ext = path.extname(filename || '').toLowerCase().replace(/[^.a-z0-9]/g, '');
  const allowed = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp', '.svg']);
  const cleanBase = path.basename(filename || 'image', ext).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'image';
  return `${cleanBase}${allowed.has(ext) ? ext : '.img'}`;
}

function validateImageUpload(body) {
  const filename = safeFilename(body.filename || 'image');
  const contentType = text(body.content_type || 'application/octet-stream', 120).toLowerCase();
  const buffer = Buffer.from(String(body.base64 || ''), 'base64');

  if (!buffer.length) throw new Error('No image data received.');
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error('Image is too large. Maximum size is 25 MB.');

  const ext = path.extname(filename).toLowerCase();
  const allowedExt = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp', '.svg', '.img']);
  const allowedMime = contentType.startsWith('image/') || contentType === 'application/octet-stream';
  if (!allowedExt.has(ext) || !allowedMime) throw new Error('Unsupported image type.');

  if (ext === '.svg' || contentType === 'image/svg+xml') {
    const svg = buffer.toString('utf8').toLowerCase();
    if (/<script|on\w+\s*=|javascript:|<foreignobject/.test(svg)) {
      throw new Error('Unsafe SVG rejected. Remove scripts/events and upload again.');
    }
  }

  return { filename, contentType: contentType === 'application/octet-stream' ? 'image/*' : contentType, buffer };
}

async function saveImage(key, payload) {
  const s = await store();
  const value = { content_type: payload.contentType, base64: payload.buffer.toString('base64'), filename: payload.filename };
  if (s) {
    await s.setJSON(`${IMAGE_PREFIX}${key}`, value);
  } else {
    const file = path.join(FALLBACK_IMAGES, encodeURIComponent(key) + '.json');
    fs.mkdirSync(FALLBACK_IMAGES, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value));
  }
}

async function readImage(key) {
  const s = await store();
  if (s) return await s.get(`${IMAGE_PREFIX}${key}`, { type: 'json' }).catch(() => null);
  const file = path.join(FALLBACK_IMAGES, encodeURIComponent(key) + '.json');
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function deleteImage(key) {
  const s = await store();
  if (s) {
    await s.delete(`${IMAGE_PREFIX}${key}`);
  } else {
    const file = path.join(FALLBACK_IMAGES, encodeURIComponent(key) + '.json');
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}

function imageKeyFromUrl(url) {
  try {
    const parsed = new URL(url, 'https://example.com');
    const match = parsed.pathname.match(/\/api\/image\/(.+)$/);
    return match ? decodeURIComponent(match[1]) : '';
  } catch (error) {
    return '';
  }
}

exports.handler = async function handler(event) {
  // Required by @netlify/blobs when the function is executed in Netlify's
  // Lambda-compatible runtime. Without this, getStore() can throw:
  // 'The environment has not been configured to use Netlify Blobs'.
  if (typeof connectLambda === 'function') {
    try { connectLambda(event); } catch (error) { /* fallback storage will handle it */ }
  }

  const method = event.httpMethod || 'GET';
  const endpoint = endpointFromEvent(event);
  const [root, second, ...rest] = endpoint.split('/').filter(Boolean);

  if (method === 'OPTIONS') return response(200, { ok: true });

  try {
    if (!root || root === 'health') {
      return response(200, { ok: true, time: new Date().toISOString(), auth: 'cms-session-or-github-token-login-v6' });
    }

    if (root === 'auth' && second === 'login' && method === 'POST') {
      const body = parseJson(event);
      const token = text(body.token || '', 500);
      const provider = text(body.provider || 'github', 40).toLowerCase();

      if (!token) return response(400, { ok: false, message: 'Token is required.' });

      // Legacy CMS token still works, but the browser receives a short CMS
      // session instead of storing the raw admin token.
      if (safeTokenCompare(token, expectedAdminToken())) {
        const session = createSession({ auth: 'cms-token', login: 'admin' });
        return response(200, {
          ok: true,
          session_token: session.token,
          expires_at: new Date(session.payload.exp * 1000).toISOString(),
          user: { login: 'admin', provider: 'cms-token' }
        });
      }

      if (provider === 'github') {
        const githubUser = await validateGithubToken(token);
        const session = createSession({ auth: 'github', login: githubUser.login, name: githubUser.name });
        return response(200, {
          ok: true,
          session_token: session.token,
          expires_at: new Date(session.payload.exp * 1000).toISOString(),
          user: { ...githubUser, provider: 'github' }
        });
      }

      return response(400, { ok: false, message: 'Unsupported login provider.' });
    }

    if (root === 'image' && method === 'GET') {
      const key = decodeURIComponent([second, ...rest].filter(Boolean).join('/'));
      const image = await readImage(key);
      if (!image) return response(404, { ok: false, message: 'Image not found.' });
      return {
        statusCode: 200,
        isBase64Encoded: true,
        headers: {
          'content-type': image.content_type || 'image/jpeg',
          'cache-control': 'public, max-age=31536000, immutable',
          'x-content-type-options': 'nosniff'
        },
        body: image.base64
      };
    }

    if (root === 'admin') {
      if (!isAdmin(event)) return response(401, { ok: false, message: 'Invalid admin token.' });

      if (second === 'data' && method === 'GET') {
        return response(200, { ok: true, data: await loadData() });
      }

      if (second === 'save' && method === 'POST') {
        const body = parseJson(event);
        const saved = await saveData(body.data || body);
        return response(200, { ok: true, data: saved, message: 'Saved successfully.' });
      }

      if (second === 'upload' && method === 'POST') {
        const body = parseJson(event);
        const payload = validateImageUpload(body);
        const date = new Date().toISOString().slice(0, 10);
        const key = `uploads/${date}/${crypto.randomUUID()}-${payload.filename}`;
        await saveImage(key, payload);
        const url = `${baseUrl(event)}/api/image/${encodeURIComponent(key)}`;
        return response(200, { ok: true, image: { key, url, filename: payload.filename, content_type: payload.contentType, size: payload.buffer.length } });
      }

      if (second === 'delete-image' && method === 'POST') {
        const body = parseJson(event);
        const key = imageKeyFromUrl(body.url || '');
        if (!key) return response(400, { ok: false, message: 'Only CMS-uploaded Netlify images can be deleted.' });
        await deleteImage(key);
        return response(200, { ok: true, message: 'Image deleted from CMS storage.' });
      }

      return response(404, { ok: false, message: 'Admin endpoint not found.' });
    }

    const data = await loadData();
    const includeHidden = false;

    if (root === 'settings' && method === 'GET') return response(200, data.settings);

    if (root === 'banners' && method === 'GET') {
      return response(200, [{ title: data.settings.hero_title, text: data.settings.hero_text, image: data.settings.hero_image }]);
    }

    if (root === 'categories' && method === 'GET') {
      return response(200, visible(data.categories, includeHidden).map((category) => publicCategory(category, data, includeHidden)));
    }

    if ((root === 'products' || root === 'product') && method === 'GET') {
      const qs = event.queryStringParameters || {};
      let products = visible(data.products, includeHidden);
      const requestedSlug = second ? slugify(second) : '';
      if (requestedSlug) {
        const product = products.find((item) => item.slug === requestedSlug);
        if (!product) return response(404, { ok: false, message: 'Product not found.' });
        return response(200, publicProduct(product, data));
      }
      if (qs.category) products = products.filter((product) => (product.category_slugs || []).includes(slugify(qs.category)));
      if (qs.featured) products = products.filter((product) => product.featured);
      if (qs.new) products = products.filter((product) => product.new_arrival);
      if (qs.q) {
        const query = text(qs.q, 120).toLowerCase();
        products = products.filter((product) => [product.title, product.excerpt, product.content, product.sku, product.fabric].some((value) => String(value || '').toLowerCase().includes(query)));
      }
      return response(200, products.map((product) => publicProduct(product, data)));
    }

    if (root === 'inquiries' && method === 'POST') {
      const body = parseJson(event);
      const inquiry = sanitizeInquiry(body);
      if (!inquiry.name || !inquiry.phone || !inquiry.message) return response(422, { ok: false, message: 'Name, phone, and message are required.' });
      const current = await loadData();
      current.inquiries = Array.isArray(current.inquiries) ? current.inquiries : [];
      current.inquiries.unshift(inquiry);
      await saveData(current);
      return response(200, { ok: true, inquiry: { id: inquiry.id, created_at: inquiry.created_at }, message: 'Inquiry saved in CMS.' });
    }

    if (root === 'blogs' && method === 'GET') return response(200, visible(data.blogs, includeHidden));

    if (root === 'home' && method === 'GET') {
      const categories = visible(data.categories).map((category) => publicCategory(category, data));
      const products = visible(data.products).map((product) => publicProduct(product, data));
      return response(200, {
        ok: true,
        settings: data.settings,
        categories,
        featured: products.filter((product) => product.featured).slice(0, 8),
        new_arrivals: products.filter((product) => product.new_arrival).slice(0, 8),
        blogs: visible(data.blogs).slice(0, 6)
      });
    }

    return response(404, { ok: false, message: 'Endpoint not found.' });
  } catch (error) {
    return response(500, { ok: false, message: error.message || 'CMS API error.' });
  }
};
