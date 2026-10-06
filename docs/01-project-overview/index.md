# 1. Project Overview

## Executive Summary

**AutoOffer**  is an information system that automates the most repetitive parts of a job search: finding relevant vacancies across several job platforms, judging how well they fit a candidate's resume, writing a tailored cover letter, and submitting the application.

The system has three parts:

- **Browser extension.** It runs in the user's own browser, scrapes job platforms, fills in application forms and holds all personal data and credentials. Nothing sensitive leaves the device.
- **Backend server.** A lightweight aggregator that deduplicates vacancies collected by many clients, keeps a registry of CSS/XPath selectors for each platform and serves them to the extension, and produces "hot words" skills analytics.
- **Progressive Web App .** A dashboard where the user manages filters, resume variants and personal data (stored in IndexedDB), tracks application statuses, views analytics and resolves captchas. It adapts to smartphones and tablets.

An **AI assistant** compares resume text with vacancy requirements to compute a match score and generates personalized cover letters.

The key design decision is **decentralization with privacy by default**. Scraping runs on user devices, so the project is not limited by single-IP rate limits and the server stays cheap. The server only ever sees non-sensitive data: public vacancy listings, selectors and anonymous preferences.
