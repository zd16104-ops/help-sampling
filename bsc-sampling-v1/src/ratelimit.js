'use strict';

// Small in-memory fixed-window rate limiter for PIN/activation login attempts
// (spec section 20.2: login, activation and PIN errors need rate limiting and
// a short lockout). Single-process server, so memory state is sufficient.

const attempts = new Map(); // key -> { count, windowStart }
const DEFAULTS = { max: 5, windowMs: 10 * 60_000 };

function now() { return Date.now(); }

function slot(key, options) {
  const { windowMs } = { ...DEFAULTS, ...options };
  const entry = attempts.get(key);
  if (!entry || now() - entry.windowStart >= windowMs) {
    const fresh = { count: 0, windowStart: now() };
    attempts.set(key, fresh);
    return fresh;
  }
  return entry;
}

// Returns { limited, retryAfterMs } for the given key.
function check(key, options = DEFAULTS) {
  const entry = slot(key, options);
  if (entry.count >= options.max) {
    return { limited: true, retryAfterMs: entry.windowStart + options.windowMs - now() };
  }
  return { limited: false };
}

function recordFailure(key, options = DEFAULTS) {
  const entry = slot(key, options);
  entry.count++;
  return entry.count;
}

function recordSuccess(key) {
  attempts.delete(key);
}

// Prune expired entries opportunistically so the map cannot grow unbounded.
function prune() {
  const cutoff = now() - 60 * 60_000;
  for (const [key, entry] of attempts) {
    if (entry.windowStart < cutoff) attempts.delete(key);
  }
}

module.exports = { check, recordFailure, recordSuccess, prune };
