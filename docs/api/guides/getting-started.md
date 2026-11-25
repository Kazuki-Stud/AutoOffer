# Getting Started with the AutoOffer API

This guide walks you through starting the API locally, verifying health, exploring interactive docs, and running your first requests.

## 1. Prerequisites

* **Docker & Docker Compose** (recommended) or JDK 26 + PostgreSQL 16 + Redis 7 + ClickHouse 24
* `curl` (or VS Code REST Client / HTTPie / Postman)
* Optional: Node.js `>= 20` for Redocly CLI & Prism mock server

## 2. Base URLs

| Environment | Base URL | Notes |
| :--- | :--- | :--- |
| **Local Docker / Spring Boot** | `http://localhost:8080` | Default port from `SERVER_PORT=8080` |
| **Swagger UI (Local profile)** | `http://localhost:8080/swagger-ui.html` | Disabled automatically in `prod` (`application-prod.yaml`) |
| **Prism Mock Server** | `http://localhost:4010` | Run `npx @stoplight/prism-cli mock docs/api/openapi.yaml` |

## 3. Start the Backend Stack

```bash
cd src/server/AutoOffer
cp .env.example .env
# Edit .env with strong local secrets (JWT_SECRET, DEVICE_TOKEN_PEPPER >= 32 chars)
docker compose up -d --build
```

Verify the API is ready:

```bash
curl -fsS http://localhost:8080/api/health
```

Expected response (`200 OK`):

```json
{
  "status": "UP"
}
```

## 4. Make Your First Public Calls (No Auth Required)

### Fetch the Platform Whitelist (`GET /api/registry/whitelist`)

```bash
curl -s http://localhost:8080/api/registry/whitelist
```

Check `permissionStatus`:
* `granted` — automated collection and `full` vacancy storage are permitted.
* `none` or `pending` — automated background collection is blocked; manual saves send `url_only`.

### Bootstrap Reference Dictionaries (`GET /api/dictionaries/bootstrap`)

```bash
curl -s http://localhost:8080/api/dictionaries/bootstrap
```

Returns platforms, selector tasks, selector element types, currencies, regions, countries, cities, levels, work formats, employment types, and positions in a single cached payload.

## 5. Authentication Overview

| Caller Type | Required Headers | How to Obtain Credentials |
| :--- | :--- | :--- |
| **Public Read / GDPR Removal** | None | N/A |
| **Client Device (Extension / PWA)** | `X-Device-Id: <pseudonymousId>` + `Authorization: Bearer <token>` | `POST /api/devices/register` |
| **Registry Administrator** | `Authorization: Bearer <jwt>` *(do not send `X-Device-Id`)* | `POST /api/admin/auth/login` |

> **Security Warning:** Never commit real `token`, `JWT`, `JWT_SECRET`, or `DEVICE_TOKEN_PEPPER` values to Git, and never send candidate personal data (resumes, profiles, passwords) to any endpoint.

## 6. Validate & Preview Docs Locally

```bash
# Lint OpenAPI 3.1.0 specification
npx @redocly/cli lint docs/api/openapi.yaml --config docs/api/redocly.yaml

# Build standalone Redoc HTML
npx @redocly/cli build-docs docs/api/openapi.yaml -o docs/api/redoc.html

# Start local OpenAPI mock sandbox
npx @stoplight/prism-cli mock docs/api/openapi.yaml
```
