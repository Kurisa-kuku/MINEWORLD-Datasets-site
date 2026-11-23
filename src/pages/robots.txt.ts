import type { APIRoute } from 'astro';
import { BASE } from '../config';

export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL('https://kurisa-kuku.github.io')).origin;
  const base = BASE || '';
  const sitemap = new URL(`${base}/sitemap-index.xml`, origin).toString();
  const lines = [
    'User-agent: *',
    'Allow: /',
    `Disallow: ${base}/admin/`,
    `Disallow: ${base}/edit/`,
    'Disallow: /*?*sort=',
    '',
    `Sitemap: ${sitemap}`,
    '',
  ];
  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
