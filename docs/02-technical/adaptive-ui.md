# Adaptive UI (Web / Mobile)

## Context
Job seekers inspect saved vacancies and track application statuses on mobile phones (down to `360px` width and `280px` foldable cover screens) and tablets (`768px`) while managing resumes and running extension-paired workflows on desktop (`1280px+` and `1920px+`). The UI must reflow cleanly across portrait/landscape orientations and browser zoom levels without horizontal overflow, maintain accessible contrast (WCAG 2.1 Level AA), and provide touch-friendly interactive targets (`>= 44px`).

## Decision
We implemented a responsive CSS design token architecture (`src/client/pwa/src/styles/main.css`) paired with automatic device detection (`src/composables/useDeviceInfo.js`) and user-customizable display settings in `useAppStore` and `SettingsPage.vue`:
- **Fluid CSS Grids & Flex Layouts:** Multi-column desktop grids (`3 columns` → `2 columns` at `<= 980px` → `1 column` at `<= 680px`, compact padding at `<= 340px`, ultra-compact icon-only smartwatch nav at `<= 250px`, widened container at `>= 1920px` and `>= 2560px`), with `min-width: 0; max-width: 100%` guards on flex/grid containers.
- **Responsive Data Table Reflow:** Below `768px`, `.applications-table` switches from a multi-column table to stacked card rows using `data-label` CSS pseudo-elements.
- **One-Hand Mobile Navigation & Keyboard Safety:** On `<= 680px`, `.pwa-nav` docks to a fixed bottom tab bar with SVG icons (`env(safe-area-inset-bottom)` aware), hides automatically when `visualViewport` detects an open soft keyboard (`ao-keyboard-open`), modals use `max-height: 90dvh`, and focused inputs auto-scroll into view.
- **Touch Target Enforcement (`>= 44px`):** Under `@media (pointer: coarse), (max-width: 768px), (max-height: 500px) and (orientation: landscape)`, buttons, navigation links, inputs, selects, theme toggle, modal/toast close buttons, vacancy links, and checkbox tap rows enforce `min-height: 44px` (and `22px` checkboxes).
- **Theming, Contrast & Display Customization:** Light and dark CSS custom property palettes (`--text-muted`, `--text-secondary`, `.tag-status`, `.hub-badge`, `.skill-chip-sm`, `.clear-button:hover`, and light-theme `.skill-chip.missing` tuned for `>= 4.5:1` contrast), scalable SVG icons/charts, and user-selectable theme, text scale (`100%` / `110%` / `120%`), and layout density (`comfortable` / `compact`).
- **Automated Viewport & Touch Verification:** Playwright E2E tests (`src/client/pwa/e2e/pwa.spec.js`) assert zero horizontal overflow across 9 route viewports (`240px`, `280px`, `360px`, `780×360`, `768px`, `1280px`, `1920px`, `2560px`, `3840px`) plus modal overflow and close-target checks (`VacancyModal`, `ReviewApplyModal`, `AiConsentModal`) at `240px`, `280px`, `360px`, and `780×360`, verify `>= 44px` touch targets, and export screenshots to `docs/02-technical/assets/screenshots/`.

## Alternatives Considered

| Alternative | Pros | Cons | Why Not Chosen |
|---|---|---|---|
| **Separate Mobile & Desktop Templates** | Tailored markup per form factor | Duplicates business logic and increases maintenance for one developer | Unnecessary complexity when CSS Grid/Flexbox + table-card media queries handle all breakpoints cleanly |
| **Responsive CSS Tokens + `useDeviceInfo` + Bottom Tab Bar + E2E Viewport Tests (Chosen)** | Single codebase (`240px–3840px`), instant theme/scale/density switching, verified automatically in Chromium | Requires disciplined `min-width: 0` rules on flex children | Meets all Minimum and Maximum Adaptive UI requirements with minimal bundle overhead |
| **Heavy CSS Framework (e.g. Bootstrap / Vuetify)** | Prebuilt responsive utilities | Adds bundle weight and overrides existing dark/light design tokens | Existing custom design tokens + Vite CSS fit the PWA cleanly without extra runtime CSS |

## Consequences

**Positive:**
- Zero horizontal overflow verified via Playwright across all 5 routes and 9 viewports.
- Touch targets on mobile, rotated landscape phones, and tablets meet the `44px` minimum ergonomics requirement.
- Users can customize color scheme (Dark/Light), interface scale (`100%`/`110%`/`120%`), and layout density (`comfortable`/`compact`).

**Negative:**
- Dense desktop tables require custom `data-label` card styling for mobile viewports.

**Neutral:**
- Uses relative `rem`, `%`, `fr`, `dvh`, and `vh` units so browser zoom and OS font settings scale proportionally.

## Implementation Details

### Responsive Breakpoints

| Breakpoint | Behavior |
|---|---|
| `>= 2560px` / `>= 1920px` (4K / 2K / Ultrawide) | Widens `.layout-container` (`1560px` / `1840px`) |
| `> 980px` (Desktop) | 3-column vacancy grid, full horizontal application table, top header navigation |
| `<= 980px` (Tablet Landscape) | 2-column vacancy grid |
| `<= 768px` (Tablet Portrait / Touch) | Applications table collapses into stacked cards (`data-label`); touch targets enforce `min-height: 44px` |
| `<= 680px` (Mobile `360px+`) | Single-column grids, fixed bottom tab bar navigation with SVG icons, keyboard-aware auto-hide (`ao-keyboard-open`) |
| `<= 340px` (Foldable Cover) | Compact `8px` gutters and `0.62rem` tab labels |
| `<= 250px` (Smartwatch) | `6px` gutters, compact header badge, and icon-only bottom navigation preserving `>= 44px` touch targets |

## Requirements Checklist

| # | Requirement | Status | Evidence / Notes |
|---|---|---|---|
| 1 | Support 3+ device types (foldable, mobile, tablet, desktop, ultrawide/2K/4K, smartwatch) + zoom & orientation | ✅ | Viewport meta in `index.html`; breakpoints in `src/styles/main.css`; verified across 9 viewports in `e2e/pwa.spec.js` |
| 2 | Automatic device detection (density, orientation, aspect ratio) & Design System tokens | ✅ | `src/composables/useDeviceInfo.js` sets `data-device`, `data-orientation`, `data-touch`; CSS design tokens in `src/styles/main.css` |
| 3 | Relative units & responsive grid with no overlapping/overflow | ✅ | `rem`/`%`/`fr`/`dvh` units; `min-width: 0` flex/grid rules; `scrollWidth <= innerWidth` asserted across all 5 routes |
| 4 | One-hand mobile bottom tab bar + persistent desktop navigation | ✅ | `AppHeader.vue` + `main.css` dock `.pwa-nav` to a bottom tab bar with SVG icons on `<= 680px` |
| 5 | Keyboard-safe UI (not covered by virtual keyboard) | ✅ | `90dvh` modals, `visualViewport` keyboard detection hiding bottom nav (`ao-keyboard-open`), and `focusin` auto-scroll |
| 6 | Touch interactive elements ≥ 44px | ✅ | Enforced on buttons, links, inputs, selects, modal/toast close, theme toggle & verified across routes and modals in `e2e/pwa.spec.js` |
| 7 | Consistent palette, typography, SVG icons, dark/light theme | ✅ | CSS theme tokens in `main.css`, `public/image.svg`, responsive-viewBox `HotwordsChart.vue` SVG, search icons, `AppHeader.vue` SVG nav icons & theme toggle |
| 8 | User-customizable display settings (scale, layout density & color scheme) | ✅ | `SettingsPage.vue` (`#display-theme`, `#display-scale`, `#display-density`) + `useAppStore` |
| 9 | WCAG 2.1 AA contrast (`>= 4.5:1`), `:focus-visible`, skip link & reduced motion | ✅ | Dark/light contrast tokens (`.hub-badge`, `.skill-chip-sm`, `.clear-button:hover`, light `.skill-chip.missing`), sequential heading order (`<h2 class="sr-only">Vacancies</h2>`), `:focus-visible`, `<a class="skip-link">`, single `<main>` landmark, keyboard modal Escape/focus & native button triggers (**100 Accessibility** in Lighthouse) |
| 10 | 3-device rendered screenshots (360px, 768px, 1280px) | ✅ | Auto-generated by `e2e/pwa.spec.js` into `docs/02-technical/assets/screenshots/` |
| 11 | Interactive Figma / Adobe XD / PDF mockups (3 variants + component states) | ❌ | External design deliverable — attach Figma link or PDF export when submitting |

## Known Limitations

| Limitation | Impact | Potential Solution |
|---|---|---|
| Figma / PDF mockups are external to the Git repository | Required by Adaptive UI submission checklist | Export 3-device Figma mockups (with component states) as PDF/link alongside submission |

## References
- [W3C WCAG 2.1 Contrast Guidelines](https://www.w3.org/TR/WCAG21/)
- `src/client/pwa/src/styles/main.css`
- `src/client/pwa/src/composables/useDeviceInfo.js`
- `src/client/pwa/src/pages/SettingsPage.vue`
- `src/client/pwa/e2e/pwa.spec.js`
