# SLSEA Solar Generation API (Node.js)

**NB6007CEM Web API Development coursework** — separate from the HelioLanka .NET / iOS / React stack in this repo.

This folder is a standalone Express REST API with:

- Live **Swagger UI** at `/api-docs`
- OpenAPI YAML at `/openapi.json`
- SQLite seed data (9 provinces, **25** districts, **25** substations, **200** installations, ~68k readings ≈ 1 week × 15‑minute daytime)
- **Write path:** metering devices (`X-Device-Api-Key`)
- **Read path:** JWT SLSEA users with jurisdiction scope
- Pagination, filtering, sorting, conditional GET (ETag / 304)
- Stretch: district generation summary

## Quick start

```bash
cd WEB_API_CW
cp .env.example .env   # if needed
npm install
npm run db:reset       # migrate + seed
npm run dev            # http://localhost:3080
```

Open Swagger: [http://localhost:3080/api-docs](http://localhost:3080/api-docs)

## AWS (public HTTPS)

Deployed with Docker → **ECR** → **ECS Express Mode** in `ap-southeast-1`.

| | |
| --- | --- |
| API | https://sl-aced683b8da34d50806d14bcab9d5a82.ecs.ap-southeast-1.on.aws |
| Swagger | https://sl-aced683b8da34d50806d14bcab9d5a82.ecs.ap-southeast-1.on.aws/api-docs |
| Health | https://sl-aced683b8da34d50806d14bcab9d5a82.ecs.ap-southeast-1.on.aws/health |

Details / redeploy: [docs/AWS_DEPLOYMENT.md](./docs/AWS_DEPLOYMENT.md)

## Docker

Separate from the HelioLanka image at the repo root. SQLite is seeded on first start and persisted in a volume.

```bash
cd WEB_API_CW
docker compose up --build -d
```

- API: [http://localhost:3080](http://localhost:3080)
- Swagger: [http://localhost:3080/api-docs](http://localhost:3080/api-docs)

```bash
# image only
docker build -t nodejs-slsea-api:latest .
docker run --rm -p 3080:3080 -e JWT_SECRET=change-me nodejs-slsea-api:latest

# reseed (destructive — drops volume)
docker compose down -v && docker compose up --build -d
```

## Demo credentials

| Actor | How |
| --- | --- |
| National admin | `POST /api/v1/auth/login` → `national.admin` / `Admin@12345` |
| Provincial (Western) | `wp.admin` / `Admin@12345` |
| District (Colombo) | `colombo.admin` / `Admin@12345` |
| Device write | Header `X-Device-Api-Key: slsea-demo-device-key-001` on `POST /api/v1/installations/{meterId}/readings` |

## Example calls

```bash
# Login
TOKEN=$(curl -s -X POST http://localhost:3080/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"national.admin","password":"Admin@12345"}' | jq -r .accessToken)

# List installations
curl -s "http://localhost:3080/api/v1/installations?limit=5" -H "Authorization: Bearer $TOKEN" | jq

# Last reading (operational)
curl -s http://localhost:3080/api/v1/installations/MTR-000001/last-reading \
  -H "Authorization: Bearer $TOKEN" | jq

# Device ingest (write)
curl -s -X POST http://localhost:3080/api/v1/installations/MTR-000001/readings \
  -H 'Content-Type: application/json' \
  -H 'X-Device-Api-Key: slsea-demo-device-key-001' \
  -d '{"instantaneousPowerKw":3.2,"cumulativeExportKwh":1500.5,"voltageV":230}' | jq
```

## Isolation from HelioLanka

- Lives only under `nodejs-slsea-api/`
- Does **not** modify `src/HelioLanka.*`, `ios/`, or `web/admin/`
- Own port (`3080`), own SQLite file (`data/slsea.sqlite`)

## Coursework mapping (brief §5)

| Requirement | Endpoint / behaviour |
| --- | --- |
| Hierarchy collections | `/provinces`, `/districts`, `/grid-substations`, `/installations` |
| Scoped nested collections | `/provinces/{code}/districts`, `/districts/{code}/grid-substations`, … |
| Composite | `GET /installations/{meterId}/composite` |
| Last-known reading | `GET /installations/{meterId}/last-reading` |
| Readings history | `GET /installations/{meterId}/readings` (+ filter/sort/page) |
| Device write | `POST /installations/{meterId}/readings` → **201** + `Location` |
| Conditional GET | `ETag` / `If-None-Match` → **304** |
| Errors | `{ code, message, details, traceId }` |
| Auth split | JWT users (read) vs device API key (write) |
| Stretch summary | `GET /districts/{code}/generation-summary` |

## Richardson maturity

**Target: Level 2** (coursework brief). Hypermedia Level 3 is out of scope.

| Ladder | Evidence in this API |
| --- | --- |
| **L0** avoided | No single-endpoint RPC; each capability has its own resource URI |
| **L1** resources | `/provinces`, `/districts`, `/grid-substations`, `/installations/{meterId}/readings`, composite, `last-reading`, `generation-summary` |
| **L2** verbs | `GET` retrieve; `POST` create reading / login; `PUT`/`PATCH`/`DELETE` on readings and geography → **405** + `Allow` |
| **L2** status | `200`, `201`, `304`, `400`, `401`, `403`, `404`, `405`, `406`, `409`, `415`, `422`, `500` |
| **L2** headers | `Content-Type: application/json`, `Location` + `Content-Location` on create, `ETag` / `Last-Modified` / `If-None-Match` → **304**, `WWW-Authenticate` on **401**, `Allow` on **405** |
| **L3** not claimed | Pagination `links.next` / `links.prev` are convenience only — no hypermedia control vocabulary |

### Quick Level-2 checks

```bash
# 406 — wrong Accept
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3080/api/v1/provinces \
  -H "Authorization: Bearer $TOKEN" -H "Accept: text/plain"

# 405 — illegal verb on append-only readings
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE \
  http://localhost:3080/api/v1/installations/MTR-000001/readings

# 201 — create with Location
curl -si -X POST http://localhost:3080/api/v1/installations/MTR-000001/readings \
  -H 'Content-Type: application/json' \
  -H 'X-Device-Api-Key: slsea-demo-device-key-001' \
  -d '{"instantaneousPowerKw":1.1,"cumulativeExportKwh":100001,"voltageV":230}'
```
