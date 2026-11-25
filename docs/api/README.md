# AutoOffer API Documentation

Welcome to the AutoOffer Registry & Analytics API documentation (`v0.1.0`).

## Navigation

| Section | File | Description |
| :--- | :--- | :--- |
| **OpenAPI Specification** | [`openapi.yaml`](openapi.yaml) | Machine-readable OpenAPI 3.1.0 spec (validated with Redocly CLI) |
| **Getting Started** | [`guides/getting-started.md`](guides/getting-started.md) | Base URLs, quick verification, Swagger UI, Redoc & Prism mock server |
| **Integration Tutorials** | [`guides/integration-tutorial.md`](guides/integration-tutorial.md) | Step-by-step workflows for extension ingestion, selector moderation & GDPR Art. 17 |
| **Architecture & Concepts** | [`guides/architecture-and-concepts.md`](guides/architecture-and-concepts.md) | System/sequence diagrams, auth deep dive, pagination, idempotency, caching & error taxonomy |
| **Endpoint Reference** | [`reference/endpoints.md`](reference/endpoints.md) | Complete endpoint catalog with typical & edge-case requests/responses |
| **Schemas & Data Models** | [`schemas/README.md`](schemas/README.md) | Request/response schemas, constraints, regexes & PWA `types.js` alignment |
| **Runnable Examples** | [`examples/autooffer.http`](examples/autooffer.http) | Executable HTTP/REST Client requests for all endpoints |
| **Release Notes** | [`CHANGELOG.md`](CHANGELOG.md) | API versioning policy & changelog |
| **Criterion ADR Report** | [`../02-technical/api.md`](../02-technical/api.md) | Documentation strategy, tools, standards, checklist & known limitations |

## Interactive & Static Viewing

* **Swagger UI (Local Dev Profile):** `http://localhost:8080/swagger-ui.html`
* **Raw OpenAPI JSON/YAML (Local):** `http://localhost:8080/v3/api-docs` / `http://localhost:8080/v3/api-docs.yaml`
* **Lint & Build Static Redoc HTML:**
  ```bash
  npx @redocly/cli lint docs/api/openapi.yaml --config docs/api/redocly.yaml
  npx @redocly/cli build-docs docs/api/openapi.yaml -o docs/api/redoc.html
  ```
* **Run Local API Mock Server (Prism):**
  ```bash
  npx @stoplight/prism-cli mock docs/api/openapi.yaml
  ```
