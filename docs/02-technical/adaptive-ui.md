# Adaptive UI (Web / Mobile)

## Context
Job seekers inspect saved vacancies and track application statuses on mobile phones (down to `360px` width) and tablets (`768px`) while managing resumes and running extension-paired workflows on desktop (`1280px+`). The UI must reflow cleanly across portrait/landscape orientations and browser zoom levels without horizontal overflow, maintain accessible contrast (WCAG 2.1 Level AA), and provide touch-friendly interactive targets (`>= 44px`).

## Decision
We implemented a responsive CSS design token architecture (`src/client/pwa/src/styles/main.css`) paired with user-customizable display settings in `useAppStore` and `SettingsPage.vue`:
- **Fluid CSS Grids & Flex Layouts:** Multi-column desktop grids (`3 columns` → `2 columns` at `<= 980px` → `1 column` at `<= 680px`), wrapping navigation/filters, and `min-width: 0; max-width: 100%` guards on flex/grid containers to prevent overflow at `360px`.
- **Responsive Data Table Reflow:** Below `768px`, `#applications-table` switches from a multi-column table to stacked card rows using `data-label` CSS pseudo-elements.
- **Touch Target Enforcement (`>= 44px`):** Under `@media (pointer: coarse), (max-width: 768px)`, buttons, navigation links, inputs, selects, theme toggle, modal close buttons, and checkbox tap rows enforce `min-height: 44px` (and `22px` checkboxes).
- **Theming, Contrast & Text Scaling:** Light and dark CSS custom property palettes (`--text-muted` / `--text-secondary` tuned for `>= 4.5:1` contrast), scalable SVG logo/icons/chart (`viewBox`), and user-selectable interface scale (`100%`, `110%`, `120%` driving root `rem` sizing).
- **Automated Viewport & Touch Verification:** Playwright E2E tests (`src/client/pwa/e2e/pwa.spec.js`) assert zero horizontal overflow (`scrollWidth <= innerWidth`) across `360x780`, `768x1024`, and `1280x800`, and verify `>= 44px` touch target heights.

## Alternatives Considered

| Alternative | Pros | Cons | Why Not Chosen |
|---|---|---|---|
| **Separate Mobile & Desktop Templates** | Tailored markup per form factor | Duplicates business logic and increases maintenance for one developer | Unnecessary complexity when CSS Grid/Flexbox + table-card media queries handle all breakpoints cleanly |
| **Responsive CSS Tokens + Media Queries + E2E Viewport Tests (Chosen)** | Single codebase (`360px–3840px`), instant theme & `rem` scale switching, verified automatically in Chromium | Requires disciplined `min-width: 0` rules on flex children | Meets all Adaptive UI requirements with minimal bundle overhead |
| **Heavy CSS Framework (e.g. Bootstrap / Vuetify)** | Prebuilt responsive utilities | Adds bundle weight and overrides existing dark/light design tokens | Existing custom design tokens + Vite CSS fit the PWA cleanly without extra runtime CSS |

## Consequences

**Positive:**
- Zero horizontal overflow verified via Playwright across all 5 routes at `360px`, `768px`, and `1280px`.
- Touch targets on mobile/tablet meet the `44px` minimum ergonomics requirement.
- Users can customize color scheme (Dark/Light) and interface scale (`100%`/`110%`/`120%`).

**Negative:**
- Dense desktop tables require custom `data-label` card styling for mobile viewports.

**Neutral:**
- Uses relative `rem`, `%`, `fr`, and `vh` units so browser zoom and OS font settings scale proportionally.

## Implementation Details

### Responsive Breakpoints

| Breakpoint | Behavior |
|---|---|
| `> 980px` (Desktop / 4K) | 3-column vacancy grid, 3-column KPI stats, full horizontal application table, max container width `1240px` |
| `<= 980px` (Tablet Landscape) | 2-column vacancy grid |
| `<= 768px` (Tablet Portrait / Touch) | Applications table collapses into stacked cards (`data-label`); interactive touch targets enforce `min-height: 44px` |
| `<= 680px` (Mobile `360px+`) | Single-column grids (`vacancies-grid`, `ao-stats`, `profile-grid`, `sync-form-grid`, `metrics-grid`), wrapping nav bar, full-width filter controls |

## Requirements Checklist

| # | Requirement | Status | Evidence / Notes |
|---|---|---|---|
| 1 | Support 3+ device types (foldable, mobile, tablet, desktop, ultrawide/4K) + zoom & orientation | ✅ | Viewport meta in `index.html`; breakpoints (`<=340px`, `<=680px`, `<=768px`, `<=980px`, `>=1920px`, `>=2560px`, landscape); verified across 6 viewports in `e2e/pwa.spec.js` |
| 2 | Automatic device detection (density, orientation, aspect ratio) & Design System tokens | ✅ | `src/composables/useDeviceInfo.js` sets `data-device`, `data-orientation`, `data-touch`; CSS design tokens in `src/styles/main.css` |
| 3 | Relative units & responsive grid with no overlapping/overflow | ✅ | `rem`/`%`/`fr`/`dvh` units; `min-width: 0` flex/grid rules; `scrollWidth <= innerWidth` asserted across all 5 routes |
| 4 | One-hand mobile bottom tab bar + persistent desktop navigation | ✅ | `AppHeader.vue` + `main.css` dock `.pwa-nav` to a bottom tab bar with SVG icons on `<= 680px` |
| 5 | Keyboard-safe UI (not covered by virtual keyboard) | ✅ | `90dvh` modals, `visualViewport` keyboard detection hiding bottom nav (`ao-keyboard-open`), and `focusin` auto-scroll |
| 6 | Touch interactive elements ≥ 44px | ✅ | Enforced on buttons, links, inputs, selects, modal/toast close, theme toggle (`@media (pointer: coarse), (max-width: 768px)`) & verified in `e2e/pwa.spec.js` |
| 7 | Consistent palette, typography, SVG icons, dark/light theme | ✅ | CSS theme tokens in `main.css`, `public/image.svg`, `HotwordsChart.vue` SVG, `AppHeader.vue` SVG nav icons & theme toggle |
| 8 | User-customizable display settings (scale, layout density & color scheme) | ✅ | `SettingsPage.vue` (`#display-theme`, `#display-scale`, `#display-density`) + `useAppStore` |
| 9 | WCAG 2.1 AA contrast (`>= 4.5:1`), `:focus-visible`, skip link & reduced motion | ✅ | Dark/light contrast tokens, `:focus-visible`, `<a class="skip-link">`, single `<main>` landmark |
| 10 | 3-device rendered screenshots (360px, 768px, 1280px) | ✅ | Auto-generated by `e2e/pwa.spec.js` into `docs/02-technical/criteria/assets/screenshots/` |
| 11 | Interactive Figma / Adobe XD / PDF mockups (3 variants + component states) | ❌ | External design deliverable — attach Figma link or PDF export when submitting |

## Known Limitations

| Limitation | Impact | Potential Solution |
|---|---|---|
| Figma / PDF mockups are external to the Git repository | Required by Adaptive UI submission checklist | Export 3-device Figma mockups (with component states) as PDF/link alongside submission |
| No dedicated smartwatch or foldable CSS rules | Non-standard ultra-narrow (`< 320px`) screens may clip | Add `<= 320px` media query if wearable viewports are targeted |

## References
- [W3C WCAG 2.1 Contrast Guidelines](https://www.w3.org/TR/WCAG21/)
- `src/client/pwa/src/styles/main.css`
- `src/client/pwa/src/pages/SettingsPage.vue`
- `src/client/pwa/e2e/pwa.spec.js`
