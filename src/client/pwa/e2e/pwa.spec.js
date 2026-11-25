import { expect, test } from '@playwright/test';

import { Buffer } from 'node:buffer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.resolve(__dirname, '../../../../docs/02-technical/assets/screenshots');

const VIEWPORTS = [
    { name: 'smartwatch-240', width: 240, height: 240, touchCheck: true, bottomNav: true, deviceAttr: 'smartwatch', screenshot: null },
    { name: 'foldable-280', width: 280, height: 653, touchCheck: true, bottomNav: true, deviceAttr: 'foldable', screenshot: null },
    { name: 'mobile-360', width: 360, height: 780, touchCheck: true, bottomNav: true, deviceAttr: 'mobile', screenshot: 'mobile-360.png' },
    { name: 'mobile-landscape-780', width: 780, height: 360, touchCheck: true, bottomNav: false, deviceAttr: 'tablet', screenshot: null },
    { name: 'tablet-768', width: 768, height: 1024, touchCheck: true, bottomNav: false, deviceAttr: 'tablet', screenshot: 'tablet-768.png' },
    { name: 'desktop-1280', width: 1280, height: 800, touchCheck: false, bottomNav: false, deviceAttr: 'desktop', screenshot: 'desktop-1280.png' },
    { name: 'ultrawide-1920', width: 1920, height: 1080, touchCheck: false, bottomNav: false, deviceAttr: 'ultrawide', screenshot: null },
    { name: '2k-2560', width: 2560, height: 1440, touchCheck: false, bottomNav: false, deviceAttr: '2k', screenshot: null },
    { name: '4k-3840', width: 3840, height: 2160, touchCheck: false, bottomNav: false, deviceAttr: '4k', screenshot: null },
];

for (const vp of VIEWPORTS) {
    test(`renders cleanly without horizontal overflow on ${vp.name}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto('./');

        await expect(page.locator('.header-brand-title')).toHaveText('AutoOffer');
        await expect(page.locator('html')).toHaveAttribute('data-device', vp.deviceAttr);

        const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth
        );
        expect(overflow).toBe(false);

        if (vp.touchCheck) {
            const navBox = await page.locator('.pwa-nav-btn').first().boundingBox();
            expect(navBox.height).toBeGreaterThanOrEqual(44);
            const toggleBox = await page.locator('.theme-toggle-pill').boundingBox();
            expect(toggleBox.height).toBeGreaterThanOrEqual(44);
            expect(toggleBox.width).toBeGreaterThanOrEqual(44);
        }

        if (vp.bottomNav) {
            const navBarBox = await page.locator('.pwa-nav').boundingBox();
            expect(navBarBox.y + navBarBox.height).toBeGreaterThanOrEqual(vp.height - 2);
        }

        if (vp.screenshot) {
            await page.screenshot({ path: path.join(SCREENSHOT_DIR, vp.screenshot), fullPage: true });
        }

        for (const [label, urlRe] of [
            ['Applications', /#\/applications/],
            ['Jobs & Automation', /#\/jobs/],
            ['Profile & Resumes', /#\/profile/],
            ['Settings & Sync', /#\/settings/],
        ]) {
            await page.getByRole('link', { name: label, exact: true }).click();
            await expect(page).toHaveURL(urlRe);
            const overflowInfo = await page.evaluate(() => {
                const vw = window.innerWidth;
                const offenders = Array.from(document.querySelectorAll('*'))
                    .map((el) => {
                        const rect = el.getBoundingClientRect();
                        return {
                            tag: el.tagName.toLowerCase(),
                            id: el.id || null,
                            className: typeof el.className === 'string' ? el.className : null,
                            right: Math.round(rect.right),
                            width: Math.round(rect.width),
                        };
                    })
                    .filter((item) => item.right > vw);
                return {
                    scrollWidth: document.documentElement.scrollWidth,
                    innerWidth: vw,
                    offenders: offenders.slice(0, 10),
                };
            });
            expect(
                overflowInfo.scrollWidth,
                `Horizontal overflow on ${label}: ${JSON.stringify(overflowInfo)}`
            ).toBeLessThanOrEqual(overflowInfo.innerWidth);
        }
        await expect(page.getByText('Display & Accessibility Preferences')).toBeVisible();
    });
}

test('toggles theme, scales text, and validates Profile form', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('./');

    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: 'Toggle theme' }).click();
    await expect(html).toHaveAttribute('data-theme', 'light');

    await page.getByRole('link', { name: 'Vacancies', exact: true }).click();
    await page.getByRole('button', { name: 'List', exact: true }).click();
    const listOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(listOverflow).toBe(false);

    await page.getByRole('link', { name: 'Settings & Sync', exact: true }).click();
    await page.locator('#display-scale').selectOption('120');
    const rootFontSize = await page.evaluate(() => document.documentElement.style.fontSize);
    expect(rootFontSize).toBe('120%');
    await page.locator('#display-density').selectOption('compact');
    await expect(html).toHaveAttribute('data-density', 'compact');

    await page.getByRole('link', { name: 'Profile & Resumes', exact: true }).click();
    await expect(page).toHaveURL(/#\/profile/);
    await page.getByRole('button', { name: 'Save Profile Changes' }).click();
    await expect(page.getByText('First name, last name, and valid email are required.')).toBeVisible();
});

const MODAL_VIEWPORTS = [
    { name: 'mobile-360', width: 360, height: 780, touchCheck: true },
    { name: 'smartwatch-240', width: 240, height: 240, touchCheck: true },
    { name: 'foldable-280', width: 280, height: 653, touchCheck: true },
    { name: 'mobile-landscape-780', width: 780, height: 360, touchCheck: true },
];

async function assertModalFitsViewport(page, modalCard, closeBtn, vp, label) {
await expect(modalCard).toBeVisible();
await modalCard.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));

    await expect(async () => {
        const metrics = await modalCard.evaluate((el) => {
            const r = el.getBoundingClientRect();
            return {
                docScrollWidth: document.documentElement.scrollWidth,
                innerWidth: window.innerWidth,
                cardScrollWidth: el.scrollWidth,
                cardClientWidth: el.clientWidth,
                left: Math.round(r.left),
                right: Math.round(r.right),
            };
        });
        expect(metrics.docScrollWidth, `${label} caused page overflow`).toBeLessThanOrEqual(metrics.innerWidth);
        expect(metrics.cardScrollWidth, `${label} card scrolled horizontally`).toBeLessThanOrEqual(metrics.cardClientWidth + 1);
        expect(metrics.left, `${label} left edge clipped`).toBeGreaterThanOrEqual(0);
        expect(metrics.right, `${label} right edge clipped`).toBeLessThanOrEqual(vp.width + 1);

        await expect(closeBtn).toBeVisible();
        const btnBox = await closeBtn.boundingBox();
        expect(btnBox, `${label} close button missing bounding box`).toBeTruthy();
        expect(btnBox.x, `${label} close button clipped left`).toBeGreaterThanOrEqual(0);
        expect(btnBox.x + btnBox.width, `${label} close button clipped right`).toBeLessThanOrEqual(vp.width + 1);
        if (vp.touchCheck) {
            expect(btnBox.height, `${label} close button < 44px height`).toBeGreaterThanOrEqual(44);
        }
    }).toPass({ timeout: 2000 });
}

for (const vp of MODAL_VIEWPORTS) {
    test(`modals render without overflow and close cleanly on ${vp.name}`, async ({ page }) => {
            await page.setViewportSize({ width: vp.width, height: vp.height });
            await page.goto('./');
            await expect(page.locator('.header-brand-title')).toHaveText('AutoOffer');

            await page.getByRole('link', { name: 'Profile & Resumes', exact: true }).click();
            await page.locator('#prof-first').fill('Jane');
            await page.locator('#prof-last').fill('Doe');
            await page.locator('#prof-email').fill('jane@example.com');
            await page.getByRole('button', { name: 'Save Profile Changes' }).click();
            await expect(page.locator('.profile-actions-bar .status-msg').first()).not.toBeEmpty();

            await page.locator('#res-title').fill('Backend Resume');
            await page.locator('#res-skills').fill('Java, PostgreSQL, Docker');
            await page.locator('#res-text').fill('Experienced Java and PostgreSQL developer.');
            await page.getByRole('button', { name: 'Save Resume Variant' }).click();
            await expect(page.locator('.resume-variant-card').first()).toContainText('Backend Resume');

            await page.getByRole('link', { name: 'Settings & Sync', exact: true }).click();
            await page.locator('#ai-key').fill('sk-test-e2e-key');
            await page.getByRole('button', { name: 'Save AI Configuration' }).click();
            await expect(page.locator('.ai-config-row').first()).toContainText('gpt-4o-mini');

            const backupPayload = {
                exportedAt: '2026-11-23T12:00:00.000Z',
                schemaVersion: 7,
                tables: {
                    local_vacancies: [
                        {
                            id: '00000000-0000-4000-8000-000000000901',
                            platform_id: '10000000-0000-4000-8000-000000000001',
                            source_host: null,
                            position_id: null,
                            full_position_name: 'Senior Full Stack Software Engineer (Remote)',
                            company_id: null,
                            address: 'Vilnius, Lithuania',
                            region_id: null,
                            country_id: null,
                            city_id: null,
                            salary_from: null,
                            salary_to: null,
                            currency_id: null,
                            level_id: null,
                            work_format_id: null,
                            employment_type_id: null,
                            url: 'https://www.indeed.com/viewjob?jk=e2e-modal-check',
                            description: 'Java, TypeScript, Vue 3, PostgreSQL, Docker, Kubernetes experience.',
                            posted_at: '2026-11-20T10:00:00.000Z',
                            sync_level: 'none',
                            source: 'manual',
                            status: 'complete',
                            skill_ids: [],
                            created_at: '2026-11-20T10:00:00.000Z',
                            updated_at: '2026-11-20T10:00:00.000Z',
                        },
                    ],
                },
            };
            await page.locator('input[type="file"][accept="application/json"]').setInputFiles({
                    name: 'e2e-backup.json',
                    mimeType: 'application/json',
                    buffer: Buffer.from(JSON.stringify(backupPayload)),
            });
            await expect(page.locator('.metrics-grid .metric-box').nth(1)).toContainText('1');

            await page.getByRole('link', { name: 'Vacancies', exact: true }).click();
            await expect(page.locator('.vacancy-item').first()).toBeVisible();

            // 1. VacancyModal open, layout check, close button, and reopen
            await page.locator('.vacancy-title-btn').first().click();
            const vacancyCard = page.locator('.ao-modal-card').first();
            await assertModalFitsViewport(
                page,
                vacancyCard,
                vacancyCard.locator('.ao-modal-close'),
                vp,
            `VacancyModal (${vp.name})`
        );
        await vacancyCard.locator('.ao-modal-close').click();
        await expect(page.locator('.ao-overlay-modal')).toHaveCount(0);

        await page.locator('.vacancy-title-btn').first().click();
        await vacancyCard.locator('.ao-modal-footer-actions').getByRole('button', { name: 'Review & Apply' }).click();

        // 2. ReviewApplyModal open and layout check
        const reviewCard = page.locator('.ai-modal-card');
        await assertModalFitsViewport(
            page,
            reviewCard,
            reviewCard.locator('.ao-modal-close'),
            vp,
        `ReviewApplyModal (${vp.name})`
    );

    // 3. AiConsentModal triggered from Evaluate Match, layout check, and Cancel
    await reviewCard.getByRole('button', { name: 'Evaluate Match' }).click();
    const consentCard = page.locator('.ao-modal-card').filter({ hasText: 'GDPR AI Data Processing Consent' });
    const consentCancelBtn = consentCard.getByRole('button', { name: 'Cancel' });
    await assertModalFitsViewport(page, consentCard, consentCancelBtn, vp, `AiConsentModal (${vp.name})`);
    await consentCancelBtn.click();
    await expect(consentCard).toHaveCount(0);

    const toastClose = page.locator('.ao-toast-close').first();
    if (await toastClose.isVisible().catch(() => false)) {
        await toastClose.click();
    }
    await reviewCard.locator('.ao-modal-close').click();
    await expect(page.locator('.ao-overlay-modal')).toHaveCount(0);
});
}