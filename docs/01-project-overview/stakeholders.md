# Stakeholders & Target Audience

## Target Audience

### Primary Audience
- **Active Job Seekers:** Individuals who need to apply to dozens of postings across platforms. They need to reduce mechanical form-filling overhead, assess resume fit quickly, and track applications in one place.
- **Employed** Individuals who selectively explore new positions while employed. They require a broad search across various roles and similar tech stacks to either transition to a more convenient workplace or increase their compensation.

### Secondary Audience
- **Career Changers** Individuals transitioning into tech who must understand which tools and frameworks are most in-demand to guide their learning.
---

## User Personas

### Persona 1: Anna — Junior Frontend Developer (Active Job Seeker)
- **Demographics:** 23 years old, recent computer science graduate, applying to junior/intern roles.
- **Behavior:** Spends 3–4 hours daily checking Indeed and LinkedIn; manually sends 8–12 applications daily with minimal resume customization.
- **Frustrations:** Disorganized application tracking; feels overwhelmed reading lengthy job descriptions to spot junior-friendly skill sets; receives low response rates due to generic cover letters.
- **System Value:**
    - *Current Core:* Automated vacancy collection for "Frontend Developer" across multiple platforms into a single dashboard.
    - *Future Enhancements:* AI match score highlighting missing skills; automated generation of personalized cover letters.

### Persona 2: Mikhail — Senior Backend Engineer (Passive Job Seeker)
- **Demographics:** 34 years old, employed backend engineer with 8 years of Java/Spring experience.
- **Behavior:** Explores senior positions 2–3 evenings a week; applies only to highly relevant vacancies; maintains distinct resume versions.
- **Frustrations:** Refuses third-party "auto-apply" tools that require cloud account credentials; lacks time to manually retype personal data into company job portals.
- **System Value:**
    - *Current Core:* All data and sessions remain on his local machine; zero external telemetry.
    - *Future Enhancements:* Semi-automated form filling with mandatory manual confirmation; versioned resume profile selection per vacancy.

### Persona 3: Olga — Career Changer (Mobile-First Market Monitor)
- **Demographics:** 30 years old, transitioning from digital marketing into data analytics.
- **Behavior:** Reviews market trends and vacancies primarily on her tablet/smartphone during commutes.
- **Frustrations:** Desktop-bound tools; uncertainty regarding which analytical tools (Python vs. R, PowerBI vs. Tableau) employers demand.
- **System Value:**
    - *Current Core:* Responsive PWA dashboard allowing offline browsing of captured listings and status tracking on mobile viewports.
    - *Future Enhancements:* "Hot words" skills analytics charts displaying relative demand frequencies for targeted job titles.

---

## Stakeholder Matrix

| Stakeholder                        | Category              | Primary Interest                                                    | System Impact | Management & Engagement Strategy                                                   |
|------------------------------------|-----------------------|---------------------------------------------------------------------|---------------|------------------------------------------------------------------------------------|
| **Job Seekers**                    | Primary User          | Efficiency, privacy, tracking, tailored applications                | High          | Direct user interface design, local-first storage, transparent automation controls |
| **Artsiom Chyslou**                | Author / Developer    | Complete system implementation and academic degree defense          | High          | Architecture design, iterative implementation of Phase 1 and Phase 2               |
| **Yuriy Mischeryakov**             | Academic Supervisor   | Methodological rigor, technical quality, documentation completeness | High          | Regular project reviews, formal milestone demonstrations                           |
| **European Humanities University** | Academic Institution  | Compliance with thesis and informatics program criteria             | High          | Adherence to evaluation criteria, reproducible builds, academic integrity          |
| **Job Platforms**                  | External Environment  | Platform availability, abuse prevention, terms compliance           | High          | Gentle scraping rates, human-paced tab navigation, client-side session handling    |
| **AI API Providers**               | Infrastructure Vendor | Model availability, compliance with usage policies                  | Medium        | Abstracted AI proxy interfaces, token caching, local fallback support              |
| **Web Browser Vendors**            | Platform Host         | Manifest V3 compliance, permission security                         | High          | Strict adherence to least-privilege permissions, declarative data exchange         |

---

## Stakeholder Needs vs. Architectural Mapping

| Stakeholder Group           | Identified Need                            | Implemented Architectural Feature (Phase 1 Core)                            | Planned Roadmap Feature (Phase 2 Future)                  |
|-----------------------------|--------------------------------------------|-----------------------------------------------------------------------------|-----------------------------------------------------------|
| **Active Job Seekers**      | Unified aggregation across disparate sites | Background tab automation pipeline capturing vacancy lists and detail texts | Centralized vacancy deduplication and ingestion pipeline  |
| **Active Job Seekers**      | Quick vacancy assessment & tailoring       | PWA detailed modal inspector rendering full description texts               | AI match scoring and tailored cover letter generation     |
| **Privacy-Conscious Users** | Zero data leaks; account safety            | Local storage via Dexie.js; PWA sync via direct extension messaging bridge  | Device-derived anonymous onboarding; client-side AI proxy |
| **Mobile Users**            | Monitoring on phones and tablets           | Responsive PWA dashboard with offline Service Worker support                | Synchronized cross-device preferences using anonymous IDs |
| **Platform Operators**      | No server overload or abusive requests     | Low-frequency, sequential client-side browser tab navigation                | Client rate throttling, manual captcha resolution         |