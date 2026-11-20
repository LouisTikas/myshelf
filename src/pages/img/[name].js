import { envOf } from '../../../server/util.js';
import { serveCover } from '../../../server/covers.js';

// GET /img/<name> → cover image from KV
export const GET = ({ params, locals }) => serveCover(envOf(locals), params.name);
