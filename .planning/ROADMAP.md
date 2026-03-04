# Roadmap: openNotes

## Milestones

- ✅ **v1.0 MVP** — Phases 01-09 (shipped 2026-03-01)
- ✅ **v1.1 Hardening & Quality** — Phases 10-13 (shipped 2026-03-03)
- 🔵 **v1.2 Documentation Site** — Phases 14-18

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 01-09) — SHIPPED 2026-03-01</summary>

- [x] Phase 01: App Shell & Storage Foundation — completed 2026-02-26
- [x] Phase 02: Audio Capture Foundation (2/2 plans) — completed 2026-02-27
- [x] Phase 03: Transcription Engine Integration (3/3 plans) — completed 2026-02-27
- [x] Phase 04: Recording Orchestration (3/3 plans) — completed 2026-02-27
- [x] Phase 05: Notes/Summary Pipeline (3/3 plans) — completed 2026-02-27
- [x] Phase 06: Library + Data Workflows (3/3 plans) — completed 2026-02-28
- [x] Phase 07: Settings Surface Expansion (3/3 plans) — completed 2026-02-28
- [x] Phase 08: Cross-Platform Hardening (4/4 plans) — completed 2026-03-01
- [x] Phase 09: Polish & Tech Debt Cleanup (3/3 plans) — completed 2026-03-01

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.1 Hardening & Quality (Phases 10-13) — SHIPPED 2026-03-03</summary>

- [x] Phase 10: Dependency Risk Closure (1/1 plans) — completed 2026-03-02
- [x] Phase 11: LLM Model Selection End-to-End (2/2 plans) — completed 2026-03-02
- [x] Phase 12: Frontend Bundle Optimization (2/2 plans) — completed 2026-03-03
- [x] Phase 13: LLM Quality Tuning (1/1 plans) — completed 2026-03-03

Full details: `.planning/milestones/v1.1-ROADMAP.md`

</details>

### v1.2 Documentation Site

#### Phase 14: Project Scaffold & Repo Cleanup
**Goal:** Replace app source code with Astro Starlight project. Working dev server with docs framework ready.
**Requirements:** R1.1, R1.2, R1.3, R1.4
**Delivers:**
- Clean Astro Starlight project scaffolded in repo
- React integration enabled for interactive components
- Tailwind CSS configured with brand color variables
- Sitemap integration added
- Dev server runs, placeholder docs page renders
- Old app source code removed (preserved in main opennotes repo)

**Success criteria:**
- `bun run dev` starts Astro dev server
- Starlight docs pages render with sidebar navigation
- `bun run build` produces static output in `dist/`

---

#### Phase 15: Marketing Landing Page
**Goal:** Custom marketing landing page at `/` that communicates openNotes' value proposition and drives visitors to docs or downloads.
**Requirements:** R2.1, R2.2, R2.3, R2.4, R2.5, R2.6
**Delivers:**
- Full custom Astro page at `src/pages/index.astro`
- Hero section with tagline and dual CTAs
- Features grid (6 features with icons)
- How-it-works 3-step visual flow
- Comparison table (openNotes vs cloud alternatives)
- Platform download buttons (link to GitHub Releases)
- Footer with links to GitHub, docs, license

**Success criteria:**
- Landing page renders at `/` with all 6 sections
- Responsive design (mobile, tablet, desktop)
- Dark/light mode works
- All CTAs link to correct destinations

---

#### Phase 16: Documentation Content — Core
**Goal:** Write the essential documentation that gets users from zero to productive.
**Requirements:** R3.1, R3.2, R3.3, R4.1, R4.2, R4.3, R4.4, R4.5
**Delivers:**
- Getting Started section: introduction, installation (3 platforms), quick start
- Usage Guides: recording, transcription settings, AI models, meeting library, export
- Sidebar configured with logical grouping
- Placeholder images where screenshots will go

**Success criteria:**
- All 8 documentation pages render with content
- Sidebar navigation works correctly
- Pagefind indexes all docs content
- Internal links between docs pages work

---

#### Phase 17: Documentation Content — Reference & Support
**Goal:** Complete the documentation with reference material, troubleshooting, and community guides.
**Requirements:** R5.1, R5.2, R5.3, R5.4
**Delivers:**
- Settings reference page (all configurable options)
- Troubleshooting guide (common issues + solutions)
- FAQ page
- Contributing guide (build from source, PR process)

**Success criteria:**
- All 4 reference/support pages render
- FAQ answers cover the most common questions
- Contributing guide includes dev setup instructions

---

#### Phase 18: Branding, SEO & Deployment
**Goal:** Polish branding, configure SEO metadata, deploy to Vercel, and add CI.
**Requirements:** R6.1, R6.2, R6.3, R6.4, R7.1, R7.2
**Delivers:**
- Custom theme (brand colors, fonts) applied across marketing + docs
- Placeholder logo in header (light/dark variants)
- OpenGraph meta tags (default + per-page descriptions)
- Navigation consistency (marketing ↔ docs ↔ GitHub)
- Vercel deployment configured and live
- GitHub Actions CI build check on PRs

**Success criteria:**
- Site deployed and accessible on Vercel
- OG meta renders correctly when sharing links
- CI build check runs on PR and catches build failures
- Sitemap generated at `/sitemap-index.xml`
- All pages pass Lighthouse SEO audit (score > 90)

---

## Phase Ordering Rationale

- **Phase 14 first:** Must scaffold before anything else can be built. Removes app source, establishes the Astro project.
- **Phase 15 next:** Landing page is the entry point for visitors. Design and layout established early informs docs styling.
- **Phase 16 before 17:** Core docs (getting started, usage) have higher traffic than reference/support docs. Ship the most valuable content first.
- **Phase 17 after core docs:** Reference and support content builds on the patterns established in Phase 16.
- **Phase 18 last:** Branding polish, SEO, and deployment are final-mile work. Deploying last ensures all content is ready before going live.

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 01. App Shell & Storage Foundation | v1.0 | 3/3 | Complete | 2026-02-26 |
| 02. Audio Capture Foundation | v1.0 | 2/2 | Complete | 2026-02-27 |
| 03. Transcription Engine Integration | v1.0 | 3/3 | Complete | 2026-02-27 |
| 04. Recording Orchestration | v1.0 | 3/3 | Complete | 2026-02-27 |
| 05. Notes/Summary Pipeline | v1.0 | 3/3 | Complete | 2026-02-27 |
| 06. Library + Data Workflows | v1.0 | 3/3 | Complete | 2026-02-28 |
| 07. Settings Surface Expansion | v1.0 | 3/3 | Complete | 2026-02-28 |
| 08. Cross-Platform Hardening | v1.0 | 4/4 | Complete | 2026-03-01 |
| 09. Polish & Tech Debt Cleanup | v1.0 | 3/3 | Complete | 2026-03-01 |
| 10. Dependency Risk Closure | v1.1 | 1/1 | Complete | 2026-03-02 |
| 11. LLM Model Selection End-to-End | v1.1 | 2/2 | Complete | 2026-03-02 |
| 12. Frontend Bundle Optimization | v1.1 | 2/2 | Complete | 2026-03-03 |
| 13. LLM Quality Tuning | v1.1 | 1/1 | Complete | 2026-03-03 |
| 14. Project Scaffold & Repo Cleanup | v1.2 | 1/1 | Complete | 2026-03-04 |
| 15. Marketing Landing Page | v1.2 | 1/1 | Complete | 2026-03-04 |
| 16. Documentation Content — Core | v1.2 | 1/1 | Complete | 2026-03-04 |
| 17. Documentation Content — Reference & Support | v1.2 | — | Pending | — |
| 18. Branding, SEO & Deployment | v1.2 | — | Pending | — |
