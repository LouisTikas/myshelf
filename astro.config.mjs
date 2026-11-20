import { defineConfig } from 'astro/config';

// Fully static output. Cloudflare Pages serves dist/ and runs /functions for the API.
export default defineConfig({
  output: 'static',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
});
