'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hashPin, verifyPin, safeEqual, signToken, verifyToken, totp, verifyTotp, randomToken } = require('../src/security');

test('hashPin/verifyPin roundtrip', () => {
  const a = hashPin('1234');
  const b = hashPin('1234');
  assert.notEqual(a.salt, b.salt, 'salt must be random per hash');
  assert.equal(verifyPin('1234', a.salt, a.hash), true);
  assert.equal(verifyPin('1234', b.salt, b.hash), true);
  assert.equal(verifyPin('9999', a.salt, a.hash), false);
  assert.equal(verifyPin('12345', a.salt, a.hash), false);
  assert.notEqual(a.hash, '1234', 'plain pin never stored');
});

test('safeEqual is constant-time comparison', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'ab'), false);
  assert.equal(safeEqual('', ''), true);
});

test('signToken/verifyToken roundtrip and expiry', () => {
  const secret = 'test-secret';
  const token = signToken(secret, 'villager', 7, { deviceId: 3 }, 60);
  const payload = verifyToken(secret, token);
  assert.equal(payload.role, 'villager');
  assert.equal(payload.subject, 7);
  assert.equal(payload.deviceId, 3);
  assert.ok(payload.exp > Date.now());
  assert.equal(verifyToken(secret, `${token}x`), null, 'tampered token rejected');
  assert.equal(verifyToken('other-secret', token), null, 'wrong secret rejected');
  assert.equal(verifyToken(secret, 'not-a-token'), null);
  const expired = signToken(secret, 'villager', 7, {}, -1);
  assert.equal(verifyToken(secret, expired), null, 'expired token rejected');
});

test('totp matches RFC 6238 test vector', () => {
  // RFC 6238 Appendix B: secret "12345678901234567890" (ASCII),
  // Base32 GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ, T=59s → 6-digit SHA1 = 287082.
  assert.equal(totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59000, 30, 6), '287082');
});

test('verifyTotp accepts current window codes', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const code = totp(secret);
  assert.equal(verifyTotp(secret, code, 1), true);
  assert.equal(verifyTotp(secret, '000000', 1), false);
  assert.equal(verifyTotp('', '000000', 1), true, 'empty secret disables TOTP');
});

test('randomToken uniqueness and length', () => {
  const a = randomToken(24);
  const b = randomToken(24);
  assert.notEqual(a, b);
  assert.equal(a.length, 32, '24 bytes base64url = 32 chars');
  assert.match(a, /^[A-Za-z0-9_-]+$/);
});
