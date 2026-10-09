const express = require('express');
const db = require('../db');
const { requireUser } = require('../middleware/auth');
const { notFound, forbidden } = require('../utils/errors');
const { weakEtag, applyConditionalGet } = require('../utils/http');
const { rejectMethods } = require('../middleware/httpLevel2');

const router = express.Router();

router.get('/', requireUser, (req, res) => {
  let rows = db.prepare(
    'SELECT code, name, province_code AS provinceCode, updated_at AS updatedAt FROM districts ORDER BY code'
  ).all();
  const u = req.user;
  if (u.role === 'ProvincialAdmin') rows = rows.filter((r) => r.provinceCode === u.provinceCode);
  if (u.role === 'DistrictAdmin') rows = rows.filter((r) => r.code === u.districtCode);
  res.json({ data: rows, count: rows.length });
});

router.get('/:code', requireUser, (req, res) => {
  const row = db.prepare(
    'SELECT code, name, province_code AS provinceCode, updated_at AS updatedAt FROM districts WHERE code = ?'
  ).get(req.params.code);
  if (!row) throw notFound('District');
  const u = req.user;
  if (u.role === 'ProvincialAdmin' && row.provinceCode !== u.provinceCode) throw forbidden();
  if (u.role === 'DistrictAdmin' && row.code !== u.districtCode) throw forbidden();
  const etag = weakEtag(['district', row.code, row.updatedAt]);
  if (applyConditionalGet(req, res, etag, row.updatedAt)) return;
  res.json(row);
});

router.get('/:code/grid-substations', requireUser, (req, res) => {
  const district = db.prepare('SELECT * FROM districts WHERE code = ?').get(req.params.code);
  if (!district) throw notFound('District');
  const u = req.user;
  if (u.role === 'ProvincialAdmin' && district.province_code !== u.provinceCode) throw forbidden();
  if (u.role === 'DistrictAdmin' && district.code !== u.districtCode) throw forbidden();
  const rows = db.prepare(
    `SELECT code, name, district_code AS districtCode, latitude, longitude, updated_at AS updatedAt
     FROM grid_substations WHERE district_code = ? ORDER BY code`
  ).all(req.params.code);
  res.json({ data: rows, count: rows.length });
});

/** Stretch: district generation summary (processing resource). */
router.get('/:code/generation-summary', requireUser, (req, res) => {
  const district = db.prepare('SELECT * FROM districts WHERE code = ?').get(req.params.code);
  if (!district) throw notFound('District');
  const u = req.user;
  if (u.role === 'ProvincialAdmin' && district.province_code !== u.provinceCode) throw forbidden();
  if (u.role === 'DistrictAdmin' && district.code !== u.districtCode) throw forbidden();

  const today = new Date().toISOString().slice(0, 10);
  const summary = db.prepare(`
    SELECT
      COUNT(DISTINCT si.id) AS installationCount,
      COALESCE(SUM(si.capacity_kw), 0) AS totalCapacityKw,
      COALESCE((
        SELECT SUM(r.instantaneous_power_kw) FROM generation_readings r
        JOIN solar_installations s2 ON s2.id = r.installation_id
        JOIN grid_substations g2 ON g2.code = s2.grid_substation_code
        WHERE g2.district_code = ?
          AND r.timestamp_utc = (
            SELECT MAX(r2.timestamp_utc) FROM generation_readings r2 WHERE r2.installation_id = s2.id
          )
      ), 0) AS currentTotalPowerKw,
      COALESCE((
        SELECT SUM(delta) FROM (
          SELECT MAX(r.cumulative_export_kwh) - MIN(r.cumulative_export_kwh) AS delta
          FROM generation_readings r
          JOIN solar_installations s3 ON s3.id = r.installation_id
          JOIN grid_substations g3 ON g3.code = s3.grid_substation_code
          WHERE g3.district_code = ? AND substr(r.timestamp_utc, 1, 10) = ?
          GROUP BY r.installation_id
        )
      ), 0) AS todayEnergyKwh
    FROM solar_installations si
    JOIN grid_substations gs ON gs.code = si.grid_substation_code
    WHERE gs.district_code = ?
  `).get(req.params.code, req.params.code, today, req.params.code);

  res.json({
    districtCode: district.code,
    districtName: district.name,
    asOfUtc: new Date().toISOString(),
    installationCount: summary.installationCount,
    totalCapacityKw: Number(summary.totalCapacityKw.toFixed?.(2) ?? summary.totalCapacityKw),
    currentTotalPowerKw: Number(Number(summary.currentTotalPowerKw).toFixed(3)),
    todayEnergyKwh: Number(Number(summary.todayEnergyKwh).toFixed(3)),
  });
});

router.post('/', rejectMethods(['GET'], 'Districts are read-only. Use GET to list.'));
router.put('/:code', rejectMethods(['GET'], 'Districts are read-only.'));
router.patch('/:code', rejectMethods(['GET'], 'Districts are read-only.'));
router.delete('/:code', rejectMethods(['GET'], 'Districts are read-only.'));

module.exports = router;
