# Inertial Dashboard — Production-Ready Visual Overhaul

> **Picking this up in a new chat session?** This plan is self-contained. Read [What's already there](#whats-already-there) so you don't break working backend, then execute phases in order.

## Goal

Transform the Electron dashboard from "internal-tool prototype" to a UI a real platform team (Instagram, Discord, a Mastodon admin) would be proud to ship. Specifically:

1. **shadcn/ui primitives** properly initialized (Card, Button, Sheet, Dialog, Tooltip, etc.)
2. **Lucide React icons** consistently across every surface (already a transitive dep)
3. **Thin-line typography** — Geist or Inter, weight 300-400, tight tracking
4. **Light + dark mode** with persisted theme preference + system-aware default
5. **Sidebar navigation** replacing top tabs (more sections, better discoverability)
6. **Simulated queue (demo mode)** so the dashboard renders rich content without runciter running
7. **Richer queue list items** — severity stripes, author avatars, relative time, channel chips
8. **Production polish** — skeleton loaders, toast notifications with undo, focus states, subtle animations

Outcome: a dashboard you'd demo to a federated mod or a Discord-scale platform team without apologising for the visuals.

---

## What's already there

**Don't break any of this.** Backend is working end-to-end (Claude Vision integrated, 77 tests passing).

- **Three tabs** — Queue, Compliance, Eval — at `apps/inertial-app/src/renderer/src/views/`. Functionality must survive.
- **HITL-KIT primitives** at `apps/inertial-app/src/renderer/src/components/hitl/`:
  - `MiniTrace`, `ApproveRejectRow`, `AiGenerationScale`, `HitlCard`, `BatchQueue`, `SubagentStatusCard`. These ARE shadcn-compatible (use `cn` util + Tailwind classes). Keep using them.
- **`@eval-kit/ui` primitives** in EvalView — `StatCard`, `Pill`, `ProgressRing`, `Sparkline`, `EmptyState`, `Card`. Workspace-linked package; keep using.
- **API client** at `apps/inertial-app/src/renderer/src/lib/api.ts`: `listQueue`, `getEventDetail`, `commitDecision`, `getSkills`, `listAudit`, `verifyAudit`, `getShadowAgreement`. Don't change these signatures — wrap them with the demo-mode override.
- **Crypto shim** at `apps/inertial-app/src/renderer/src/lib/crypto-shim.ts` aliases Node `crypto` → `globalThis.crypto` for the renderer bundle. Don't remove (eval-kit/core relies on it).
- **Existing custom components** to update or replace: `ChannelChip`, `ImageEvidence`, `QueueDetailPanel`, `QueueView`, `ComplianceView`, `EvalView`, `App.tsx`.
- **Stack**: Electron + Vite (electron-vite), React 19, Tailwind v4 via `@tailwindcss/vite`, shadcn registry consumer (HITL-KIT URLs in `components.json`).
- **Working backend**: runciter (`apps/runciter`) on :4001, gateway on :4000, real Claude Vision integration via `@inertial/agents-cloud`. `pnpm demo` boots all three concurrently.

---

## Phases

Each phase commits independently. Each phase ends with `pnpm test` + `pnpm --filter @inertial/app build` green.

### Phase 1 — Theme system + shadcn base components

Goal: light + dark mode via shadcn's CSS-variable token system. Add base shadcn primitives.

**Tokens — replace `apps/inertial-app/src/renderer/src/index.css`**

Replace the current `:root` dark-only block with shadcn's standard token system (research current shadcn-Tailwind-v4 syntax — the format changed in late 2024). Define BOTH a light theme (`:root`) and a dark theme (`.dark`). Token names: `--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground`, `--primary`, `--primary-foreground`, `--secondary`, `--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`, `--destructive`, `--destructive-foreground`, `--border`, `--input`, `--ring`, `--radius`. Add `@variant dark (&:is(.dark *));` for Tailwind v4 dark variant.

**Theme provider — new file**

`apps/inertial-app/src/renderer/src/lib/theme.tsx`:
- `ThemeProvider` context + `useTheme` hook
- State: `"light" | "dark" | "system"` (default "system")
- Persistence: `localStorage["inertial-theme"]`
- Effect: adds/removes `.dark` class on `<html>`; on "system", listens to `prefers-color-scheme` media query
- Wrap in `apps/inertial-app/src/renderer/src/main.tsx`

**Migrate HITL primitives to shadcn tokens**

Audit `apps/inertial-app/src/renderer/src/components/hitl/*.tsx` for `var(--accent-violet)`, `var(--card)`, etc. Map to shadcn equivalents. Most should already work since both use the same names; the inertial-specific ones (`--accent-violet`, `--accent-emerald`, etc.) need to be remapped to chart-style tokens or kept as supplementary tokens.

**Add base components**

```bash
cd apps/inertial-app
pnpm dlx shadcn@latest add button card sheet dialog popover tooltip select tabs badge separator scroll-area switch dropdown-menu command skeleton avatar sonner
```

⚠️ **Gotcha from prior sessions**: shadcn add may write files to `src/lib/` and `src/components/` (top-level) rather than the renderer-scoped path. If so, move them to `src/renderer/src/lib/` and `src/renderer/src/components/ui/`, then verify imports resolve via the existing `@renderer/*` alias in `tsconfig.web.json`.

**Verify Phase 1**

- `pnpm --filter @inertial/app build` green
- Add a temporary `<ThemeToggle />` to App.tsx, switch between light/dark, see colors flip
- Existing pages render in both themes without obvious breakage

### Phase 2 — Sidebar navigation + AppShell

Goal: replace top-tab nav with a persistent left sidebar. Add Skills + Settings sections.

**Files**

- New `apps/inertial-app/src/renderer/src/components/AppShell.tsx`: full-height grid (sidebar + main content), draggable Electron title bar across the top
- New `apps/inertial-app/src/renderer/src/components/Sidebar.tsx`: logo at top, nav list, footer (theme toggle, settings, runciter health dot polling `/healthz`)
- New `apps/inertial-app/src/renderer/src/components/SidebarNav.tsx`: list with `Lucide` icons + labels, active-state highlight, optional badge (e.g. pending queue count)
- Refactor `App.tsx` into `<AppShell><Outlet /></AppShell>` style — internal routing via simple `useState<Section>` (no router yet) or extract a tiny `Router` context
- New `apps/inertial-app/src/renderer/src/views/SkillsView.tsx`: split skills table out of Compliance into its own page — adds room for per-skill enable/disable toggles + cost summary
- New `apps/inertial-app/src/renderer/src/views/SettingsView.tsx`: instance picker (still hardcoded for now), demo-mode toggle, theme picker, "rotate API key" reminder card

**Sidebar sections**

| Section | Icon (lucide) | Notes |
|---|---|---|
| Queue | `LayoutGrid` | Pending count badge |
| Skills | `Plug` | Active skills + tools registry |
| Compliance | `Shield` | Audit feed + chain integrity |
| Calibration | `Activity` | (was Eval) |
| Settings | `Settings` | Theme, demo mode, instance |

**Verify Phase 2**

- All old functionality still reachable via sidebar
- Theme toggle in sidebar footer persists across reloads
- Health dot turns red when runciter is killed
- Sidebar collapses gracefully on narrow widths (use `<Sheet>` for mobile-style overlay if needed)

### Phase 3 — Queue redesign + demo data

Goal: queue items look like real moderation cards. Demo mode renders rich content without backend.

**Demo data**

`apps/inertial-app/src/renderer/src/lib/demo-data.ts`: ~15 curated events. Each is a full `(ContentEvent, StructuredSignal, AgentTrace[])` triple covering one signal class:

1. Clean post (decided, approved) — for context
2. URL spam → quick queue
3. Mild insult → quick queue
4. **Severe threat → deep queue** with cloud escalation in trace (local 0.50, anthropic 0.95, threat=0.95)
5. **NSFW image → deep queue** with bbox overlay + Claude Vision rationale
6. Identity-hate → deep queue
7. **Self-harm imagery → escalation queue** (multi-reviewer required)
8. **Brigading suspicion → escalation** with similarity-cluster evidence pointers
9. Multi-modal: toxic text + clean image → quick (text rule fired)
10. Multi-modal: clean text + nsfw image → deep (image rule fired)
11. Already-decided / approved
12. Already-decided / removed
13. Borderline toxicity that triggered shadow run (compliance tab gets agreement data)
14. Image with high `image_minor_present` score → escalation
15. Spam-link-presence on otherwise clean text (regex false-positive demo)

Each event needs realistic timing, channels, evidence, and traces — not lorem ipsum. Goal: every screenshot looks like a real federated-instance moderation case.

**Demo mode toggle**

- New `apps/inertial-app/src/renderer/src/lib/demo-mode.tsx`: context provider + `useDemoMode` hook
- Persistence: `localStorage["inertial-demo"]` (`"on" | "off"`, default `"off"` — discoverable in Settings)
- Update `lib/api.ts`: at the top of every API function, check demo mode; if on, return curated mock data via `Promise.resolve()`. Otherwise hit runciter as today.
- Visual indicator: when demo mode is active, sidebar footer shows a small "DEMO" pill so the user can never confuse mock data for live signals

**Queue list redesign**

New `apps/inertial-app/src/renderer/src/components/QueueListItem.tsx` (shadcn `Card`-based):

```
┌────────────────────────────────────────────────────────┐
│ ▌ [avatar] @alice · 2m ago     [DEEP] [pending]       │
│   "you're so stupid I genuinely can't believe..."     │
│   [toxic 0.98] [insult 0.93] [obscene 0.66]           │
└────────────────────────────────────────────────────────┘
```

- Left edge: 4px severity stripe (emerald < 0.5, amber 0.5–0.8, rose > 0.8)
- Avatar: shadcn `Avatar` with author initials (deterministic color)
- Header row: handle + relative time on left, queue badge + state badge on right
- Body: text preview (truncate at ~120 chars) OR `🖼 image post` with thumbnail OR `🎬 video` etc.
- Channel chips inline: top 3 channels by probability with mini probability bars
- Hover state: slight border color shift + cursor:pointer
- Selected state: border-primary, subtle inset glow

**Detail panel polish**

`QueueDetailPanel.tsx`: rebuild sections using shadcn `Card`:
- **Event** card: instance, author (with `AuthorBadge` component), modalities, posted time
- **Content** card: text body with proper typography
- **Media** card: existing `<ImageEvidence>` (keep), maybe add lightbox on click
- **Channels** card: list of `<ChannelChip>` (keep, but tighten spacing)
- **Traces** card: collapsible per-agent groups with `<MiniTrace>`
- **Decision** card: rationale `Textarea` + approve/remove/escalate buttons (shadcn Button variants: default, destructive, outline)
- Sticky decision card at bottom of scroll

**New components to build**

- `AuthorBadge.tsx`: avatar + handle + optional "⚠ N prior actions" warning if `priorActionCount > 0`
- `SeverityIndicator.tsx`: 4px-wide colored stripe driven by max channel probability
- `RelativeTime.tsx`: "2m ago" / "1h ago" / "yesterday" — pure helper, no deps
- `EventPreview.tsx`: shows text preview OR media thumbnail OR generic placeholder

**Verify Phase 3**

- Toggle demo mode in Settings, queue fills with curated content immediately
- Toggle off, queue reflects live runciter data
- Each demo case looks visually polished
- Selecting an item opens the detail panel; layout is tight, hierarchy clear

### Phase 4 — Compliance + Calibration polish

Refresh the other two views with new tokens + shadcn `Card` components.

**ComplianceView.tsx**:
- Stat tiles: rebuild with shadcn `Card` + Lucide icons. Add subtle trend indicators where appropriate.
- Skill table: extract to its own SkillsView (Phase 2 did this); leave a "Skills →" link card here pointing to that section.
- Audit feed: use shadcn `ScrollArea`, monospace entries, color-code by `kind` (signal-generated = blue, decision-recorded = green, queue-routed = amber, etc.).
- "Verify chain" button (already exists conceptually) — make it explicit + show last-verified timestamp.

**SkillsView.tsx** (new):
- Skills table with provider, execution model, privacy badge, cost, mode (production/shadow)
- Per-skill toggle to disable (writes to localStorage, demo only — real toggle needs runciter API additions out of this scope)
- Tools section listing the registered tools

**EvalView.tsx**: keep eval-kit/ui primitives. Just verify they cascade tokens correctly in light mode.

### Phase 5 — Polish layer

- **Toasts**: install `sonner` via shadcn (Phase 1). Wire approve/remove/escalate to toast: "Approved · UNDO" with 5s undo window. Undo restores `state` to "pending".
- **Skeleton loaders**: shadcn `Skeleton` for queue list, detail panel, audit feed, every async surface.
- **Focus rings**: shadcn defaults (`focus-visible:ring-2 focus-visible:ring-ring`) — verify all interactive elements have them.
- **Subtle animations**: `transition-colors` on hover states, `animate-in fade-in duration-200` on tab switches via `tw-animate-css` (a Tailwind plugin shadcn includes).
- **Empty states**: every empty surface gets a Lucide icon + headline + supporting copy + CTA. Examples: empty queue → "All caught up. Nothing to review." with `CheckCircle2` icon. Empty audit → "Waiting for the first event."
- **Keyboard help overlay**: redesign the existing `?` overlay using shadcn `Dialog` with proper styling.
- **Drag region**: in Electron, the title bar should be draggable. Set `-webkit-app-region: drag` on the AppShell header strip.

### Phase 6 (optional) — delight

Drop in if there's session time:
- Confetti via `canvas-confetti` on first decision committed (one-shot, dismissable forever)
- Micro-interactions on approve/remove buttons (color flash, check animation)
- Smooth list virtualization with `react-virtuoso` if queue ever exceeds 50 items
- Sound effects on decision (toggle in settings, off by default)

---

## Dependencies to add

```bash
# All shadcn base primitives (Phase 1)
cd apps/inertial-app
pnpm dlx shadcn@latest add button card sheet dialog popover tooltip select tabs badge separator scroll-area switch dropdown-menu command skeleton avatar sonner

# Optional animation utilities (Phase 5/6)
pnpm --filter @inertial/app add tw-animate-css
pnpm --filter @inertial/app add canvas-confetti  # phase 6 only
```

No additional workspace deps — everything else stays as-is.

---

## Critical files (full inventory)

### Modify

- `apps/inertial-app/src/renderer/src/index.css` — light + dark token block
- `apps/inertial-app/src/renderer/src/main.tsx` — wrap in `ThemeProvider` + `DemoModeProvider`
- `apps/inertial-app/src/renderer/src/App.tsx` — replace top-tab layout with `<AppShell>`
- `apps/inertial-app/src/renderer/src/lib/api.ts` — demo-mode override at the top of each function
- `apps/inertial-app/src/renderer/src/views/QueueView.tsx` — list using new `QueueListItem`
- `apps/inertial-app/src/renderer/src/views/QueueDetailPanel.tsx` — section cards
- `apps/inertial-app/src/renderer/src/views/ComplianceView.tsx` — refresh with shadcn `Card`
- `apps/inertial-app/src/renderer/src/views/EvalView.tsx` — verify token cascade
- `apps/inertial-app/src/renderer/src/components/ChannelChip.tsx` — tighten with shadcn tokens
- `apps/inertial-app/src/renderer/src/components/ImageEvidence.tsx` — minor polish
- `apps/inertial-app/components.json` — verify shadcn registry config (already pointing at HITL-KIT for some components — keep both)

### Create

- `apps/inertial-app/src/renderer/src/lib/theme.tsx`
- `apps/inertial-app/src/renderer/src/lib/demo-mode.tsx`
- `apps/inertial-app/src/renderer/src/lib/demo-data.ts`
- `apps/inertial-app/src/renderer/src/components/AppShell.tsx`
- `apps/inertial-app/src/renderer/src/components/Sidebar.tsx`
- `apps/inertial-app/src/renderer/src/components/SidebarNav.tsx`
- `apps/inertial-app/src/renderer/src/components/ThemeToggle.tsx`
- `apps/inertial-app/src/renderer/src/components/QueueListItem.tsx`
- `apps/inertial-app/src/renderer/src/components/AuthorBadge.tsx`
- `apps/inertial-app/src/renderer/src/components/SeverityIndicator.tsx`
- `apps/inertial-app/src/renderer/src/components/RelativeTime.tsx`
- `apps/inertial-app/src/renderer/src/components/EventPreview.tsx`
- `apps/inertial-app/src/renderer/src/views/SkillsView.tsx`
- `apps/inertial-app/src/renderer/src/views/SettingsView.tsx`
- `apps/inertial-app/src/renderer/src/components/ui/*.tsx` (auto-generated by shadcn add)

---

## Verification per phase

| Phase | Manual check | Automated |
|---|---|---|
| 1 | Theme toggle works, both modes rendered intentionally, no obvious regression | `pnpm --filter @inertial/app build` |
| 2 | Every old route reachable via sidebar; settings page exists; health dot reflects runciter status | `pnpm --filter @inertial/app build` |
| 3 | Demo mode toggle populates queue without backend; turning it off restores live data; queue items look polished | `pnpm test` (no regressions) |
| 4 | Compliance + Calibration look polished in both themes | `pnpm --filter @inertial/app build` |
| 5 | Toasts fire on decisions; skeletons render during loads; focus visible everywhere; keyboard shortcuts still work | `pnpm test` (77 tests still passing) |
| Final | Take screenshots in light + dark, both demo and live modes; commit with screenshots in `docs/screenshots/` | `pnpm exec turbo run typecheck --force && pnpm exec turbo run build --force` |

---

## Out of scope

- URL-based routing (deep links to specific queue items) — defer
- Real-time SSE updates — currently polling 4–6s, fine for now
- Mobile/tablet responsive — Electron desktop is the only target
- Internationalization (i18n)
- Authentication
- Multi-instance picker (UI exists in Settings but still hardcoded to `smoke.local`)
- New backend features — this is purely a frontend overhaul

---

## Notes for the agent picking this up

- **Don't lose existing functionality**. The keyboard shortcuts (`j/k/a/r/e/Esc/?`) are load-bearing for moderator workflow. Preserve them through every refactor.
- **Don't break the API contracts**. `lib/api.ts` is the boundary; demo mode wraps each function but doesn't change signatures.
- **Tailwind v4 + shadcn**: shadcn updated their setup for Tailwind v4 in late 2024. Verify current syntax for theme variables — older guides reference v3 (`tailwind.config.ts`-based theme).
- **Test in both light and dark for every change**. Easy to forget; manifests as unreadable contrast in one mode only.
- **Commit per phase**. Avoids one giant unreviewable diff. If a phase takes more than a session, commit progress under a phase-N-WIP branch.

---

## Reference: stack snapshot

- Electron 33 + electron-vite 2.3
- React 19, Tailwind v4 with `@tailwindcss/vite`
- TypeScript strict mode (`verbatimModuleSyntax`, `noUncheckedIndexedAccess`)
- shadcn registry consumer (HITL-KIT URL pattern)
- pnpm 10.4 (note: `onlyBuiltDependencies` already set in root package.json for native deps)
- React 19 type quirk: `JSX.Element` is now `React.JSX.Element`. We removed explicit return-type annotations to dodge this — if you re-add them, use `React.JSX.Element`.
