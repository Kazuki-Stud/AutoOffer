# Step-by-Step Integration Tutorials

These tutorials walk through complete real-world client and administrator workflows against `http://localhost:8080`.

---

## Tutorial 1: Client Onboarding, Selector Sync & Vacancy Ingestion

This matches the Chromium Extension / PWA lifecycle (**US 1.1, US 1.3, US 2.1, US 7.1**).

### Step 1: Generate a Random `pseudonymousId` and Register

Generate a random UUID v4 locally (never derived from hardware or user identity) and register it:

```bash
PSEUDONYMOUS_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')

REGISTER_JSON=$(curl -s -X POST http://localhost:8080/api/devices/register \
  -H "Content-Type: application/json" \
  -d "{\"pseudonymousId\":\"${PSEUDONYMOUS_ID}\"}")

echo "$REGISTER_JSON"
```

Response (`201 Created`):

```json
{
  "deviceId": "d0000000-0000-4000-8000-000000000010",
  "pseudonymousId": "0b6a5c1e-2b0f-4f0b-9d54-5f7a6c1f0099",
  "token": "9f4c2a1b8e7d6c5a..."
}
```

Extract `token` into an environment variable (in the browser extension, store it encrypted in IndexedDB via Web Crypto `AES-GCM-256`):

```bash
DEVICE_TOKEN="<paste-token-here>"
```

> Calling `POST /api/devices/register` again with the same `pseudonymousId` rotates the token and immediately invalidates the old one.

### Step 2: Check Whitelist & Fetch Approved Selectors

```bash
# 1. Check board permissions
curl -s http://localhost:8080/api/registry/whitelist

# 2. Fetch active approved selectors (or pass ?since=2026-11-16T00:00:00Z for delta sync)
curl -s "http://localhost:8080/api/registry/selectors?since=2026-11-01T00:00:00Z"
```

### Step 3: Submit a Vacancy (`POST /api/vacancies`)

```bash
curl -s -X POST http://localhost:8080/api/vacancies \
  -H "Content-Type: application/json" \
  -H "X-Device-Id: ${PSEUDONYMOUS_ID}" \
  -H "Authorization: Bearer ${DEVICE_TOKEN}" \
  -d '{
    "platformId": "10000000-0000-4000-8000-0000000000ff",
    "url": "https://demo-board.test/jobs/2001#apply",
    "fullPositionName": "Backend Java Developer",
    "companyName": "Acme Cloud",
    "description": "Java 21, Spring Boot, PostgreSQL. Contact: Jane Doe at jane.doe@example.com or +370 600 12345.",
    "cityId": "70000000-0000-4000-8000-000000000002",
    "salaryFrom": 4000,
    "salaryTo": 5500,
    "currencyId": "40000000-0000-4000-8000-000000000002"
  }'
```

Response (`200 OK`):

```json
{
  "id": "a1b2c3d4-0000-4000-8000-000000000001"
}
```

Verify that the `#apply` URL fragment was stripped and personal name/email/phone were sanitized:

```bash
curl -s "http://localhost:8080/api/vacancies?platformCode=demo-board.test&page=0&size=5"
```

### JavaScript (`fetch`) Client Example (Extension / PWA)

```javascript
async function submitVacancy(baseUrl, pseudonymousId, token, payload) {
  const response = await fetch(`${baseUrl}/api/vacancies`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Id': pseudonymousId,
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.json(); // ApiErrorBody: { timestamp, status, code, message, details }
    throw new Error(`${err.code}: ${err.message}`);
  }
  return response.json(); // { id }
}
```

---

## Tutorial 2: Community Selector Proposal & Admin Review

1. **Device submits a candidate selector (`201 Created`):**
   ```bash
   curl -s -X POST http://localhost:8080/api/selectors \
     -H "Content-Type: application/json" \
     -H "X-Device-Id: ${PSEUDONYMOUS_ID}" \
     -H "Authorization: Bearer ${DEVICE_TOKEN}" \
     -d '{
       "platformId": "10000000-0000-4000-8000-000000000003",
       "taskId": "20000000-0000-4000-8000-000000000001",
       "elementTypeId": "30000000-0000-4000-8000-000000000002",
       "urlPattern": "weworkremotely.com",
       "kind": "css",
       "selectorString": "span.title, h3.listing-title"
     }'
   ```
2. **Admin logs in (`200 OK`):**
   ```bash
   ADMIN_JWT=$(curl -s -X POST http://localhost:8080/api/admin/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username":"<admin>","password":"<password>"}' | jq -r '.token')
   ```
3. **Admin inspects review queue (`200 OK`) and approves (`204 No Content`):**
   ```bash
   curl -s http://localhost:8080/api/admin/selectors/queue \
     -H "Authorization: Bearer ${ADMIN_JWT}"

   curl -i -X POST http://localhost:8080/api/admin/selectors/<selectorId>/approve \
     -H "Authorization: Bearer ${ADMIN_JWT}" \
     -H "Content-Type: application/json" \
     -d '{"comment":"Verified on 3 live pages"}'
   ```

---

## Tutorial 3: Anonymous GDPR Art. 17 Removal Workflow

1. **Anyone submits an anonymous removal request (`202 Accepted`):**
   ```bash
   curl -s -X POST http://localhost:8080/api/removal-requests \
     -H "Content-Type: application/json" \
     -d '{"targetUrl":"https://demo-board.test/jobs/2001","note":"Recruiter name visible"}'
   ```
2. **Admin lists open requests and approves takedown (`204 No Content`):**
   ```bash
   curl -s "http://localhost:8080/api/admin/removal-requests?status=open" \
     -H "Authorization: Bearer ${ADMIN_JWT}"

   curl -i -X POST http://localhost:8080/api/admin/removal-requests/<requestId>/process \
     -H "Authorization: Bearer ${ADMIN_JWT}" \
     -H "Content-Type: application/json" \
     -d '{"decision":"done"}'
   ```
   The backend locks the ticket row, deletes the matching vacancy by normalized URL, and stamps `processed_at` + `processed_by_admin_id`.
