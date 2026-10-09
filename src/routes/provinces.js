const express = require('express');
const db = require('../db');
const { requireUser } = require('../middleware/auth');
const { notFound } = require('../utils/errors');
const { weakEtag, applyConditionalGet } = require('../utils/http');
const { rejectMethods } = require('../middleware/httpLevel2');

const router = express.Router();

router.get('/', requireUser, (req, res) => {
  const rows = db.prepare('SELECT code, name, updated_at AS updatedAt FROM provinces ORDER BY code').all();
  const etag = weakEtag(['provinces', String(rows.length), rows[0]?.updatedAt || '']);
  if (applyConditionalGet(req, res, etag, rows[0]?.updatedAt)) return;
  res.json({ data: rows, count: rows.length });
});

router.get('/:code', requireUser, (req, res) => {
  const row = db.prepare('SELECT code, name, updated_at AS updatedAt FROM provinces WHERE code = ?').get(req.params.code);
  if (!row) throw notFound('Province');
  const etag = weakEtag(['province', row.code, row.updatedAt]);
  if (applyConditionalGet(req, res, etag, row.updatedAt)) return;
  res.json(row);
});

router.get('/:code/districts', requireUser, (req, res) => {
  const province = db.prepare('SELECT code FROM provinces WHERE code = ?').get(req.params.code);
  if (!province) throw notFound('Province');
  const rows = db.prepare(
    'SELECT code, name, province_code AS provinceCode, updated_at AS updatedAt FROM districts WHERE province_code = ? ORDER BY code'
  ).all(req.params.code);
  res.json({ data: rows, count: rows.length });
});

/** Hierarchy geography is read-only for SLSEA users (device write is readings only). */
router.post('/', rejectMethods(['GET'], 'Provinces are read-only. Use GET to list.'));
router.put('/:code', rejectMethods(['GET'], 'Provinces are read-only. Use GET to retrieve.'));
router.patch('/:code', rejectMethods(['GET'], 'Provinces are read-only. Use GET to retrieve.'));
router.delete('/:code', rejectMethods(['GET'], 'Provinces are read-only. Use GET to retrieve.'));

module.exports = router;
