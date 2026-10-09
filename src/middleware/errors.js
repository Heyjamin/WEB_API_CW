const { randomUUID } = require('crypto');
const { AppError, errorBody } = require('../utils/errors');

function traceIdMiddleware(req, res, next) {
  req.traceId = randomUUID();
  res.setHeader('X-Trace-Id', req.traceId);
  next();
}

function errorHandler(err, req, res, _next) {
  const status = err instanceof AppError ? err.status : 500;
  if (status >= 500) {
    // eslint-disable-next-line no-console
    console.error(err);
  }
  if (status === 401) {
    const challenge = req.authKind === 'device' || req.headers['x-device-api-key']
      ? 'ApiKey realm="slsea-device", header="X-Device-Api-Key"'
      : 'Bearer realm="slsea-api"';
    res.setHeader('WWW-Authenticate', challenge);
  }
  if (status === 405 && (err.allow || err.details?.allow)) {
    res.setHeader('Allow', err.allow || err.details.allow);
  }
  if (status === 406) {
    res.setHeader('Accept', 'application/json');
  }
  res.status(status).json(errorBody(err, req.traceId || randomUUID()));
}

module.exports = { traceIdMiddleware, errorHandler };
