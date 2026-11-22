// Lock down /api/* with the admin token. Public pages, /img/*, /federation/* and /.well-known/myshelf are open
// (federation messages carry their own signatures).
import { defineMiddleware } from 'astro:middleware';
import { checkAuth } from '../server/auth.js';
import { envOf } from '../server/util.js';

export const onRequest = defineMiddleware(async (ctx, next) => {
  if (ctx.url.pathname.startsWith('/api/') && !ctx.isPrerendered) {
    const denied = await checkAuth(ctx.request, envOf(ctx.locals));
    if (denied) return denied;
  }
  return next();
});
