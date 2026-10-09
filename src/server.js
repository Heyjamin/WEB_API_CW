require('dotenv').config();
const fs = require('fs');
const path = require('path');
const app = require('./app');

const port = Number(process.env.PORT || 3080);
const dbPath = path.resolve(process.cwd(), process.env.DATABASE_PATH || './data/slsea.sqlite');

if (!fs.existsSync(dbPath)) {
  // eslint-disable-next-line no-console
  console.warn(`Database not found at ${dbPath}. Run: npm run db:reset`);
}

app.listen(port, () => {
  const base = process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;
  // eslint-disable-next-line no-console
  console.log(`SLSEA API listening on ${base}`);
  // eslint-disable-next-line no-console
  console.log(`Swagger UI → ${base}/api-docs`);
});
