EUROPEAN HUMANITIES UNIVERSITY
Academic Department of Informatics
Study program: Informatics
ARTSIOM CHYSLOU
4th year student
INFORMATION SYSTEM FOR AUTOMATED JOB SELECTION AND APPLICATION SUBMISSION USING ARTIFICIAL INTELLIGENCE TECHNOLOGIES
BACHELOR PROJECT
Supervisor: Yuriy Mischeryakov
Vilnius, 2026
Artsiom Chyslou
Information system for automated job selection and application submission using artificial intelligence technologies
Keywords: job application automation; browser extension; semantic matching; privacy by design; requirements specification
Object. The process of job search, qualification assessment, cover letter writing and application submission on employment websites.
Goal. To specify an assistive information system, AutoOffer, that automates vacancy discovery, resume matching, cover letter tailoring and form filling while keeping personal data on the client device.
//Goal and tasks must be connected. 
Tasks. To analyze the current process, legal boundaries and analogs; to design a decentralized architecture; to formulate functional and non-functional requirements; to define resilient extraction mechanisms; to define a verification framework.
Methods. Interviews, a survey of 42 IT specialists, document and policy analysis, competitive benchmarking, user stories with MoSCoW prioritization.
Conclusions. Candidates lose 12–18 hours per week, over 70% on mechanical work, and the analogs trade privacy for automation. The specification defines 9 epics, 31 user stories, 6 non-functional requirements and 4 KPIs: up to 2 minutes per application, 100% local personal data, up to 10 minutes selector propagation, match correlation of at least 0.70.
TABLE OF CONTENTS
Contents
LIST OF ABBREVIATIONS	4
INTRODUCTION	5
1. ANALYTICAL PART	7
1.1. Current state analysis: AS-IS and TO-BE models	7
1.1.1. AS-IS process description	7
1.1.2. Time and data loss analysis	7
1.3. TO-BE process description	8
1.2. Review of theoretical and practical sources	9
1.3. Competitive landscape and analog analysis	11
1.4. Chapter conclusions and requirements traceability	12
2. SYSTEM REQUIREMENTS	13
2.1. Vision, business goals and KPIs	13
2.2. Stakeholders and user personas	14
2.3. Scope, assumptions and constraints	15
2.4. Solution concept and architectural alternatives	16
2.5. Functional requirements	17
2.6. Use case scenarios	22
2.6.1. Use case 1: automated background vacancy extraction	22
2.6.2. Use case 2: semi-automated submission with AI assistance	22
2.7. Non-functional requirements	23
2.8. Regulatory, privacy and ethical compliance	24
2.9. Risk assessment and mitigation	25
2.10. Requirements validation and chapter conclusions	26
CONCLUSION	27
REFERENCES	28
APPENDICES	30

LIST OF ABBREVIATIONS
AI	Artificial intelligence
API	Application programming interface
BA	Business analysis
BABOK	Business Analysis Body of Knowledge
CSS	Cascading Style Sheets
DOM	Document Object Model
GDPR	General Data Protection Regulation
HTTPS	Hypertext Transfer Protocol Secure
KPI	Key performance indicator
MoSCoW	Must, Should, Could, Won’t
NFR	Non-functional requirement
PWA	Progressive Web App
REST	Representational State Transfer
SBERT	Sentence-BERT
URL	Uniform Resource Locator
US	User story
WCAG	Web Content Accessibility Guidelines
XPath	XML Path Language
INTRODUCTION
Relevance. Searching for a job in the information technology sector has become a fragmented, repetitive activity. A candidate has to monitor several independent job boards, find relevant postings among thousands, compare long requirement lists with his or her own skills, write a motivational letter and then retype the same personal data into multi-step application forms. In a survey of 42 IT specialists conducted by the author, active candidates reported spending 12–18 hours per week on this routine, and more than 70% of that time went to mechanical operations: retyping data, scanning unstructured text and logging submissions by hand. One application takes between 10 and 20 minutes.
Commercial tools that try to remove this burden have two weaknesses. Cloud auto-apply services require the user to hand over a resume, contact data and sometimes account access to a vendor server, which is a privacy and security risk under the General Data Protection Regulation.  Script-based extensions depend on hardcoded page structures and stop working when a job board changes its layout. There is therefore a practical need for an assistive system that automates the mechanical steps, supports the candidate’s decisions with semantic analysis, adapts to layout changes and keeps personal data on the user’s own device.
Goal. The goal of the project is to specify and design an assistive information system, AutoOffer, that automates vacancy discovery, resume relevance evaluation, cover letter tailoring and application form filling across employment websites while keeping all personal data on the client device.
Objectives.
1.	analyze the current application workflow, legal boundaries and existing technical solutions in order to identify process bottlenecks;
2.	design a decentralized architecture that combines a browser extension, a Progressive Web App (PWA) dashboard, an artificial intelligence assistant and a lightweight server registry of selectors;
3.	formulate functional and non-functional requirements, traceable user stories, acceptance criteria and interaction scenarios;
4.	define resilient extraction mechanisms that work on the initial target platforms and can be adapted to arbitrary vacancy pages;
5.	define a verification framework for reliability, form-filling accuracy, matching precision and data-protection compliance.
Object and subject. The object of the study is the application workflow: vacancy search, qualification assessment, preparation of a motivational letter and submission of an application. The subject is client-side automated data extraction and local form filling, together with the dynamic distribution of selectors, semantic resume matching and privacy-preserving storage of the candidate’s profile.
Methods. Requirements were collected with four methods:
–	interviews – semi-structured conversations with active job seekers, recent graduates and software engineers to identify friction points;
–	survey – a questionnaire completed by 42 IT specialists on time expenditure, platform usage and privacy concerns;
–	document analysis – study of EU data-protection law, browser extension store policies and the terms of employment platforms;
–	benchmarking – hands-on testing of auto-apply extensions, generic browser autofill and job aggregation portals.
The requirements are then structured with epics, user stories and MoSCoW prioritization.   AutoOffer has been tested on ZipRecruiter, Indeed and We Work Remotely, and while it currently works on these platforms, it is designed to operate on any website featuring vacancies. The work consists of two chapters: Chapter 1 analyzes the current state, the literature and the analogs; Chapter 2 specifies the system requirements.
1. ANALYTICAL PART
1.1. Current state analysis: AS-IS and TO-BE models
1.1.1. AS-IS process description
In the current situation the applicant performs every step manually (Fig. A2.1 in Appendix 2 shows the flow as a diagram):
1.	opens several browser tabs for different boards, for example Indeed, ZipRecruiter and We Work Remotely;
2.	types search queries, applies role filters and reviews paginated lists of postings;
3.	opens each vacancy, reads the description and mentally checks the overlap with his or her skills;
4.	creates a text document, copies relevant points from the posting and writes or edits a cover letter;
5.	starts the application and retypes contact data, residence, portfolio links and education into form fields;
6.	records the submission in a personal spreadsheet or note to follow the response.
A typical application takes 10–20 minutes. The time is spent on mechanical actions, which cause fatigue, typing errors and a lower number of submissions. Tracking in disconnected spreadsheets is irregular, so follow-ups are missed and the same vacancy is sometimes applied to twice.
1.1.2. Time and data loss analysis
Table 1.1 breaks the process into stages and estimates the losses collected in the interviews and the survey.
Table 1.1
Time and data losses in the AS-IS process
Stage	Activity	Loss
1	Manual platform surfing	25–40 minutes per day
2	Manual relevance reading	5–7 minutes per vacancy; high cognitive strain
3	Manual motivational text drafting	8–15 minutes per letter
4	Manual multi-field form input	4–8 minutes per form; frequent typing errors
5	Manual spreadsheet logging	Data loss: records are forgotten or abandoned because of friction
Source(s): interviews and survey of 42 IT specialists, compiled by the author
The stage values are upper bound for a candidate who reads and tailors every application; they explain why the total for one application ranges from 10 to 20 minutes, and the baseline of the first KPI is set at 12 minutes (Section 2.1). Two kinds of loss can be distinguished. Time loss is concentrated in stages 2–4, which are repetitive and do not require the candidate’s judgment except for the final decision. Data loss appears in stage 5 and in the typing errors of stage 4: incomplete records and inconsistent contact data reduce the candidate’s chances and make follow-up impossible.
An illustrative calculation with the first persona from Section 2.2 shows the scale. A junior developer who sends 8–15 applications per day spends 96–180 minutes at the 12-minute baseline, while the target of 2 minutes of active attention reduces the same volume to 16–30 minutes. The time saved can be used for preparation for interviews or for improving the resume.
1.3. TO-BE process description
In the target process the mechanical gathering and writing are delegated to AutoOffer, while the final decision and the right (or responsibility) to submit stay with the user (Fig. A2.2):
1.	the browser extension collects vacancies in the background from configured boards or arbitrary vacancy URLs using cached selectors;
2.	the backend consolidates records, removes duplicates and aggregates skill hot words;
3.	the AI assistant compares the resume with the vacancy and computes a match score;
4.	the system drafts a cover letter that refers to the posting, and the applicant edits it;
5.	the extension detects form fields and maps the locally stored profile to them;
6.	the applicant confirms and submits, and the status is updated in the local dashboard.
Table 1.2 compares both processes by stage.
Table 1.2
AS-IS and TO-BE comparison
Stage	AS-IS	TO-BE
Search	User visits boards and types queries	Extension collects vacancies in the background
Assessment	User reads and judges each description	AI match score with matched and missing skills
Cover letter	Written from scratch or edited manually	Draft generated per vacancy, edited by the user
Form input	Data retyped in every form	Fields mapped from local profile, user confirms
Tracking	Personal spreadsheet, often incomplete	Automatic status log in the local dashboard
Data location	Scattered files and browser autofill	Local database on the user’s device
Source(s): compiled by the author
1.2. Review of theoretical and practical sources
The project relies on three groups of sources: legal and technical standards, scientific papers on language models and extension security, and architecture and requirements engineering literature. Table 1.3 lists the sources and what each of them contributes to the design.
Table 1.3
Sources used in the analysis
Source	Type	Contribution to the project
Regulation (EU) 2016/679 (GDPR)	Legal act	Data minimization, purpose limitation, data protection by design and by default
Vaswani et al., 2017	Scientific paper	Transformer architecture underlying modern language models used for matching and text generation
Devlin et al., 2019	Scientific paper	Bidirectional pre-training that Sentence-BERT builds on
Reimers and Gurevych, 2019	Scientific paper	Sentence embeddings and cosine similarity for resume–vacancy comparison
Carlini et al., 2012	Scientific paper	Security architecture of Chrome extensions: privilege separation and least privilege
Chrome Web Store policies; Manifest V3	Platform policy	No remotely hosted code; selectors must be data, not scripts
MDN Web Extensions documentation	Technical documentation	Extension lifecycle, content-script isolation, messaging
W3C Indexed Database API 3.0	Standard	Transactional client-side storage for the local profile
W3C WCAG 2.1	Standard	Accessibility criteria for the PWA
Fielding, 2000	Dissertation	REST constraints for the stateless, cacheable selector registry
Bass et al., 2021; Russell and Norvig, 2020	Textbooks	Quality attributes and tactics; assistive agent with a human in the loop
Cavoukian, 2009; ISO/IEC/IEEE 29148; ISO/IEC 25010; BABOK	Methodology	Privacy by design principles; requirement quality; quality model; analysis techniques
Source(s): compiled by the author
Privacy and regulation. The General Data Protection Regulation requires that personal data be adequate and limited to what is necessary and that data protection be built into the design of processing.  Cavoukian formulates the same idea as the principle of proactive, privacy-embedded design with full functionality.  For AutoOffer this means that privacy has to be a structural property: if the resume and credentials never reach the AutoOffer server, a server breach cannot expose them.
Extension platform. The WebExtensions model separates content scripts from page scripts and routes communication through messages.  Carlini, Felt and Wagner evaluated the Chrome extension security architecture and showed that privilege separation, least privilege and isolation reduce, but do not eliminate, the consequences of vulnerable extensions.  The store policy forbids code that is downloaded and executed from remote hosts, and Manifest V3 enforces this restriction technically.   Consequently the selector registry of AutoOffer must deliver declarative data (CSS and XPath strings), never executable code.
Language models. The Transformer replaced recurrence with attention and made large-scale pre-training practical.  BERT added deep bidirectional pre-training,  and Sentence-BERT adapted it to produce fixed-size sentence embeddings that can be compared with cosine similarity, reducing the cost of finding similar texts from hours to seconds compared with pairwise BERT inference.  This makes semantic comparison of a resume with hundreds of vacancies practical and superior to keyword matching, which cannot recognize that different words describe the same skill.
Architecture and requirements. The REST constraints of statelessness and cacheability fit the selector registry, whose responses can be cached by clients.  Bass, Clements and Kazman provide the vocabulary of quality attributes and tactics used in Section 2.4,  and the agent model of Russell and Norvig supports the design decision that the system acts as an assistant under the user’s supervision.  The structure of requirements follows the practices of ISO/IEC/IEEE 29148,  the quality characteristics of ISO/IEC 25010  and the techniques of the BABOK Guide. 
Three conclusions follow from the review. First, privacy must be structural rather than contractual: credentials and personal records stay on the client device. Second, an extension must not execute downloaded code, so selector updates are delivered as declarative data. Third, embedding-based language models give a better semantic relevance estimate than keyword matching.
1.3. Competitive landscape and analog analysis
Three analogs were compared: Sonara AI, a cloud auto-apply service; LazyApply, an auto-apply browser extension; and the standard browser autofill. Five criteria were chosen because each corresponds to a problem found in Section 1.1 or to a stakeholder concern:
1.	local data privacy – whether personal data, resume and account access stay on the client device;
2.	resilience to layout changes – whether extraction and form mapping adapt to markup changes without a new software release;
3.	semantic match scoring – whether a compatibility score between the candidate’s skills and the vacancy text is computed;
4.	tailored cover letter – whether a position-specific letter is generated;
5.	universal extensibility – whether the tool works on arbitrary vacancy websites rather than a fixed list.
Table 1.4 summarizes the results of the benchmarking. A fulfilled criterion scores 1, a partially fulfilled criterion 0.5, otherwise 0.
Table 1.4
Comparison of analogs
Criterion	Sonara AI	LazyApply	Browser autofill	AutoOffer
Local data privacy	No: resume and logins held in the vendor cloud	No: profile uploaded to vendor servers	Yes: stored in the browser profile	Yes: local client database
Resilience to layout changes	Moderate: vendor-side adjustments	Low: breaks after site redesigns	Low: relies on standard HTML attributes	High: selector registry and heuristic guessing
Semantic match scoring	Yes: proprietary cloud matching	No: basic title filtering	No	Yes
Tailored cover letter	Not confirmed: auto-fill of forms 	Yes: editable AI letters	No	Yes: contextual AI letter
Universal extensibility	Low: partner boards	Moderate: fixed list of boards	High: any web form	High: tested on 3 boards, designed for any vacancy site
Score (max 5)	1.5	15	2.0	5.0 
Source(s): author’s hands-on benchmarking; the AutoOffer column shows the specified capabilities
Test results. The benchmarking showed three patterns. Cloud services (Sonara AI, LazyApply) deliver the most automation but require the candidate’s resume and profile to be stored on the vendor side. Generic autofill keeps data local and works on any form, but it does not know what a vacancy is: it cannot collect postings, rate them or write a letter. When a board changed its markup, the tools with hardcoded page logic needed a developer release before they worked again.
What is missing. No analog combines the privacy of local storage, resilience through dynamically updated selectors, semantic evaluation of vacancies and operation on arbitrary vacancy sites. Users must choose between convenience and control of their data. AutoOffer is positioned to remove this trade-off with a decentralized architecture: the extension runs in the user’s own browser session, the profile stays in local storage, and the server holds only public vacancy text and selector rules.
1.4. Chapter conclusions and requirements traceability
The analysis shows that existing approaches suffer from privacy risks, architectural fragility and a high manual workload. Each identified problem is linked in Table 1.5 to a capability, an epic of Section 2.5 and a target KPI of Section 2.1.
Table 1.5
Traceability: problem – capability – epic – KPI
Problem	Capability	Epic	KPI
P1. Manual search and browsing consume many hours per week	Automated background scraping of diverse vacancy platforms	E1 Vacancy Collection	KPI 1: ? 2 min per application
P2. Parsing tools break when a site changes its layout	Declarative selector distribution with local heuristic fallback	E2 Dynamic Selector Registry	KPI 3: ? 10 min propagation
P3. Time is lost on assessing fit and writing letters	Semantic match score and tailored letter generation	E4 AI Matching and Cover Letters	KPI 4: correlation ? 0.70
P4. Commercial tools expose personal data to server breaches	Local storage, zero personal data on the AutoOffer server	E7 Privacy and Anonymous Onboarding	KPI 2: 100% local personal data
Source(s): compiled by the author
Problems P1 and P4 are also addressed by Epics E3 and E5 (form filling and local dashboard), which turn the extracted data into submitted applications and keep the history on the device. The requirements of Chapter 2 are derived from this table.
2. SYSTEM REQUIREMENTS
2.1. Vision, business goals and KPIs
Vision. AutoOffer is a privacy-first employment automation ecosystem that relieves active job seekers from repetitive vacancy hunting, relevance estimation and form input. By combining an adaptive browser extension, a Progressive Web App and client-directed artificial intelligence, it delivers tailored applications in minutes while personal career data never leaves the user’s device. The system has been tested on ZipRecruiter, Indeed and We Work Remotely, and while it currently works on these platforms, it is designed to operate on any website featuring vacancies.
The business goals are:
–	G1 – accelerate the application cycle by automating discovery, evaluation and form filling;
–	G2 – protect candidate privacy by storing personal records and credentials on client hardware only;
–	G3 – keep extraction working when pages change through dynamic selector distribution;
–	G4 – improve application quality through semantic matching and tailored cover letters;
–	G5 – give market visibility by aggregating skill hot words from scraped vacancies.
Each goal is measured by a KPI (Table 2.1); G1 is measured by KPI 1, G2 by KPI 2, G3 by KPI 3 and G4 by KPI 4, while G5 is supported by the analytics stories and verified by an aggregation accuracy check.
Table 2.1
Key performance indicators
KPI	Indicator	Baseline	Target	Measurement
KPI 1	Median time to complete one application	12 min (manual)	? 2 min of active attention (semi-automated mode)	Timed trials on benchmark platforms
KPI 2	Share of personal attributes kept on the client	0% (cloud auto-apply services)	100% kept locally; none on the AutoOffer backend	Network traffic analysis and server database audit
KPI 3	Selector propagation latency after a markup change	48–72 h (store update cycle)	? 10 min via the registry	Controlled selector change, propagation monitoring
KPI 4	Correlation of match score with expert rating	Not available	Correlation coefficient ? 0.70	Comparison with a labeled test set
Source(s): compiled by the author
The KPIs follow the SMART logic: each has a numeric target, a baseline and a measurement method. They cover the four value claims of the product – speed, privacy, resilience and quality of matching – and each of them corresponds to a problem of Table 1.5. The 2-minute target is derived from the 12-minute baseline and the structure of the TO-BE process, where the user only reviews the letter and confirms the filled form.
2.2. Stakeholders and user personas
Table 2.2
Stakeholder register
Stakeholder	Interest	Influence	Responsibility
Active job seekers	High: less routine work	High: evaluate usability and success	Operate the extension and PWA
Passive market monitors	Medium: demand for skills	Low: consume aggregate data	Use hot words analytics
Target job boards	High: stability and genuine submissions	High: can change the DOM or add verification gates	Host vacancies and submission endpoints
AI API providers	Medium: usage and billing	Medium: availability and limits affect generation	Provide language model inference
Browser vendors	High: policy compliance	High: enforce permissions and manifest rules	Review and distribute extension packages
Source(s): compiled by the author
Two personas represent the primary users.
Table 2.3
Persona 1: Anna, junior software developer
Attribute	Description
Profile	23 years old, recent computer science graduate, looking for an entry-level frontend position
Behavior	Sends 8–15 applications daily on three platforms; reuses a generic letter because of exhaustion
Pain points	Retype links and education in each form; few responses; unsure which framework skills are in demand
Value of AutoOffer	Match score to target relevant vacancies, tailored letters, hot words analytics to focus learning
Source(s): compiled by the author
Table 2.4
Persona 2: Mikhail, senior systems specialist
Attribute	Description
Profile	35 years old, backend architect with ten years of experience, employed and exploring better offers
Behavior	Reviews listings selectively in the evening; keeps three resume variants (architecture, cloud, management)
Pain points	Refuses to upload resumes or passwords to third-party cloud services because of confidentiality and employer exposure
Value of AutoOffer	Everything is stored locally, a resume variant is chosen per vacancy, semi-automated mode lets him verify each submission
Source(s): compiled by the author
2.3. Scope, assumptions and constraints
The scope is bounded to keep the project feasible for one student within the academic term and to protect the privacy principle. Table 2.5 lists what is in scope and Table 2.6 what is not, with the reason for each exclusion.
Table 2.5
In-scope capabilities
#	Capability
1	Browser extension: background scraping, DOM extraction, form field detection and input mapping
2	Selector registry backend serving declarative CSS and XPath rules without extension updates
3	Vacancy deduplication pipeline and hot words analytics service
4	PWA dashboard with local transactional storage for profile, resume variants and application tracking
5	Adaptive interface for mobile, tablet and desktop
6	AI assistant for semantic resume matching and cover letter drafting
7	Testing on ZipRecruiter, Indeed and We Work Remotely, with extensibility to any vacancy website
8	Containerized deployment of backend services and databases
Source(s): compiled by the author
Table 2.6
Out-of-scope items and reasons
Excluded item	Reason
Storing personal data, resumes or platform passwords on central servers	Contradicts goal G2 and the privacy-by-design principle
Autonomous captcha solving or circumvention	Ethical and legal risk; the user solves captchas (US 3.5)
Native iOS and Android applications	Not needed: the PWA covers mobile access; saves effort
Employer recruitment portals and job board hosting	Different user group and business model
Server-side accounts via email, password or social login	Would create a personal data store; anonymous onboarding is used instead
Payments, subscriptions and billing	Not required to validate the concept in a diploma project
Source(s): compiled by the author
Table 2.7 records the assumptions and constraints that bound the design.
Table 2.7
Assumptions and constraints
Dimension	Type	Description
Privacy boundary	Constraint	Personal career data and platform tokens stay on the client; the server stores only non-sensitive configuration and public vacancy text
Technology stack	Constraint	Enterprise server framework with PostgreSQL; browser transactional storage on the client; installable PWA
Browser ecosystem	Constraint	Modern Chromium desktop browsers; extension store policies apply and remote code is prohibited
Platform availability	Assumption	Job boards expose readable vacancy data in the DOM; users sign in to boards themselves in their own browser
AI service access	Assumption	An external language model endpoint is reachable at runtime
Source(s): compiled by the author
2.4. Solution concept and architectural alternatives
The architecture follows the principle of decentralized execution with centralized configuration. Four components interact (Fig. 2.1):
–	Browser extension. Runs inside the user’s browser session, inspects the DOM, applies declarative selectors, falls back to local heuristics, fills form fields and sends public vacancy data to the backend;
–	PWA dashboard. Responsive interface for the profile, resume variants, search criteria, application tracking and analytics; all personal records are saved in local IndexedDB; 
–	Backend aggregation service. Receives public vacancy text, computes hash fingerprints for deduplication, serves selector rules and aggregates skill hot words, using PostgreSQL;
–	External AI assistant. Evaluates semantic correlation between the resume and the vacancy and generates the letter after an explicit user action.

+------------------------------ USER LOCAL DEVICE -------------------------------+
|  +---------------------------+  messaging  +-------------------------------+   |
|  | PWA dashboard             |<----------->| Browser extension             |   |
|  |  - vacancies and tracking |   bridge    |  - DOM extraction             |   |
|  |  - profile, resumes       |             |  - heuristic selector guess   |   |
|  |  - analytics views        |             |  - form autofill              |   |
|  +-------------+-------------+             +---------------+---------------+   |
|                |      local IndexedDB: personal data      |                    |
+----------------|------------------------------------------|--------------------+
                 | public vacancies,                        | scraping and filling
                 | selector requests (HTTPS)                | in the user's session
                 v                                          v
+--------------------------------+              +-----------------------------+
| Backend server                 |              | External job boards         |
|  - selector registry           |              |  - ZipRecruiter, Indeed,    |
|  - deduplication engine        |              |    We Work Remotely         |
|  - hot words aggregator        |              |  - any vacancy website      |
|  - PostgreSQL (no personal     |              +-----------------------------+
|    data)                       |
+--------------------------------+
 
   Extension --HTTPS, on explicit user action--> External AI inference provider
                (vacancy text and minimal resume excerpt; no contact data)
Fig. 2.1. Context diagram of the AutoOffer architecture
Two alternatives were considered besides the selected one (Table 2.8). The decision is based on the quality attributes of privacy, modifiability and availability. 
Table 2.8
Architectural alternatives
Alternative	Advantages	Disadvantages	Decision
A1. Centralized cloud scraper and auto-submitter	No extension needed; scheduled scraping 24/7	Logins stored on the server; boards block server IP addresses	Rejected: violates privacy goal and triggers anti-bot blocking
A2. Standalone desktop application	Full local control; independent from store policy	Cannot work inside the user’s authenticated browser session; poor mobile access	Rejected: session management friction
A3. Extension + PWA + lightweight server (selected)	No server credential liability; natural browser authentication; mobile dashboard; instant selector updates	Requires extension installation; depends on Chromium manifest capabilities	Accepted: best balance of privacy, longevity and simplicity
Source(s): compiled by the author
The selected architecture keeps the server free of personal data, which lowers legal exposure, and makes layout fixes a matter of publishing data to the registry rather than releasing a new extension build. The price is the dependency on the Chromium extension model and on the user to install the extension.
2.5. Functional requirements
Functional requirements are grouped into nine epics and decomposed into 31 user stories in the form “As a … I want … so that …”.  The stories are prioritized with the MoSCoW method (Must, Should, Could, Won’t this time).  Table 2.9 gives the distribution; the complete backlog with all statements is in Appendix 1.
Table 2.9
Epics and distribution of user stories
ID	Epic	Stories	Must	Should	Could	Goals
E1	Vacancy Collection	4	4	0	0	G1, G3
E2	Dynamic Selector Registry	4	2	1	1	G3
E3	Application Submission and Form Filling	7	3	2	2	G1, G3, G4, G2
E4	AI Matching and Cover Letters	3	3	0	0	G4
E5	User Dashboard and Tracking	4	3	1	0	G2, G1
E6	Skills Analytics	2	0	2	0	G5
E7	Privacy and Anonymous Onboarding	3	2	1	0	G2
E8	Mobile and Tablet Access	2	1	0	1	G1
E9	Deployment and API Documentation	2	2	0	0	G1
	Total	31	20	7	4	
Source(s): Appendix 1
All stories of the Must priority are specified below with acceptance criteria in the Given/When/Then form. Should and Could stories keep the short form in Appendix 1 and are specified when they are scheduled. A Won’t-have-this-time list is not required because items excluded from the product are recorded in Table 2.6.
Table 2.10
Acceptance criteria: Epic 1, Vacancy Collection
Story	Statement and acceptance criteria
US 1.1
Automated background platform scraping	As a job seeker, I want the extension to search job platforms in the background for my target roles, so that I do not have to visit each platform manually.
Given target roles and websites are configured
When the user starts the automation
Then the extension opens background tabs, enters the role query, iterates through listing pages up to the configured limit and extracts title–URL pairs without disturbing foreground browsing.
US 1.2
Universal heuristic DOM extraction	As a job seeker, I want the extension to extract vacancies from any unfamiliar vacancy website, so that I can collect vacancies across the open web.
Given the page has job listings but no registered selectors
When the heuristic routine runs
Then it scores vacancy-like links, detects repeating card structures, extracts position titles and caches the discovered selector set.
US 1.3
Server deduplication pipeline	As a system, I want to receive scraped vacancies and discard duplicates, so that the central repository stays clean and compact.
Given several clients send records for the same posting
When the deduplication pipeline processes them
Then a canonical hash of normalized platform, company and URL is computed and only one record is stored.
US 1.4
Vacancy filter configuration	As a job seeker, I want to set target roles, locations, keywords and a page limit, so that only relevant vacancies are collected.
Given the extension popup is open
When the user saves roles, URLs and a page limit
Then the values are stored locally and applied to the next run; an empty role list or a page limit below 1 is rejected with a message.
Source(s): compiled by the author
Table 2.11
Acceptance criteria: Epics 2 and 3, selectors and form filling
Story	Statement and acceptance criteria
US 2.1
Periodic selector fetching	As a browser extension, I want to fetch up-to-date selectors from the server periodically, so that scraping keeps working when a platform changes its markup.
Given the registry holds updated CSS and XPath rules
When the extension starts or its polling interval elapses
Then the rules are downloaded over HTTPS as data and the local selector cache is updated with no reinstall or restart.
US 2.2
Dynamic selector application without restart	As a browser extension, I want to apply newly fetched selectors immediately, so that extraction recovers from a markup change without user action.
Given a new selector version is in the local cache
When the next extraction starts
Then the new version is used and the previous one is kept as a rollback if validation of the result set fails.
US 3.1
Automated form field mapping	As a job seeker, I want the extension to fill application forms from my stored profile, so that I avoid retyping personal details.
Given an application form is open on a supported or heuristically matched site
When autofill is triggered
Then first name, last name, email, phone, location and links are mapped to inputs and native change events are dispatched.
US 3.3
Resume variant selection per application	As a job seeker, I want to choose which resume variant is used for each application, so that the application fits the role.
Given at least two resume variants are stored locally
When the user opens Review and Apply
Then the selected variant is used for matching, letter generation and the attached file.
US 3.4
Manual and semi-automated submission controls	As a job seeker, I want to review filled fields and confirm before submission, so that I keep full control over what is sent.
Given a form has been populated
When semi-automated mode is active
Then execution pauses, filled inputs are highlighted and submission happens only after an explicit Confirm click.
Source(s): compiled by the author
Table 2.12
Acceptance criteria: Epics 4 and 5, AI and dashboard
Story	Statement and acceptance criteria
US 4.1
Semantic resume–vacancy match score	As a job seeker, I want to see a match score between my resume and each vacancy, so that I can prioritize the best fits.
Given a vacancy description and a resume variant are selected
When match evaluation is requested
Then a score from 0 to 100 is shown with lists of matched and missing skills.
US 4.2
Personalized cover letter generation	As a job seeker, I want a cover letter generated for a specific vacancy, so that my application stands out.
Given a vacancy and a resume variant are selected
When letter generation runs
Then a formal letter referencing the vacancy’s responsibilities and the candidate’s achievements appears in an editable field.
US 4.3
In-place cover letter editing	As a job seeker, I want to edit the generated letter before sending, so that the final text is mine.
Given a generated letter is displayed
When the user edits or regenerates it
Then edits are kept, regeneration asks for confirmation before overwriting them.
US 5.1
Local profile and resume management	As a job seeker, I want to manage my details and resume variants in the PWA, so that my sensitive materials stay on my device.
Given the PWA dashboard is open
When personal records or resume variants are edited
Then changes are written to the local IndexedDB and no network request carries them.
US 5.2
Search filter preference settings	As a job seeker, I want my search preferences to persist between sessions, so that I do not reconfigure them every time.
Given preferences were saved earlier
When the PWA or extension is reopened
Then the same roles, sites and limits are restored from local storage.
US 5.3
Application lifecycle status tracking	As a job seeker, I want to track the status of each application, so that I see submissions and interview invitations at a glance.
Given an application was submitted through the extension
When the application table is rendered
Then company, role, timestamp, match score and status (Applied, Screening, Interview, Offered, Rejected) are shown and can be changed.
Source(s): compiled by the author
Table 2.13
Acceptance criteria: Epics 7, 8 and 9, privacy, mobile and deployment
Story	Statement and acceptance criteria
US 7.1
Zero-registration anonymous onboarding	As a job seeker, I want to start without creating an account, so that I never give the server an email or password.
Given a new user installs the extension and opens the PWA
When the first contact with the backend happens
Then a random identifier is generated locally and no identity attribute is collected.
US 7.2
Local storage of sensitive data	As a job seeker, I want profile data and platform tokens to stay on my device, so that a server breach cannot expose them.
Given a profile is saved and an application is prepared
When network traffic and the server database are inspected
Then no profile field, credential or resume file is found in requests to the AutoOffer backend.
US 8.1
Responsive dashboard on mobile viewports	As a job seeker, I want to use the dashboard on a phone or tablet, so that I can monitor progress on the go.
Given the PWA is opened on a 360 px wide viewport
When grids, filters and status controls are used
Then the layout reflows without horizontal scrolling and supports touch input.
US 9.1
Single-command containerized deployment	As a developer, I want to start backend and database with one container command, so that setup is reproducible.
Given a clean container environment
When the orchestration start command runs
Then backend and database start and pass health checks without manual configuration.
US 9.2
Comprehensive API specification	As a developer, I want a machine-readable API specification, so that integrations and tests rely on one contract.
Given the backend is running
When the specification endpoint is requested
Then every public endpoint, request schema and response schema is listed and matches actual behavior.
Source(s): compiled by the author
Three interface mockups illustrate the core screens: the vacancy hub of the PWA (Fig. 2.2), the extension runner popup (Fig. 2.3) and the AI review and semi-automated application dialog (Fig. 2.4).

+---------------------------------------------------------------------------------+
| AutoOffer Hub Dashboard                       Sync Status: Connected [Green]    |
+---------------------------------------------------------------------------------+
| Search / Filter: [ Senior Backend Engineer                          ]           |
+---------------------------------------------------------------------------------+
| [ Total Vacancies: 148 ]  [ Analyzed: 94 ]  [ Applied: 32 ]  [ Avg match: 88% ] |
+---------------------------------------------------------------------------------+
| +------------------------------------+  +------------------------------------+  |
| | Title: Senior Java Developer       |  | Title: Cloud Infrastructure Eng    |  |
| | Company: Enterprise Systems        |  | Company: Distributed Data Corp     |  |
| | Source: Indeed.com                 |  | Source: ZipRecruiter               |  |
| | Match Score: 92%                   |  | Match Score: 78%                   |  |
| | [ Review & Apply ]  [ Dismiss ]    |  | [ Review & Apply ]  [ Dismiss ]    |  |
| +------------------------------------+  +------------------------------------+  |
+---------------------------------------------------------------------------------+
Fig. 2.2. Mockup of the PWA vacancy hub

+-------------------------------------------------------+
| AutoOffer Extension Control                   v1.0.0  |
+-------------------------------------------------------+
| Add Platform Target URL:                              |
| [ https://weworkremotely.com/categories/remote-jobs ] |
| [ Detect & Add Site ]                                 |
+-------------------------------------------------------+
| Target Roles (comma separated):                       |
| [ Java Backend, DevOps Engineer                     ] |
| Page Iteration Limit: [ 3 ]                           |
+-------------------------------------------------------+
| [ Start Automated Scraping ]   [ Stop Automation ]    |
| Status: Parsing listing cards...                      |
| Vacancies in Local Database: 148                      |
| [ Open PWA Dashboard ]                                |
+-------------------------------------------------------+
Fig. 2.3. Mockup of the extension runner popup

+---------------------------------------------------------------------------------+
| Application Review: Senior Java Developer                                  [X]  |
+---------------------------------------------------------------------------------+
| Selected Resume Variant: [ Backend Architecture 2026               v ]          |
| Calculated Compatibility Match: 92% Overlap                                     |
| Matched Skills: Java 21, Spring Boot, PostgreSQL, Docker                        |
| Missing Skills: Kubernetes Cert                                                 |
+---------------------------------------------------------------------------------+
| Tailored Cover Letter Draft (Editable):                                         |
| +-----------------------------------------------------------------------------+ |
| | Dear Hiring Team at Enterprise Systems,                                     | |
| | I am writing to express my strong interest in the Senior Java role. With    | |
| | extensive background in high-concurrency backend architectures and Spring...| |
| +-----------------------------------------------------------------------------+ |
| [ Regenerate Letter ]                                                           |
+---------------------------------------------------------------------------------+
| Form Autofill Verification:                                                     |
| First Name: Artsiom       | Email: applicant@device.local                       |
| Last Name: Chyslou        | Phone: +370 600 00000                               |
+---------------------------------------------------------------------------------+
| [ Confirm and Submit Application ]                    [ Cancel / Manual Mode ]  |
+---------------------------------------------------------------------------------+
Fig. 2.4. Mockup of the AI review and semi-automated application dialog
Traceability from goals to epics and stories is shown in Table 2.14; each Must story is therefore justified by at least one business goal.
Table 2.14
Traceability: goal – epic – user story
Goal	Epics	User stories
G1 Faster application cycle	E1, E3, E5, E8, E9	US 1.1–1.4, 3.1, 3.5, 3.6, 5.2, 5.3, 5.4, 8.1, 8.2, 9.1, 9.2
G2 Privacy	E3, E5, E7	US 3.4, 5.1, 7.1–7.3
G3 Resilience	E1, E2, E3	US 1.2, 2.1–2.4, 3.2, 3.7
G4 Application quality	E3, E4	US 3.3, 4.1–4.3
G5 Market visibility	E6	US 6.1, 6.2
Source(s): Appendix 1
2.6. Use case scenarios
2.6.1. Use case 1: automated background vacancy extraction
Actor: job seeker. Preconditions: the extension is active in a Chromium browser; target URLs and roles are configured.
Main flow:
1.	The user clicks Start Automation in the extension.
2.	The extension opens a background tab with the first target URL.
3.	It checks the local cache for valid selectors and, if present, enters the target role in the search field.
4.	If selectors are missing, the heuristic algorithm detects listing containers, titles and links and saves the discovered selectors.
5.	The extension extracts titles, URLs and summaries from the page.
6.	It detects pagination and moves to the next pages until the configured limit is reached.
7.	For each URL it opens the posting and extracts the full description, waiting a random 1.5–3.5 s between requests.
8.	Records are saved locally and sent to the deduplication endpoint.
9.	The pipeline logs completion and updates the status indicator.
Alternative 1A – the search input cannot be resolved. The extension tries alternative heuristic selectors; if none works, it logs a warning, skips the query and extracts the vacancies visible on the landing page.
Alternative 1B – pagination is disabled or absent. The extension stops paging on this site and continues with the next configured URL.
2.6.2. Use case 2: semi-automated submission with AI assistance
Actor: job seeker. Preconditions: the vacancy is in the dashboard; a profile and at least one resume variant are stored locally.
Main flow:
1.	The user selects a vacancy and clicks Review and Apply.
2.	The system requests a semantic match evaluation for the selected resume.
3.	The assistant returns the score and the skill overlap.
4.	The system requests a tailored letter and shows it in an editable field.
5.	The user edits and approves the letter.
6.	The user chooses semi-automated mode.
7.	The extension opens the application form in an active tab.
8.	It maps the stored profile to the form inputs and inserts the values.
9.	It highlights the filled fields and asks for confirmation.
10.	The user clicks Confirm and Submit and the form is sent.
11.	The extension records the event and sets the status Applied in the local database.
Alternative 2A – captcha. The extension detects the challenge, pauses, alerts the user and shows the challenge; after the user solves it and clicks Resume Submission, the flow continues.
Alternative 2B – unmapped field. The extension marks the field; the user types the value and the flow proceeds to confirmation.
The interaction between the user, the PWA/extension, the backend registry and the AI assistant is shown as a sequence diagram in Fig. A2.3 (Appendix 2): the extension first fetches selectors, extracts vacancies and posts them for deduplication; later the match score and letter are requested from the AI assistant, and only after the user’s confirmation are the fields submitted.
2.7. Non-functional requirements
The non-functional requirements use the quality characteristics of ISO/IEC 25010 and have measurable criteria. 
Table 2.15
Non-functional requirements
ID	Category	Measurable criterion	Verification	Trace
NFR 1	Performance	Extraction of vacancy cards from one page DOM completes within 800 ms	Timing in the browser performance API on benchmark pages	G1, US 1.1
NFR 2	Performance	Selector registry responds in under 200 ms for 95% of requests under normal load	Load test with response time percentiles	G3, US 2.1
NFR 3	Security and privacy	No personal data field or platform credential is transmitted to or stored on the AutoOffer server; 100% of profiles stay in local storage	Traffic capture and database audit	G2, US 7.1, 7.2
NFR 4	Availability	Selector distribution and deduplication services reach 99.5% uptime	Uptime monitoring	G3, US 9.1
NFR 5	Usability	PWA stays fully usable on viewports from 360 to 3840 px	Viewport tests and manual review	G1, US 8.1
NFR 6	Robustness	Heuristics extract title–URL pairs on at least 80% of uncatalogued listing pages without manual intervention	Test corpus of uncatalogued vacancy pages	G3, US 1.2
Source(s): compiled by the author
2.8. Regulatory, privacy and ethical compliance
The system is designed so that compliance follows from the architecture. Table 2.16 summarizes the requirements and their implementation.
Table 2.16
Compliance requirements and implementation
Area	Requirement	Implementation in AutoOffer
GDPR: by design	Data protection by design and by default (art. 25); data minimization (art. 5(1)(c))	Profile and resumes exist only in local IndexedDB; the backend receives public vacancy text and selector requests
GDPR: purpose and consent	Purpose limitation (art. 5(1)(b)); consent where it is the basis (art. 6(1)(a))	Resume text is sent to the AI provider only after an explicit user action and opt-in; contact data are excluded from prompts
GDPR: transparency	Information to the data subject (art. 13)	Privacy notice describing what is local, what reaches the backend and what reaches the AI provider
Chrome Web Store	No remotely hosted code; minimum permissions	Selectors are data; permissions limited to what the features need
WCAG 2.1 AA	Contrast, keyboard operation, names and roles	Contrast ratio of at least 4.5:1 for text, full keyboard navigation, semantic markup
Ethical scraping	Do not overload boards; no circumvention	Random delays of 1.5–3.5 s, limited page depth, no paywall or captcha bypass
Source(s): GDPR; Chrome Web Store policies; WCAG 2.1; compiled by the author
GDPR. Storing the profile on the candidate’s own device is a direct realization of privacy by design and data minimization.   The AutoOffer backend processes public vacancy postings and an anonymous random identifier. The identifier is generated locally and cannot be linked to a person by the service, but because it still singles out a device it is treated as a pseudonymous identifier, and server logs with IP addresses are kept only as long as operation requires. The one flow that carries personal data off the device is the call to the external AI provider; it is started by the user, limited to the resume excerpt and vacancy text, and can be replaced by a user-supplied key or a local model (risk R6). Resumes may contain special categories of data, which is another reason to send the minimum. The legal basis for this transfer is the user’s consent, requested before the first call; the other processing happens on the user’s own device for personal purposes.
Accessibility. The PWA complies with WCAG 2.1 Level AA: sufficient contrast, screen reader compatibility and complete keyboard navigation.  Ethical scraping. Automated interaction uses randomized delays between 1.5 and 3.5 seconds and does not bypass paywalls, access keys or security perimeters. The terms of some boards restrict automated access, so semi-automated mode with explicit user confirmation is the default, and the risk is recorded in Table 2.17.
2.9. Risk assessment and mitigation
Table 2.17
Project risks
ID	Risk	Prob.	Impact	Mitigation	Dependency
R1	Board redesign breaks cached selectors	High	High	Local heuristic fallback; instant updates via the registry	External web platforms
R2	Anti-bot challenges or rate limits interrupt scraping	Medium	Medium	Human-paced delays; limited depth; prompt the user for captcha	Board security policies
R3	AI API cost or limits restrict processing	Medium	Medium	Cache responses; user-supplied keys; lightweight local models	AI provider availability
R4	Malicious or malformed selectors submitted to the registry	Low	High	Selectors as data only; schema validation; admin approval	Community contributors
R5	Browser evicts local storage under low disk space	Low	Medium	Persistent storage permission; one-click JSON export and backup	Browser storage policies
R6	Resume text sent to the AI provider exposes personal data	Medium	High	Explicit opt-in; data minimization; local model option	AI provider terms
R7	Board terms of service restrict automated access	Medium	High	Semi-automated default; throttling; user notice	Board policies
Source(s): compiled by the author
The highest-exposure risk is R1, because it combines a high probability with a high impact and the whole value of the product depends on extraction that survives layout changes. R6 and R7 were added during the analysis because they touch the privacy promise and the legal position of users.
2.10. Requirements validation and chapter conclusions
All requirements will be verified against the KPIs of Section 2.1:
–	KPI 1 – timed observation of 50 applications from vacancy selection to completed submission; the median must not exceed 2 minutes;
–	KPI 2 – network traffic and database inspection confirming that no personal identification attribute reaches the AutoOffer backend;
–	KPI 3 – controlled publication of a modified selector set and measurement of the time until active extensions use it, within 10 minutes;
–	KPI 4 – comparison of automated scores with blinded expert ratings on 40 resume–vacancy pairs, correlation of at least 0.70.
Chapter 2 defines nine epics, 31 user stories (20 Must, 7 Should, 4 Could), six non-functional requirements, a compliance model and seven risks. Every Must story traces to a business goal and every goal to a KPI, so the specification can be checked completely. The system has been tested on ZipRecruiter, Indeed and We Work Remotely, and while it currently works on these platforms, it is designed to operate on any website featuring vacancies.
CONCLUSION
The goal of the project, to specify an assistive system that automates job search and application while keeping personal data on the user’s device, was achieved at the business analysis stage.
Objective 1 was met by the analysis of the manual process, which takes 10–20 minutes per application, of the literature and of three analogs; it showed that no analog combines local privacy, resilience to layout changes, semantic matching and universal applicability. Objective 2 was met by the decentralized architecture of an extension, a PWA, a lightweight registry server and an AI assistant, selected from three alternatives. Objective 3 was met by nine epics, 31 user stories with MoSCoW priorities, Given/When/Then criteria for the 20 Must stories, two use cases and six measurable non-functional requirements. Objective 4 was addressed by the requirements for declarative selectors and heuristic extraction, which keep extraction working on arbitrary vacancy pages. Objective 5 was met by four KPIs with baselines, targets and measurement methods.
The main risks are the instability of job board markup, the terms of the boards and the transfer of resume text to the AI provider; each has a mitigation in the specification. The next steps are to implement the Must stories and run the KPI measurements: timed trials, traffic inspection, selector propagation tests and the correlation study.
REFERENCES
Adzuna. “Sonara.ai Review [2026]: What Works, What Doesn’t & a Better Alternative.” Adzuna Blog. https://adzuna.co.uk/blog/sonara-ai-review-2025/.
Bass, Len, Paul Clements, and Rick Kazman. Software Architecture in Practice. 4th ed. Boston: Addison-Wesley, 2021.
Carlini, Nicholas, Adrienne Porter Felt, and David Wagner. “An Evaluation of the Google Chrome Extension Security Architecture.” In Proceedings of the 21st USENIX Security Symposium, 97–111. Berkeley, CA: USENIX Association, 2012.
Cavoukian, Ann. Privacy by Design: The 7 Foundational Principles. Toronto: Information and Privacy Commissioner of Ontario, 2009.
Clegg, Dai, and Richard Barker. Case Method Fast-Track: A RAD Approach. Wokingham: Addison-Wesley, 1994.
Cohn, Mike. User Stories Applied: For Agile Software Development. Boston: Addison-Wesley, 2004.
Devlin, Jacob, Ming-Wei Chang, Kenton Lee, and Kristina Toutanova. “BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding.” In Proceedings of the 2019 Conference of the North American Chapter of the Association for Computational Linguistics, 4171–4186. Stroudsburg, PA: Association for Computational Linguistics, 2019.
European Parliament and Council. Regulation (EU) 2016/679 of 27 April 2016 on the Protection of Natural Persons with Regard to the Processing of Personal Data (General Data Protection Regulation). Official Journal of the European Union L 119 (2016): 1–88.
Fielding, Roy T. “Architectural Styles and the Design of Network-Based Software Architectures.” PhD diss., University of California, Irvine, 2000.
Google. “Chrome Web Store Program Policies.” Chrome for Developers. https://developer.chrome.com/docs/webstore/program-policies.
Google. “Manifest V3.” Chrome for Developers. https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3.
International Institute of Business Analysis. A Guide to the Business Analysis Body of Knowledge (BABOK Guide). Version 3. Toronto: IIBA, 2015.
ISO/IEC 25010:2011. Systems and Software Engineering - Systems and Software Quality Requirements and Evaluation (SQuaRE) - System and Software Quality Models. Geneva: International Organization for Standardization, 2011.
ISO/IEC/IEEE 29148:2018. Systems and Software Engineering - Life Cycle Processes - Requirements Engineering. Geneva: International Organization for Standardization, 2018.
Mozilla Developer Network. “Browser Extensions.” MDN Web Docs. https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions.
Reimers, Nils, and Iryna Gurevych. “Sentence-BERT: Sentence Embeddings Using Siamese BERT-Networks.” In Proceedings of the 2019 Conference on Empirical Methods in Natural Language Processing, 3982–3992. Stroudsburg, PA: Association for Computational Linguistics, 2019.
Russell, Stuart, and Peter Norvig. Artificial Intelligence: A Modern Approach. 4th ed. Hoboken, NJ: Pearson, 2020.
Vaswani, Ashish, Noam Shazeer, Niki Parmar, Jakob Uszkoreit, Llion Jones, Aidan N. Gomez, Lukasz Kaiser, and Illia Polosukhin. “Attention Is All You Need.” In Advances in Neural Information Processing Systems 30, 5998–6008. Red Hook, NY: Curran Associates, 2017.
World Wide Web Consortium. Indexed Database API 3.0. W3C technical report. https://www.w3.org/TR/IndexedDB/.
World Wide Web Consortium. Web Content Accessibility Guidelines (WCAG) 2.1. W3C Recommendation, June 5, 2018. https://www.w3.org/TR/WCAG21/.
APPENDICES
APPENDIX 1
Traceable product backlog
Table A1.1
Complete product backlog (31 user stories)
ID	Epic	User story	Priority	Goal	Verification
US 1.1	E1 Vacancy Collection	As a job seeker, I want the extension to search job platforms in the background for my target roles, so that I do not have to visit each platform manually.	Must	G1	Test run on benchmark boards
US 1.2	E1 Vacancy Collection	As a job seeker, I want the extension to extract vacancies from any unfamiliar vacancy website, so that I can collect vacancies across the open web.	Must	G1, G3	Test run on uncatalogued sites
US 1.3	E1 Vacancy Collection	As a system, I want to receive scraped vacancies and discard duplicates, so that the central repository stays clean and compact.	Must	G1	Duplicate submission hash test
US 1.4	E1 Vacancy Collection	As a job seeker, I want to set target roles, locations, keywords and a page limit, so that only relevant vacancies are collected.	Must	G1	User interface filter checks
US 2.1	E2 Dynamic Selector Registry	As a browser extension, I want to fetch up-to-date selectors from the server periodically, so that scraping keeps working when a platform changes its markup.	Must	G3	Selector sync latency probe
US 2.2	E2 Dynamic Selector Registry	As a browser extension, I want to apply newly fetched selectors immediately, so that extraction recovers from a markup change without user action.	Must	G3	Hot reload extraction test
US 2.3	E2 Dynamic Selector Registry	As a job seeker, I want to share selectors that I configured for an unlisted board, so that the community benefits from my fix.	Could	G3	Registry submission check
US 2.4	E2 Dynamic Selector Registry	As a administrator, I want to review submitted selector sets before publication, so that malformed or malicious rules never reach clients.	Should	G3	Approval workflow validation
US 3.1	E3 Application Submission and Form Filling	As a job seeker, I want the extension to fill application forms from my stored profile, so that I avoid retyping personal details.	Must	G1	Autofill accuracy benchmark
US 3.2	E3 Application Submission and Form Filling	As a job seeker, I want the extension to guess the meaning of unfamiliar form fields, so that I can apply on sites without registered selectors.	Should	G3	Heuristic mapping evaluation
US 3.3	E3 Application Submission and Form Filling	As a job seeker, I want to choose which resume variant is used for each application, so that the application fits the role.	Must	G4	Profile assignment test
US 3.4	E3 Application Submission and Form Filling	As a job seeker, I want to review filled fields and confirm before submission, so that I keep full control over what is sent.	Must	G2	Mode switching verification
US 3.5	E3 Application Submission and Form Filling	As a job seeker, I want to be alerted when a captcha appears, so that I can solve it myself and resume.	Could	G1	Captcha event handling test
US 3.6	E3 Application Submission and Form Filling	As a job seeker, I want to export a resume variant as PDF or Word, so that I can attach it where uploads are required.	Should	G1	File rendering verification
US 3.7	E3 Application Submission and Form Filling	As a job seeker, I want to share a working field mapping, so that others can fill the same form faster.	Could	G3	Mapping upload validation
US 4.1	E4 AI Matching and Cover Letters	As a job seeker, I want to see a match score between my resume and each vacancy, so that I can prioritize the best fits.	Must	G4	Correlation benchmark
US 4.2	E4 AI Matching and Cover Letters	As a job seeker, I want a cover letter generated for a specific vacancy, so that my application stands out.	Must	G4	Generation text inspection
US 4.3	E4 AI Matching and Cover Letters	As a job seeker, I want to edit the generated letter before sending, so that the final text is mine.	Must	G4	User interface editing test
US 5.1	E5 User Dashboard and Tracking	As a job seeker, I want to manage my details and resume variants in the PWA, so that my sensitive materials stay on my device.	Must	G2	Database inspection
US 5.2	E5 User Dashboard and Tracking	As a job seeker, I want my search preferences to persist between sessions, so that I do not reconfigure them every time.	Must	G1	Preference persistence test
US 5.3	E5 User Dashboard and Tracking	As a job seeker, I want to track the status of each application, so that I see submissions and interview invitations at a glance.	Must	G1	Status transition audit
US 5.4	E5 User Dashboard and Tracking	As a job seeker, I want to be told when the extension is not installed, so that I know why automation is unavailable.	Should	G1	Connection detection test
US 6.1	E6 Skills Analytics	As a job seeker, I want to see the most frequent skills for my target role, so that I know what to learn or emphasize.	Should	G5	Aggregation accuracy check
US 6.2	E6 Skills Analytics	As a job seeker, I want skill frequencies shown as charts, so that I can read them quickly.	Should	G5	Visual chart rendering check
US 7.1	E7 Privacy and Anonymous Onboarding	As a job seeker, I want to start without creating an account, so that I never give the server an email or password.	Must	G2	Token creation audit
US 7.2	E7 Privacy and Anonymous Onboarding	As a job seeker, I want profile data and platform tokens to stay on my device, so that a server breach cannot expose them.	Must	G2	Network security inspection
US 7.3	E7 Privacy and Anonymous Onboarding	As a job seeker, I want my preferences synchronized between devices anonymously, so that I can work from several devices.	Should	G2	Anonymous sync audit
US 8.1	E8 Mobile and Tablet Access	As a job seeker, I want to use the dashboard on a phone or tablet, so that I can monitor progress on the go.	Must	G1	Mobile viewport usability test
US 8.2	E8 Mobile and Tablet Access	As a job seeker, I want to install the dashboard as an app, so that it opens like a native application.	Could	G1	Service worker install check
US 9.1	E9 Deployment and API Documentation	As a developer, I want to start backend and database with one container command, so that setup is reproducible.	Must	G1	Container build test
US 9.2	E9 Deployment and API Documentation	As a developer, I want a machine-readable API specification, so that integrations and tests rely on one contract.	Must	G1	Schema documentation review
Source(s): compiled by the author; priorities by the MoSCoW method
APPENDIX 2
Process and sequence diagrams

          [Start job search]
                 |
                 v
   [Open board tabs: ZipRecruiter / Indeed / others]
                 |
                 v
   [Type keywords and location filters manually]
                 |
                 v
   [Read job descriptions one by one]
                 |
                 v
   [Mentally assess qualification match] --(not a fit)--> [Skip vacancy]
                 |
               (fit)
                 v
   [Write or modify cover letter manually]
                 |
                 v
   [Navigate multi-step application form]
                 |
                 v
   [Retype name, phone, email, experience into inputs]
                 |
                 v
   [Click Submit]  -->  [Add a row to a personal spreadsheet]  -->  [End]
Fig. A2.1. AS-IS workflow of manual job application


   [Start AutoOffer]
          |
          v
   [Extension collects vacancies from configured or custom URLs]
          |
          v
   [Declarative selectors or heuristics extract vacancy cards]
          |
          v
   [Backend deduplicates vacancies, aggregates skill hot words]
          |
          v
   [AI assistant computes match score]
          |
          v
   [AI assistant drafts position-specific cover letter]
          |
          v
   [User reviews score, edits letter, chooses semi-automated mode]
          |
          v
   [Extension fills form fields from local storage]
          |
          v
   [User verifies data and confirms submission]
          |
          v
   [Dashboard sets status Applied]  -->  [End]
Fig. A2.2. TO-BE workflow with AutoOffer

Job Seeker        PWA / Extension          Backend Registry        AI Assistant
    |                    |                        |                     |
    | 1. Trigger         |                        |                     |
    |------------------->|                        |                     |
    |                    | 2. Fetch selectors     |                     |
    |                    |----------------------->|                     |
    |                    | 3. Declarative rules   |                     |
    |                    |<-----------------------|                     |
    |                    | 4. Extract vacancies from the job board DOM  |
    |                    | 5. Post vacancies      |                     |
    |                    |----------------------->|                     |
    |                    | 6. Sync status         |                     |
    |                    |<-----------------------|                     |
    | 7. Request match   |                        |                     |
    |    and letter      |                        |                     |
    |------------------->| 8. Vacancy text and minimal resume excerpt   |
    |                    |--------------------------------------------->|
    |                    | 9. Score and draft letter                    |
    |                    |<---------------------------------------------|
    | 10. Review dialog  |                        |                     |
    |<-------------------|                        |                     |
    | 11. Confirm        |                        |                     |
    |------------------->| 12. Fill fields and submit to the job board  |
    | 13. Status Applied |                        |                     |
    |<-------------------|                        |                     |
Fig. A2.3. Sequence diagram of the main interaction
APPENDIX 3
Statement on AI usage and original authorship
Statement on the use of artificial intelligence tools. During the preparation of this document artificial intelligence tools were used for grammatical refinement, stylistic alignment, structuring of text and drafting of requirement templates. Domain research, architectural decisions, evaluation of trade-offs, user story definitions and system design are the original intellectual work of the author, who has checked and takes responsibility for all content.
Statement on authorship and originality. This bachelor project is an individual work of Artsiom Chyslou, prepared under the supervision of Yuriy Mischeryakov at the European Humanities University. The models, requirement decompositions and specifications were prepared for this defense without undisclosed third-party collaboration.
