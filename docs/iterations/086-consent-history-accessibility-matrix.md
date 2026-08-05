# Iteration 086: Consent-history accessibility matrix

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round binds the new consent-history authority states to a narrow/large-text and keyboard contract. Acceptance requires 320 px reflow under an exact synthetic 2× component-text override without horizontal scrolling, readable initial-error/retained-prefix/footer content, pointer plus Enter/Space equivalence, stable retry focus and an independently available current revocation control.

The round changes history-specific CSS and adds one browser matrix, but no API, contract, migration, persistence, polling, consent mutation, medical interpretation, cloud service or external provider.

## 2. Structure, technology and design state

- The consent-history selectors in `privacy/index.scss` expose four component-owned size variables for history text, plus content-driven button line height and explicit long-token wrapping.
- `.consent-history__item-copy` accepts grid shrinking so long version labels and locale timestamps wrap inside the ruled ledger instead of widening it.
- `privacy.spec.ts` adds one 320 × 844 real API flow with exact 16/18/20/22 px component overrides and a keyboard-only history operation sequence.
- The existing shared `buttonActivationProps` and delayed H5 retry focus remain the only interaction runtime; no new dependency or global key listener is added.

## 3. Implementation method

### Scale only the bounded surface

History labels, factual text, status copy, indexes and action text retain their 8/9/10/11 px defaults behind four variables. The browser test doubles those values without changing the surrounding privacy page or Taro's root viewport conversion, which keeps the round scoped while proving the newly introduced surface can reflow at an exact bounded scale.

### Prefer wrapping over clipping

Toggle/retry/refresh/continuation controls retain their minimum target height but use a unitless line height. Failure titles/notes, item titles and timestamps may wrap anywhere, and the item-copy grid child has `min-width: 0`. The browser requires the privacy scroll plane's `scrollWidth` to equal its 320 px `clientWidth` in unknown, ready and retained-stale phases.

### Complete the activation matrix

One sequence uses Space to open into an injected 503, Enter to retry the first page, Space to refresh the latest page, Enter to request an older suffix into another 503, Space to retry the exact frozen cursor and Enter to collapse. Existing pointer scenarios still cover empty, normal continuation and three failure operations.

### Keep claims precise

The test overrides only the four history variables to exact 2× values and runs Chromium at 320 × 844. This proves component reflow and Taro H5 keyboard behavior in that environment, not real browser/system text scaling, screen-reader narration or a physical WeChat keyboard.

## 4. Validation evidence

- The three consent-history real API browser scenarios passed together, covering standard pointer states, all failure authority operations and the new keyboard/large-text matrix.
- Repository-wide unit validation passed 80 files / 407 tests; strict workspace TypeScript, repository formatting and zero-diff checks passed.
- The complete main browser suite passed 92/92 in 3.0 minutes; the correctly sequenced OIDC build/suite passed 3/3, retaining 95 browser tests.
- Normal H5, OIDC H5 and WeApp production builds passed. API/administrator, PostgreSQL integration and AI suites were not rerun because this round changes only client CSS and browser coverage; their iteration-085 evidence remains unchanged.
- `pnpm client:verify` passed without a budget change: H5 total 2,800,513 bytes, entry 319,238 and largest async JavaScript 205,178; WeApp total 1,064,360, vendor 19,338 and largest page 55,697. Forbidden runtime-marker scans are empty.
- Production dependency audit reports zero critical/high and nine registered moderate Taro build-chain findings.
- Obsidian status and this knowledge archive are written and verified byte-for-byte before commit.
- Inspected evidence: `iteration-086-consent-history-large-text-mobile.png`.

## 5. Problems found and experience captured

- Fixed pixel text can pass a narrow screenshot without proving enlarged-text reflow. Component variables make an exact scaling contract executable without redesigning the whole page or interfering with framework viewport conversion.
- Enlarged text needs both scalable glyphs and layout permission: grid children require `min-width: 0`, long tokens need an explicit wrap rule and controls cannot rely on one fixed line box.
- A keyboard flow should use both Enter and Space across real requests. Inspecting `tabIndex` or testing only one action does not prove Taro custom-element activation parity.
- A successful collapse changes the button's accessible name from `收起历史` to `查看全部凭证`; browser assertions must reacquire the node through its new accessibility state rather than hold a stale role/name locator.
- The first targeted run reached correct collapse behavior but failed only on that stale-name assertion. Updating the assertion produced a clean rerun and prevented a false product regression.
- Full browser runs regenerate date-bearing historical screenshots. All previously accepted artifacts were restored, leaving only the new 320 px evidence.
- Correction recorded during iteration 087: the first committed implementation used equivalent `rem` values and a 200% root-font injection. Ordinary 390 px visual review revealed that Taro already controls root `rem` sizing, so normal history text became oversized. The defaults were restored as component variables and the evidence was regenerated with exact variable overrides. This archive now describes the accepted implementation rather than preserving an inaccurate scaling claim.

## 6. Global state review, remaining risks and next step

Consent history now has bounded pointer, keyboard, focus, narrow and synthetic enlarged-component-text evidence. It still lacks real system-text/screen-reader/WeChat-device proof, and the current component can receive a late asynchronous result after its panel is collapsed unless the response is explicitly invalidated.

Iteration 087 should make collapse/unmount a lifecycle boundary for initial, refresh and continuation requests. Late success/failure must not update hidden history or move focus to a hidden retry; one explicit reopen should start a fresh read. Managed deployment and real identity/provider/object-storage/custody/telemetry/policy inputs remain parked until the user supplies them.

This archive is also the iteration-086 knowledge note mirrored into Obsidian; `docs/PROJECT_STATUS.md` remains the authoritative global state.

## 7. References

- [Iteration 085 archive](085-consent-history-read-authority.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [ADR-0050](../architecture/decisions/0050-taro-keyboard-focus-contract.md)
- [ADR-0079](../architecture/decisions/0079-bounded-consent-receipt-history.md)
- [ADR-0080](../architecture/decisions/0080-consent-history-read-authority.md)
- [ADR-0081](../architecture/decisions/0081-consent-history-accessibility-matrix.md)
- [Privacy ownership model](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [Architecture baseline](../architecture/ARCHITECTURE.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
