/**
 * Helpers to send JSON responses with status codes.
 */

const { makeError } = require('./errors');

function sendJson(res, statusCode, body) {
  res.status(statusCode);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function success(res, statusCode, body) {
  sendJson(res, statusCode || 200, body);
}

function errorResponse(res, statusCode, message, details) {
  sendJson(res, statusCode, makeError(message, statusCode, details));
}

module.exports = { sendJson, success, errorResponse };
