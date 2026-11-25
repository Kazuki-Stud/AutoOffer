# API Changelog & Versioning

## Versioning Strategy

* **Specification Version:** Semantic Versioning (`MAJOR.MINOR.PATCH`) declared in `info.version` inside [`openapi.yaml`](openapi.yaml).
* **Backward Compatibility:**
  * **Additive changes** (new optional fields, new endpoints, new `ErrorCode` values) increment `MINOR`.
  * **Bug fixes and documentation clarifications** increment `PATCH`.
  * **Breaking changes** (removing fields, changing auth headers, altering status codes) require a `MAJOR` bump and a `/api/v2/...` path prefix migration window.
* **Deprecation Policy:** Deprecated endpoints are marked with `deprecated: true` in OpenAPI and announced in this changelog at least one minor release before removal.

---

## [0.1.0] - 2026-11-16

### Added
* **Devices:** `POST /api/devices/register` (`201 Created`) for zero-registration pseudonymous onboarding and HMAC token rotation.
* **Registry:** `GET /api/registry/whitelist` and `GET /api/registry/selectors` (with incremental `?since=` ISO-8601 polling).
* **Dictionaries & Skills:** `GET /api/dictionaries/bootstrap`, `GET /api/skills` (escaped `ILIKE` autocomplete), and `GET /api/skills/hotwords` (PostgreSQL materialized view).
* **Vacancies:** `GET /api/vacancies` (paginated `max-page-size: 100`) and `POST /api/vacancies` (server-side PII sanitization, SHA-256 deduplication, whitelist `url_only`/`full` enforcement).
* **Selectors:** `POST /api/selectors` (`201 Created`) with XSS/URL guard and advisory-locked versioning.
* **GDPR Art. 17:** `POST /api/removal-requests` (`202 Accepted`) for anonymous takedown requests.
* **OLAP Analytics & ETL:** `GET /api/analytics/skills-demand`, `GET /api/analytics/salary-by-country`, `POST /api/admin/etl/run`, `POST /api/admin/etl/rebuild-mart`.
* **Admin Moderation:** JWT login/password change, platform whitelist permission updates, selector queue approval/rejection, removal request processing, and community dictionary verification.
* **Health & Error Model:** `GET /api/health` and standardized `ErrorResponseBody` (`VALIDATION_ERROR`, `DB_POLICY_VIOLATION`, `RESOURCE_NOT_FOUND`, `CONFLICT`, `UNAUTHORIZED`, `FORBIDDEN`, `INTERNAL_ERROR`).
