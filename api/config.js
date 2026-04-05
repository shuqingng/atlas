// api/config.js — returns public client-side configuration
// GOOGLE_CLIENT_ID is not secret, but keeping it server-side avoids any hardcoding in HTML.

module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || '' });
};
