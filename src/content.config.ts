import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// One Markdown file per item in src/content/items/.
// Frontmatter = metadata, body = your journal / review.
const items = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/items' }),
  schema: z
    .object({
      title: z.string(),
      type: z.enum(['book', 'movie', 'tv', 'music', 'videogame', 'boardgame']),
      creator: z.string().optional().default(''),
      year: z.coerce.string().optional().default(''),
      cover: z.string().optional().default(''),
      status: z
        .enum(['want', 'in-progress', 'finished', 'abandoned'])
        .optional()
        .default('finished'),
      rating: z.coerce.number().min(0).max(5).optional().nullable(),
      dateAdded: z.coerce.date().optional(),
      dateStarted: z.coerce.date().optional().nullable(),
      dateFinished: z.coerce.date().optional().nullable(),
      collections: z.array(z.string()).optional().default([]),
      tags: z.array(z.string()).optional().default([]),
      description: z.string().optional().default(''),
      genres: z.array(z.string()).optional().default([]),
      // Type-specific extras: pages, runtime, seasons, tracks, platforms, players, playtime…
      details: z.record(z.any()).optional().default({}),
      source: z
        .object({
          name: z.string().optional(),
          id: z.coerce.string().optional(),
          url: z.string().optional(),
        })
        .optional()
        .default({}),
    })
    .passthrough(),
});

export const collections = { items };
