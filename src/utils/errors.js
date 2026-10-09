class AppError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function errorBody(err, traceId) {
  return {
    code: err.code || 'INTERNAL_ERROR',
    message: err.message || 'An unexpected error occurred.',
    details: err.details || null,
    traceId,
  };
}

function notFound(resource = 'Resource') {
  return new AppError(404, 'NOT_FOUND', `${resource} was not found.`);
}

function badRequest(message, details = null) {
  return new AppError(400, 'BAD_REQUEST', message, details);
}

function unauthorized(message = 'Authentication required.') {
  return new AppError(401, 'UNAUTHORIZED', message);
}

function forbidden(message = 'Forbidden for this jurisdiction or role.') {
  return new AppError(403, 'FORBIDDEN', message);
}

function conflict(message, details = null) {
  return new AppError(409, 'CONFLICT', message, details);
}

function unprocessable(message, details = null) {
  return new AppError(422, 'UNPROCESSABLE_ENTITY', message, details);
}

module.exports = {
  AppError,
  errorBody,
  notFound,
  badRequest,
  unauthorized,
  forbidden,
  conflict,
  unprocessable,
};
