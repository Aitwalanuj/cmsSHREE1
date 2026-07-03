# Luxe Boutique CMS - Netlify GitHub Token Login v8

This is the CMS-only Netlify package.

## v8 update

GitHub token login is relaxed and the public API is ready for the GitHub Pages website:

- Fine-grained GitHub tokens work.
- Classic GitHub tokens work.
- The CMS no longer requires repository write/admin permission.
- The token is pasted once in the CMS login page.
- The browser stores only a CMS session token after login.
- The GitHub token itself is not saved in the browser.

## Upload to GitHub

Upload the contents of this folder directly to your CMS repo root:

```text
public/
netlify/
tools/
netlify.toml
package.json
.npmrc
.gitignore
README.md
```

Do not upload old PHP CMS files:

```text
api.php
index.php
config.php
lib.php
.htaccess
storage/
```

## Netlify settings

```text
Build command: npm run build
Publish directory: public
Functions directory: netlify/functions
Base directory: empty
```

Then deploy with:

```text
Deploys -> Trigger deploy -> Clear cache and deploy site
```

## Create GitHub token

Create a token from:

```text
GitHub -> Settings -> Developer settings -> Personal access tokens
```

Use either:

```text
Fine-grained token
```

or:

```text
Tokens classic
```

For simple CMS login, no repository write/admin permission is required.
If you select repository access, select only your CMS repo.

## Optional security restriction

If you want only your GitHub username to login, add this Netlify environment variable:

```text
GITHUB_ALLOWED_USERS=your-github-username
```

If you enable this and login says GitHub did not expose username, create a GitHub token with profile/user read permission or remove `GITHUB_ALLOWED_USERS`.

## Test after deploy

```text
https://your-site.netlify.app/api/health
https://your-site.netlify.app/cms/
```

## v7 content + website link update

This package now supports:

- Public catalogue API at `/api/categories`, `/api/products`, `/api/products/:slug`, `/api/settings`, and `/api/home`.
- Public inquiry submission at `/api/inquiries`; inquiries appear in the CMS Inquiries tab.
- Product discount label / discount percent.
- Product size and colour options.
- Multiple gallery images for a single product.
- Image previews and delete buttons inside product/category/blog/settings fields and the Images tab.
- High-quality CMS uploads up to 25 MB.
- Instagram URL in Settings.

Use this API base in the website `config.php`:

```php
define('LUXE_CMS_API_BASE', 'https://your-cms-site.netlify.app/api');
define('LUXE_API_TOKEN', '');
```

## GitHub Pages website note

Use the separate `luxe-boutique-website-github-pages-v8.zip` for the public website when hosting on GitHub Pages. GitHub Pages is static hosting and cannot run PHP, so the website uses `config.js` and browser `fetch()` calls to read this CMS API directly.

After deploying this CMS to Netlify, copy your API base URL, for example:

```text
https://your-cms-site.netlify.app/api
```

Paste it into the website `config.js` as `CMS_API_BASE`, then push the website files to GitHub Pages.
