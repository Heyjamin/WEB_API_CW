const express = require('express');
const db = require('../db');
const { requireUser } = require('../middleware/auth');
const { notFound, forbidden } = require('../utils/errors');
const { weakEtag, applyConditionalGet } = require('../utils/http');
const { rejectMethods } = require('../middleware/httpLevel2');

const router = express.Router();

function canAccessSubstation(user, sub) {
  const district = db.prepare('SELECT * FROM districts WHERE code = ?').get(sub.district_code);
  if (user.role === 'NationalAdmin') return true;
  if (user.role === 'ProvincialAdmin') return district.province_code === user.provinceCode;
  if (user.role === 'DistrictAdmin') return district.code === user.districtCode;
  return false;
}

router.get('/', requireUser, (req, res) => {
  let rows = db.prepare(
    `SELECT code, name, district_code AS districtCode, latitude, longitude, updated_at AS updatedAt
     FROM grid_substations ORDER BY code`
  ).all();
  rows = rows.filter((r) => canAccessSubstation(req.user, { district_code: r.districtCode }));
  res.json({ data: rows, count: rows.length });
});

router.get('/:code', requireUser, (req, res) => {
  const row = db.prepare(
    `SELECT code, name, district_code AS districtCode, latitude, longitude, updated_at AS updatedAt
     FROM grid_substations WHERE code = ?`
  ).get(req.params.code);
  if (!row) throw notFound('Grid substation');
  if (!canAccessSubstation(req.user, { district_code: row.districtCode })) throw forbidden();
  const etag = weakEtag(['gs', row.code, row.updatedAt]);
  if (applyConditionalGet(req, res, etag, row.updatedAt)) return;
  res.json(row);
});

router.get('/:code/installations', requireUser, (req, res) => {
  const sub = db.prepare('SELECT * FROM grid_substations WHERE code = ?').get(req.params.code);
  if (!sub) throw notFound('Grid substation');
  if (!canAccessSubstation(req.user, sub)) throw forbidden();
  const rows = db.prepare(
    `SELECT id, meter_id AS meterId, account_number AS accountNumber, inverter_id AS inverterId,
            installation_name AS installationName, address, latitude, longitude, capacity_kw AS capacityKw,
            status, grid_substation_code AS gridSubstationCode, updated_at AS updatedAt
     FROM solar_installations WHERE grid_substation_code = ? ORDER BY meter_id`
  ).all(req.params.code);
  res.json({ data: rows, count: rows.length });
});

router.post('/', rejectMethods(['GET'], 'Grid substations are read-only. Use GET to list.'));
router.put('/:code', rejectMethods(['GET'], 'Grid substations are read-only.'));
router.patch('/:code', rejectMethods(['GET'], 'Grid substations are read-only.'));
router.delete('/:code', rejectMethods(['GET'], 'Grid substations are read-only.'));

module.exports = router;
