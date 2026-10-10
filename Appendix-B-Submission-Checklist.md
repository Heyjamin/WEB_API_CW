# Appendix B — Submission Checklist

**Module:** NB6007CEM Web API Development  
**API:** SLSEA Real-Time Solar Generation Data API  
**Repository:** https://github.com/Heyjamin/WEB_API_CW.git (`main`)

Use this list before hand-in and before the viva. **Confirmed** means the item was checked against this repository or the live host on 10 October 2026. **Student** means you still have to do it. Do not treat a Student row as done.

## B.1 Deployed API

| Item | State | Evidence |
| --- | --- | --- |
| Public HTTPS base URL | Confirmed | https://sl-aced683b8da34d50806d14bcab9d5a82.ecs.ap-southeast-1.on.aws |
| Liveness | Confirmed | `GET /health` returned `{"status":"ok","service":"slsea-solar-api","timeUtc":"2026-10-10T14:42:05.575Z"}` |
| Versioned API | Confirmed | Routes mounted at `/api/v1` in `src/app.js` |
| Demo login works on the public host | Student | `POST /api/v1/auth/login` with `national.admin` / `Admin@12345`, then one scoped read as `colombo.admin` |
| Device write works on the public host | Student | `POST /api/v1/installations/MTR-000001/readings` with `X-Device-Api-Key: slsea-demo-device-key-001` returns **201** and `Location` |
| Local run documented | Confirmed | `README.md`: `npm run db:reset`, `npm run dev`, port 3080 |
| Container run documented | Confirmed | `Dockerfile`, `docker-compose.yml`, `docker-entrypoint.sh` |

## B.2 Swagger and specification

| Item | State | Evidence |
| --- | --- | --- |
| OpenAPI document in source | Confirmed | `src/docs/openapi.yaml` |
| OpenAPI served by the API | Confirmed | `GET /openapi.json` in `src/app.js` (current host is placed first in `servers`) |
| Swagger UI route | Confirmed | `GET /api-docs` |
| Public Swagger URL | Confirmed in README | https://sl-aced683b8da34d50806d14bcab9d5a82.ecs.ap-southeast-1.on.aws/api-docs |
| Swagger “Try it out” exercised on the public host | Student | Login, one GET, one device POST, and one **401** without a token |
| Human-readable contract | Confirmed | `spec.md` |
| Design-spine map | Confirmed | `Appendix-A-Design-Spine-Coverage-Map.md` |

## B.3 Git repository

| Item | State | Evidence |
| --- | --- | --- |
| Remote repository | Confirmed | https://github.com/Heyjamin/WEB_API_CW.git |
| Branch | Confirmed | `main` tracks `origin/main` |
| Marker can clone without private credentials | Student | Confirm the GitHub repo visibility matches the brief |
| Latest required files are pushed | Student | Local history includes commit `spec added`. Push `spec.md` and Appendices A–C if they are not already on `origin/main` |
| Secrets not committed | Confirmed as policy | `.env` is gitignored. `.env.example` holds development defaults only. Do not commit a production `JWT_SECRET`. |
| README explains how to run the API | Confirmed | `README.md` |

## B.4 Report sections

Tick these in the written report. This repository does not contain the report body, so every row stays **Student**.

| Section | State | What to include |
| --- | --- | --- |
| Scenario and actors | Student | SLSEA readers versus metering devices; national, provincial, and district scope |
| Resource model and URIs | Student | Province → district → substation → installation → reading. Cite Appendix A R1–R17 |
| HTTP design (Level 2) | Student | Verbs, status codes, `Allow`, `Location`, `ETag` / **304**, **406**, **415**. State that Level 3 is not claimed |
| Security design | Student | JWT read path, device API key write path, jurisdiction **403** versus unknown **404** |
| Error model | Student | `{ code, message, details, traceId }` and `X-Trace-Id` |
| Pagination, filter, and sort | Student | Installations and readings query rules from `spec.md` |
| Stretch capability | Student | `GET /api/v1/districts/{code}/generation-summary` |
| Test evidence | Student | Screenshots or transcripts for 200, 201, 304, 401, 403, 404, 405, 406, 409, 415, 422 |
| Deployment | Student | Public base URL, `/health`, `/api-docs` |
| Appendix A — Design-Spine Coverage Map | Student | Insert `Appendix-A-Design-Spine-Coverage-Map.md` |
| Appendix B — Submission Checklist | Student | Insert this file after the boxes you still own are done |
| Appendix C — AI Disclosure | Student | Insert `Appendix-C-AI-Disclosure.md`, including any prompts from other sessions |
| Signed declaration | Student | See B.5 |

## B.5 Signed declaration

| Item | State | Action |
| --- | --- | --- |
| Declaration form required by the brief | Student | Attach the module declaration to the report |
| Signed and dated by the author | Student | Sign by hand or with the approved digital method. This file is not a signature |
| AI use declared in the same submission | Student | Appendix C, and any declaration question that asks about generative AI |

## B.6 AI-disclosure appendix

| Item | State | Evidence |
| --- | --- | --- |
| Separate AI appendix | Confirmed as a file | `Appendix-C-AI-Disclosure.md` |
| Cursor prompts from this documentation session recorded | Confirmed | Appendix C §C.3 |
| Any other AI tools or prompts added | Student | If the API code was drafted with another chat or tool, paste those prompts into Appendix C before submission |
| Appendix reviewed against the code | Student | You remain responsible for every claim in the report |

## B.7 Viva readiness

Be ready to demonstrate these on the public URL or a local server. None of these are a substitute for the viva itself.

| Topic | State | Be able to show |
| --- | --- | --- |
| Login and a Bearer call | Student | `national.admin` token, then `GET /api/v1/installations?limit=5` |
| Jurisdiction | Student | `colombo.admin` can read `WP-D01` and receives **403** for a district outside Colombo |
| Composite and last reading | Student | `GET /api/v1/installations/MTR-000001/composite` and `.../last-reading` |
| History controls | Student | `fromUtc`, `toUtc`, `order=asc`, `limit`, and `links.next` |
| Conditional GET | Student | Repeat a GET with `If-None-Match` and show **304** |
| Device create | Student | **201**, `Location`, then GET that reading id |
| Rejected write | Student | Same timestamp → **409**. Lower cumulative export → **422**. `DELETE` on readings → **405** and `Allow` |
| Content negotiation | Student | `Accept: text/plain` → **406**. `POST` without JSON content type → **415** |
| Why Level 2, not Level 3 | Student | Own words: resources and verbs are in place; pagination links are not hypermedia controls |
| What you would not change under questioning | Student | Append-only readings, and why an unknown meter on the device path is **401** |

## B.8 Hand-in order

1. Finish every **Student** row in B.1, B.3, B.4, and B.6.  
2. Sign B.5.  
3. Push `main` so the marker’s clone matches the report.  
4. Put Appendix A, this checklist, and Appendix C at the end of the report, in that order.
