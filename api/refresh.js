// Vercel serverless function — POST /api/refresh
// Relays a Microsoft OAuth refresh_token grant server-side, since the token
// endpoint doesn't allow CORS from a browser. Ported from refresh-proxy.js.

import { handlePreflight } from './_cors.js';

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;

  try {
    const { refresh_token, client_id, tenant = 'common' } = req.body || {};
    if (!refresh_token || !client_id) {
      res.status(400).json({ error: 'refresh_token and client_id required' });
      return;
    }

    const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`;
    const params = new URLSearchParams({
      client_id,
      grant_type: 'refresh_token',
      refresh_token,
      scope: 'https://graph.microsoft.com/.default offline_access',
    });

    const msResp = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const data = await msResp.json();
    res.status(msResp.ok ? 200 : msResp.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Proxy error' });
  }
}
