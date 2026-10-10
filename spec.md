# SLSEA Real-Time Solar Generation Data API

**Specification version:** 1.0.0  
**Service:** `slsea-solar-api`  
**Richardson maturity:** Level 2

This document is the contract for the Node.js API in this repository. It describes the resources, authentication, request and response shapes, and status codes implemented in `src/`. Machine-readable companion: `src/docs/openapi.yaml` (served at `/openapi.json` and `/api-docs`).

## 1. Purpose

The API publishes Sri Lanka Sustainable Energy Authority (SLSEA) solar generation data for a fixed geography hierarchy:

```
Province → District → Grid substation → Solar installation → Generation reading
```

Two actors use it:

| Actor | Direction | Credential |
| --- | --- | --- |
| SLSEA user | Read | JWT from `POST /api/v1/auth/login` |
| Metering device | Write (append a reading) | `X-Device-Api-Key` on the installation |

Geography (provinces, districts, substations, installations) is read-only. Generation readings are append-only.

## 2. Base URL and version

All versioned resources live under `/api/v1`.

| Environment | Base URL |
| --- | --- |
| Local | `http://localhost:3080` |
| Public HTTPS | `https://sl-aced683b8da34d50806d14bcab9d5a82.ecs.ap-southeast-1.on.aws` |

`GET /openapi.json` rewrites the OpenAPI `servers` entry to the host of the current request (`PUBLIC_BASE_URL`, else `X-Forwarded-Proto` / `X-Forwarded-Host`, else the request host). The process listens on `PORT` (default `3080`).

## 3. Representation

JSON is the only representation.

- Successful bodies use `Content-Type: application/json; charset=utf-8`.
- `Accept` may be omitted, `application/json`, `application/*`, `*/*`, or `application/problem+json`. Any other `Accept` returns **406** with an `Accept: application/json` response header. This check is skipped for `/api-docs` and `/openapi.json`.
- Every `POST` requires a `Content-Type` that includes `application/json`. A missing or other type returns **415**. Request bodies are limited to 1 MB.
- CORS is open. Responses include `X-Trace-Id` (UUID) on every request, including errors.

### 3.1 Error body

Every error uses the same object:

```json
{
  "code": "NOT_FOUND",
  "message": "Installation was not found.",
  "details": null,
  "traceId": "8c1e0a3e-7b2d-4f1a-9c0e-123456789abc"
}
```

| Field | Type | Meaning |
| --- | --- | --- |
| `code` | string | Stable machine code (see §8) |
| `message` | string | Human-readable explanation |
| `details` | object or null | Extra context when the handler supplies it |
| `traceId` | string | Same value as `X-Trace-Id` |

### 3.2 Collections and pagination

Unpaged collections:

```json
{ "data": [ ], "count": 0 }
```

Paged collections (`GET /installations`, `GET /installations/{meterId}/readings`):

```json
{
  "data": [ ],
  "offset": 0,
  "limit": 20,
  "count": 200,
  "links": {
    "next": "http://localhost:3080/api/v1/installations?offset=20&limit=20",
    "prev": "http://localhost:3080/api/v1/installations?offset=0&limit=20"
  }
}
```

`count` is the total number of matching rows, not the page size. `links.next` is present when `offset + limit < count`. `links.prev` is present when `offset > 0`. These links are absolute URLs for navigation only. They are not a hypermedia control vocabulary (Level 3 is out of scope).

`offset` defaults to `0` and is clamped to `>= 0`. Non-numeric values are treated as `0`.

### 3.3 Conditional GET

Single-resource reads that support caching send:

| Header | Value |
| --- | --- |
| `ETag` | Weak validator, `W/"<sha1>"` for geography and installations; the stored reading etag for readings |
| `Last-Modified` | HTTP date of the resource timestamp |

Clients may send `If-None-Match` (exact match against `ETag`) or `If-Modified-Since`. A match returns **304** with an empty body.

Supported on: province (list and item), district item, grid substation item, installation item, composite, last reading, and a single reading. List endpoints for districts, substations, and paged collections do not send validators.

### 3.4 Method discipline

Resources that reject a verb return **405** with an `Allow` header listing the permitted methods. Verbs with no registered route return **404** (`No route for {METHOD} {path}`), not 405.

## 4. Authentication and jurisdiction

### 4.1 SLSEA users (read path)

`Authorization: Bearer <accessToken>`

The token is an HS256 JWT signed with `JWT_SECRET`, lifetime **8 hours** (`expiresIn` in the login body is `28800` seconds). Claims:

| Claim | Meaning |
| --- | --- |
| `sub` | User id |
| `username` | Login name |
| `role` | `NationalAdmin`, `ProvincialAdmin`, or `DistrictAdmin` |
| `provinceCode` | Set for provincial and district admins |
| `districtCode` | Set for district admins |
| `kind` | Must be `user`. Other kinds are rejected |

Missing, invalid, or expired tokens return **401** and:

```
WWW-Authenticate: Bearer realm="slsea-api"
```

### 4.2 Jurisdiction

| Role | Sees |
| --- | --- |
| `NationalAdmin` | Every district, substation, installation, and reading |
| `ProvincialAdmin` | Rows whose province matches `provinceCode` |
| `DistrictAdmin` | Rows whose district matches `districtCode` |
| Any other role | No installation rows (`403` on a direct read) |

Scope is applied as follows:

- `GET /provinces` and `GET /provinces/{code}/districts` return the full hierarchy. They are not filtered by role.
- `GET /districts`, `GET /districts/{code}`, nested substations, and `generation-summary` return **403** when the district is outside the caller's province or district.
- Substation and installation reads return **403** when the parent district is outside scope. The resource is looked up first, so an unknown id is **404** and an out-of-scope id is **403**.
- `GET /installations` intersects the caller's scope with query filters. An out-of-scope filter yields an empty page (`count: 0`), not 403.

### 4.3 Metering devices (write path)

`POST /api/v1/installations/{meterId}/readings` requires:

```
X-Device-Api-Key: <installation key>
```

The key is checked with bcrypt against `solar_installations.device_api_key_hash` for that `meterId`. A missing key, unknown meter, or wrong key all return **401** (an unknown meter is not **404** on this path). When the header is present, the challenge is:

```
WWW-Authenticate: ApiKey realm="slsea-device", header="X-Device-Api-Key"
```

Seeded installations share one demo key: `slsea-demo-device-key-001`.

### 4.4 Demo users

Password for all three is `Admin@12345`.

| Username | Role | Scope |
| --- | --- | --- |
| `national.admin` | `NationalAdmin` | National |
| `wp.admin` | `ProvincialAdmin` | Province `WP` (Western) |
| `colombo.admin` | `DistrictAdmin` | District `WP-D01` (Colombo) |

## 5. Resources

### 5.1 Health

`GET /health` — no authentication.

```json
{
  "status": "ok",
  "service": "slsea-solar-api",
  "timeUtc": "2026-10-10T03:00:00.000Z"
}
```

**200** always when the process is up. This route does not check the database.

### 5.2 Login

`POST /api/v1/auth/login`

Request:

```json
{ "username": "national.admin", "password": "Admin@12345" }
```

| Status | When |
| --- | --- |
| **200** | Active user and password match |
| **400** | `username` or `password` missing (`BAD_REQUEST`) |
| **401** | Unknown user, inactive user, or bad password. Message: `Username or Password incorrect. Please try again.` |
| **415** | `Content-Type` is not JSON |

**200** body:

```json
{
  "accessToken": "<jwt>",
  "tokenType": "Bearer",
  "expiresIn": 28800,
  "user": {
    "id": "<uuid>",
    "username": "national.admin",
    "email": "admin@slsea.example",
    "role": "NationalAdmin",
    "provinceCode": null,
    "districtCode": null
  }
}
```

### 5.3 Province

| Method | Path | Success |
| --- | --- | --- |
| `GET` | `/api/v1/provinces` | **200** `{ data, count }`, plus `ETag` |
| `GET` | `/api/v1/provinces/{code}` | **200** province object |
| `GET` | `/api/v1/provinces/{code}/districts` | **200** districts in that province |
| `POST` | `/api/v1/provinces` | **405** `Allow: GET` |
| `PUT`, `PATCH`, `DELETE` | `/api/v1/provinces/{code}` | **405** `Allow: GET` |

Province object:

```json
{ "code": "WP", "name": "Western", "updatedAt": "2026-10-10T03:00:00.000Z" }
```

District object inside the nested collection adds `provinceCode`.

Unknown `{code}` on the item or nested collection is **404** `Province was not found.`

Seeded codes: `WP`, `CP`, `SP`, `NP`, `EP`, `NW`, `NC`, `SG`, `UV`.

### 5.4 District

| Method | Path | Success |
| --- | --- | --- |
| `GET` | `/api/v1/districts` | **200** districts inside the caller's jurisdiction |
| `GET` | `/api/v1/districts/{code}` | **200** district object |
| `GET` | `/api/v1/districts/{code}/grid-substations` | **200** substations in that district |
| `GET` | `/api/v1/districts/{code}/generation-summary` | **200** aggregate (below) |
| `POST` | `/api/v1/districts` | **405** `Allow: GET` |
| `PUT`, `PATCH`, `DELETE` | `/api/v1/districts/{code}` | **405** `Allow: GET` |

District object:

```json
{
  "code": "WP-D01",
  "name": "Colombo",
  "provinceCode": "WP",
  "updatedAt": "2026-10-10T03:00:00.000Z"
}
```

Unknown code is **404**. A known code outside jurisdiction is **403**.

#### Generation summary

`GET /api/v1/districts/{code}/generation-summary` is a computed resource, not a stored row.

```json
{
  "districtCode": "WP-D01",
  "districtName": "Colombo",
  "asOfUtc": "2026-10-10T03:00:00.000Z",
  "installationCount": 8,
  "totalCapacityKw": 100,
  "currentTotalPowerKw": 12.345,
  "todayEnergyKwh": 40.5
}
```

| Field | Calculation |
| --- | --- |
| `installationCount` | Installations whose substation belongs to the district |
| `totalCapacityKw` | Sum of `capacityKw` for those installations, 2 decimal places |
| `currentTotalPowerKw` | Sum of `instantaneousPowerKw` from each installation's latest reading, 3 decimal places |
| `todayEnergyKwh` | For each installation, `max(cumulativeExportKwh) - min(cumulativeExportKwh)` among readings whose UTC date is today, then summed, 3 decimal places |
| `asOfUtc` | Server time when the response is built |

"Today" is the server's current UTC calendar date (`YYYY-MM-DD`).

### 5.5 Grid substation

| Method | Path | Success |
| --- | --- | --- |
| `GET` | `/api/v1/grid-substations` | **200** substations inside jurisdiction |
| `GET` | `/api/v1/grid-substations/{code}` | **200** substation object |
| `GET` | `/api/v1/grid-substations/{code}/installations` | **200** installations on that substation (not paged) |
| `POST` | `/api/v1/grid-substations` | **405** `Allow: GET` |
| `PUT`, `PATCH`, `DELETE` | `/api/v1/grid-substations/{code}` | **405** `Allow: GET` |

Substation object:

```json
{
  "code": "GS-001",
  "name": "Colombo Grid Substation",
  "districtCode": "WP-D01",
  "latitude": 6.9271,
  "longitude": 79.8612,
  "updatedAt": "2026-10-10T03:00:00.000Z"
}
```

Installation objects in the nested collection use the installation shape in §5.6, without `createdAt` (the nested query does not select it).

Seeded codes are `GS-001` through `GS-025`, one substation per district, ordered with the district seed.

### 5.6 Installation

| Method | Path | Success |
| --- | --- | --- |
| `GET` | `/api/v1/installations` | **200** paged list |
| `GET` | `/api/v1/installations/{meterId}` | **200** installation |
| `GET` | `/api/v1/installations/{meterId}/composite` | **200** installation plus geography plus last reading |

Installation object:

```json
{
  "id": "<uuid>",
  "meterId": "MTR-000001",
  "accountNumber": "0302345644",
  "inverterId": "INV-000001",
  "installationName": "Rooftop Site 1",
  "address": "Sample Address 1, Sri Lanka",
  "latitude": 6.9271,
  "longitude": 79.8612,
  "capacityKw": 6,
  "status": "Active",
  "gridSubstationCode": "GS-001",
  "updatedAt": "2026-10-10T03:00:00.000Z",
  "createdAt": "2026-10-10T03:00:00.000Z"
}
```

`device_api_key_hash` is never returned.

#### List query

| Parameter | Default | Rule |
| --- | --- | --- |
| `offset` | `0` | Integer ≥ 0 |
| `limit` | `20` | Integer from 1 to 100 |
| `provinceCode` | — | Keep installations whose substation's district is in this province |
| `districtCode` | — | Keep installations whose substation is in this district |
| `substationCode` | — | Exact `gridSubstationCode` |
| `status` | — | Exact status string (seeded value is `Active`) |

Results are ordered by `meterId`. Jurisdiction scope is always applied (§4.2).

Seeded meter ids run from `MTR-000001` to `MTR-000200`.

#### Composite

`GET /api/v1/installations/{meterId}/composite`

```json
{
  "installation": { },
  "substation": { "code": "GS-001", "name": "Colombo Grid Substation" },
  "district": { "code": "WP-D01", "name": "Colombo" },
  "province": { "code": "WP", "name": "Western" },
  "lastReading": { }
}
```

`lastReading` is the reading with the greatest `timestampUtc`, or `null` when the installation has none. `ETag` covers the installation update time and the last reading's etag.

### 5.7 Generation reading

Reading object:

```json
{
  "id": "<uuid>",
  "installationId": "<uuid>",
  "meterId": "MTR-000001",
  "timestampUtc": "2026-10-09T06:00:00.000Z",
  "instantaneousPowerKw": 1.25,
  "cumulativeExportKwh": 1500.5,
  "voltageV": 230,
  "eTag": "W/\"abc123\"",
  "createdAt": "2026-10-10T03:00:00.000Z"
}
```

| Method | Path | Auth | Success |
| --- | --- | --- | --- |
| `GET` | `/api/v1/installations/{meterId}/readings` | User | **200** paged history |
| `GET` | `/api/v1/installations/{meterId}/readings/{readingId}` | User | **200** one reading |
| `GET` | `/api/v1/installations/{meterId}/last-reading` | User | **200** latest by `timestampUtc` |
| `POST` | `/api/v1/installations/{meterId}/readings` | Device | **201** created reading |
| `PUT`, `PATCH`, `DELETE` | `.../readings` | — | **405** `Allow: GET, POST` |
| `PUT`, `PATCH`, `DELETE` | `.../readings/{readingId}` | — | **405** `Allow: GET` |

#### History query

| Parameter | Default | Rule |
| --- | --- | --- |
| `offset` | `0` | Integer ≥ 0 |
| `limit` | `50` | Integer from 1 to 200 |
| `fromUtc` | — | `timestampUtc >= fromUtc` (ISO-8601 string compare) |
| `toUtc` | — | `timestampUtc <= toUtc` |
| `sort` | `timestampUtc` | Only `timestampUtc` is honoured; any other value still sorts by timestamp |
| `order` | `desc` | `asc` or `desc` |

`last-reading` returns **404** `Reading was not found.` when the installation exists but has no readings.

#### Create (device ingest)

`POST /api/v1/installations/{meterId}/readings`

```json
{
  "timestampUtc": "2026-10-10T08:15:00.000Z",
  "instantaneousPowerKw": 3.2,
  "cumulativeExportKwh": 1500.5,
  "voltageV": 230
}
```

| Field | Required | Rule |
| --- | --- | --- |
| `instantaneousPowerKw` | yes | Finite number |
| `cumulativeExportKwh` | yes | Finite number. Must be ≥ the latest stored cumulative for this installation |
| `voltageV` | no | Defaults to `230` |
| `timestampUtc` | no | Defaults to the server time at ingest. Must be unique per installation |

**201** response body is the reading object. Headers:

| Header | Value |
| --- | --- |
| `Location` | `{base}/api/v1/installations/{meterId}/readings/{id}` |
| `Content-Location` | Same URI |
| `ETag` | New weak etag stored on the row |
| `Last-Modified` | HTTP date of `timestampUtc` |

| Status | Code | When |
| --- | --- | --- |
| **400** | `BAD_REQUEST` | `instantaneousPowerKw` or `cumulativeExportKwh` is missing or not a number |
| **401** | `UNAUTHORIZED` | Missing key, unknown meter, or key does not match |
| **409** | `CONFLICT` | A reading already exists for this installation and `timestampUtc`. `details` includes `existingId` and `timestampUtc` |
| **415** | `UNSUPPORTED_MEDIA_TYPE` | Body is not JSON |
| **422** | `UNPROCESSABLE_ENTITY` | `cumulativeExportKwh` is lower than the previous register. `details` includes `previousCumulativeExportKwh` and `submitted` |

Readings are never updated or deleted through the API.

## 6. Data stored

SQLite file at `DATABASE_PATH` (default `./data/slsea.sqlite`). Foreign keys are enforced.

| Table | Identity | Notes |
| --- | --- | --- |
| `provinces` | `code` | `name`, `updated_at` |
| `districts` | `code` | Belongs to one province |
| `grid_substations` | `code` | Belongs to one district; `latitude`, `longitude` |
| `solar_installations` | `id` (UUID), unique `meter_id` | Capacity, status, coordinates, bcrypt device-key hash. Belongs to one substation |
| `generation_readings` | `id` (UUID) | Unique `(installation_id, timestamp_utc)`. Power, cumulative export, voltage, etag |
| `users` | `id` (UUID), unique `username` | bcrypt password, role, optional province and district, `is_active` |

After `npm run db:reset` the database holds 9 provinces, 25 districts, 25 substations, 200 installations, about one week of 15-minute daytime readings (06:00–18:00 UTC), and the three demo users.

## 7. Status codes

| Status | Code | When |
| --- | --- | --- |
| **200** | — | Successful read or login |
| **201** | — | Reading created |
| **304** | — | Conditional GET matched; empty body |
| **400** | `BAD_REQUEST` | Missing login fields, or a reading body that is not numeric |
| **401** | `UNAUTHORIZED` | Missing or bad JWT, or device key failure. `WWW-Authenticate` is set |
| **403** | `FORBIDDEN` | Authenticated user is outside the resource's jurisdiction |
| **404** | `NOT_FOUND` | Unknown resource, or no route for that method and path |
| **405** | `METHOD_NOT_ALLOWED` | Verb is explicitly rejected. `Allow` is set |
| **406** | `NOT_ACCEPTABLE` | `Accept` is not JSON. `Accept: application/json` is set |
| **409** | `CONFLICT` | Duplicate reading timestamp |
| **415** | `UNSUPPORTED_MEDIA_TYPE` | `POST` without `Content-Type: application/json` |
| **422** | `UNPROCESSABLE_ENTITY` | Cumulative export decreased |
| **500** | `INTERNAL_ERROR` | Unhandled failure, including a JSON body Express cannot parse |

## 8. Out of scope

- Creating, updating, or deleting provinces, districts, substations, installations, or users
- Updating or deleting a reading
- Hypermedia controls beyond pagination `links`
- Representations other than JSON
