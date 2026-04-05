// api/trips.js — Vercel serverless function
// Verifies Google identity, enforces per-trip access, proxies to Apps Script.

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

  // ── 1. Authenticate ────────────────────────────────────────────────
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

  // Set role header so the browser can tell whether to show edit controls
  res.setHeader('X-Atlas-Role', isOwner ? 'owner' : 'guest');

  // ── 2. GET ─────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    if (tripId === '_trips-list') {
      const data = await proxyGet('_trips-list');
      // If Drive file doesn't exist yet, return empty list
      if (!Array.isArray(data)) return res.status(200).json([]);
      // Owner sees everything; guests see only trips they're shared on
      const visible = isOwner
        ? data
        : data.filter(t => canRead(userEmail, t.id));
      return res.status(200).json(visible);
    }

    if (!isOwner && !canRead(userEmail, tripId)) {
      return res.status(403).json({ error: 'You do not have access to this trip' });
    }
    const data = await proxyGet(tripId);
    return res.status(200).json(data);
  }

  // ── 3. POST ────────────────────────────────────────────────────────
  if (!isOwner && !canWrite(userEmail, tripId)) {
    return res.status(403).json({ error: 'You do not have write access to this trip' });
  }

  // req.body is auto-parsed by Vercel; re-serialise for Apps Script
  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body, null, 2);
  await proxyPost(tripId, body);
  return res.status(200).json({ success: true });
};

// ── Helpers ────────────────────────────────────────────────────────────

function canRead(email, tripId) {
  const t = (access.trips || {})[tripId];
  return Array.isArray(t?.read) && t.read.map(e => e.toLowerCase()).includes(email);
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
    // email_verified can be the string "true" or boolean true depending on Google's response
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
