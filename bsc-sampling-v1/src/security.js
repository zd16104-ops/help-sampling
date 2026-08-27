'use strict';

const crypto = require('node:crypto');

function hashPin(pin, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(String(pin), salt, 120000, 32, 'sha256').toString('hex');
  return { salt, hash };
}

function verifyPin(pin, salt, expected) {
  const actual = hashPin(pin, salt).hash;
  return safeEqual(actual, expected);
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function signToken(secret, role, subject, extra = {}, ttlSeconds = 86400) {
  const payload = Buffer.from(JSON.stringify({ role, subject, ...extra, exp: Date.now() + ttlSeconds * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifyToken(secret, token) {
  if (!token || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (!safeEqual(signature, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return parsed.exp > Date.now() ? parsed : null;
  } catch { return null; }
}

function decodeBase32(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const normalized = String(value || '').toUpperCase().replace(/=+$/g, '').replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const char of normalized) bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret, timeMs = Date.now(), stepSeconds = 30, digits = 6) {
  const counter = Math.floor(timeMs / 1000 / stepSeconds);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', decodeBase32(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(binary % (10 ** digits)).padStart(digits, '0');
}

function verifyTotp(secret, value, window = 1) {
  if (!secret) return true;
  for (let offset = -window; offset <= window; offset += 1) {
    if (safeEqual(totp(secret, Date.now() + offset * 30000), String(value || ''))) return true;
  }
  return false;
}

function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

module.exports = { hashPin, verifyPin, safeEqual, signToken, verifyToken, totp, verifyTotp, randomToken };
