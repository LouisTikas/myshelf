import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// Pages render on request from the D1 database, so saves show up immediately (no rebuilds).
// Static files (CSS, JS, fonts, old covers) are still served straight from Cloudflare Pages.
export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    imageService: 'passthrough',
    platformProxy: { enabled: true },
  }),
  trailingSlash: 'ignore',
  build: { format: 'directory' },
});
