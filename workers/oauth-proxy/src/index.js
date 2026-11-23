/**
 * Minimal, secretless GitHub OAuth device-flow proxy for MineWorld Datasets.
 *
 * GitHub's device endpoints do not emit CORS headers, so a static browser app
 * cannot call them directly. This Worker forwards only the two POST endpoints
 * needed by the browser. It never receives a client secret and never logs
 * token responses.
 *
 * Required environment variable:
 *   ALLOWED_ORIGIN = https://<owner>.github.io
 *
 * Deploy with Wrangler:
 *   pnpm dlx wrangler deploy
 */
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGIN || '').replace(/\/$/, '');
    const allowOrigin = allowed && origin === allowed ? origin : allowed;
    const cors = {
      'Access-Control-Allow-Origin': allowOrigin || 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
      'Cache-Control': 'no-store',
    };

    if (!allowed) {
      return new Response('ALLOWED_ORIGIN is not configured.', { status: 500, headers: cors });
    }
    if (origin && origin !== allowed) {
      return new Response('Origin not allowed.', { status: 403, headers: cors });
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'POST') {
      return new Response('Method not allowed.', { status: 405, headers: cors });
    }

    const url = new URL(request.url);
    const routes = new Set(['/login/device/code', '/login/oauth/access_token']);
    if (!routes.has(url.pathname)) {
      return new Response('Not found.', { status: 404, headers: cors });
    }

    const body = await request.text();
    if (body.length > 8192) {
      return new Response('Request too large.', { status: 413, headers: cors });
    }

    const upstream = await fetch(`https://github.com${url.pathname}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'mw-datasets-oauth-proxy',
      },
      body,
    });

    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: {
        ...cors,
        'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
      },
    });
  },
};
