// The Worker's entry point: Astro's usual request handler, plus a `scheduled` handler for the cron trigger in
// wrangler.jsonc (once a day), which installs new MyShelf versions unless that's turned off in Settings → Updates.
// Wired up with workerEntryPoint in astro.config.mjs.
import { App } from 'astro/app';
import { handle } from '@astrojs/cloudflare/handler';
import { withStoredKeys } from '../server/apikeys.js';
import { runAutoUpdate } from '../server/updates.js';
import { logEvent } from '../server/logs.js';

async function scheduled(env) {
  let full = env;
  try {
    full = await withStoredKeys(env); // the GitHub token is usually saved in Settings → API keys, not as a secret
  } catch (err) {
    await logEvent(env, { level: 'warn', source: 'auto-update', message: err });
  }
  await runAutoUpdate(full);
}

export function createExports(manifest) {
  const app = new App(manifest);
  return {
    default: {
      fetch: (request, env, ctx) => handle(manifest, app, request, env, ctx),
      scheduled: (_event, env, ctx) => ctx.waitUntil(scheduled(env)),
    },
  };
}
