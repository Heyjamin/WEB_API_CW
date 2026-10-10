# Appendix A — Design-Spine Coverage Map

**API:** SLSEA Real-Time Solar Generation Data API (`slsea-solar-api` 1.0.0)  
**Target:** Richardson Maturity Model Level 2 (brief). Level 3 hypermedia is not claimed.  
**Contract:** `spec.md`. Machine-readable description: `src/docs/openapi.yaml`.

This appendix maps each required capability to the endpoint, source file, status codes, headers, and security control that implement it.

Base path for versioned resources: `/api/v1`.

## A.1 Brief §5 — resources

| ID | Required capability | Endpoint | Implementation | Status, headers, security |
| --- | --- | --- | --- | --- |
| R1 | Hierarchy collection — provinces | `GET /api/v1/provinces` | `src/routes/provinces.js` | **200** `{ data, count }`. `ETag`, `Last-Modified`; `If-None-Match` / `If-Modified-Since` → **304**. JWT via `requireUser` in `src/middleware/auth.js`. List is not filtered by role. |
| R2 | Hierarchy item — province | `GET /api/v1/provinces/{code}` | `src/routes/provinces.js` | **200** `{ code, name, updatedAt }`. Same conditional GET as R1. Unknown code → **404** `NOT_FOUND`. JWT. |
| R3 | Hierarchy collection — districts | `GET /api/v1/districts` | `src/routes/districts.js` | **200** `{ data, count }`. JWT. `ProvincialAdmin` limited to `provinceCode`; `DistrictAdmin` limited to `districtCode`. No ETag on this list. |
| R4 | Hierarchy item — district | `GET /api/v1/districts/{code}` | `src/routes/districts.js` | **200** district object. Conditional GET. Unknown → **404**. Outside jurisdiction → **403** `FORBIDDEN`. JWT. |
| R5 | Hierarchy collection — grid substations | `GET /api/v1/grid-substations` | `src/routes/substations.js` (`canAccessSubstation`) | **200** `{ data, count }` after jurisdiction filter. JWT. No ETag on this list. |
| R6 | Hierarchy item — grid substation | `GET /api/v1/grid-substations/{code}` | `src/routes/substations.js` | **200**. Conditional GET. Unknown → **404**. Outside jurisdiction → **403**. JWT. |
| R7 | Hierarchy collection — installations | `GET /api/v1/installations` | `src/routes/installations.js`; scope SQL from `scopedInstallationFilter` in `src/middleware/auth.js` | **200** paged body `{ data, offset, limit, count, links }`. JWT. Filters: `provinceCode`, `districtCode`, `substationCode`, `status`. An out-of-scope filter returns an empty page, not 403. |
| R8 | Hierarchy item — installation | `GET /api/v1/installations/{meterId}` | `src/routes/installations.js` (`mapInstall`); `assertReadScope` | **200**. Conditional GET. Unknown meter → **404**. Outside jurisdiction → **403**. Device key hash is never returned. JWT. |
| R9 | Scoped nested collection — districts in a province | `GET /api/v1/provinces/{code}/districts` | `src/routes/provinces.js` | **200** `{ data, count }` for that province code. Unknown province → **404**. Path scope only; the caller’s role does not further filter this list. JWT. |
| R10 | Scoped nested collection — substations in a district | `GET /api/v1/districts/{code}/grid-substations` | `src/routes/districts.js` | **200**. Unknown district → **404**. Outside jurisdiction → **403**. JWT. |
| R11 | Scoped nested collection — installations on a substation | `GET /api/v1/grid-substations/{code}/installations` | `src/routes/substations.js` | **200** `{ data, count }`, ordered by `meterId`. Not paged. Unknown substation → **404**. Outside jurisdiction → **403**. JWT. |
| R12 | Composite resource | `GET /api/v1/installations/{meterId}/composite` | `src/routes/installations.js` | **200** `{ installation, substation, district, province, lastReading }`. `lastReading` is `null` when none exist. Conditional GET uses installation `updatedAt` and the last reading etag. **404** / **403** as R8. JWT. |
| R13 | Operational last-known reading | `GET /api/v1/installations/{meterId}/last-reading` | `src/routes/installations.js` | **200** latest row by `timestamp_utc`. Conditional GET uses the stored reading `etag`. Installation missing → **404**. No readings → **404** `Reading was not found.` Outside jurisdiction → **403**. JWT. |
| R14 | Analytical readings history | `GET /api/v1/installations/{meterId}/readings` | `src/routes/installations.js`; `paginationLinks` in `src/utils/http.js` | **200** paged body. Query: `offset` (default 0), `limit` (default 50, max 200), `fromUtc`, `toUtc`, `sort=timestampUtc`, `order=asc\|desc` (default `desc`). **404** / **403** as R8. JWT. |
| R15 | Single reading | `GET /api/v1/installations/{meterId}/readings/{readingId}` | `src/routes/installations.js` | **200**. Conditional GET. Unknown installation or reading id → **404**. Outside jurisdiction → **403**. JWT. |
| R16 | Device write (append-only create) | `POST /api/v1/installations/{meterId}/readings` | `src/routes/installations.js`; `requireDeviceForInstallation` in `src/middleware/auth.js` | **201** reading body. `Location` and `Content-Location` point at `/api/v1/installations/{meterId}/readings/{id}`. `ETag`, `Last-Modified`. See A.2 for 400, 401, 409, 415, 422. |
| R17 | Stretch — district generation summary | `GET /api/v1/districts/{code}/generation-summary` | `src/routes/districts.js` | **200** `{ districtCode, districtName, asOfUtc, installationCount, totalCapacityKw, currentTotalPowerKw, todayEnergyKwh }`. Computed, not stored. Unknown → **404**. Outside jurisdiction → **403**. JWT. |

## A.2 Richardson Level 2 — verbs, status, headers

| ID | Required capability | Where | Evidence |
| --- | --- | --- | --- |
| L0 | No single-endpoint RPC | All routes mounted in `src/app.js` | Each capability has its own URI under `/api/v1`. Login is `POST /api/v1/auth/login`, not a shared command tunnel. |
| L1 | Resources identified by URI | `src/routes/*.js`, `src/docs/openapi.yaml` | Nouns: provinces, districts, grid-substations, installations, readings, composite, last-reading, generation-summary. |
| L2a | Safe retrieval uses GET | Every read handler | **200** on success. |
| L2b | Create uses POST | `POST /api/v1/auth/login`; `POST .../readings` | Login **200** (token issue, not a new user resource). Reading create **201**. |
| L2c | Illegal verbs rejected with Allow | `rejectMethods` in `src/middleware/httpLevel2.js` | Geography: `POST` on the collection and `PUT` / `PATCH` / `DELETE` on the item → **405** `METHOD_NOT_ALLOWED`, `Allow: GET`. Readings collection: `PUT` / `PATCH` / `DELETE` → **405**, `Allow: GET, POST`. Reading item: those verbs → **405**, `Allow: GET`. |
| L2d | Unregistered route | Final handler in `src/app.js` | **404** `NOT_FOUND`, message `No route for {METHOD} {path}`. |
| H1 | `Content-Type` | JSON wrapper in `src/app.js` | Success and error bodies: `application/json; charset=utf-8`. |
| H2 | `Location` and `Content-Location` | Reading `POST` in `src/routes/installations.js` | Both set to the new reading URI on **201**. |
| H3 | Conditional GET | `weakEtag` and `applyConditionalGet` in `src/utils/http.js` | Response: `ETag`, `Last-Modified`. Request: `If-None-Match` (exact match) or `If-Modified-Since`. Match → **304** empty body. Used on R1, R2, R4, R6, R8, R12, R13, R15. Not used on district, substation, or paged lists. |
| H4 | Content negotiation | `contentNegotiation` in `src/middleware/httpLevel2.js` | `Accept` omitted, `application/json`, `application/*`, `*/*`, or `application/problem+json` is accepted. Anything else → **406** `NOT_ACCEPTABLE`, response header `Accept: application/json` (`src/middleware/errors.js`). Skipped for `/api-docs` and `/openapi.json`. |
| H5 | Request media type | `requireJsonBody` in `src/middleware/httpLevel2.js` | Every `POST` without `Content-Type: application/json` → **415** `UNSUPPORTED_MEDIA_TYPE`. Body limit 1 MB (`src/app.js`). |
| H6 | Authentication challenge | `errorHandler` in `src/middleware/errors.js` | **401** sets `WWW-Authenticate`. User path: `Bearer realm="slsea-api"`. Device path, when `X-Device-Api-Key` is present: `ApiKey realm="slsea-device", header="X-Device-Api-Key"`. |
| H7 | Correlation | `traceIdMiddleware` in `src/middleware/errors.js` | Every response includes `X-Trace-Id`. The same value is `traceId` in the error body. |
| H8 | Pagination links | `paginationLinks` in `src/utils/http.js` | `links.next` when `offset + limit < count`. `links.prev` when `offset > 0`. Absolute URLs. Navigational only; not a Level 3 control vocabulary. Installations: `limit` default 20, max 100. Readings: default 50, max 200. `offset` default 0, minimum 0. |
| E1 | Uniform error body | `errorBody` in `src/utils/errors.js`; `errorHandler` | `{ code, message, details, traceId }` on every error. |

### Status codes

| Status | Code | Where it is produced |
| --- | --- | --- |
| **200** | — | Reads and login |
| **201** | — | `POST .../readings` |
| **304** | — | `applyConditionalGet` |
| **400** | `BAD_REQUEST` | Login missing `username` or `password` (`src/routes/auth.js`). Reading body missing numeric `instantaneousPowerKw` or `cumulativeExportKwh`. |
| **401** | `UNAUTHORIZED` | Missing, invalid, or non-user JWT. Missing, unknown-meter, or wrong device key. Unknown meter on the write path is **401**, not 404. |
| **403** | `FORBIDDEN` | `assertReadScope` and the district/substation role checks. Resource exists but is outside jurisdiction. |
| **404** | `NOT_FOUND` | `notFound()` for a missing province, district, substation, installation, or reading. Also the catch-all in `src/app.js`. |
| **405** | `METHOD_NOT_ALLOWED` | `rejectMethods`. `Allow` header set. |
| **406** | `NOT_ACCEPTABLE` | `contentNegotiation` |
| **409** | `CONFLICT` | Duplicate `(installation, timestampUtc)` on create. `details.existingId`, `details.timestampUtc`. |
| **415** | `UNSUPPORTED_MEDIA_TYPE` | `requireJsonBody` |
| **422** | `UNPROCESSABLE_ENTITY` | `cumulativeExportKwh` lower than the previous register. `details.previousCumulativeExportKwh`, `details.submitted`. |
| **500** | `INTERNAL_ERROR` | Any error that is not an `AppError`, including a JSON body Express cannot parse. |

## A.3 Security

| ID | Control | Implementation | Behaviour |
| --- | --- | --- | --- |
| S1 | User authentication | `POST /api/v1/auth/login` in `src/routes/auth.js`; `signUser` in `src/middleware/auth.js` | Active user, bcrypt password check. HS256 JWT, `JWT_SECRET`, lifetime 8 hours (`expiresIn: 28800`). Claims: `sub`, `username`, `role`, `provinceCode`, `districtCode`, `kind: "user"`. |
| S2 | User authorisation on reads | `requireUser` | `Authorization: Bearer <token>`. Missing or bad token → **401**. `kind` other than `user` → **401**. |
| S3 | Jurisdiction | `assertReadScope`, `scopedInstallationFilter`, district and substation filters | `NationalAdmin`: all rows. `ProvincialAdmin`: matching `provinceCode`. `DistrictAdmin`: matching `districtCode`. Any other role: no installation rows. |
| S4 | Device authentication on write | `requireDeviceForInstallation` | Header `X-Device-Api-Key`, bcrypt against `solar_installations.device_api_key_hash` for that `meterId`. |
| S5 | Credential storage | `src/db/schema.sql`, `src/db/seed.js` | Passwords and device keys stored as bcrypt hashes. API responses omit both. |
| S6 | Demo actors | `src/db/seed.js`, `README.md` | `national.admin` (national), `wp.admin` (Western `WP`), `colombo.admin` (Colombo `WP-D01`). Password `Admin@12345`. Shared demo device key `slsea-demo-device-key-001`. |

Province list (R1) and province-scoped districts (R9) are authenticated but not jurisdiction-filtered. District, substation, and installation reads are.

## A.4 Data, documentation, and operations

| ID | Capability | Implementation |
| --- | --- | --- |
| D1 | Schema | `src/db/schema.sql`. Tables: `provinces`, `districts`, `grid_substations`, `solar_installations`, `generation_readings`, `users`. Unique `(installation_id, timestamp_utc)` on readings. |
| D2 | Seed volume | `src/db/seed.js`, run by `npm run db:reset`. 9 provinces, 25 districts, 25 substations (`GS-001`–`GS-025`), 200 installations (`MTR-000001`–`MTR-000200`), about one week of 15-minute daytime readings (06:00–18:00 UTC), 3 users. |
| D3 | API version | Prefix `/api/v1` in `src/app.js`. |
| D4 | OpenAPI | `src/docs/openapi.yaml`, served as `GET /openapi.json` with the current host first in `servers`. |
| D5 | Swagger UI | `GET /api-docs` via `swagger-ui-express` in `src/app.js`. |
| D6 | Liveness | `GET /health` → **200** `{ status, service, timeUtc }`. No authentication. Does not check the database. |
| D7 | Process entry | `src/server.js`. Port `PORT` or 3080. Docker: `Dockerfile`, `docker-compose.yml`, `docker-entrypoint.sh` (migrate and seed when the SQLite file is missing). |

## A.5 File index

| File | Design-spine role |
| --- | --- |
| `src/app.js` | Mounts, health, OpenAPI, Swagger, JSON content type, 404 |
| `src/routes/auth.js` | Login |
| `src/routes/provinces.js` | R1, R2, R9, geography 405 |
| `src/routes/districts.js` | R3, R4, R10, R17, geography 405 |
| `src/routes/substations.js` | R5, R6, R11, geography 405 |
| `src/routes/installations.js` | R7, R8, R12–R16, reading 405 |
| `src/middleware/auth.js` | S1–S4 |
| `src/middleware/httpLevel2.js` | 405, 406, 415 |
| `src/middleware/errors.js` | `X-Trace-Id`, `WWW-Authenticate`, `Allow`, `Accept` |
| `src/utils/errors.js` | Error codes and body shape |
| `src/utils/http.js` | ETag, 304, pagination links |
| `src/db/schema.sql` | Persistence |
| `src/db/seed.js` | Demonstration data |
| `src/docs/openapi.yaml` | Published contract |
| `spec.md` | Human-readable contract |

## A.6 Not claimed

| Item | Position |
| --- | --- |
| Richardson Level 3 (HATEOAS) | Out of scope. `links.next` / `links.prev` are convenience URLs only. |
| Create, update, or delete geography, installations, or users | Not implemented. Explicit illegal verbs on geography return **405**. |
| Update or delete a reading | Append-only. **405** with `Allow`. |
| Representations other than JSON | **406** / **415**. |
