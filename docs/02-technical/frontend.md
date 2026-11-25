# Front-End Architecture and Development


## Context
AutoOffer requires a local-first Progressive Web App (PWA) dashboard (`src/client/pwa`) that communicates with a Chromium Manifest V3 extension (`src/client/extension`), stores candidate profiles, resume variants, applications, and scraped vacancies in IndexedDB (`Dexie`), performs client-side AI evaluation/tailoring, and queries public skill analytics from the Spring Boot backend.

An initial prototype used imperative DOM manipulation across vanilla JS view scripts without URL routing, centralized HTTP error handling, a reactive state store, or automated tests. To meet maintainability, scalability, and the Diploma Project Front-End requirements, the PWA needed a component-based Single Page Application (SPA) architecture with clear separation of concerns, reactive state management, client-side routing, global error handling, and automated test coverage.

## Decision
We migrated `src/client/pwa` to a **Vue 3 SPA** built with **Vite**, using:
- **Vue Router (`vue-router`)** with hash history and lazy-loaded route components across 5 pages (`/vacancies`, `/applications`, `/jobs`, `/profile`, `/settings`).
- **Pinia (`pinia`)** (`useAppStore`) as a centralized reactive store bridging local IndexedDB (`Dexie`), Chrome extension external messaging (`bridge.js`), and UI state.
- **Modular folder structure**: `components/`, `pages/`, `services/`, `composables/`, `stores/`, `models/` (`types.js` JSDoc contracts + `constants.js`), `router/`, `utils/`, `styles/`, `tests/`, and `e2e/`.
- **Centralized HTTP wrapper & error boundary**: `httpClient.js` parses server error payloads and handles HTTP `400`/`401`/`403`/`404`/`5xx`, timeouts, and network errors via `ToastContainer.vue`, complemented by `ErrorBoundary.vue` (`onErrorCaptured` + `unhandledrejection`) and `logger.js`.
- **Quality & Testing**: ESLint (`eslint-plugin-vue`), Prettier, Vitest + `@vue/test-utils` unit/integration tests against `fake-indexeddb` + live Spring Boot backend, and Playwright E2E tests.

## Alternatives Considered

| Alternative | Pros | Cons | Why Not Chosen |
|---|---|---|---|
| **Vanilla JS + Web Components (Prototype)** | Zero framework dependency; small initial bundle | Imperative DOM manipulation (`innerHTML`), no URL router, hard to unit-test UI states, violates SPA framework requirement | Fails maintainability and Front-End SPA rubric requirements |
| **Vue 3 + Pinia + Vue Router (Chosen)** | Lightweight, fast Vite builds, clean `<script setup>` SFCs, low friction reusing existing ES modules (`database.js`, `aiClient.js`, `bridge.js`) | Smaller enterprise ecosystem than Angular | Best balance of simplicity, reactivity, bundle size, and compatibility with the shared ES module extension codebase |
| **React + Zustand + React Router** | Very large ecosystem; strong testing library | JSX rewrite overhead for HTML-heavy forms/modals; slightly more boilerplate for two-way form bindings | Vue 3 SFCs map more directly to the existing HTML templates and reactive form bindings |
| **Angular** | Strict built-in DI, router, and forms out of the box | Heavy boilerplate and CLI constraints when sharing Dexie ES modules with a vanilla MV3 Chrome extension | Overkill for a local-first extension companion PWA |

## Consequences

**Positive:**
- Clear separation between UI (`components/`, `pages/`), global state (`stores/appStore.js`), persistence/network (`services/`), typed contracts (`models/types.js`), and shared extension DB/AI modules.
- Route-level code splitting and async modal loading (`defineAsyncComponent`) reduce initial bundle weight and defer AI client modules until opened.
- Global error handling, toast feedback, skeleton loaders across async views, and automated unit + integration + E2E tests prevent regressions.

**Negative:**
- Requires `npm install` and Vite compilation with `@vitejs/plugin-vue`.
- Uses ES modules + JSDoc `@typedef` interfaces (`src/models/types.js`) rather than strict `.ts` compilation across every `.vue` file.

**Neutral:**
- Hash routing (`createWebHashHistory`) is used so routes resolve reliably under GitHub Pages (`/AutoOffer/`) and offline Service Worker caching (`public/sw.js`).

## Implementation Details

### Project Structure

~~~text
src/client/pwa/
├── index.html                   # SPA entry HTML (<div id="app"> + PWA manifest meta)
├── jsconfig.json                # JS/JSDoc project configuration for IDE type intelligence
├── vite.config.mjs              # Vite + @vitejs/plugin-vue + Vitest configuration
├── eslint.config.js             # ESLint 9 flat config for JS & Vue SFCs
├── .prettierrc                  # Formatting rules
├── playwright.config.mjs        # Playwright E2E configuration
├── e2e/
│   └── pwa.spec.js              # Multi-viewport route & modal E2E + Adaptive UI verification
├── tests/
│   ├── pwa.spec.js              # Real-backend & real-DOM unit tests (6 specs)
│   ├── components.spec.js       # Offline component & page unit tests (6 specs)
│   └── integration.spec.js      # Real-IndexedDB & Router integration tests (4 specs)
└── src/
    ├── main.js                  # App bootstrap, Pinia, Router, SW registration
    ├── App.vue                  # Root shell (Skip link, Header, Main, ErrorBoundary, Modals, Toasts)
    ├── router/index.js          # 5 lazy-loaded hash routes
    ├── composables/useDeviceInfo.js # Reactive viewport, orientation, aspect & keyboard detection
    ├── stores/appStore.js       # Global Pinia store (profiles, vacancies, apps, settings, AI)
    ├── models/
    │   ├── constants.js         # Skill dictionaries, AI model presets, application statuses
    │   └── types.js             # JSDoc @typedef contracts for local entities & API DTOs
    ├── services/
    │   ├── bridge.js            # Extension messaging, Dexie mirroring, JSON backup export/import
    │   ├── httpClient.js        # Centralized fetch wrapper with 400/401/403/404/5xx parsing
    │   ├── logger.js            # Structured console logger
    │   └── resumeExport.js      # Client-side PDF (print frame) & Word (.doc) generation
    ├── utils/helpers.js         # URL safety, date formatting, base64/blob & array helpers
    ├── styles/main.css          # Design tokens, WCAG AA contrast, responsive/modal layout, 44px touch rules
    ├── components/
    │   ├── AppHeader.vue        # Brand, connection status badge, nav links/bottom bar, theme toggle
    │   ├── StatsGrid.vue        # Reusable KPI summary grid component
    │   ├── VacancyModal.vue     # Detailed vacancy inspection modal
    │   ├── ReviewApplyModal.vue # AI match evaluation, letter editor, autofill launcher
    │   ├── AiConsentModal.vue   # GDPR opt-in prompt prior to remote AI calls
    │   ├── HotwordsChart.vue    # SVG bar chart querying backend skill demand
    │   ├── ToastContainer.vue   # Global toast notification stack
    │   └── ErrorBoundary.vue    # Vue onErrorCaptured + unhandledrejection boundary
    └── pages/
        ├── VacanciesPage.vue    # Search, filters, grid/list toggle, vacancy cards, analytics
        ├── ApplicationsPage.vue # Lifecycle status table/cards + inline follow-up notes
        ├── JobsPage.vue         # Automation job CRUD & platform chip selection
        ├── ProfilePage.vue      # Multi-profile & resume variant manager + exports
        └── SettingsPage.vue     # Display preferences, AI provider config, sync & backups
~~~

### Key Implementation Decisions

| Decision | Rationale |
|---|---|
| Reuse `src/client/extension/database/*` and `aiClient.js` directly from `services/` & `stores/` | Prevents duplicating IndexedDB schema (Dexie v7), AES-GCM key encryption, and PII stripping across extension and PWA |
| Hash routing (`createWebHashHistory`), lazy `import()` routes & `defineAsyncComponent` modals | Works seamlessly offline (`sw.js`) and on static subpaths (`/AutoOffer/`), while keeping `aiClient.js` out of the initial chunk |
| Centralized `httpClient.js` + `ErrorBoundary.vue` + `ToastContainer.vue` | Guarantees consistent `400`/`401`/`403`/`404`/`5xx` handling, backend error extraction, timeouts, and user-visible feedback |
| JSDoc `@typedef` models (`src/models/types.js`) + runtime `validation.js` | Documents exact `camelCase` backend DTOs vs `snake_case` local IndexedDB entities without requiring TypeScript rewrite of extension modules |
| Real-backend Vitest unit/integration tests + Playwright E2E | Verifies isolated components, form validation, IndexedDB persistence, and real-browser layout/routing |

### Diagrams

**Front-End Architecture Diagram:**

~~~mermaid
flowchart TB
    Main[main.js] --> App[App.vue]
    App --> Header[AppHeader.vue]
    App --> EB[ErrorBoundary.vue]
    EB --> Router[Vue Router - 5 Lazy Pages]
    Router --> VP[VacanciesPage]
    Router --> AP[ApplicationsPage]
    Router --> JP[JobsPage]
    Router --> PP[ProfilePage]
    Router --> SP[SettingsPage]

    App --> Modals[VacancyModal / ReviewApplyModal / AiConsentModal]
    App --> Toasts[ToastContainer.vue]

    VP & AP & JP & PP & SP & Modals --> Store[Pinia: useAppStore]
    Store --> Bridge[services/bridge.js]
    Store --> HTTP[services/httpClient.js]
    Store --> Export[services/resumeExport.js]
    Bridge --> Ext[Chrome Extension Runtime]
    Bridge --> Dexie[(IndexedDB / Dexie v7)]
    HTTP --> API[Backend REST API]
~~~

**Primary User Flow Diagram:**

~~~mermaid
flowchart LR
    V[/#/vacancies/] -->|Filter / Click Card| VM[VacancyModal]
    VM -->|Review & Apply| RM[ReviewApplyModal]
    RM -->|Evaluate / Generate| AI[aiClient + AiConsentModal]
    RM -->|Confirm & Submit| A[/#/applications/]
    V -->|Configure Search| J[/#/jobs/]
    V -->|Manage Resumes| P[/#/profile/]
    V -->|AI Keys / Sync / Display| S[/#/settings/]
~~~

### Client API Reference & Sample Payloads

| Endpoint / Channel | Method | Purpose | Schema Contract |
|---|---|---|---|
| `/api/dictionaries/bootstrap` | `GET` | Load reference positions for analytics filter | `positions[]` (`{ id, name, is_verified }`) |
| `/api/skills/hotwords?positionId=` | `GET` | Fetch aggregated skill counts from PostgreSQL | `SkillHotwordDto[]` |
| `/api/analytics/skills-demand` | `GET` | ClickHouse OLAP fallback for top skills | `{ data: ClickHouseSkillDemandRow[] }` |
| Extension Bridge (`chrome.runtime.sendMessage`) | `RPC` | Local-first sync of vacancies, profiles, resumes, jobs, AI configs, autofill | `{ status: 'success' \| 'error', data, message }` |

**Sample Request — `GET /api/dictionaries/bootstrap` (200 OK):**
~~~json
{
  "positions": [
    { "id": "b0000000-0000-4000-8000-000000000002", "name": "Backend Developer", "is_verified": true }
  ]
}
~~~

**Sample Request — `GET /api/skills/hotwords?positionId=b0000000-0000-4000-8000-000000000002` (200 OK):**
~~~json
[
  {
    "positionId": "b0000000-0000-4000-8000-000000000002",
    "positionName": "Backend Developer",
    "skillId": "d1a2b3c4-0000-4000-8000-000000000001",
    "skillName": "Java",
    "vacancyCount": 14
  }
]
~~~

**Sample Fallback — `GET /api/analytics/skills-demand` (200 OK):**
~~~json
{
  "data": [
    {
      "position_name": "Backend Developer",
      "skill_name": "PostgreSQL",
      "total_vacancies": 14,
      "avg_salary_eur": 4600,
      "skill_rank": 1
    }
  ]
}
~~~

**Sample Error — `GET /api/admin/selectors/queue` (403 Forbidden / `ApiErrorBody`):**
~~~json
{
  "timestamp": "2026-11-23T23:00:00Z",
  "status": 403,
  "code": "FORBIDDEN",
  "message": "Access denied",
  "details": {}
}
~~~

## Requirements Checklist

| # | Requirement | Status | Evidence / Notes |
|---|---|---|---|
| 1 | SPA built with modern framework + bundler | ✅ | Vue 3 (`src/client/pwa/package.json`) + Vite (`vite.config.mjs`) |
| 2 | Architecture & user flow diagrams + tech justification | ✅ | Included in `docs/02-technical/frontend.md` |
| 3 | API documentation & sample payloads for client endpoints | ✅ | Included above + `src/models/types.js` + `OpenApiConfiguration.java` |
| 4 | Separation into components, pages, services, composables, stores, models, styles | ✅ | `src/client/pwa/src/{components,pages,services,composables,stores,models,styles}` |
| 5 | Routing (≥ 3–4 routes) + lazy loading | ✅ | 5 lazy routes in `src/router/index.js` |
| 6 | Local + global state management | ✅ | Component `ref`/`reactive` + Pinia `useAppStore` (`src/stores/appStore.js`) |
| 7 | Clear data interfaces / types | ✅ | JSDoc `@typedef` contracts (`src/models/types.js`) + `jsconfig.json` + runtime `validation.js` |
| 8 | Centralized HTTP handling, global error boundary, toasts, skeleton loading states | ✅ | `httpClient.js`, `ErrorBoundary.vue`, `ToastContainer.vue`, `.ao-skeleton` across views |
| 9 | Forms with validation, tables/lists, search/filter/sort | ✅ | `ProfilePage.vue`, `JobsPage.vue`, `SettingsPage.vue`, `VacanciesPage.vue`, `ApplicationsPage.vue` |
| 10 | ESLint + Prettier + logging | ✅ | `eslint.config.js`, `.prettierrc`, `src/services/logger.js` |
| 11 | Unit tests (≥ 3 components/services) + Integration/E2E tests | ✅ | `tests/pwa.spec.js` (6 specs), `tests/components.spec.js` (6 specs), `tests/integration.spec.js` (4 specs), `e2e/pwa.spec.js` (14 specs covering 9 viewports, theme/scale/form flow, and small-viewport modal flows) |
| 12 | Lighthouse ≥ 90 benchmark report | ⚠️ | Code splitting, SW, WCAG 2.1 AA contrast fixes (`.hub-badge`, `.skill-chip-sm`, `.clear-button:hover`), and sequential heading hierarchy (`<h2 class="sr-only">Vacancies</h2>`) applied; final Lighthouse desktop/mobile score to be captured on deployed build |

## Known Limitations

| Limitation | Impact | Potential Solution |
|---|---|---|
| Uses ES modules + JSDoc `@typedef` instead of strict `.ts` compilation | Type checking is editorial/IDE-level rather than enforced in CI | Enable `checkJs: true` or migrate `src/` to `.ts` + `vue-tsc` |
| Extension-dependent features run in standalone local mode when unpaired | Autofill and extension sync unavailable in plain mobile browser | Surfaced clearly via `AppHeader` badge and `VacanciesPage` status card |

## References
- [Vue 3 Documentation](https://vuejs.org/)
- [Pinia Documentation](https://pinia.vuejs.org/)
- [Vue Router Documentation](https://router.vuejs.org/)
- `src/client/pwa/src/stores/appStore.js`, `src/client/pwa/src/router/index.js`, `src/client/pwa/src/services/httpClient.js`, `src/client/pwa/src/models/types.js`
