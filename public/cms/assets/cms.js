(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const csrf = $('meta[name="csrf-token"]')?.content || '';
  const staticLogin = window.LUXE_CMS_STATIC_LOGIN === true;
  const tokenStorageKey = 'luxe_cms_session_token';
  let adminToken = staticLogin ? (localStorage.getItem(tokenStorageKey) || '') : '';
  let state = { settings: {}, categories: [], products: [], blogs: [], inquiries: [] };
  let activeTab = 'dashboard';

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const id = (prefix) => `${prefix}_${Math.random().toString(16).slice(2)}${Date.now().toString(16).slice(-4)}`;
  const slugify = (value) => String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `item-${Date.now().toString(36)}`;

  function endpointUrl(endpoint) {
    const cleanEndpoint = String(endpoint || '').replace(/^\/+/, '');
    if (window.LUXE_CMS_API_BASE) return `${String(window.LUXE_CMS_API_BASE).replace(/\/+$/, '')}/${cleanEndpoint}`;
    const url = new URL('api.php', window.location.href);
    url.searchParams.set('endpoint', cleanEndpoint);
    return url.toString();
  }

  async function api(endpoint, options = {}) {
    const opts = { ...options };
    opts.headers = opts.headers || {};
    if (!(opts.body instanceof FormData)) opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/json';
    if (csrf) opts.headers['X-CSRF-Token'] = csrf;
    if (staticLogin && adminToken) opts.headers.Authorization = `Bearer ${adminToken}`;
    const res = await fetch(endpointUrl(endpoint), opts);
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false) throw new Error(json.message || `Request failed: ${res.status}`);
    return json;
  }

  function notice(message, error = false) {
    const box = $('#notice');
    if (!box) return;
    box.hidden = false;
    box.textContent = message;
    box.classList.toggle('error', !!error);
    clearTimeout(notice._timer);
    notice._timer = setTimeout(() => { box.hidden = true; }, 5200);
  }

  function getPath(path) {
    return String(path).split('.').reduce((obj, key) => obj ? obj[key] : undefined, state);
  }

  function setPath(path, value) {
    const parts = String(path).split('.');
    let obj = state;
    parts.slice(0, -1).forEach(key => {
      if (obj[key] === undefined) obj[key] = /^\d+$/.test(key) ? [] : {};
      obj = obj[key];
    });
    obj[parts[parts.length - 1]] = value;
  }

  function input(label, path, opts = {}) {
    const type = opts.type || 'text';
    const cls = opts.full ? 'field full' : 'field';
    const value = getPath(path) ?? '';
    const attrs = [
      opts.placeholder ? `placeholder="${esc(opts.placeholder)}"` : '',
      opts.min !== undefined ? `min="${esc(opts.min)}"` : '',
      opts.max !== undefined ? `max="${esc(opts.max)}"` : ''
    ].filter(Boolean).join(' ');
    if (opts.kind === 'textarea') {
      return `<label class="${cls}">${esc(label)}<textarea data-path="${esc(path)}" ${attrs}>${esc(value)}</textarea></label>`;
    }
    if (opts.kind === 'select') {
      return `<label class="${cls}">${esc(label)}<select data-path="${esc(path)}">${opts.options.map(o => `<option value="${esc(o.value)}" ${String(value) === String(o.value) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>`;
    }
    return `<label class="${cls}">${esc(label)}<input type="${esc(type)}" data-path="${esc(path)}" value="${esc(value)}" ${attrs}></label>`;
  }

  function checkbox(label, path) {
    return `<label class="check"><input type="checkbox" data-path="${esc(path)}" ${getPath(path) ? 'checked' : ''}> ${esc(label)}</label>`;
  }

  function imagePreview(value) {
    return value ? `<div class="image-preview"><img src="${esc(value)}" onerror="this.parentElement.classList.add('broken')" alt=""><span>Preview</span></div>` : `<div class="image-preview empty-preview"><span>No image selected</span></div>`;
  }

  function imageTools(path, label = 'Image URL') {
    const value = getPath(path) || '';
    return `<div class="field full image-field"><label>${esc(label)}</label>${imagePreview(value)}<div class="image-tools"><input type="text" data-path="${esc(path)}" value="${esc(value)}" placeholder="Upload high-quality image or paste image URL"><label class="upload-mini">Upload<input type="file" data-upload-path="${esc(path)}" accept="image/*,.svg,.avif,.webp,.bmp,.gif"></label><button type="button" class="ghost small" data-delete-upload="${esc(path)}">Delete file</button><button type="button" class="ghost small" data-clear-path="${esc(path)}">Clear</button></div>${value ? `<p><a class="preview-link" href="${esc(value)}" target="_blank" rel="noopener">Open full image</a></p>` : ''}</div>`;
  }

  function render() {
    renderDashboard();
    renderSettings();
    renderCategories();
    renderProducts();
    renderBlogs();
    renderInquiries();
    renderImages();
  }

  function renderDashboard() {
    $('#statCategories').textContent = state.categories.length;
    $('#statProducts').textContent = state.products.length;
    $('#statBlogs').textContent = state.blogs.length;
    $('#statInquiries').textContent = state.inquiries.length;
    const hidden = [...state.categories, ...state.products, ...state.blogs].filter(item => item.hidden).length;
    $('#statHidden').textContent = hidden;
  }

  function renderSettings() {
    if (!state.settings) state.settings = {};
    if (!state.settings.fonts) state.settings.fonts = {};
    $('#settingsForm').innerHTML = [
      input('Site / brand name', 'settings.site_name'),
      input('WhatsApp number', 'settings.whatsapp_number', { placeholder: '9779868800001' }),
      input('Instagram URL', 'settings.instagram_url', { placeholder: 'https://www.instagram.com/your-page' }),
      input('Top bar text', 'settings.topbar_text', { full: true }),
      input('Default WhatsApp message', 'settings.default_message', { full: true, kind: 'textarea' }),
      input('Homepage hero title', 'settings.hero_title'),
      input('Homepage hero text', 'settings.hero_text', { kind: 'textarea' }),
      imageTools('settings.hero_image', 'Homepage hero image'),
      input('Contact page heading', 'settings.contact_heading'),
      input('Contact page text', 'settings.contact_text', { kind: 'textarea' }),
      input('Body font family', 'settings.fonts.body', { placeholder: 'Poppins, Arial, sans-serif' }),
      input('Heading font family', 'settings.fonts.heading', { placeholder: 'Playfair Display, Georgia, serif' }),
      input('Navigation font family', 'settings.fonts.nav'),
      input('Button font family', 'settings.fonts.button'),
      input('Body font size', 'settings.fonts.body_size', { placeholder: '16px' }),
      input('Heading weight', 'settings.fonts.heading_weight', { placeholder: '700' })
    ].join('');
  }

  function renderCategories() {
    const list = $('#categoryList');
    if (!state.categories.length) {
      list.innerHTML = '<div class="empty">No categories yet. Click Add Category.</div>';
      return;
    }
    list.innerHTML = state.categories.map((cat, i) => `
      <article class="item-card">
        <div class="item-head">
          <div class="item-title">${cat.image ? `<img class="thumb" src="${esc(cat.image)}" onerror="this.style.visibility='hidden'" alt="">` : '<div class="thumb no-thumb">No image</div>'}<div><h3>${esc(cat.name || 'Category')}</h3><span class="status-dot ${cat.hidden ? 'hidden' : ''}">${cat.hidden ? 'Hidden from website' : 'Visible on website'}</span></div></div>
          <div class="actions"><button class="ghost small" data-move="categories.${i}.-1">Up</button><button class="ghost small" data-move="categories.${i}.1">Down</button><button class="danger small" data-remove="categories.${i}">Delete</button></div>
        </div>
        <div class="row three">
          ${input('Category name', `categories.${i}.name`)}
          ${input('Slug', `categories.${i}.slug`)}
          ${input('Sort order', `categories.${i}.sort_order`, { type: 'number' })}
        </div>
        ${input('Description', `categories.${i}.description`, { kind: 'textarea', full: true })}
        ${imageTools(`categories.${i}.image`, 'Category image')}
        <div class="checks">${checkbox('Hide this category from website', `categories.${i}.hidden`)}</div>
      </article>
    `).join('');
  }

  function productCategoriesHtml(productIndex) {
    const selected = new Set(state.products[productIndex].category_slugs || []);
    return `<div class="field full"><label>Categories</label><div class="select-grid">${state.categories.map(cat => `<label><input type="checkbox" data-product-category="${productIndex}" value="${esc(cat.slug)}" ${selected.has(cat.slug) ? 'checked' : ''}> ${esc(cat.name)}</label>`).join('') || '<span class="muted">Create categories first.</span>'}</div></div>`;
  }

  function renderProducts() {
    const list = $('#productList');
    if (!state.products.length) {
      list.innerHTML = '<div class="empty">No products yet. Click Add Product.</div>';
      return;
    }
    list.innerHTML = state.products.map((p, i) => {
      const sizes = (p.sizes || []).join(', ');
      const colors = (p.colors || []).map(c => `${c.name || ''}:${c.hex || '#dddddd'}`).join('; ');
      return `
      <article class="item-card">
        <div class="item-head">
          <div class="item-title">${p.image ? `<img class="thumb" src="${esc(p.image)}" onerror="this.style.visibility='hidden'" alt="">` : '<div class="thumb no-thumb">No image</div>'}<div><h3>${esc(p.title || 'Product')}</h3><span class="status-dot ${p.hidden ? 'hidden' : ''}">${p.hidden ? 'Hidden from website' : 'Visible on website'}</span> <span class="muted">Stock: ${esc(p.stock_qty ?? 0)}</span></div></div>
          <div class="actions"><button class="ghost small" data-move="products.${i}.-1">Up</button><button class="ghost small" data-move="products.${i}.1">Down</button><button class="danger small" data-remove="products.${i}">Delete</button></div>
        </div>
        <div class="row four">
          ${input('Product name', `products.${i}.title`)}
          ${input('Slug', `products.${i}.slug`)}
          ${input('SKU', `products.${i}.sku`)}
          ${input('Sort order', `products.${i}.sort_order`, { type: 'number' })}
        </div>
        <div class="row four">
          ${input('Price', `products.${i}.price`)}
          ${input('Compare price / MRP', `products.${i}.compare_price`)}
          ${input('Discount label', `products.${i}.discount_label`, { placeholder: 'Dashain offer, Sale, etc.' })}
          ${input('Discount %', `products.${i}.discount_percent`, { type: 'number', min: 0, max: 100 })}
        </div>
        <div class="row four">
          ${input('Stock quantity', `products.${i}.stock_qty`, { type: 'number' })}
          ${input('Stock label', `products.${i}.stock_label`)}
          ${input('Stock status', `products.${i}.stock_status`, { kind: 'select', options: [{value:'instock',label:'In stock'},{value:'lowstock',label:'Low stock'},{value:'outofstock',label:'Out of stock'},{value:'preorder',label:'Pre-order'}] })}
          ${input('Fabric', `products.${i}.fabric`)}
        </div>
        <label class="field full">Size options, comma separated<input data-sizes="${i}" value="${esc(sizes)}" placeholder="S, M, L, XL"></label>
        <label class="field full">Colour options, format Name:#hex; Name:#hex<input data-colors="${i}" value="${esc(colors)}" placeholder="Black:#111111; White:#ffffff"></label>
        ${productCategoriesHtml(i)}
        ${input('Short excerpt', `products.${i}.excerpt`, { kind: 'textarea', full: true })}
        ${input('Full product description', `products.${i}.content`, { kind: 'textarea', full: true })}
        ${imageTools(`products.${i}.image`, 'Main product image')}
        <div class="field full"><label>Multiple gallery images for this product</label><div class="gallery-list">${galleryHtml(i)}</div><div class="upload-box"><label class="upload-mini">Upload gallery image<input type="file" data-gallery-upload="${i}" accept="image/*,.svg,.avif,.webp,.bmp,.gif"></label><button type="button" class="ghost small" data-add-gallery="${i}">Add blank gallery URL</button></div><p class="muted">Upload as many product photos as needed. The first main image is used on product cards; all gallery images show on the product detail page.</p></div>
        <div class="checks">${checkbox('Featured', `products.${i}.featured`)}${checkbox('New arrival', `products.${i}.new_arrival`)}${checkbox('Hide this product from website', `products.${i}.hidden`)}</div>
      </article>`;
    }).join('');
  }

  function galleryHtml(i) {
    const gallery = state.products[i].gallery || [];
    if (!gallery.length) return '<div class="empty">No gallery images.</div>';
    return gallery.map((url, j) => `<div class="gallery-row">${url ? `<img src="${esc(url)}" onerror="this.style.visibility='hidden'" alt="">` : '<div class="gallery-empty">No image</div>'}<input data-path="products.${i}.gallery.${j}" value="${esc(url)}" placeholder="Gallery image URL"><button type="button" class="ghost small" data-delete-gallery-file="${i}.${j}">Delete file</button><button type="button" class="danger small" data-remove-gallery="${i}.${j}">Remove</button></div>`).join('');
  }

  function renderBlogs() {
    const list = $('#blogList');
    if (!state.blogs.length) {
      list.innerHTML = '<div class="empty">No blogs yet. Click Add Blog.</div>';
      return;
    }
    list.innerHTML = state.blogs.map((b, i) => `
      <article class="item-card">
        <div class="item-head">
          <div class="item-title">${b.image ? `<img class="thumb" src="${esc(b.image)}" onerror="this.style.visibility='hidden'" alt="">` : '<div class="thumb no-thumb">No image</div>'}<div><h3>${esc(b.title || 'Blog')}</h3><span class="status-dot ${b.hidden ? 'hidden' : ''}">${b.hidden ? 'Hidden from website' : 'Visible'}</span></div></div>
          <div class="actions"><button class="ghost small" data-move="blogs.${i}.-1">Up</button><button class="ghost small" data-move="blogs.${i}.1">Down</button><button class="danger small" data-remove="blogs.${i}">Delete</button></div>
        </div>
        <div class="row four">
          ${input('Blog title', `blogs.${i}.title`)}
          ${input('Slug', `blogs.${i}.slug`)}
          ${input('Published date', `blogs.${i}.published_at`, { type: 'date' })}
          ${input('Sort order', `blogs.${i}.sort_order`, { type: 'number' })}
        </div>
        ${input('Excerpt', `blogs.${i}.excerpt`, { kind: 'textarea', full: true })}
        ${input('Content', `blogs.${i}.content`, { kind: 'textarea', full: true })}
        ${imageTools(`blogs.${i}.image`, 'Blog image')}
        <div class="checks">${checkbox('Hide this blog from website', `blogs.${i}.hidden`)}</div>
      </article>
    `).join('');
  }

  function renderInquiries() {
    const list = $('#inquiryList');
    if (!list) return;
    if (!state.inquiries.length) {
      list.innerHTML = '<div class="empty">No inquiries yet. Website inquiries will appear here after customers submit the form.</div>';
      return;
    }
    list.innerHTML = state.inquiries.map((inq, i) => `
      <article class="item-card inquiry-card">
        <div class="item-head">
          <div><h3>${esc(inq.name || 'Customer inquiry')}</h3><span class="muted">${esc(inq.created_at || '')}</span></div>
          <div class="actions"><button class="danger small" data-remove="inquiries.${i}">Delete</button></div>
        </div>
        <div class="row three">
          ${input('Status', `inquiries.${i}.status`, { kind: 'select', options: [{value:'new',label:'New'},{value:'contacted',label:'Contacted'},{value:'closed',label:'Closed'}] })}
          ${input('Phone / WhatsApp', `inquiries.${i}.phone`)}
          ${input('Email', `inquiries.${i}.email`)}
        </div>
        <div class="row three">
          ${input('Product', `inquiries.${i}.product_title`)}
          ${input('Size', `inquiries.${i}.size`)}
          ${input('Colour', `inquiries.${i}.color`)}
        </div>
        ${input('Message', `inquiries.${i}.message`, { kind: 'textarea', full: true })}
      </article>
    `).join('');
  }

  function usedImages() {
    const entries = [];
    const push = (path, label, url) => { if (url) entries.push({ path, label, url }); };
    push('settings.hero_image', 'Homepage hero image', state.settings?.hero_image);
    (state.categories || []).forEach((cat, i) => push(`categories.${i}.image`, `Category: ${cat.name || i + 1}`, cat.image));
    (state.products || []).forEach((p, i) => {
      push(`products.${i}.image`, `Product main: ${p.title || i + 1}`, p.image);
      (p.gallery || []).forEach((url, j) => push(`products.${i}.gallery.${j}`, `Product gallery: ${p.title || i + 1} #${j + 1}`, url));
    });
    (state.blogs || []).forEach((b, i) => push(`blogs.${i}.image`, `Blog: ${b.title || i + 1}`, b.image));
    return entries;
  }

  function renderImages() {
    const list = $('#usedImageList');
    if (!list) return;
    const entries = usedImages();
    if (!entries.length) {
      list.innerHTML = '<div class="empty">No CMS images are currently attached. Upload images in Settings, Categories, Products, Blogs, or the global upload box.</div>';
      return;
    }
    list.innerHTML = entries.map((item) => `<div class="used-image-row"><img src="${esc(item.url)}" onerror="this.style.visibility='hidden'" alt=""><div><strong>${esc(item.label)}</strong><p class="code">${esc(item.url)}</p></div><button type="button" class="ghost small" data-clear-path="${esc(item.path)}">Clear</button><button type="button" class="danger small" data-delete-used-image="${esc(item.path)}">Delete file</button></div>`).join('');
  }

  function parseColors(value) {
    return String(value || '').split(';').map(part => part.trim()).filter(Boolean).map(part => {
      const [name, hex] = part.split(':');
      return { name: (name || '').trim(), hex: (hex || '#dddddd').trim() };
    }).filter(c => c.name);
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
      reader.onerror = () => reject(new Error('Could not read selected image.'));
      reader.readAsDataURL(file);
    });
  }

  async function uploadFile(file, path) {
    if (!file) throw new Error('Select an image first.');
    let result;
    if (window.LUXE_CMS_NETLIFY) {
      const base64 = await fileToBase64(file);
      result = await api('admin/upload', {
        method: 'POST',
        body: JSON.stringify({
          filename: file.name || 'image',
          content_type: file.type || 'application/octet-stream',
          size: file.size || 0,
          base64
        })
      });
    } else {
      const form = new FormData();
      form.append('image', file);
      result = await api('admin/upload', { method: 'POST', body: form, headers: {} });
    }
    if (path) setPath(path, result.image.url);
    render();
    notice('Image uploaded. Press Save Changes to publish the new image URL to the website.');
    return result.image;
  }

  async function deleteImageUrl(url) {
    if (!url) throw new Error('No image URL selected.');
    const result = await api('admin/delete-image', { method: 'POST', body: JSON.stringify({ url }) });
    notice(result.message || 'Image deleted. Press Save Changes to publish the removal.');
    return result;
  }

  async function loadData() {
    const result = await api('admin/data');
    state = result.data || state;
    state.settings = state.settings || {};
    state.settings.fonts = state.settings.fonts || {};
    state.categories = state.categories || [];
    state.products = state.products || [];
    state.blogs = state.blogs || [];
    state.inquiries = state.inquiries || [];
    render();
    notice('CMS loaded.');
  }

  async function saveData() {
    const result = await api('admin/save', { method: 'POST', body: JSON.stringify({ data: state }) });
    state = result.data || state;
    render();
    notice('Saved successfully. The public website reads this CMS data and will show the updated content.');
  }

  function switchTab(tab) {
    activeTab = tab;
    $$('.tab').forEach(el => el.classList.toggle('active', el.id === `tab-${tab}`));
    $$('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
    const titles = { dashboard:'Dashboard', settings:'Settings & Fonts', categories:'Categories', products:'Products', blogs:'Blogs', inquiries:'Inquiries', images:'Images' };
    const title = $('[data-title]');
    if (title) title.textContent = titles[tab] || 'CMS';
  }

  document.addEventListener('input', (event) => {
    const target = event.target;
    if (target.matches('[data-path]')) {
      const value = target.type === 'checkbox' ? target.checked : target.value;
      setPath(target.dataset.path, value);
    }
    if (target.matches('[data-sizes]')) {
      state.products[Number(target.dataset.sizes)].sizes = target.value.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (target.matches('[data-colors]')) {
      state.products[Number(target.dataset.colors)].colors = parseColors(target.value);
    }
  });

  document.addEventListener('change', async (event) => {
    const target = event.target;
    try {
      if (target.matches('[data-upload-path]')) await uploadFile(target.files[0], target.dataset.uploadPath);
      if (target.matches('[data-gallery-upload]')) {
        const product = state.products[Number(target.dataset.galleryUpload)];
        product.gallery = product.gallery || [];
        const image = await uploadFile(target.files[0]);
        if (image) {
          product.gallery.push(image.url);
          if (!product.image) product.image = image.url;
        }
        render();
      }
      if (target.matches('[data-product-category]')) {
        const product = state.products[Number(target.dataset.productCategory)];
        const checked = $$(`[data-product-category="${target.dataset.productCategory}"]:checked`).map(el => el.value);
        product.category_slugs = checked;
      }
    } catch (err) { notice(err.message, true); }
  });

  document.addEventListener('click', async (event) => {
    const target = event.target.closest('button');
    if (!target) return;
    try {
      if (target.matches('[data-tab]')) switchTab(target.dataset.tab);
      if (target.id === 'saveBtn') await saveData();
      if (target.id === 'reloadBtn') await loadData();
      if (target.id === 'addCategory') { state.categories.push({ id:id('cat'), name:'New Category', slug:'new-category', description:'', image:'', hidden:false, sort_order:state.categories.length + 1 }); render(); }
      if (target.id === 'addProduct') { state.products.push({ id:id('prod'), title:'New Product', slug:'new-product', excerpt:'', content:'', price:'', compare_price:'', discount_label:'', discount_percent:'', sku:'', fabric:'', sizes:[], colors:[], stock_qty:0, stock_status:'instock', stock_label:'In Stock', image:'', gallery:[], category_slugs:[], featured:false, new_arrival:false, hidden:false, sort_order:state.products.length + 1 }); render(); }
      if (target.id === 'addBlog') { state.blogs.push({ id:id('blog'), title:'New Blog', slug:'new-blog', excerpt:'', content:'', image:'', published_at:new Date().toISOString().slice(0,10), hidden:false, sort_order:state.blogs.length + 1 }); render(); }
      if (target.matches('[data-remove]')) {
        const [collection, index] = target.dataset.remove.split('.');
        if (confirm('Delete this item from CMS data? Attached image files are not deleted unless you press Delete file first.')) { state[collection].splice(Number(index), 1); render(); }
      }
      if (target.matches('[data-move]')) {
        const [collection, index, delta] = target.dataset.move.split('.');
        const i = Number(index), d = Number(delta), j = i + d;
        if (j >= 0 && j < state[collection].length) {
          const arr = state[collection];
          [arr[i], arr[j]] = [arr[j], arr[i]];
          arr.forEach((item, idx) => item.sort_order = idx + 1);
          render();
        }
      }
      if (target.matches('[data-clear-path]')) { setPath(target.dataset.clearPath, ''); render(); }
      if (target.matches('[data-delete-upload]')) {
        const path = target.dataset.deleteUpload;
        const url = getPath(path);
        if (url && confirm('Delete this CMS-uploaded image file and clear the field?')) {
          await deleteImageUrl(url);
          setPath(path, '');
          render();
        }
      }
      if (target.matches('[data-add-gallery]')) { const p = state.products[Number(target.dataset.addGallery)]; p.gallery = p.gallery || []; p.gallery.push(''); render(); }
      if (target.matches('[data-remove-gallery]')) { const [i,j] = target.dataset.removeGallery.split('.').map(Number); state.products[i].gallery.splice(j, 1); render(); }
      if (target.matches('[data-delete-gallery-file]')) {
        const [i,j] = target.dataset.deleteGalleryFile.split('.').map(Number);
        const url = state.products[i]?.gallery?.[j];
        if (url && confirm('Delete this gallery image file and remove it from the product?')) {
          await deleteImageUrl(url);
          state.products[i].gallery.splice(j, 1);
          render();
        }
      }
      if (target.matches('[data-delete-used-image]')) {
        const path = target.dataset.deleteUsedImage;
        const url = getPath(path);
        if (url && confirm('Delete this CMS-uploaded image file and clear it from CMS data?')) {
          await deleteImageUrl(url);
          setPath(path, '');
          render();
        }
      }
      if (target.id === 'globalUploadBtn') {
        const file = $('#globalUpload').files[0];
        const image = await uploadFile(file);
        $('#globalUploadResult').innerHTML = image ? `<p class="code">${esc(image.url)}</p><p><a class="preview-link" href="${esc(image.url)}" target="_blank" rel="noopener">Open uploaded image</a></p>` : '';
      }
      if (target.id === 'deleteImageBtn') {
        const url = $('#deleteImageUrl').value.trim();
        if (confirm('Delete this uploaded image file from the server?')) await deleteImageUrl(url);
      }
    } catch (err) { notice(err.message, true); }
  });

  document.addEventListener('blur', (event) => {
    const target = event.target;
    if (target.matches('[data-path$=".name"],[data-path$=".title"]')) {
      const slugPath = target.dataset.path.replace(/\.(name|title)$/, '.slug');
      if (!getPath(slugPath)) { setPath(slugPath, slugify(target.value)); render(); }
    }
  }, true);

  function showStaticLogin(message) {
    const login = $('#staticLogin');
    const app = $('#cmsApp');
    const err = $('#staticLoginError');
    if (login) login.hidden = false;
    if (app) app.hidden = true;
    if (err) {
      err.hidden = !message;
      err.textContent = message || '';
    }
  }

  function showStaticApp() {
    const login = $('#staticLogin');
    const app = $('#cmsApp');
    if (login) login.hidden = true;
    if (app) app.hidden = false;
  }

  async function startStaticCms() {
    const form = $('#staticLoginForm');
    const inputToken = $('#staticAdminToken');
    const logout = $('#staticLogout');

    if (logout) {
      logout.addEventListener('click', () => {
        adminToken = '';
        localStorage.removeItem(tokenStorageKey);
        showStaticLogin('Logged out.');
      });
    }

    if (form) {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const loginToken = (inputToken?.value || '').trim();
        if (!loginToken) return showStaticLogin('Please enter your GitHub token.');
        try {
          const login = await api('auth/login', {
            method: 'POST',
            body: JSON.stringify({ provider: 'github', token: loginToken })
          });
          adminToken = login.session_token || '';
          if (!adminToken) throw new Error('Login did not return a CMS session.');
          localStorage.setItem(tokenStorageKey, adminToken);
          if (inputToken) inputToken.value = '';
          showStaticApp();
          await loadData();
        } catch (err) {
          adminToken = '';
          localStorage.removeItem(tokenStorageKey);
          showStaticLogin(err.message || 'Invalid GitHub token.');
        }
      });
    }

    if (!adminToken) {
      showStaticLogin();
      return;
    }

    try {
      showStaticApp();
      await loadData();
    } catch (err) {
      adminToken = '';
      localStorage.removeItem(tokenStorageKey);
      showStaticLogin(err.message || 'Invalid admin token.');
    }
  }

  $$('.nav-btn').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  if (staticLogin) startStaticCms(); else loadData().catch(err => notice(err.message, true));
})();
