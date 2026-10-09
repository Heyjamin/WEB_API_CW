const { AppError } = require('../utils/errors');

/**
 * Richardson Level 2 helpers: content negotiation, media type, method Allow.
 * Level 3 (HATEOAS) deliberately out of scope per NB6007CEM brief.
 */

const SKIP_ACCEPT_PREFIXES = ['/api-docs', '/openapi.json'];

function acceptsJson(acceptHeader) {
  if (!acceptHeader || acceptHeader.trim() === '') return true;
  const parts = acceptHeader.split(',').map((p) => p.trim().toLowerCase().split(';')[0]);
  return parts.some(
    (t) => t === 'application/json' || t === 'application/*' || t === '*/*' || t === 'application/problem+json'
  );
}

/** Unsupported Accept → 406 Not Acceptable (WSO2 §10.1 / brief §9). */
function contentNegotiation(req, _res, next) {
  if (SKIP_ACCEPT_PREFIXES.some((p) => req.path.startsWith(p))) return next();
  if (req.method === 'OPTIONS') return next();
  if (!acceptsJson(req.headers.accept)) {
    return next(
      new AppError(
        406,
        'NOT_ACCEPTABLE',
        'This API only serves application/json representations.',
        { accept: req.headers.accept, supported: ['application/json'] }
      )
    );
  }
  return next();
}

/** Unsupported Content-Type on POST bodies → 415 (this API creates via POST only). */
function requireJsonBody(req, _res, next) {
  if (req.method !== 'POST') return next();
  const ct = (req.headers['content-type'] || '').toLowerCase();
  if (!ct) {
    return next(
      new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type application/json is required.', {
        supported: ['application/json'],
      })
    );
  }
  if (!ct.includes('application/json')) {
    return next(
      new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', `Unsupported Content-Type: ${ct}`, {
        supported: ['application/json'],
      })
    );
  }
  return next();
}

function methodNotAllowed(allowMethods, message) {
  const allow = Array.isArray(allowMethods) ? allowMethods.join(', ') : String(allowMethods);
  const err = new AppError(
    405,
    'METHOD_NOT_ALLOWED',
    message || `Method not allowed. Allowed: ${allow}.`,
    { allow }
  );
  err.allow = allow;
  return err;
}

/** Express handler factory: reject disallowed verbs with 405 + Allow. */
function rejectMethods(allowMethods, message) {
  return (req, _res, next) => {
    next(methodNotAllowed(allowMethods, message));
  };
}

module.exports = {
  contentNegotiation,
  requireJsonBody,
  methodNotAllowed,
  rejectMethods,
  acceptsJson,
};
