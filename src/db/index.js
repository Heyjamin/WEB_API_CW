const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
require('dotenv').config();

const dbPath = process.env.DATABASE_PATH || './data/slsea.sqlite';
const abs = path.resolve(process.cwd(), dbPath);
fs.mkdirSync(path.dirname(abs), { recursive: true });

const db = new Database(abs);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

module.exports = db;
