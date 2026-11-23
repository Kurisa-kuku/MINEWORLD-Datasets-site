import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const docs = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './docs' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    order: z.number().int().default(0),
    updated: z
      .union([z.string(), z.date()])
      .transform((value) => (typeof value === 'string' ? value : value.toISOString().slice(0, 10)))
      .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  }),
});

export const collections = { docs };
