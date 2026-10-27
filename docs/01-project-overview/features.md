# Features, Epics and User Stories

## Epics

| ID | Epic                                    | Component          | Criterion                           |
|----|-----------------------------------------|--------------------|-------------------------------------|
| E1 | Vacancy collection                      | Extension, Backend | Backend, Database                   |
| E2 | Dynamic selector registry               | Backend, Extension | Backend, Database                   |
| E3 | Application submission and form filling | Extension, PWA     | Frontend                            |
| E4 | AI matching and cover letters           | Extension, AI      | AI Assistant                        |
| E5 | User dashboard and tracking             | PWA                | Frontend                            |
| E6 | Skills analytics                        | Backend, PWA       | Backend                             |
| E7 | Privacy and anonymous onboarding        | Extension, Backend | Backend                             |
| E8 | Mobile and tablet access                | PWA                | Adaptive UI                         |
| E9 | Deployment and API documentation        | Infrastructure     | Containerization, API documentation |

## Platform Compatibility and Universal Operation

The system has been tested on ZipRecruiter, Indeed, and We Work Remotely, and while it currently functions on these platforms, it is designed to operate on any website featuring vacancies.

## User Stories

Priority levels comprise Must have, Should have, and Could have.

### E1. Vacancy collection

| ID     | As a       | I want to                                                                        | So that                                       | Priority  |
|--------|------------|----------------------------------------------------------------------------------|-----------------------------------------------|-----------|
| US 1.1 | job seeker | have the extension search job platforms in the background for my role            | I do not have to visit each platform manually | Must have |
| US 1.2 | job seeker | have the extension scrape vacancies locally when the server has none for my role | I still get results for rare roles            | Must have |
| US 1.3 | system     | receive scraped vacancies from clients and remove duplicates                     | the database stays clean and useful           | Must have |
| US 1.4 | job seeker | filter vacancies by my criteria                                                  | I only see relevant listings                  | Must have |

### E2. Dynamic selector registry

| ID     | As a          | I want to                                                                       | So that                                               | Priority    |
|--------|---------------|---------------------------------------------------------------------------------|-------------------------------------------------------|-------------|
| US 2.1 | extension     | periodically fetch up to date selectors from the server                         | scraping keeps working after a platform layout change | Must have   |
| US 2.2 | job seeker    | have updated selectors applied without restarting or reinstalling the extension | I experience no interruption                          | Must have   |
| US 2.3 | job seeker    | share selectors that worked for me                                              | other users benefit from my fix                       | Could have  |
| US 2.4 | administrator | review and approve submitted selectors before distribution                      | malicious or broken selectors are not spread          | Should have |

### E3. Application submission and form filling

| ID     | As a       | I want to                                                        | So that                              | Priority    |
|--------|------------|------------------------------------------------------------------|--------------------------------------|-------------|
| US 3.1 | job seeker | have application forms filled automatically from my stored data  | I do not retype the same information | Must have   |
| US 3.2 | job seeker | have the extension guess field mappings on unknown forms         | unfamiliar platforms still work      | Should have |
| US 3.3 | job seeker | choose the resume variant, name and address for each application | each application is tailored         | Must have   |
| US 3.4 | job seeker | choose between manual, semi automated and automatic submission   | I stay in control                    | Must have   |
| US 3.5 | job seeker | solve a captcha in the PWA when a platform requires it           | the application can continue         | Could have  |
| US 3.6 | job seeker | generate a resume in PDF or Word format from a template          | I can attach it to applications      | Should have |
| US 3.7 | job seeker | share successful form mappings                                   | others can apply faster              | Could have  |

### E4. AI matching and cover letters

| ID     | As a       | I want to                                            | So that                   | Priority  |
|--------|------------|------------------------------------------------------|---------------------------|-----------|
| US 4.1 | job seeker | see a match score between my resume and each vacancy | I can prioritize          | Must have |
| US 4.2 | job seeker | get a personalized cover letter for a vacancy        | my application stands out | Must have |
| US 4.3 | job seeker | edit the generated letter before sending             | I keep the final say      | Must have |

### E5. User dashboard and tracking

| ID     | As a       | I want to                                                | So that                                       | Priority    |
|--------|------------|----------------------------------------------------------|-----------------------------------------------|-------------|
| US 5.1 | job seeker | manage personal data and resume variants in the PWA      | everything is in one place and stored locally | Must have   |
| US 5.2 | job seeker | configure search filters                                 | automated search reflects my preferences      | Must have   |
| US 5.3 | job seeker | track the status of every application                    | I know what has been sent and what happened   | Must have   |
| US 5.4 | job seeker | get a reminder to install the extension if it is missing | the system works as intended                  | Should have |

### E6. Skills analytics

| ID     | As a       | I want to                                                 | So that                           | Priority    |
|--------|------------|-----------------------------------------------------------|-----------------------------------|-------------|
| US 6.1 | job seeker | see the most frequent skills hot words for my target role | I know what to learn or emphasize | Should have |
| US 6.2 | job seeker | view analytics as charts in the dashboard                 | trends are easy to grasp          | Should have |

### E7. Privacy and anonymous onboarding

| ID     | As a       | I want to                                                  | So that                                    | Priority    |
|--------|------------|------------------------------------------------------------|--------------------------------------------|-------------|
| US 7.1 | job seeker | start using the system without registration                | I do not have to give an email or password | Must have   |
| US 7.2 | job seeker | keep credentials and personal data only on my device       | my privacy is protected                    | Must have   |
| US 7.3 | job seeker | store non sensitive preferences under an anonymous profile | settings persist across sessions           | Should have |

### E8. Mobile and tablet access

| ID     | As a       | I want to                                | So that                            | Priority   |
|--------|------------|------------------------------------------|------------------------------------|------------|
| US 8.1 | job seeker | open the dashboard on my phone or tablet | I can monitor and manage on the go | Must have  |
| US 8.2 | job seeker | install the PWA to my home screen        | it opens like an app               | Could have |

### E9. Deployment and API documentation

| ID     | As a      | I want to                                                                          | So that                                             | Priority  |
|--------|-----------|------------------------------------------------------------------------------------|-----------------------------------------------------|-----------|
| US 9.1 | developer | start the backend, collector and databases with one command in an isolated network | setup is reproducible                               | Must have |
| US 9.2 | developer | read a specification of all endpoints, formats and error structures                | I can integrate the PWA and the extension correctly | Must have |

## Use Cases and Actor Interactions

| Primary Actor | Use Case                          | Description                                                     | Connected Subsystems      |
|---------------|-----------------------------------|-----------------------------------------------------------------|---------------------------|
| Job Seeker    | Configure filters                 | Sets preferred roles, locations, and salary criteria            | PWA Dashboard             |
| Job Seeker    | Manage personal data and resumes  | Stores profile entries and resume variants locally              | Local Client Storage      |
| Job Seeker    | Browse vacancies and match scores | Reviews collected vacancies and semantic suitability ratings    | Extension, AI Assistant   |
| Job Seeker    | Generate cover letter             | Creates personalized cover letters tailored to job requirements | AI Assistant              |
| Job Seeker    | Submit application                | Executes manual, semi automated, or automated submissions       | Extension, Job Platforms  |
| Job Seeker    | Resolve captcha                   | Solves verification challenges when requested by job platforms  | Extension, PWA Dashboard  |
| Job Seeker    | Track application statuses        | Monitors responses, interviews, and submission stages           | PWA Dashboard             |
| Job Seeker    | View skills analytics             | Observes market demand and hot words frequency charts           | Backend Analytics Service |
| Job Seeker    | Share selectors and form mappings | Submits verified layout selectors to the shared registry        | Dynamic Selector Registry |
| Administrator | Review submitted selectors        | Validates community contributions before broad distribution     | Backend Registry          |
| Job Platform  | Provide vacancy data              | Serves vacancy postings to client browser scrapers              | Extension Collector       |
| AI Provider   | Text processing service           | Delivers embeddings, match scores, and letter drafts            | AI Assistant              |

## Feature List by Component

| Component         | Features                                                                                                                                                       |
|-------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Browser extension | Background and local scraping, dynamic selectors, adaptive form filling, AI request proxying, resume generation, local storage of personal data, captcha relay |
| Backend           | Vacancy aggregation and deduplication, selector and configuration distribution, anonymous onboarding, hot words analytics                                      |
| PWA               | Dashboard, filter settings, personal data in local client storage, manual and semi automated applications, status tracking, analytics charts, adaptive layout  |
| AI Assistant      | Match score calculation, personalized cover letter generation                                                                                                  |
| Infrastructure    | Containerized services in an isolated network, API specification                                                                                               |