require('express-async-errors');
require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');

const { traceIdMiddleware, errorHandler } = require('./middleware/errors');
const { contentNegotiation, requireJsonBody } = require('./middleware/httpLevel2');
const authRoutes = require('./routes/auth');
const provinceRoutes = require('./routes/provinces');
const districtRoutes = require('./routes/districts');
const substationRoutes = require('./routes/substations');
const installationRoutes = require('./routes/installations');

const app = express();

// Behind ALB / ECS Express — honour X-Forwarded-Proto / Host for Swagger server URL
app.set('trust proxy', true);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(traceIdMiddleware);
app.use(contentNegotiation);
app.use(requireJsonBody);

// Uniform JSON representation (Richardson L2 / WSO2 §6)
app.use((_req, res, next) => {
  const origJson = res.json.bind(res);
  res.json = (body) => {
    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    return origJson(body);
  };
  next();
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'slsea-solar-api', timeUtc: new Date().toISOString() });
});

const openapiBase = YAML.load(path.join(__dirname, 'docs', 'openapi.yaml'));

/** Build OpenAPI doc with the correct server URL for this request (fixes Swagger "Try it out" on AWS). */
function openapiForRequest(req) {
  const doc = JSON.parse(JSON.stringify(openapiBase));
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
  const host = (req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
  const publicBase = process.env.PUBLIC_BASE_URL;
  const current =
    publicBase ||
    (host ? `${proto}://${host}` : null) ||
    'http://localhost:3080';

  const others = (doc.servers || []).filter((s) => s.url !== current);
  doc.servers = [{ url: current, description: 'Current host' }, ...others];
  return doc;
}

app.get('/openapi.json', (req, res) => res.json(openapiForRequest(req)));
app.use(
  '/api-docs',
  swaggerUi.serve,
  (req, res, next) => swaggerUi.setup(openapiForRequest(req), { explorer: true })(req, res, next)
);

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/provinces', provinceRoutes);
app.use('/api/v1/districts', districtRoutes);
app.use('/api/v1/grid-substations', substationRoutes);
app.use('/api/v1/installations', installationRoutes);

app.use((req, res) => {
  res.status(404).json({
    code: 'NOT_FOUND',
    message: `No route for ${req.method} ${req.path}`,
    details: null,
    traceId: req.traceId,
  });
});

app.use(errorHandler);

module.exports = app;
