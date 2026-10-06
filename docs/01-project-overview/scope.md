# Scope, Constraints & Assumptions

## In Scope

| Area | Included |
|---|---|
| **Browser extension** | Background vacancy scraping on supported platforms; local scraping when the central database lacks vacancies for a role; periodic fetching of CSS/XPath selectors; sharing of working selectors and form mappings; adaptive form filling with field-mapping guessing; AI request proxying on the client side; resume generation in PDF and DOC from templates; local storage of personal data, tokens and credentials |
| **Backend** | Receiving vacancies from clients; deduplication; selector registry and distribution; configuration distribution; anonymous onboarding with a device-derived key and token; hot-words aggregation service and skills analytics; storage of raw vacancies; caching of selectors and keywords |
| **PWA** | Dashboard with aggregated views; filter configuration; personal data and resume variant management in IndexedDB; manual and semi-automated application controls; application status tracking; analytics visualization; extension installation reminder with Chrome Web Store link; captcha display and relay through the extension |
| **Adaptive UI** | Responsive layout of the PWA for smartphones and tablets |
| **AI assistant** | Semantic comparison of resume and vacancy to compute a match score; generation of personalized cover letters |
| **Infrastructure** | Containerization of the backend, the background data collector and databases in an isolated network |
| **Documentation** | API specification; project documentation in Markdown |

## Out of Scope

- Server-side storage of personal data, resumes or platform credentials.
- Automatic captcha solving.
- Support for browsers other than Chromium-based ones in the MVP.
- A native mobile application.
- Employer-side features.
- User accounts with email/password or social login.
- Payments, subscriptions and billing.
- Guaranteed support for every job platform; only a limited, selected set.
- Interview preparation, salary negotiation and other career coaching functions.

## Constraints

| Type | Constraint |
|---|---|
| **Privacy** | Personal data, tokens and credentials must remain on the client device; the server may store only non-sensitive configuration and preferences. |
| **Technology** | Backend in Spring Boot; frontend as a PWA with IndexedDB; client logic in a browser extension. |
| **Platform terms** | Job platforms may restrict automated access and automated applications in their terms of service. The project must be presented as an assistive tool with the user in control, and the risk must be documented. |
| **Browser policies** | The extension must comply with Chrome Web Store policies. Selectors are distributed as data, not as executable code. |
| **Anti-bot measures** | Captchas and rate limits on target platforms; these are handled by distribution of load and by user interaction, not circumvention. |
| **AI costs and limits** | Language-model API usage is limited by cost, rate limits and availability. |
| **Resources** | A single developer; fixed diploma deadline. |
| **Deployment** | The server components must run from containers with a reproducible setup. |

## Assumptions

- Users have a desktop Chromium-based browser and are willing to install an extension.
- Users already have accounts on the supported job platforms and are signed in within the browser.
- Target platforms expose vacancy data and application forms in the page DOM that can be read through selectors.
- Platform layouts change occasionally, so selectors need to be updatable without reinstalling the extension.
- A device-derived key is sufficient to identify an anonymous profile for storing non-sensitive preferences.
- A language-model API is available for matching and letter generation throughout development and evaluation.
- Enough users will contribute vacancies to make deduplication and hot-words analytics meaningful.

## Risks and Open Questions

| # | Risk / Open Question | Impact | Mitigation / Next step |
|---|---|---|---|
| 1 | Community-shared selectors could be used to inject malicious behavior | High | Treat selectors as declarative data only; validate against a schema; accept submissions into a review or reputation-based pipeline before distribution |
| 2 | Performance overhead of scraping in the user's browser during normal use | Medium | Run scraping in the background with throttling and idle-time scheduling; measure and report |
| 3 | Deduplication of vacancies from decentralized clients at scale; retention policy | Medium | Define a canonical vacancy fingerprint; set a retention period for raw data |
| 4 | Abuse of the anonymous token endpoint | Medium | Rate limiting, proof-of-work or request signing; token expiry |
| 5 | An API key embedded in the extension can be extracted by users | High | Use a restricted, rate-limited key for development only, or route requests through a backend proxy with quotas, or support user-supplied keys and local models |
| 6 | Messaging bridge between the PWA and the extension for real-time captcha rendering | Medium | Prototype with `externally_connectable` messaging and verify origins |
| 7 | Platforms detect automation and ban accounts | High | Human-like pacing, user confirmation for submissions, explicit disclosure to users |
