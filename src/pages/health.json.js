import { json, route } from '../../server/util.js';
import { health } from '../../server/health.js';

// GET /health.json → yes/no checks for the database, cover storage and admin password, plus the version.
// Public on purpose, so Manage's sign-in screen can show it when signing in doesn't work. No details or secrets.
export const GET = route(async ({ env }) => json(await health(env)));
