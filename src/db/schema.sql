-- SLSEA Solar Generation API schema (NB6007CEM coursework)

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS provinces (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS districts (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  province_code TEXT NOT NULL REFERENCES provinces(code),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS grid_substations (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  district_code TEXT NOT NULL REFERENCES districts(code),
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS solar_installations (
  id TEXT PRIMARY KEY,
  meter_id TEXT NOT NULL UNIQUE,
  account_number TEXT NOT NULL,
  inverter_id TEXT,
  installation_name TEXT NOT NULL,
  address TEXT,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  capacity_kw REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active',
  grid_substation_code TEXT NOT NULL REFERENCES grid_substations(code),
  device_api_key_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS generation_readings (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL REFERENCES solar_installations(id),
  meter_id TEXT NOT NULL,
  timestamp_utc TEXT NOT NULL,
  instantaneous_power_kw REAL NOT NULL,
  cumulative_export_kwh REAL NOT NULL,
  voltage_v REAL NOT NULL,
  etag TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (installation_id, timestamp_utc)
);

CREATE INDEX IF NOT EXISTS idx_readings_install_ts
  ON generation_readings(installation_id, timestamp_utc DESC);

CREATE INDEX IF NOT EXISTS idx_install_substation
  ON solar_installations(grid_substation_code);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  province_code TEXT REFERENCES provinces(code),
  district_code TEXT REFERENCES districts(code),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
