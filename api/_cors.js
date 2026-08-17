// Shared CORS handling for the api/* serverless functions.
// Same-origin once deployed on Vercel (frontend + api/ in one project), but
// permissive headers are kept so local dev (vite on a different port, or the
// standalone refresh-proxy.js) keeps working unmodified.

export function applyCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// Returns true if the caller should stop (an OPTIONS preflight or a
// non-POST request was already responded to).
export function handlePreflight(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  if (req.method !== 'POST') {
    res.status(404).json({ error: 'POST only' });
    return true;
  }
  return false;
}
