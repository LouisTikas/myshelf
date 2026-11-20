import { json } from '../../server/util.js';
import { configured } from '../../server/providers.js';

// GET /api/ping → confirms the admin token and reports which API keys are set.
export const onRequestGet = ({ env }) => json({ ok: true, configured: configured(env) });
