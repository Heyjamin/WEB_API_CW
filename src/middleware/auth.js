const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { unauthorized, forbidden } = require('../utils/errors');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

function signUser(user) {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      role: user.role,
      provinceCode: user.province_code,
      districtCode: user.district_code,
      kind: 'user',
    },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

function requireUser(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(unauthorized());
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.kind !== 'user') return next(unauthorized('User token required.'));
    req.user = payload;
    return next();
  } catch {
    return next(unauthorized('Invalid or expired token.'));
  }
}

/** Device authenticates as its installation via X-Device-Api-Key + meter path. */
function requireDeviceForInstallation(req, _res, next) {
  const apiKey = req.headers['x-device-api-key'];
  if (!apiKey) return next(unauthorized('Device API key required (X-Device-Api-Key).'));

  const meterId = req.params.meterId;
  const install = db.prepare('SELECT * FROM solar_installations WHERE meter_id = ?').get(meterId);
  if (!install) return next(unauthorized('Unknown meter.'));
  if (!bcrypt.compareSync(apiKey, install.device_api_key_hash)) {
    return next(unauthorized('Invalid device API key.'));
  }
  req.installation = install;
  req.authKind = 'device';
  return next();
}

function assertReadScope(user, installationRow) {
  if (!user) throw unauthorized();
  if (user.role === 'NationalAdmin') return;
  const sub = db.prepare('SELECT * FROM grid_substations WHERE code = ?').get(installationRow.grid_substation_code);
  const district = db.prepare('SELECT * FROM districts WHERE code = ?').get(sub.district_code);
  if (user.role === 'ProvincialAdmin') {
    if (user.provinceCode !== district.province_code) throw forbidden();
    return;
  }
  if (user.role === 'DistrictAdmin') {
    if (user.districtCode !== district.code) throw forbidden();
    return;
  }
  throw forbidden();
}

function scopedInstallationFilter(user) {
  if (user.role === 'NationalAdmin') return { sql: '1=1', params: [] };
  if (user.role === 'ProvincialAdmin') {
    return {
      sql: `si.grid_substation_code IN (
        SELECT gs.code FROM grid_substations gs
        JOIN districts d ON d.code = gs.district_code
        WHERE d.province_code = ?
      )`,
      params: [user.provinceCode],
    };
  }
  if (user.role === 'DistrictAdmin') {
    return {
      sql: `si.grid_substation_code IN (
        SELECT gs.code FROM grid_substations gs WHERE gs.district_code = ?
      )`,
      params: [user.districtCode],
    };
  }
  return { sql: '0=1', params: [] };
}

module.exports = {
  signUser,
  requireUser,
  requireDeviceForInstallation,
  assertReadScope,
  scopedInstallationFilter,
};
