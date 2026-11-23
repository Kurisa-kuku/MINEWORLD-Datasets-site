# OAuth device-flow proxy

A **secretless, optional** Cloudflare Worker that makes browser-based GitHub device-flow login possible for the static site.

GitHub's `github.com/login/device/code` and `github.com/login/oauth/access_token` endpoints do **not** send CORS headers, so a GitHub Pages site cannot call them directly. This Worker exposes only those two POST endpoints and adds CORS for one configured origin. It never sees a client secret and does not log request or response bodies.

## Why is this needed?

The catalog is a static GitHub Pages site with no auth backend. The PAT fallback login works without this Worker, but it is less friendly. This optional Worker enables a real one-click GitHub device-flow experience. It does not host data or authenticate API requests; after login, the browser talks directly to `api.github.com`.

## Deploy

1. Create a GitHub **OAuth App** (Settings → Developer settings → OAuth Apps). Enable **Device flow**.
2. Set the required environment variable in `wrangler.toml`:
   ```toml
   [vars]
   ALLOWED_ORIGIN = "https://YOUR-GITHUB-USERNAME.github.io"
   ```
   For a custom domain, use its exact HTTPS origin.
3. Deploy:
   ```bash
   cd workers/oauth-proxy
   pnpm dlx wrangler login
   pnpm dlx wrangler deploy
   ```
4. Copy the deployed `https://…workers.dev` origin.
5. In the site repository variables:
   - `PUBLIC_GITHUB_OAUTH_CLIENT_ID` = OAuth App client id
   - `PUBLIC_GITHUB_AUTH_BASE` = deployed Worker origin (no trailing slash)
6. Rebuild the site.

If either setting is missing, the auth dialog hides browser authorization and offers the personal access token path instead.

## Security properties

- Only `POST /login/device/code` and `POST /login/oauth/access_token` are proxied.
- Requests from an origin other than `ALLOWED_ORIGIN` are rejected where the browser sends an `Origin` header. CORS is not an authentication boundary, so do not treat this as a secret-bearing API.
- No cookies, client secrets or GitHub tokens are stored by the Worker.
- The access-token response is passed back to the browser and kept in `sessionStorage`.

## Local development

`wrangler dev` serves on localhost; set `ALLOWED_ORIGIN` to your Astro dev origin (e.g. `http://127.0.0.1:4321`) in a local `.dev.vars` file. Never commit `.dev.vars`.
