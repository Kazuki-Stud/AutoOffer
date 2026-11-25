import { expect, test } from '@playwright/test';

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