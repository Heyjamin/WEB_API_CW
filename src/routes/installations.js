const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const {
  requireUser,
  requireDeviceForInstallation,
  assertReadScope,
  scopedInstallationFilter,
} = require('../middleware/auth');
const { notFound, badRequest, conflict, unprocessable } = require('../utils/errors');
const { weakEtag, applyConditionalGet, paginationLinks } = require('../utils/http');
const { rejectMethods } = require('../middleware/httpLevel2');

const router = express.Router();

function mapInstall(row) {
  return {
    id: row.id,
    meterId: row.meter_id,
    accountNumber: row.account_number,
    inverterId: row.inverter_id,
    installationName: row.installation_name,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    capacityKw: row.capacity_kw,
    status: row.status,
    gridSubstationCode: row.grid_substation_code,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

function mapReading(row) {
  return {
    id: row.id,
    installationId: row.installation_id,
    meterId: row.meter_id,
    timestampUtc: row.timestamp_utc,
    instantaneousPowerKw: row.instantaneous_power_kw,
    cumulativeExportKwh: row.cumulative_export_kwh,
    voltageV: row.voltage_v,
    eTag: row.etag,
    createdAt: row.created_at,
  };
}

router.get('/', requireUser, (req, res) => {
  const offset = Math.max(0, parseInt(req.query.offset || '0', 10) || 0);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10) || 20));
  const scope = scopedInstallationFilter(req.user);

  let where = `WHERE ${scope.sql}`;
  const params = [...scope.params];

  if (req.query.provinceCode) {
    where += ` AND si.grid_substation_code IN (
      SELECT gs.code FROM grid_substations gs
      JOIN districts d ON d.code = gs.district_code WHERE d.province_code = ?)`;
    params.push(req.query.provinceCode);
  }
  if (req.query.districtCode) {
    where += ` AND si.grid_substation_code IN (
      SELECT gs.code FROM grid_substations gs WHERE gs.district_code = ?)`;
    params.push(req.query.districtCode);
  }
  if (req.query.substationCode) {
    where += ' AND si.grid_substation_code = ?';
    params.push(req.query.substationCode);
  }
  if (req.query.status) {
    where += ' AND si.status = ?';
    params.push(req.query.status);
  }

  const count = db.prepare(`SELECT COUNT(*) c FROM solar_installations si ${where}`).get(...params).c;
  const rows = db.prepare(
    `SELECT si.* FROM solar_installations si ${where} ORDER BY si.meter_id LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  res.json({
    data: rows.map(mapInstall),
    offset,
    limit,
    count,
    links: paginationLinks(req, offset, limit, count),
  });
});

router.get('/:meterId', requireUser, (req, res) => {
  const row = db.prepare('SELECT * FROM solar_installations WHERE meter_id = ?').get(req.params.meterId);
  if (!row) throw notFound('Installation');
  assertReadScope(req.user, row);
  const etag = weakEtag(['install', row.meter_id, row.updated_at]);
  if (applyConditionalGet(req, res, etag, row.updated_at)) return;
  res.json(mapInstall(row));
});

/** Composite: installation + geography + last reading. */
router.get('/:meterId/composite', requireUser, (req, res) => {
  const row = db.prepare('SELECT * FROM solar_installations WHERE meter_id = ?').get(req.params.meterId);
  if (!row) throw notFound('Installation');
  assertReadScope(req.user, row);
  const sub = db.prepare('SELECT * FROM grid_substations WHERE code = ?').get(row.grid_substation_code);
  const district = db.prepare('SELECT * FROM districts WHERE code = ?').get(sub.district_code);
  const province = db.prepare('SELECT * FROM provinces WHERE code = ?').get(district.province_code);
  const last = db.prepare(
    'SELECT * FROM generation_readings WHERE installation_id = ? ORDER BY timestamp_utc DESC LIMIT 1'
  ).get(row.id);

  const payload = {
    installation: mapInstall(row),
    substation: { code: sub.code, name: sub.name },
    district: { code: district.code, name: district.name },
    province: { code: province.code, name: province.name },
    lastReading: last ? mapReading(last) : null,
  };
  const etag = weakEtag(['composite', row.meter_id, row.updated_at, last?.etag || 'none']);
  if (applyConditionalGet(req, res, etag, last?.timestamp_utc || row.updated_at)) return;
  res.json(payload);
});

/** Operational: last-known reading (derived resource). */
router.get('/:meterId/last-reading', requireUser, (req, res) => {
  const row = db.prepare('SELECT * FROM solar_installations WHERE meter_id = ?').get(req.params.meterId);
  if (!row) throw notFound('Installation');
  assertReadScope(req.user, row);
  const last = db.prepare(
    'SELECT * FROM generation_readings WHERE installation_id = ? ORDER BY timestamp_utc DESC LIMIT 1'
  ).get(row.id);
  if (!last) throw notFound('Reading');
  if (applyConditionalGet(req, res, last.etag, last.timestamp_utc)) return;
  res.json(mapReading(last));
});

/** Analytical: readings history with pagination, filter, sort. */
router.get('/:meterId/readings', requireUser, (req, res) => {
  const row = db.prepare('SELECT * FROM solar_installations WHERE meter_id = ?').get(req.params.meterId);
  if (!row) throw notFound('Installation');
  assertReadScope(req.user, row);

  const offset = Math.max(0, parseInt(req.query.offset || '0', 10) || 0);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '50', 10) || 50));
  const order = (req.query.order || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const sort = req.query.sort === 'timestampUtc' || !req.query.sort ? 'timestamp_utc' : 'timestamp_utc';

  let where = 'WHERE installation_id = ?';
  const params = [row.id];
  if (req.query.fromUtc) {
    where += ' AND timestamp_utc >= ?';
    params.push(req.query.fromUtc);
  }
  if (req.query.toUtc) {
    where += ' AND timestamp_utc <= ?';
    params.push(req.query.toUtc);
  }

  const count = db.prepare(`SELECT COUNT(*) c FROM generation_readings ${where}`).get(...params).c;
  const rows = db.prepare(
    `SELECT * FROM generation_readings ${where} ORDER BY ${sort} ${order} LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  res.json({
    data: rows.map(mapReading),
    offset,
    limit,
    count,
    links: paginationLinks(req, offset, limit, count),
  });
});

/** Write path: device pushes a new reading (append-only → POST only). */
router.post('/:meterId/readings', requireDeviceForInstallation, (req, res) => {
  const install = req.installation;
  const body = req.body || {};
  const timestampUtc = body.timestampUtc || new Date().toISOString();
  const power = Number(body.instantaneousPowerKw);
  const cumulative = Number(body.cumulativeExportKwh);
  const voltage = Number(body.voltageV ?? 230);

  if (Number.isNaN(power) || Number.isNaN(cumulative)) {
    throw badRequest('instantaneousPowerKw and cumulativeExportKwh are required numbers.');
  }

  const existing = db.prepare(
    'SELECT * FROM generation_readings WHERE installation_id = ? AND timestamp_utc = ?'
  ).get(install.id, timestampUtc);
  if (existing) {
    throw conflict('A reading already exists for this timestamp.', {
      existingId: existing.id,
      timestampUtc,
    });
  }

  const prev = db.prepare(
    'SELECT cumulative_export_kwh FROM generation_readings WHERE installation_id = ? ORDER BY timestamp_utc DESC LIMIT 1'
  ).get(install.id);
  if (prev && cumulative < prev.cumulative_export_kwh) {
    throw unprocessable('cumulativeExportKwh must be non-decreasing (append-only meter register).', {
      previousCumulativeExportKwh: prev.cumulative_export_kwh,
      submitted: cumulative,
    });
  }

  const id = randomUUID();
  const etag = `W/"${randomUUID().replace(/-/g, '')}"`;
  const createdAt = new Date().toISOString();
  db.prepare(`INSERT INTO generation_readings
    (id, installation_id, meter_id, timestamp_utc, instantaneous_power_kw, cumulative_export_kwh, voltage_v, etag, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, install.id, install.meter_id, timestampUtc, power, cumulative, voltage, etag, createdAt
  );

  const location = `${req.protocol}://${req.get('host')}/api/v1/installations/${install.meter_id}/readings/${id}`;
  res.setHeader('Location', location);
  res.setHeader('Content-Location', location);
  res.setHeader('ETag', etag);
  res.setHeader('Last-Modified', new Date(timestampUtc).toUTCString());
  res.status(201).json({
    id,
    installationId: install.id,
    meterId: install.meter_id,
    timestampUtc,
    instantaneousPowerKw: power,
    cumulativeExportKwh: cumulative,
    voltageV: voltage,
    eTag: etag,
    createdAt,
  });
});

/** Readings are append-only — reject replace / delete with 405 + Allow (Level 2 verb discipline). */
router.put('/:meterId/readings', rejectMethods(['GET', 'POST'], 'Generation readings are append-only; create with POST.'));
router.put('/:meterId/readings/:readingId', rejectMethods(['GET'], 'Generation readings are immutable; GET only.'));
router.patch('/:meterId/readings', rejectMethods(['GET', 'POST'], 'Generation readings are append-only; create with POST.'));
router.patch('/:meterId/readings/:readingId', rejectMethods(['GET'], 'Generation readings are immutable; GET only.'));
router.delete('/:meterId/readings', rejectMethods(['GET', 'POST'], 'Generation readings are append-only; DELETE is not supported.'));
router.delete('/:meterId/readings/:readingId', rejectMethods(['GET'], 'Generation readings are immutable; DELETE is not supported.'));

router.get('/:meterId/readings/:readingId', requireUser, (req, res) => {
  const install = db.prepare('SELECT * FROM solar_installations WHERE meter_id = ?').get(req.params.meterId);
  if (!install) throw notFound('Installation');
  assertReadScope(req.user, install);
  const row = db.prepare(
    'SELECT * FROM generation_readings WHERE id = ? AND installation_id = ?'
  ).get(req.params.readingId, install.id);
  if (!row) throw notFound('Reading');
  if (applyConditionalGet(req, res, row.etag, row.timestamp_utc)) return;
  res.json(mapReading(row));
});

module.exports = router;
