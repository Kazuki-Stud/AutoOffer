# Front-End Architecture and Development


## Context
AutoOffer requires a local-first Progressive Web App (PWA) dashboard (`src/client/pwa`) that communicates with a Chromium Manifest V3 extension (`src/client/extension`), stores candidate profiles, resume variants, applications, and scraped vacancies in IndexedDB (`Dexie`), performs client-side AI evaluation/tailoring, and queries public skill analytics from the Spring Boot backend.

An initial prototype used imperative DOM manipulation across vanilla JS view scripts without URL routing, centralized HTTP error handling, a reactive state store, or automated tests. To meet maintainability, scalability, and the Diploma Project Front-End requirements, the PWA needed a component-based Single Page Application (SPA) architecture with clear separation of concerns, reactive state management, client-side routing, global error handling, and automated test coverage.

## Decision
We migrated `src/client/pwa` to a **Vue 3 SPA** built with **Vite**, using:
- **Vue Router (`vue-router`)** with hash history and lazy-loaded route components across 5 pages (`/vacancies`, `/applications`, `/jobs`, `/profile`, `/settings`).
- **Pinia (`pinia`)** (`useAppStore`) as a centralized reactive store bridging local IndexedDB (`Dexie`), Chrome extension external messaging (`bridge.js`), and UI state.
- **Modular folder structure**: `components/`, `pages/`, `services/`, `stores/`, `models/`, `router/`, `utils/`, `styles/`, and `tests/` + `e2e/`.
- **Centralized HTTP wrapper & error boundary**: `httpClient.js` handles timeouts and HTTP `401`/`403`/`404`/`500` errors via `ToastContainer.vue`, complemented by `ErrorBoundary.vue` (`onErrorCaptured` + `unhandledrejection`) and `logger.js`.
- **Quality & Testing**: ESLint (`eslint-plugin-vue`), Prettier, Vitest + `@vue/test-utils` unit/integration tests, and Playwright E2E tests.

## Alternatives Considered

| Alternative | Pros | Cons | Why Not Chosen |
|---|---|---|---|
| **Vanilla JS + Web Components (Prototype)** | Zero framework dependency; small initial bundle | Imperative DOM manipulation (`innerHTML`), no URL router, hard to unit-test UI states, violates SPA framework requirement | Fails maintainability and Front-End SPA rubric requirements |
| **Vue 3 + Pinia + Vue Router (Chosen)** | Lightweight, fast Vite builds, clean `<script setup>` SFCs, low friction reusing existing ES modules (`database.js`, `aiClient.js`, `bridge.js`) | Smaller enterprise ecosystem than Angular | Best balance of simplicity, reactivity, bundle size, and compatibility with the shared ES module extension codebase |
| **React + Zustand + React Router** | Very large ecosystem; strong testing library | JSX rewrite overhead for HTML-heavy forms/modals; slightly more boilerplate for two-way form bindings | Vue 3 SFCs map more directly to the existing HTML templates and reactive form bindings |
| **Angular** | Strict built-in DI, router, and forms out of the box | Heavy boilerplate and CLI constraints when sharing Dexie ES modules with a vanilla MV3 Chrome extension | Overkill for a local-first extension companion PWA |

## Consequences

**Positive:**
- Clear separation between UI (`components/`, `pages/`), global state (`stores/appStore.js`), persistence/network (`services/`), and shared extension DB/AI modules.
- Route-level code splitting via lazy `import()` chunks reduces initial bundle weight.
- Global error handling, toast feedback, skeleton loaders, and automated unit + integration + E2E tests prevent regressions.

**Negative:**
- Requires `npm install` and Vite compilation with `@vitejs/plugin-vue`.
- Uses JavaScript with structured constants (`models/constants.js`) rather than strict TypeScript across every component.

**Neutral:**
- Hash routing (`createWebHashHistory`) is used so routes resolve reliably under GitHub Pages (`/AutoOffer/`) and offline Service Worker caching (`public/sw.js`).

## Implementation Details

### Project Structure

~~~text
src/client/pwa/
├── index.html                   # SPA entry HTML (<div id="app"> + PWA manifest meta)
├── vite.config.mjs              # Vite + @vitejs/plugin-vue + Vitest configuration
├── eslint.config.js             # ESLint 9 flat config for JS & Vue SFCs
├── .prettierrc                  # Formatting rules
├── playwright.config.mjs        # Playwright E2E configuration
├── e2e/
│   └── pwa.spec.js              # Multi-viewport E2E & Adaptive UI verification
├── tests/
│   ├── pwa.spec.js              # Unit tests for components & httpClient
│   └── integration.spec.js      # Multi-route & form validation integration tests
└── src/
    ├── main.js                  # App bootstrap, Pinia, Router, SW registration
    ├── App.vue                  # Root shell (Header, ErrorBoundary, RouterView, Modals, Toasts)
    ├── router/index.js          # 5 lazy-loaded hash routes
    ├── stores/appStore.js       # Global Pinia store (profiles, vacancies, apps, settings, AI)
    ├── models/constants.js      # Skill dictionaries, AI model presets, application statuses
    ├── services/
    │   ├── bridge.js            # Extension messaging, Dexie mirroring, JSON backup export/import
    │   ├── httpClient.js        # Centralized fetch wrapper with 401/403/404/500 mapping
    │   ├── logger.js            # Structured console logger
    │   └── resumeExport.js      # Client-side PDF (print frame) & Word (.doc) generation
    ├── utils/helpers.js         # URL safety, date formatting, base64/blob & array helpers
    ├── styles/main.css          # Theme tokens, responsive layout, 44px touch rules, skeletons/toasts
    ├── components/
    │   ├── AppHeader.vue        # Brand, router navigation links, theme toggle
    │   ├── StatsGrid.vue        # Dashboard KPI summary cards
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
| Hash routing (`createWebHashHistory`) + lazy `import()` routes | Works seamlessly offline (`sw.js`) and on static subpaths (`/AutoOffer/`) while enabling Vite chunk splitting |
| Centralized `httpClient.js` + `ErrorBoundary.vue` + `ToastContainer.vue` | Guarantees consistent `401`/`403`/`404`/`500` handling, timeouts, and user-visible feedback |
| Vitest unit/integration tests + Playwright E2E | Verifies isolated components, form validation, store flows, and real-browser layout/routing |

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

### Client API Reference Summary

| Endpoint | Method | Purpose | Response Schema / Notes |
|---|---|---|---|
| `/api/dictionaries/bootstrap` | `GET` | Load reference positions for analytics filter | `{ positions: [{ id, name, is_verified }], ... }` |
| `/api/skills/hotwords?positionId=` | `GET` | Fetch aggregated skill counts from PostgreSQL | `[{ positionId, positionName, skillId, skillName, vacancyCount }]` |
| `/api/analytics/skills-demand` | `GET` | ClickHouse OLAP fallback for top skills | `{ data: [{ position_name, skill_name, total_vacancies, avg_salary_eur, skill_rank }] }` |
| Extension Bridge (`chrome.runtime.sendMessage`) | `RPC` | Local-first sync of vacancies, profiles, resumes, jobs, AI configs, autofill | `{ status: 'success' \| 'error', data, message }` |

## Requirements Checklist

| # | Requirement | Status | Evidence / Notes |
|---|---|---|---|
| 1 | SPA built with modern framework + bundler | ✅ | Vue 3 (`src/client/pwa/package.json`) + Vite (`vite.config.mjs`) |
| 2 | Architecture & user flow diagrams + tech justification | ✅ | Included in `docs/adr/frontend.md` |
| 3 | API documentation for client endpoints | ✅ | Included in `docs/adr/frontend.md` + `OpenApiConfiguration.java` |
| 4 | Separation into components, pages, services, stores, models, styles | ✅ | `src/client/pwa/src/{components,pages,services,stores,models,styles}` |
| 5 | Routing (≥ 3–4 routes) + lazy loading | ✅ | 5 lazy routes in `src/router/index.js` |
| 6 | Local + global state management | ✅ | Component `ref`/`reactive` + Pinia `useAppStore` (`src/stores/appStore.js`) |
| 7 | Centralized HTTP handling, global error boundary, toasts, loading states | ✅ | `httpClient.js`, `ErrorBoundary.vue`, `ToastContainer.vue`, `.ao-skeleton` |
| 8 | Forms with validation, tables/lists, search/filter/sort | ✅ | `ProfilePage.vue`, `JobsPage.vue`, `SettingsPage.vue`, `VacanciesPage.vue`, `ApplicationsPage.vue` |
| 9 | ESLint + Prettier + logging | ✅ | `eslint.config.js`, `.prettierrc`, `src/services/logger.js` |
| 10 | Unit tests (≥ 3 components/services) + Integration/E2E tests | ✅ | `tests/pwa.spec.js` (5 unit tests), `tests/integration.spec.js`, `e2e/pwa.spec.js` |
| 11 | Strict TypeScript across components | ⚠️ | Implemented in ES modules with structured constants (`models/constants.js`); TS migration optional |
| 12 | Lighthouse ≥ 90 benchmark report | ⚠️ | Code splitting & SW configured; benchmark score to be recorded on deployed build |

## Known Limitations

| Limitation | Impact | Potential Solution |
|---|---|---|
| JavaScript used instead of TypeScript | No compile-time type checking on Vue props/store payloads | Add `tsconfig.json` and `vue-tsc` incrementally |
| Extension-dependent features run in standalone local mode when unpaired | Autofill and extension sync unavailable in plain mobile browser | Clearly surfaced via banner on `VacanciesPage.vue` and `SettingsPage.vue` |

## References
- [Vue 3 Documentation](https://vuejs.org/)
- [Pinia Documentation](https://pinia.vuejs.org/)
- [Vue Router Documentation](https://router.vuejs.org/)
- `src/client/pwa/src/stores/appStore.js`, `src/client/pwa/src/router/index.js`, `src/client/pwa/src/services/httpClient.js`
