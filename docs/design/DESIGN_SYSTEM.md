# Design system baseline

Status: implemented and visually validated through iteration-014 administrator support evidence

Working brand: 衡迹 / MyFitness

Audience: adult fitness beginners and returners

Primary page job: understand today's next action and record it quickly

## Direction

The interface borrows from a well-kept training logbook: deliberate marks, measured spacing, clear units, and visible revisions. It avoids a generic collection of bright progress rings and avoids using aggression or shame as motivation.

The memorable element is the **Rhythm Rail / 节律轨**: a vertical rail that pairs planned actions with completed evidence across training, meals, body signals, and recovery. A plan mark is outlined; a confirmed record is filled; an AI estimate is hatched until the user confirms it. This single visual grammar makes plan, actual, and uncertainty legible throughout the product.

## Tokens

### Color

| Token name     | Hex       | Role                                                               |
| -------------- | --------- | ------------------------------------------------------------------ |
| Ink / 墨尺     | `#142426` | Primary text and high-contrast controls                            |
| Mineral / 矿蓝 | `#244C66` | Brand anchors, links, plan marks                                   |
| Juniper / 杜松 | `#3F756B` | Confirmed records and steady progress                              |
| Pulse / 脉冲   | `#E96A5B` | Exertion, time-sensitive attention, never routine error decoration |
| Mist / 薄雾    | `#F2F6F5` | App surface and grouped backgrounds                                |
| Paper / 纸白   | `#FCFDFC` | Cards, forms, reading surfaces                                     |
| Warning / 琥珀 | `#A96821` | Risk checks and uncertain data                                     |

Accessibility constraints:

- Body text must meet WCAG AA contrast against its surface.
- Color never carries record status alone; fill pattern, icon, label, or shape also changes.
- Pulse is reserved for a small number of meaningful moments, not used as the brand background.

### Type

- Display and training labels: **Barlow Condensed**, used for short Latin labels, dates, and strong numeric hierarchy. Its proportions echo equipment plates and printed training cards.
- Chinese body and controls: **Noto Sans SC**, with system sans-serif fallbacks for predictable rendering across WeChat and H5.
- Measurements and machine-readable values: **JetBrains Mono**, limited to weights, repetitions, energy, times, and record identifiers.

Font files must be self-hosted or packaged only after license and bundle-size review. The first shell may use fallbacks while preserving roles and metrics.

### Shape and spacing

- Base spacing unit: 4 px; common gaps: 8, 12, 16, 24, 32.
- Interactive target: at least 44 × 44 CSS pixels.
- Card radius: 14 px; compact control radius: 10 px; pills only for tags/status, not every button.
- Border: 1 px quiet dividers; 2 px for selected/focused states.
- Content maximum on H5: 720 px for the primary personal dashboard.

### Motion

- One orchestrated Today-page entrance: the rhythm rail draws once, then confirmed marks settle into place.
- Record confirmation uses a short 160–220 ms fill transition.
- No ambient floating decoration. Respect `prefers-reduced-motion` and reduce the rail to a static state.

## Mobile information layout

```text
┌──────────────────────────────┐
│ 周六 7/18          恢复：尚可 │
│ 今天只推进一件事：完成下肢训练 │
├──────┬───────────────────────┤
│      │ 09:00  体重 72.4 kg    │
│  节  │                       │
│  律  │ 12:30  午餐  待记录     │
│  轨  │                       │
│      │ 19:00  下肢 A  计划 45m │
├──────┴───────────────────────┤
│ 为什么这样安排？             │
│ 近两次训练完成度稳定，今天不加量 │
├──────────────────────────────┤
│ 今天   记录   计划   教练   我的 │
└──────────────────────────────┘
```

## Wide H5 layout

```text
┌──────────────┬─────────────────────────────┐
│ 日期与周目标  │ Today / 节律轨               │
│ 训练周 03     │ plan and actual             │
│              ├─────────────────────────────┤
│ 快速记录      │ Reason / trend / next action │
└──────────────┴─────────────────────────────┘
```

Wide layout adds context but does not turn the product into a dense enterprise dashboard.

## Content voice

- Calm, concrete, active, and non-judgmental.
- Say “今天比计划少完成 2 组，可以保留原计划或降低明天强度”, not “你没有坚持”。
- Estimated content says “可能是”“范围”“请确认”, never presents visual inference as fact.
- Buttons describe the result: “保存训练”“采用计划”“删除照片”, not “提交” or “确定”.
- Empty states give one next action; error states explain what remains safe and how to retry.

## Self-critique before implementation

The first palette draft leaned toward the common near-black plus acid fitness aesthetic. It was revised to mineral blue, juniper, and paper surfaces because the product's central behavior is sustained observation rather than maximum-intensity performance. The single expressive risk is now the Rhythm Rail and its fill grammar; the rest of the interface stays quiet so that records remain readable.

## Implementation review — iteration 001

The first Taro implementation uses shared CSS variables from `packages/design-tokens`, keeps Chinese text on system sans-serif fallbacks, and reserves monospaced treatment for measurements. The Today shell contains readiness, the plan-vs-actual Rhythm Rail, an explanation card, quick recording actions, persistent navigation, and an explicit non-medical AI note.

Reviewed evidence:

- [390 × 844 mobile production capture](../../output/playwright/iteration-001-mobile.png)
- [1280 × 900 responsive H5 production capture](../../output/playwright/iteration-001-wide.png)

The review found and corrected a wide-layout collision between the profile mark and fixed navigation, a missing favicon request, and generic button semantics in the accessibility tree. The final browser run reports zero console errors or warnings and exposes primary actions as buttons. The lunch estimate remains visibly uncertain and produces a confirmation-required message instead of silently becoming a record.

Still open before the complete client design can be called validated: 320 px width, large text, keyboard focus traversal, reduced motion, and the full loading/empty/edited/offline/error state matrix.

## Implementation review — iteration 004

The body/recovery page turns the logbook direction into a working two-column ledger. The editor groups nine measurements into “身体指标” and “恢复感受”, uses large monospaced values for physical readings, and changes to five explicit tiles for subjective scores. Unit controls stay adjacent to the value; copy explains measurement conditions without calling guardrails clinical ranges.

The right ledger lists source, confirmation state and revision. Editing says that a new historical version will be created, deletion explains that the list entry is removed while audit history remains, and the history sheet distinguishes creation/update/deletion with text plus mark shape. The selected metric drives a restrained seven-entry bar trend; an empty trend gives one next action rather than an invented insight.

Reviewed evidence:

- [390 × 844 mobile history capture](../../output/playwright/iteration-004-records-mobile.png)
- [1440 × 1000 wide empty-ledger capture](../../output/playwright/iteration-004-records-wide.png)

The production-browser review exercised create, update, history and delete through PostgreSQL. It caught a CORS preflight omission for the delete revision header that direct API integration tests could not reveal. After correction, mobile and wide runs reported no page-script or console errors. Open items remain offline/retry visualization, stale-revision recovery UI, 320 px/large-text review and a confirmed-versus-AI-candidate screen once photo/import proposals exist.

## Implementation review — iteration 005

The workout page turns the logbook into a set-level evidence sheet. A restrained starter catalog adds movements without opening a modal; the active exercise uses an ordered table with explicit completion, reps or minutes, load or distance, RPE and removal. Monospaced values support quick comparison, while the completed state uses both a filled square and check mark. A live three-part summary distinguishes completed sets, completed-only volume and active minutes.

Repeat-last appears only when a real prior record exists and explains that old completion will not be copied. Editing announces that a new version will be created. Pain at 6+ produces a plain-language stop/escalation message, and header copy says volume is an observation—not a quality score or a number to maximize. History uses a focused mobile sheet with readable action labels and complete revision totals.

Reviewed evidence:

- [390 × 844 mobile workout-history capture](../../output/playwright/iteration-005-workouts-mobile.png)
- [1440 × 1000 wide editor/empty-ledger capture](../../output/playwright/iteration-005-workouts-wide.png)

The production-browser flow saved the default `3/3 · 360 kg`, repeated it as `0/3`, explicitly completed the new sets, revised the first set to reach `384 kg · v2`, inspected both snapshots and deleted only the new record. Mobile and wide runs reported no page-script or console errors. Open items remain 320 px/large-text review, keyboard focus, offline/stale recovery, exact timestamp entry and denser set models such as supersets or rest intervals.

## Implementation review — iteration 006

The nutrition page uses a faint preparation grid and restrained amber accents to distinguish food context without introducing “good/bad” colors. Meal type, catalog source, search and custom entry follow the same paper-sheet hierarchy. Before adding, each food card exposes its default portion and reference kcal; after adding, actual amount, household unit, approximate grams and P/C/F stay together.

The summary uses one larger kcal figure and three equal macro fields, with copy that says values vary by brand, cut and cooking. Favorites use a star plus an accessible pressed label; recent foods are real record projections. Repeat copy explicitly asks for today's correction. History retains action text and full revision totals rather than presenting a chart as dietary advice.

Reviewed evidence:

- [390 × 844 mobile meal-history capture](../../output/playwright/iteration-006-nutrition-mobile.png)
- [1440 × 1000 wide editor/empty-ledger capture](../../output/playwright/iteration-006-nutrition-wide.png)

The production-browser flow favorited rice, saved `393 kcal · P 41.25g`, repeated it, changed rice to 200g for `458 kcal · P 42.6g · v2`, inspected both snapshots and deleted the repeated record. Mobile and wide runs reported no script/console errors. Open items remain provider-backed branded search, editable household-unit gram conversions, AI candidate review, eating-disorder content review, 320 px/large-text, keyboard and offline/stale recovery.

## Implementation review — iteration 003

The adult onboarding flow extends the training-logbook direction into three numbered sheets: basics, sustainable rhythm, and safety/authorization. Mobile uses one calm reading column; wide H5 adds a narrow “your data, your terms” explanation rail instead of duplicating controls. Choice chips preserve 44 px targets, selected states use border plus fill, and risk selection changes both text and color.

Safety copy deliberately says the screen is not a diagnosis. Selecting any risk item marks the account as “需先取得专业许可” and pauses personalized training planning; it does not block record ownership or silently infer a disease. The final step separates adult confirmation, terms, privacy and health-data purposes into four explicit controls while the backend records three immutable versioned consent events.

Reviewed evidence:

- [390 × 844 mobile risk/consent capture](../../output/playwright/iteration-003-onboarding-mobile.png)
- [1440 × 1000 wide onboarding capture](../../output/playwright/iteration-003-onboarding-wide.png)

The review found and corrected a browser-only build-time environment failure, restored a desktop entry through “我的”, and removed a Taro DOM reconciliation error caused by changing the submit button/loading structure during persistence. The final production-browser run completes a real PostgreSQL-backed submission with zero page-script/console errors. Runtime constants were also split from Zod contracts, reducing the onboarding H5 chunk from about 452 KiB to 78.5 KiB.

## Implementation review — iteration 007

Today now behaves as a quiet evidence surface instead of a fixture-driven recommendation screen. Confirmed facts are ordered on the Rhythm Rail; recovery uses an em dash when evidence is absent, and 7/30/90-day tabs are explicitly called observation windows rather than goals. The empty state gives one recording action while retaining the same two-column hierarchy on wide H5.

Reviewed evidence:

- [390 × 844 mobile confirmed-evidence capture](../../output/playwright/iteration-007-today-mobile.png)
- [1440 × 1000 wide empty-state capture](../../output/playwright/iteration-007-today-wide.png)

The production-browser review caught two presentation leaks that functional assertions alone missed: the internal `score_1_5` unit was visible to users, and the first wide screenshot was taken while the recovery card was still loading. The final state renders `/5`, waits for the dashboard response, and says that no score is generated without recovery evidence. Open items remain manual refresh/retry, offline cache, 320 px and large-text review, keyboard focus and plan-versus-actual design after a real plan exists.

## Implementation review — iteration 008

The Plan page extends the logbook with a **Week Fold / 周折页**: seven day tabs read like folded notebook leaves, and the active day expands into a concrete session with role, time, intensity and substitutions. The interaction has one job—review the evidence and then accept, change or skip—rather than turning the week into a pressure heatmap. Wide H5 keeps the selected session at left and reasons, confirmed evidence and qualitative nutrition focuses at right; mobile preserves the same reading order in one column.

Alternatives are direct pressed controls, current status includes text and version, and the saved history distinguishes generated, modified, accepted and skipped snapshots. Recovery absence reduces the schedule without inventing confidence. Nutrition copy remains about regularity, variety, hydration and preference-compatible protein; it does not introduce energy budgets or “good/bad” food scoring.

Reviewed evidence:

- [390 × 844 mobile accepted-plan capture](../../output/playwright/iteration-008-plans-mobile.png)
- [1440 × 1000 wide weekly-review capture](../../output/playwright/iteration-008-plans-wide.png)

The browser review changed the mobile capture to reset the plan scroll container before taking evidence, preventing a technically correct but contextless mid-page screenshot. Both layouts keep keyboard-visible focus and reduced-motion rules; the responsive CSS includes 320 px handling. Still open: large-text system testing, offline/stale-plan proactive messaging, plan-versus-completed-record reconciliation and a full keyboard traversal audit.

## Implementation review — iteration 009

The **AI Margin Note / 计划边注** is deliberately a pencil-like annotation inside the Week Fold rather than a chatbot, coach avatar, or competing plan card. A fine diagonal paper pattern, narrow mineral rule and “NEXT REVIEW” footer distinguish explanatory prose from authoritative plan content. Model, fixture and fallback sources use explicit text badges; evidence appears as compact labeled tags, and the safety note says the plan was not automatically modified.

Before generation, the empty state explains the minimized data boundary and requires a purpose-specific checkbox. There is no “apply” action. After a plan revision changes, the old explanation is hidden as current and replaced with a stale-version notice. Wide H5 keeps the note in the right evidence rail; mobile reads it after the concrete session content.

Reviewed evidence:

- [390 × 844 mobile AI margin-note capture](../../output/playwright/iteration-009-ai-mobile.png)
- [1440 × 1100 wide secondary-evidence capture](../../output/playwright/iteration-009-ai-wide.png)

The production-browser review exposed Taro custom-element semantics: a rendered `disabled` attribute was not recognized as native disabled state, and the visual checkbox had no accessible checkbox role. The page now emits explicit checkbox and `aria-disabled` states through the shared compatibility helper. Both new AI scenarios pass without captured script/console errors. Still open: keyboard activation for all custom roles across WeApp/H5, system large text, 320 px, offline/provider-latency states and screen-reader testing on real devices.

## Implementation review — iteration 010

The **Photo Proof / 食物校样条** extends the logbook's estimated-state grammar into a real sensitive-media workflow. A private preview carries one diagonal amber `未确认 / PROOF` stamp; numbered candidate slips show a confidence word, visual basis, broad gram band and editable confirmation field. It avoids chatbot/sparkle decoration and never colors foods as good or bad. Fixture mode is labeled “非真实识别”.

Before selection, the sheet states purpose, metadata removal, 24-hour maximum retention and immediate deletion conditions, then requires a per-request consent control. After confirmation, the proof disappears and copy says the photo was deleted while the meal is still unsaved. Failure has a distinct `MEDIA DELETED` state and routes back to the manual catalog instead of displaying fabricated candidates.

Reviewed evidence:

- [390 × 844 mobile photo proof](../../output/playwright/iteration-010-food-photo-mobile.png)
- [1440 × 1000 wide proof/candidate split](../../output/playwright/iteration-010-food-photo-wide.png)

The browser review found that Taro H5 does not expose its custom `disabled` attribute as native disabled semantics, so the upload action now also emits `aria-disabled`. It also exposed Taro's credentialed multipart CORS behavior and a corrupt test-image fixture; both were fixed at the implementation/test boundary. Mobile and wide scenarios complete with zero captured page/console errors. Open items remain real-device camera/permission copy, large text, 320 px, screen readers, offline upload recovery and production-provider latency/refusal states.

## Implementation review — iteration 011

The privacy center treats sensitive-data ownership as a **Custody Ledger / 保管链台账**, not a generic settings list. A faint red ledger margin and numbered inventory rows connect it to the existing logbook, while counts, history flags and timestamps make structure do real explanatory work. Mobile preserves the order `清单 → 导出 → 授权 → 离开`; wide H5 fixes the ledger at left and keeps actions at right.

The one expressive risk is a perforated **PERMANENT EXIT** tear line before the account-erasure receipt. Brick red appears only below that boundary. Export stays mineral blue, active ownership stays juniper, and withdrawn optional consent uses amber; none of these states depends on color alone. Deletion requires an export choice, checkbox semantics, an exact typed phrase and an `aria-disabled` action before it becomes visually live.

Reviewed evidence:

- [390 × 844 mobile custody ledger](../../output/playwright/iteration-011-privacy-mobile.png)
- [1440 × 1000 wide ledger/action split](../../output/playwright/iteration-011-privacy-wide.png)

The first browser run found two test-accessibility mismatches: repeated visible labels require region-scoped assertions, and Taro H5 did not expose its custom input through the expected textbox role even with an aria label. The flow now uses stable semantic regions for buttons and verifies the input through its user-visible placeholder. The wide screenshot also exposed an orphaned final title character, corrected by widening the intentional hero line. Open design gates remain system large text, complete keyboard traversal, real WeChat screen-reader behavior and the full error/retry surface for large exports.

## Implementation review — iteration 014

The administrator surface deliberately does not reuse the personal Today dashboard. It becomes an **Evidence Desk / 支持证据台** whose signature is the **Evidence Rail / 访问证据轨**: allowed, denied and not-found access decisions sit on one vertical line next to the ticketed request. Mineral blue identifies bounded action, Juniper marks verified/allowed evidence, and Paper/Mist surfaces keep the dense identifiers readable. There are no health charts, user avatars, destructive controls or generic search.

The entry screen states the trust boundary before offering identity. After login, the header exposes provider, roles and session revocation. The query form requires exact UUID, ticket and one plain-language reason; selected state uses border, radio and fill together. The result reads as three custody columns—account lifecycle, bounded counts and consent/photo custody—followed by the lookup receipt. On mobile the order remains `请求 → 证据轨 → 摘要`, so audit context precedes data even when the rail grows.

Reviewed evidence:

- [390 × 844 mobile evidence desk](../../output/playwright/iteration-014-admin-mobile.png)
- [1440 × 1100 wide evidence desk](../../output/playwright/iteration-014-admin-wide.png)

The first browser run caught two implementation—not visual—problems: the API request context resolved `/auth` outside its `/v1` base because the base URL lacked a trailing slash, and Windows could not execute the pnpm-symlinked standalone tree without elevated filesystem privileges. The test now uses an explicit `/v1/` base and production preview on Windows while retaining Linux standalone output for deployment. Final wide/mobile flows verify CSP, HttpOnly/SameSite cookie behavior, exact lookup, audit evidence, summary exclusion and session revocation. Visual review found no horizontal overflow or hierarchy collision. Open gates remain system large text, complete keyboard/screen-reader audit, 320 px, provider-error/re-auth states and a deployed Linux standalone proof.

## Screenshot review checklist

- The Rhythm Rail remains understandable without color.
- Chinese text does not inherit overly condensed Latin metrics.
- The next action is identifiable in under five seconds.
- Quick record is reachable with one hand on a typical phone viewport.
- Loading, empty, estimated, confirmed, edited, offline, and error states are visually distinct.
- Focus, text scaling, reduced motion, and 320 px width are tested before calling the shell done.
