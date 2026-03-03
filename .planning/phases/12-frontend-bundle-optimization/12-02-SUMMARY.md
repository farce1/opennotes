---
phase: 12-frontend-bundle-optimization
plan: 02
subsystem: infra
tags: [vite, rollup, ci, performance, bundle]
requires:
  - phase: 12-frontend-bundle-optimization
    provides: Lazy-loaded PDF/ZIP dependencies from Plan 12-01
provides:
  - Stable vendor chunking for React and markdown dependencies
  - Bundle treemap artifact generation (`dist/stats.html`) with gzip data
  - CI release warning for oversized JavaScript bundles
affects: [release-workflow, bundle-regression-monitoring, phase-12-verification]
tech-stack:
  added:
    - rollup-plugin-visualizer@5.14.0
  patterns:
    - Explicit manual chunk boundaries for stable vendor cache keys
    - Non-blocking CI warning gate for bundle-size regressions
key-files:
  created: []
  modified:
    - vite.config.ts
    - package.json
    - package-lock.json
    - .github/workflows/release.yml
key-decisions:
  - "Used `build.rollupOptions` (not `rolldownOptions`) because Vite 7.3.1's typed build config exposes `rollupOptions` for `manualChunks`."
  - "Kept the CI bundle check as warning-only at 1400KB so releases continue while still surfacing regressions."
patterns-established:
  - "Bundle governance requires both local visualizer output and CI size telemetry."
  - "Vendor chunk names are explicitly pinned (vendor-react/vendor-markdown) for cache stability checks."
requirements-completed: [PERF-03, PERF-04, PERF-05]
duration: 4 min
completed: 2026-03-03
---

# Phase 12 Plan 02 Summary

**Bundle optimization now includes explicit vendor chunk boundaries, visualizer-based audit output, and CI warning telemetry to prevent regressions after the lazy-loading work from Plan 12-01.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-03T08:19:20Z
- **Completed:** 2026-03-03T08:22:42Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added `rollup-plugin-visualizer` and generated `dist/stats.html` treemap output with gzip metrics.
- Configured manual chunking for `vendor-react` and `vendor-markdown`, producing stable named vendor artifacts across rebuilds.
- Added CI release step to build frontend, print chunk sizes, and emit `::warning::` when largest JS chunk exceeds 1400KB.

## Task Commits

Each task was committed atomically:

1. **Task 1: Install rollup-plugin-visualizer, configure manualChunks and visualizer in vite.config.ts** - `bcc8407` (perf)
2. **Task 2: Add CI bundle size warning and verify 40% reduction target** - `6ef75de` (ci)

**Plan metadata:** pending docs commit

## Bundle Audit (Before vs After)

Baseline from `12-RESEARCH.md` (v1.0):
- Main chunk (`index-*.js`): **2237 KB raw / 706 KB gzip**

Post-optimization build (`npm run build`):
- Main chunk (`index-DjQ749YK.js`): **350.65 KB raw / 99.05 KB gzip**
- `vendor-react-D9fvhHmL.js`: **48.53 KB raw / 17.11 KB gzip**
- `vendor-markdown-D0ntQsfF.js`: **157.18 KB raw / 47.64 KB gzip**
- `jszip.min-DWmZ3a6H.js`: **96.99 KB raw / 29.99 KB gzip**
- `react-pdf.browser-C0vj4Sub.js` (async): **1573.03 KB raw / 527.01 KB gzip**
- `pdf-renderer-nhP3agSB.js` (async glue): **1.49 KB raw / 0.79 KB gzip**

Main-chunk reduction:
- **From 2237 KB to 350.65 KB = 84.3% reduction**
- Target threshold (40% reduction) required `<= 1342.20 KB`; achieved by a wide margin.

Hash stability check:
- Rebuilt twice with no code changes; vendor chunk filenames remained identical:
  - `vendor-react-D9fvhHmL.js`
  - `vendor-markdown-D0ntQsfF.js`

## Files Created/Modified
- `vite.config.ts` - Added visualizer plugin and manual chunk boundaries for React/markdown vendors.
- `package.json` - Added `rollup-plugin-visualizer` dev dependency.
- `package-lock.json` - Locked new visualizer dependency tree.
- `.github/workflows/release.yml` - Added frontend bundle check step with warning-only threshold.

## Decisions Made
- Used `rollupOptions` because the current Vite 7.3.1 typings/runtime honor it for manual chunking in this project.
- Set CI threshold to 1400KB to remain non-blocking while still flagging anomalous growth.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Switched from `rolldownOptions` to `rollupOptions` for working manual chunk output**
- **Found during:** Task 1 (bundle config verification)
- **Issue:** `rolldownOptions` did not produce named vendor chunks with Vite 7.3.1 in this repo.
- **Fix:** Replaced config key with `build.rollupOptions.output.manualChunks`, yielding the expected `vendor-react` and `vendor-markdown` files.
- **Files modified:** `vite.config.ts`
- **Verification:** `npm run build` output shows both vendor chunks with stable names.
- **Committed in:** `bcc8407` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Maintained intended behavior and ensured PERF-03 acceptance criteria were actually met.

## Issues Encountered

- Vite still emits a size warning for `react-pdf.browser-*` (>500KB), which is expected because the heavy PDF runtime now lives in an async chunk rather than the initial main bundle.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All Phase 12 plan-level work is complete; phase is ready for goal verification.
- `dist/stats.html` now provides a baseline artifact for future bundle regressions.

---
*Phase: 12-frontend-bundle-optimization*
*Completed: 2026-03-03*
