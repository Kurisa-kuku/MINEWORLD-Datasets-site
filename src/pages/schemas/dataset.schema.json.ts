import type { APIRoute } from 'astro';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const GET: APIRoute = () => {
  const schema = readFileSync(path.join(process.cwd(), 'schemas', 'dataset.schema.json'), 'utf8');
  return new Response(schema, {
    headers: {
      'Content-Type': 'application/schema+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
