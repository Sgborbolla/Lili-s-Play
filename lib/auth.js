const crypto = require('node:crypto');

function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), s, 64).toString('hex');
  return { salt: s, hash };
}

function verifyPassword(password, salt, hash) {
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(hash, 'hex');
  if (test.length !== expected.length) return false;
  return crypto.timingSafeEqual(test, expected);
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(value, secret) {
  return b64url(crypto.createHmac('sha256', secret).update(value).digest());
}

function createToken(secret, data = {}, ttlMs = 7 * 24 * 60 * 60 * 1000) {
  const payload = b64url(JSON.stringify({ ...data, exp: Date.now() + ttlMs }));
  return `${payload}.${sign(payload, secret)}`;
}

function verifyToken(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (typeof data.exp !== 'number' || data.exp <= Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i === -1) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) {
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  });
  return out;
}

function serializeCookie(name, value, opts = {}) {
  let str = `${name}=${encodeURIComponent(value)}`;
  str += `; Path=${opts.path || '/'}`;
  if (opts.maxAge !== undefined && opts.maxAge !== null) str += `; Max-Age=${Math.floor(opts.maxAge / 1000)}`;
  if (opts.httpOnly !== false) str += '; HttpOnly';
  str += `; SameSite=${opts.sameSite || 'Strict'}`;
  if (opts.secure) str += '; Secure';
  return str;
}

module.exports = { hashPassword, verifyPassword, createToken, verifyToken, parseCookies, serializeCookie };
