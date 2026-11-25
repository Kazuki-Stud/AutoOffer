# Endpoint Reference

Base URL: `http://localhost:8080` · All JSON endpoints use `Content-Type: application/json` and echo `X-Request-Id`.

## Summary Table

| Method | Path | Auth | Success | Description |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Public | `200` | Service health check |
| `POST` | `/api/devices/register` | Public | `201` | Register pseudonymous device or rotate token |
| `GET` | `/api/registry/whitelist` | Public | `200` | List board automated-collection permissions |
| `GET` | `/api/registry/selectors` | Public | `200` | List approved active selectors (`?since=`) |
| `GET` | `/api/dictionaries/bootstrap` | Public | `200` | Fetch all reference dictionaries |
| `GET` | `/api/skills` | Public | `200` | Autocomplete skills (`?q=`) |
| `GET` | `/api/skills/hotwords` | Public | `200` | Top skills per position (`?positionId=`) |
| `GET` | `/api/vacancies` | Public | `200` | Paginated active vacancies (`?platformCode=&page=&size=&sort=`) |
| `POST` | `/api/vacancies` | Device | `200` | Sanitize, deduplicate & upsert vacancy |
| `POST` | `/api/selectors` | Device | `201` | Submit pending selector proposal |
| `POST` | `/api/removal-requests` | Public | `202` | Submit anonymous GDPR Art. 17 removal request |
| `GET` | `/api/analytics/skills-demand` | Public | `200` | ClickHouse top skills per position |
| `GET` | `/api/analytics/salary-by-country` | Public | `200` | ClickHouse EUR salary medians by country |
| `POST` | `/api/admin/auth/login` | Public | `200` | Admin login -> JWT |
| `POST` | `/api/admin/auth/change-password` | Admin | `204` | Change current admin password |
| `PATCH` | `/api/admin/platforms/{id}/permission` | Admin | `204` | Grant or revoke board permission |
| `GET` | `/api/admin/selectors/queue` | Admin | `200` | List pending selector proposals with diff |
| `POST` | `/api/admin/selectors/{id}/approve` | Admin | `204` | Approve & activate selector |
| `POST` | `/api/admin/selectors/{id}/reject` | Admin | `204` | Reject pending selector |
| `GET` | `/api/admin/removal-requests` | Admin | `200` | List removal requests (`?status=open\|done\|rejected`) |
| `POST` | `/api/admin/removal-requests/{id}/process` | Admin | `204` | Execute (`done`) or `rejected` takedown |
| `POST` | `/api/admin/companies/{id}/verify` | Admin | `204` | Verify company |
| `POST` | `/api/admin/positions/{id}/verify` | Admin | `204` | Verify position |
| `POST` | `/api/admin/skills/{id}/verify` | Admin | `204` | Verify skill |
| `POST` | `/api/admin/vacancies/{id}/verify` | Admin | `204` | Verify vacancy |
| `POST` | `/api/admin/etl/run` | Admin | `200` | Trigger incremental Postgres -> ClickHouse ETL |
| `POST` | `/api/admin/etl/rebuild-mart` | Admin | `204` | Rebuild ClickHouse `dm_skill_demand` |

---

## Key Endpoint Examples (Typical & Edge Cases)

### `POST /api/devices/register`
* **Typical (`201 Created`):** `{"pseudonymousId":"0b6a5c1e-2b0f-4f0b-9d54-5f7a6c1f0001"}` → returns `{ deviceId, pseudonymousId, token }`.
* **Edge Case (`400 Bad Request`):** `{}` → `VALIDATION_ERROR` (`details.pseudonymousId: "must not be null"`).

### `POST /api/vacancies` *(Device Auth)*
* **Typical (`200 OK`):** Permitted board stores `full` sanitized text; non-whitelisted board (`indeed.com`) stores `url_only` and discards description/salary.
* **Edge Case (`400 Bad Request`):** `salaryFrom: 7000, salaryTo: 4000` → `DB_POLICY_VIOLATION` (`vacancies_salary_order`).
* **Edge Case (`401 Unauthorized`):** Missing `X-Device-Id` or invalid bearer token → `UNAUTHORIZED`.

### `POST /api/selectors` *(Device Auth)*
* **Typical (`201 Created`):** Valid `css` or `xpath` selector → `{ "id": "..." }`.
* **Edge Case (`400 Bad Request`):** `"selectorString": "javascript:alert(1)"` → `VALIDATION_ERROR` (`"Selector must not contain scripts or URLs"`).

### `POST /api/removal-requests`
* **Typical (`202 Accepted`):** `{"targetUrl":"https://demo-board.test/jobs/1001"}` → `{"id":"...","status":"open"}`.
* **Edge Case (`400 Bad Request`):** `{"targetUrl":"ftp://example.com/1"}` → `VALIDATION_ERROR` (`details.targetUrl: "Must be http(s) URL"`).

### `PATCH /api/admin/platforms/{id}/permission` *(Admin Auth)*
* **Typical (`204 No Content`):** `{"permissionStatus":"granted","permissionReference":"Written email 2026-11"}` grants permission; `{"permissionStatus":"none"}` revokes permission and automatically purges stored descriptions and `vacancy_skills`.
* **Edge Case (`400 Bad Request`):** `{"permissionStatus":"granted"}` without `permissionReference` → `VALIDATION_ERROR`.
* **Edge Case (`404 Not Found`):** Unknown platform UUID → `RESOURCE_NOT_FOUND`.

### `POST /api/admin/removal-requests/{id}/process` *(Admin Auth)*
* **Typical (`204 No Content`):** `{"decision":"done"}` deletes matching vacancy by normalized URL.
* **Edge Case (`409 Conflict`):** Processing an already `done` or `rejected` ticket → `CONFLICT`.

> Full machine-readable parameter, response, and example definitions for all 27 endpoints live in [`../openapi.yaml`](../openapi.yaml).
