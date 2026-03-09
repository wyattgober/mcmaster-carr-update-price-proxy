/**
 * Lightweight logger with level and masking of secrets. Never log API key, password, cert password, or full tokens.
 */

const { getConfig } = require('../config');

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

function maskToken(token) {
  if (token == null || typeof token !== 'string') return '***';
  if (token.length <= 8) return '***';
  return token.slice(0, 4) + '…';
}

function maskApiKey(key) {
  if (key == null || typeof key !== 'string') return '***';
  if (key.length <= 4) return '***';
  return '…' + key.slice(-4);
}

function getLevel() {
  try {
    const config = getConfig();
    const level = LEVELS[config.logLevel];
    return typeof level === 'number' ? level : LEVELS.info;
  } catch (_) {
    return LEVELS.info;
  }
}

function log(level, ...args) {
  if (LEVELS[level] > getLevel()) return;
  const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  const out = level === 'error' ? console.error : console.log;
  out(`[${level}] ${msg}`);
}

module.exports = {
  info: (...args) => log('info', ...args),
  warn: (...args) => log('warn', ...args),
  error: (...args) => log('error', ...args),
  debug: (...args) => log('debug', ...args),
  maskToken,
  maskApiKey,
};
