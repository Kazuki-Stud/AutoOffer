import { expect, test } from '@playwright/test';

const VIEWPORTS = [
    { name: 'mobile-360', width: 360, height: 780, touchCheck: true },
    { name: 'tablet-768', width: 768, height: 1024, touchCheck: true },
    { name: 'desktop-1280', width: 1280, height: 800, touchCheck: false },
];

for (const vp of VIEWPORTS) {
    test(`renders cleanly without horizontal overflow on ${vp.name}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto('./');

        await expect(page.locator('.header-brand-title')).toHaveText('AutoOffer');

        const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth
        );
        expect(overflow).toBe(false);

        if (vp.touchCheck) {
            const navBox = await page.locator('.pwa-nav-btn').first().boundingBox();
            expect(navBox.height).toBeGreaterThanOrEqual(44);
        }

        for (const [label, urlRe] of [
                ['Applications', /#\/applications/],
                ['Jobs & Automation', /#\/jobs/],
                ['Profile & Resumes', /#\/profile/],
                ['Settings & Sync', /#\/settings/],
        ]) {
            await page.getByRole('link', { name: label }).click();
            await expect(page).toHaveURL(urlRe);
            const routeOverflow = await page.evaluate(
                () => document.documentElement.scrollWidth > window.innerWidth
            );
            expect(routeOverflow).toBe(false);
        }
        await expect(page.getByText('Display & Accessibility Preferences')).toBeVisible();
    });
}

test('toggles theme and validates Profile form', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('./');

    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: 'Toggle theme' }).click();
    await expect(html).toHaveAttribute('data-theme', 'light');

    await page.getByRole('link', { name: 'Profile & Resumes' }).click();
    await expect(page).toHaveURL(/#\/profile/);
    await page.getByRole('button', { name: 'Save Profile Changes' }).click();
    await expect(page.getByText('First name, last name, and valid email are required.')).toBeVisible();
});
