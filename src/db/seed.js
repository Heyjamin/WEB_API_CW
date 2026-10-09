/**
 * Seed SLSEA domain data per NB6007CEM brief:
 * 9 provinces, 25 districts, ≥20 substations, ≥200 installations,
 * ≥1 week of 15-minute readings per installation (diurnal shape).
 */
require('dotenv').config();
const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./index');
require('./migrate');

const DEMO_DEVICE_KEY = 'slsea-demo-device-key-001';
const nowIso = () => new Date().toISOString();

const PROVINCES = [
  ['WP', 'Western'], ['CP', 'Central'], ['SP', 'Southern'], ['NP', 'Northern'],
  ['EP', 'Eastern'], ['NW', 'North Western'], ['NC', 'North Central'],
  ['SG', 'Sabaragamuwa'], ['UV', 'Uva'],
];

const DISTRICTS = {
  WP: [['WP-D01', 'Colombo'], ['WP-D02', 'Gampaha'], ['WP-D03', 'Kalutara']],
  CP: [['CP-D01', 'Kandy'], ['CP-D02', 'Matale'], ['CP-D03', 'Nuwara Eliya']],
  SP: [['SP-D01', 'Galle'], ['SP-D02', 'Matara'], ['SP-D03', 'Hambantota']],
  NP: [
    ['NP-D01', 'Jaffna'], ['NP-D02', 'Kilinochchi'], ['NP-D03', 'Mannar'],
    ['NP-D04', 'Mullaitivu'], ['NP-D05', 'Vavuniya'],
  ],
  EP: [['EP-D01', 'Batticaloa'], ['EP-D02', 'Ampara'], ['EP-D03', 'Trincomalee']],
  NW: [['NW-D01', 'Kurunegala'], ['NW-D02', 'Puttalam']],
  NC: [['NC-D01', 'Anuradhapura'], ['NC-D02', 'Polonnaruwa']],
  SG: [['SG-D01', 'Ratnapura'], ['SG-D02', 'Kegalle']],
  UV: [['UV-D01', 'Badulla'], ['UV-D02', 'Monaragala']],
};

const COORDS = {
  'WP-D01': [6.9271, 79.8612], 'WP-D02': [7.0912, 79.999], 'WP-D03': [6.5854, 79.9607],
  'CP-D01': [7.2906, 80.6337], 'CP-D02': [7.4675, 80.6234], 'CP-D03': [6.9497, 80.7891],
  'SP-D01': [6.0535, 80.221], 'SP-D02': [5.9549, 80.555], 'SP-D03': [6.124, 81.1185],
  'NP-D01': [9.6615, 80.0255], 'NP-D02': [9.3803, 80.377], 'NP-D03': [8.981, 79.904],
  'NP-D04': [9.2671, 80.8142], 'NP-D05': [8.7514, 80.4971],
  'EP-D01': [7.7309, 81.6747], 'EP-D02': [7.2975, 81.682], 'EP-D03': [8.5874, 81.2152],
  'NW-D01': [7.4818, 80.3609], 'NW-D02': [8.0362, 79.8283],
  'NC-D01': [8.3114, 80.4037], 'NC-D02': [7.9403, 81.0188],
  'SG-D01': [6.7056, 80.3847], 'SG-D02': [7.2513, 80.3464],
  'UV-D01': [6.9934, 81.055], 'UV-D02': [6.8726, 81.3507],
};

db.exec('DELETE FROM generation_readings; DELETE FROM solar_installations; DELETE FROM users; DELETE FROM grid_substations; DELETE FROM districts; DELETE FROM provinces;');

const insertProvince = db.prepare('INSERT INTO provinces (code, name, updated_at) VALUES (?, ?, ?)');
const insertDistrict = db.prepare('INSERT INTO districts (code, name, province_code, updated_at) VALUES (?, ?, ?, ?)');
const insertSub = db.prepare('INSERT INTO grid_substations (code, name, district_code, latitude, longitude, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
const insertInstall = db.prepare(`INSERT INTO solar_installations
  (id, meter_id, account_number, inverter_id, installation_name, address, latitude, longitude, capacity_kw, status, grid_substation_code, device_api_key_hash, updated_at, created_at)
  VALUES (@id, @meter_id, @account_number, @inverter_id, @installation_name, @address, @latitude, @longitude, @capacity_kw, @status, @grid_substation_code, @device_api_key_hash, @updated_at, @created_at)`);
const insertReading = db.prepare(`INSERT INTO generation_readings
  (id, installation_id, meter_id, timestamp_utc, instantaneous_power_kw, cumulative_export_kwh, voltage_v, etag, created_at)
  VALUES (@id, @installation_id, @meter_id, @timestamp_utc, @instantaneous_power_kw, @cumulative_export_kwh, @voltage_v, @etag, @created_at)`);
const insertUser = db.prepare(`INSERT INTO users
  (id, username, email, password_hash, role, province_code, district_code, is_active, created_at, updated_at)
  VALUES (@id, @username, @email, @password_hash, @role, @province_code, @district_code, @is_active, @created_at, @updated_at)`);

const ts = nowIso();
const deviceHash = bcrypt.hashSync(DEMO_DEVICE_KEY, 10);

const seed = db.transaction(() => {
  for (const [code, name] of PROVINCES) insertProvince.run(code, name, ts);

  const districtList = [];
  for (const [pCode, list] of Object.entries(DISTRICTS)) {
    for (const [dCode, dName] of list) {
      insertDistrict.run(dCode, dName, pCode, ts);
      districtList.push({ code: dCode, province: pCode, name: dName });
    }
  }

  const substations = [];
  let gs = 1;
  for (const d of districtList) {
    const [lat, lng] = COORDS[d.code] || [7.87, 80.77];
    const code = `GS-${String(gs).padStart(3, '0')}`;
    insertSub.run(code, `${d.name} Grid Substation`, d.code, lat, lng, ts);
    substations.push({ code, district: d.code, lat, lng });
    gs += 1;
  }

  const installations = [];
  const INSTALL_COUNT = 200;
  for (let i = 1; i <= INSTALL_COUNT; i++) {
    const sub = substations[(i - 1) % substations.length];
    const id = randomUUID();
    const meterId = `MTR-${String(i).padStart(6, '0')}`;
    const ring = ((i % 20) - 10) * 0.008;
    insertInstall.run({
      id,
      meter_id: meterId,
      account_number: String(302345643 + i).padStart(10, '0'),
      inverter_id: `INV-${String(i).padStart(6, '0')}`,
      installation_name: `Rooftop Site ${i}`,
      address: `Sample Address ${i}, Sri Lanka`,
      latitude: sub.lat + ring,
      longitude: sub.lng + ring * 0.6,
      capacity_kw: 5 + (i % 20),
      status: 'Active',
      grid_substation_code: sub.code,
      device_api_key_hash: deviceHash,
      updated_at: ts,
      created_at: ts,
    });
    installations.push({ id, meterId, capacity: 5 + (i % 20) });
  }

  // 7 days × 15-min intervals during daylight (06:00–18:00 UTC) → pagination matters
  const dayMs = 24 * 60 * 60 * 1000;
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end.getTime() - 7 * dayMs);

  for (const inst of installations) {
    let cumulative = 100 + inst.capacity * 10;
    for (let t = start.getTime(); t < end.getTime(); t += 15 * 60 * 1000) {
      const d = new Date(t);
      const hour = d.getUTCHours() + d.getUTCMinutes() / 60;
      let power = 0;
      if (hour >= 6 && hour <= 18) {
        const x = (hour - 6) / 12;
        power = Math.max(0, inst.capacity * Math.sin(Math.PI * x) * (0.75 + (inst.capacity % 5) * 0.02));
      }
      const intervalKwh = power * 0.25; // 15 minutes
      cumulative += intervalKwh;
      if (power <= 0 && hour > 18) continue; // skip empty overnight rows to keep seed leaner
      if (power <= 0 && hour < 6) continue;
      insertReading.run({
        id: randomUUID(),
        installation_id: inst.id,
        meter_id: inst.meterId,
        timestamp_utc: d.toISOString(),
        instantaneous_power_kw: Number(power.toFixed(4)),
        cumulative_export_kwh: Number(cumulative.toFixed(4)),
        voltage_v: 230,
        etag: `W/"${randomUUID().replace(/-/g, '')}"`,
        created_at: ts,
      });
    }
  }

  const pw = bcrypt.hashSync('Admin@12345', 10);
  insertUser.run({
    id: randomUUID(), username: 'national.admin', email: 'admin@slsea.example',
    password_hash: pw, role: 'NationalAdmin', province_code: null, district_code: null,
    is_active: 1, created_at: ts, updated_at: ts,
  });
  insertUser.run({
    id: randomUUID(), username: 'wp.admin', email: 'wp@slsea.example',
    password_hash: pw, role: 'ProvincialAdmin', province_code: 'WP', district_code: null,
    is_active: 1, created_at: ts, updated_at: ts,
  });
  insertUser.run({
    id: randomUUID(), username: 'colombo.admin', email: 'colombo@slsea.example',
    password_hash: pw, role: 'DistrictAdmin', province_code: 'WP', district_code: 'WP-D01',
    is_active: 1, created_at: ts, updated_at: ts,
  });
});

seed();

const counts = {
  provinces: db.prepare('SELECT COUNT(*) c FROM provinces').get().c,
  districts: db.prepare('SELECT COUNT(*) c FROM districts').get().c,
  substations: db.prepare('SELECT COUNT(*) c FROM grid_substations').get().c,
  installations: db.prepare('SELECT COUNT(*) c FROM solar_installations').get().c,
  readings: db.prepare('SELECT COUNT(*) c FROM generation_readings').get().c,
  users: db.prepare('SELECT COUNT(*) c FROM users').get().c,
};

console.log('Seed complete:', counts);
console.log('Demo device API key (all seeded meters):', DEMO_DEVICE_KEY);
console.log('Users: national.admin / wp.admin / colombo.admin  password: Admin@12345');
