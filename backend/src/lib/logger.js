// Simple logger wrapper to centralize logging behavior.
// Replace console.* usage across the backend so we can later
// adapt to more advanced loggers (winston, pino) easily.
function info(...args) {
  console.log('[INFO]', ...args);
}

function warn(...args) {
  console.warn('[WARN]', ...args);
}

function error(...args) {
  console.error('[ERROR]', ...args);
}

module.exports = { info, warn, error };
