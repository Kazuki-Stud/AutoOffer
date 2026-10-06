# Stakeholders & Target Audience

## Target Audience

**Primary:** active job seekers who apply to many vacancies on several platforms, in particular IT professionals and graduates (junior and middle level), who are comfortable installing a browser extension.

**Secondary:** passive job seekers who want to monitor the market and understand which skills are in demand.

**Key characteristics**

- Use a desktop browser for searching and applying, and a smartphone for monitoring.
- Care about privacy of personal data and about the safety of their accounts on job platforms.
- Apply to dozens of vacancies and value tracking and prioritization.

## Personas

### Persona 1: Anna, Junior Developer (primary)

| | |
|---|---|
| **Age / background** | 23, recently graduated in computer science |
| **Goal** | Get a first job in software development quickly |
| **Behavior** | Applies to 5–10 vacancies a day across several platforms; sends largely the same cover letter |
| **Frustrations** | Spends hours on forms, receives few replies, unsure what skills employers want |
| **What she needs from the system** | Match score to focus on the right vacancies, tailored letters, one place to track applications, skills analytics to guide learning |

### Persona 2: Mikhail, Experienced Specialist (primary)

| | |
|---|---|
| **Age / background** | 35, backend engineer with 10 years of experience, employed |
| **Goal** | Find a better position without exposing his search to his current employer |
| **Behavior** | Checks the market in the evening; applies selectively; keeps several resume variants |
| **Frustrations** | Does not trust third-party services with credentials and data; little time |
| **What he needs from the system** | Local-only data storage, resume variant choice per application, semi-automated mode with a final manual confirmation |

### Persona 3: Olga, Career Changer on Mobile (secondary)

| | |
|---|---|
| **Age / background** | 29, moving from marketing to data analysis |
| **Goal** | Understand the target market and apply to suitable roles |
| **Behavior** | Reviews vacancies and statuses mostly from her phone during commutes |
| **Frustrations** | Desktop-only tools, uncertainty about required skills |
| **What she needs from the system** | Mobile-friendly dashboard, hot-words analytics for her target role, quick approval of prepared applications |

## Other Stakeholders

| Stakeholder | Interest | Influence | Notes |
|---|---|---|---|
| Project author | Delivers a working system and documentation | High | Artsiom Chyslou |
| Supervisor | Evaluates the project against the university requirements | High | Yuriy Mischeryakov |
| European Humanities University | Quality and compliance of the diploma project | Medium | Sets documentation and evaluation rules |
| Job platforms | Their sites are scraped and applications are submitted to them | High (can change layouts, block automation, change terms) | Not a direct user; the main external risk |
| Employers| Receive applications | Low | Receive higher-quality, better-targeted applications |
| Community contributors | Share working selectors and form mappings | Medium | Contributions must be validated before distribution |
| AI provider | Supplies language-model API used for matching and letters | Medium | Rate limits, cost and availability affect the AI features |
| Browser vendor| Reviews and distributes the extension | High | Policies constrain what the extension may do |

## Stakeholder Needs Summary

| Stakeholder | Need | Addressed by |
|---|---|---|
| Job seekers | Less manual work, better targeting | Scraping, match score, letter generation, auto-fill |
| Job seekers | Privacy and control | Local storage, anonymous onboarding, user confirmation before sending |
| Job seekers | Overview and mobile access | PWA dashboard, adaptive UI, status tracking |
| Platform owners | Not overloaded or abused | Distributed low-rate scraping, user-in-the-loop for captchas |
