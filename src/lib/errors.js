/**
 * Consistent JSON error shape for all proxy responses.
 */

function makeError(message, status, details) {
  return {
    error: message,
    ...(details != null && details !== '' && { details: String(details) }),
    status: status,
  };
}

module.exports = { makeError };
