// api/trips.js — Vercel serverless function
// GET  — public, no auth required. If a valid token is provided, X-Atlas-Role: owner is set.
// POST — requires auth; only owner (or write-listed users) can write.

const access = require('../access.json');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { tripId } = req.query;
  if (!tripId) return res.status(400).json({ error: 'Missing tripId' });

  // ── GET: public read ───────────────────────────────────────────────
  if (req.method === 'GET') {
    // If the caller includes a token, verify it and advertise their role.
    // This lets the browser know to show edit controls without a separate call.
    const role = await getRoleFromRequest(req);
    if (role) res.setHeader('X-Atlas-Role', role);

    const data = await proxyGet(tripId);
    if (tripId === '_trips-list' && !Array.isArray(data)) return res.status(200).json([]);
    return res.status(200).json(data);
  }

  // ── POST: requires auth ────────────────────────────────────────────
  const auth = req.headers.authorization || '';
  const idToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!idToken) return res.status(401).json({ error: 'Sign in required' });

  const userInfo = await verifyGoogleToken(idToken);
  if (!userInfo) {
    return res.status(401).json({ error: 'Invalid or expired session — please sign in again' });
  }

  const userEmail  = userInfo.email.toLowerCase();
  const ownerEmail = (process.env.OWNER_EMAIL || '').toLowerCase();
  const isOwner    = !!ownerEmail && userEmail === ownerEmail;

  if (!isOwner && !canWrite(userEmail, tripId)) {
    return res.status(403).json({ error: 'You do not have write access to this trip' });
  }

  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body, null, 2);
  await proxyPost(tripId, body);
  return res.status(200).json({ success: true });
};

// ── Helpers ────────────────────────────────────────────────────────────

async function getRoleFromRequest(req) {
  const auth = req.headers.authorization || '';
  const idToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!idToken) return null;
  const userInfo = await verifyGoogleToken(idToken);
  if (!userInfo) return null;
  const email      = userInfo.email.toLowerCase();
  const ownerEmail = (process.env.OWNER_EMAIL || '').toLowerCase();
  return (ownerEmail && email === ownerEmail) ? 'owner' : 'guest';
}

function canWrite(email, tripId) {
  const t = (access.trips || {})[tripId];
  return Array.isArray(t?.write) && t.write.map(e => e.toLowerCase()).includes(email);
}

async function verifyGoogleToken(idToken) {
  try {
    const r = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
    );
    if (!r.ok) return null;
    const d = await r.json();
    if (!d.email || (d.email_verified !== true && d.email_verified !== 'true')) return null;
    return d;
  } catch {
    return null;
  }
}

async function proxyGet(tripId) {
  const url = `${process.env.APPS_SCRIPT_URL}?tripId=${encodeURIComponent(tripId)}&token=${encodeURIComponent(process.env.APPS_SCRIPT_TOKEN)}`;
  const r = await fetch(url);
  return r.json();
}

async function proxyPost(tripId, body) {
  const url = `${process.env.APPS_SCRIPT_URL}?tripId=${encodeURIComponent(tripId)}&token=${encodeURIComponent(process.env.APPS_SCRIPT_TOKEN)}`;
  await fetch(url, {
    method:   'POST',
    headers:  { 'Content-Type': 'text/plain' },
    body,
    redirect: 'follow',
  });
}
