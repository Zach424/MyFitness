# Iteration 052: Accessibility state matrix

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round makes the newly lazy action-definition and food-photo workbenches, their parent launchers and the highest-risk archive dialog reproducibly usable with an H5 keyboard. Acceptance requires stable accessible names and status announcements, pointer-equivalent Enter/Space completion, deterministic focus entry/return across route and dialog closure, reduced-motion compatibility and selection/destructive states that do not depend on color. Narrow browser evidence and the existing wide lifecycle must remain green without claiming untested screen-reader or physical-device support.

This round adds no API, migration, provider, cloud service, credential, dataset, medical interpretation, nutrition target or training prescription.

## 2. Structure, technology and design state

- `apps/client/src/lib/accessibility.ts` now owns dependency-free explicit button activation, H5 focus lookup and delayed route-focus helpers. Unit tests cover pointer, Enter, Space, repeat, disabled, found and missing-target behavior.
- Home quick actions/navigation, workout action launch/edit controls, the exercise catalog, nutrition photo launcher and the food-photo workbench use explicit activation on Taro's H5 custom button elements.
- Stable IDs define route entry and return points. The archive dialog has labelled title/description relationships and safe initial/cancel/success focus targets; workflow feedback is polite and atomic.
- Candidate review keeps textual `PROOF`, confidence and selection evidence plus `aria-pressed`; focus rings use the established mineral-blue/paper visual grammar.
- Reduced-motion wildcards in ten page stylesheets are scoped beneath their page roots so emulation cannot alter Taro's shared router container.
- Technology remains TypeScript strict mode, Taro 4/React, Vitest and Playwright. No runtime dependency was added.

## 3. Implementation method

### Make activation real, not only semantic

Taro H5's `taro-button-core` does not gain native Enter behavior from `role="button"` and `tabIndex`. The shared adapter feeds pointer, Enter and Space into one guarded callback, blocks repeated/disabled keyboard events and prevents Space scrolling. Critical controls adopt it explicitly instead of relying on a global event listener.

### Restore focus across Taro route timing

Child workbenches focus their stable back control after the router's 350 ms transition. Parents remember only a non-sensitive focus ID and refresh their active catalog before focusing the original target or a stable fallback. The photo workbench returns to its launcher; an archived action falls back to the manager because its edit trigger is intentionally removed. WeApp never touches `document`.

### Model risky dialog and state transitions

Archive opens on the non-destructive cancel action, cancellation returns to the triggering action and success focuses the new-action button. Status areas expose polite atomic updates. Candidate selection publishes a pressed state while visible text carries proof, confidence and choice meaning.

### Scope motion and review the evidence

The first reduced-motion pass used page stylesheet wildcards that could affect the Taro router container. Each selector is now rooted under its page class. Browser automation combines behavior/semantic assertions with inspected screenshots of the dialog, keyboard workbench and photo proof state.

### Rebaseline only measured production growth

The original client-quality gate correctly rejected the accessibility additions. After both production trees were measured, only the H5 total, WeApp total and largest-page ceilings moved narrowly to 2,421,000, 823,000 and 40,000 bytes. Entry, largest async route and WeApp vendor limits did not change.

## 4. Validation evidence

- Focused accessibility validation passed 1 file / 9 tests.
- Repository-wide unit validation passed 63 files / 280 tests.
- Strict workspace TypeScript and repository formatting passed.
- Focused workout/action and nutrition/photo browser validation passed 2/2 tests.
- The complete main H5 browser suite passed 40/40 tests in 2.1 minutes, including existing wide layouts.
- H5 and WeApp production builds passed. The non-blocking known Taro webpack-cache serialization warning remains registered.
- `pnpm client:verify` passed: H5 total 2,420,203 bytes, entry 318,996 bytes and largest async JavaScript 186,481 bytes; WeApp total 822,748 bytes, vendor 18,915 bytes and largest page 39,748 bytes (`pages/workouts`).
- Production dependency audit exited successfully with zero critical/high and nine registered moderate Taro build-chain findings.
- Inspected evidence: `iteration-052-action-archive-focus-mobile.png`, `iteration-052-keyboard-action-workbench-mobile.png` and `iteration-052-keyboard-food-photo-mobile.png`.

The integration, dedicated OIDC and AI/evaluation suites were not rerun because API, identity, prompts, validators and workers did not change. The complete main browser suite exercised the unchanged API fixture and production H5 build end to end.

## 5. Problems found and experience captured

- An accessible name plus `role` and `tabIndex` is not equivalent to activation on a framework custom element. A real Tab/Enter session exposed the gap that DOM attribute inspection alone missed.
- Immediate route focus raced Taro's transition. A stable ID plus bounded post-transition focus is more deterministic than focus by transient component reference.
- Browser focus can arrive after pointer-originated navigation without a visible `:focus-visible` ring. Programmatically restored high-risk targets therefore receive a narrow explicit `:focus` style; general pointer behavior still uses `:focus-visible`.
- A global reduced-motion wildcard inside a page stylesheet still reaches framework-owned ancestors/containers after bundling. Page-root scoping protects the router while preserving the intended motion reduction.
- Screenshot review again caught Taro H5 button text-color inheritance, this time in the archive dialog. Explicit design-token colors keep cancel and destructive labels visible.
- Full E2E refreshes historical screenshots. Only the three new iteration artifacts were retained; generated changes to established evidence were restored to avoid unrelated visual noise.
- Budget gates should fail before being changed. The old ceiling rejected real growth, measurements identified exactly three affected dimensions and the rebaseline stayed below the next kilobyte-scale boundary.

## 6. Global state review, remaining risks and next step

The critical lazy action/photo workflows now have automated H5 keyboard, focus, live-status, reduced-motion and non-color-only evidence. This still does not prove VoiceOver, TalkBack, physical keyboards on mobile devices or the WeChat runtime; those remain explicit pre-beta gates. Local MinIO, fixture AI and browser evidence remain development proof only.

Iteration 053 should build deterministic offline and request-failure recovery for record editors and the lazy action/photo workbenches. It must distinguish network absence from server refusal, preserve only safe page-owned unsaved input, provide explicit idempotent retry, prevent duplicate or fake success and keep useful visible evidence after failure. Sensitive photos must not be background-synchronized or copied outside their existing consent/custody boundary. Managed deployment, real identity/providers, custody/telemetry owners, policy/filing and paid canaries remain parked until the user supplies them.

## 7. References

- [Iteration 051 archive](051-lazy-food-photo-proof-workbench.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [ADR-0034](../architecture/decisions/0034-explicit-plan-workout-link.md)
- [ADR-0050](../architecture/decisions/0050-taro-keyboard-focus-contract.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
