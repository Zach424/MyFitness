# Design system baseline

Status: implemented and visually validated through iteration-045 history-calendar evidence

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

### Proactive freshness review — iteration 033

The Week Fold now treats a stale plan as a physically misaligned notebook leaf rather than a generic error toast. A narrow revision seam reads `PLAN vN → PROFILE vN`, the folded corner and dashed rule reuse the existing paper language, and the state names the reason before offering one bounded action. Profile drift uses the existing amber review color; safety or missing-profile holds use mineral blue and direct the user back to their safety data. No red diagnosis state, score, coach avatar or automatic replacement is introduced.

Stale plans remain readable and skippable, but substitution controls, adoption and AI explanation are disabled from server-projected permission literals. Returning to the page, focusing visible H5 or choosing “检查版本” triggers a bounded refresh; unsaved substitutions are discarded if authority changed. A 320 px stack rule makes the recovery action full width, while focus-visible and reduced-motion behavior reuse the existing controls.

The in-app H5 review first observed an eligible `v1` plan, then used a controlled local profile-revision change and the restarted current API to render `PLAN v1 → PROFILE v2`. DOM evidence confirmed both substitution buttons and adoption were disabled, skip remained enabled and the old AI explanation was no longer current. The known Taro video dependency warning iframe intercepted recovery clicks in the development build; PostgreSQL integration coverage therefore supplies the regeneration/current-state proof for this round rather than claiming a browser click that did not occur. Open items now move to iteration 034: system large text, full keyboard traversal, 320 px visual review and enforceable bundle budgets.

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

## Implementation review — iteration 029

The H5 identity surface uses a **Login Trace / 登录轨迹** instead of a generic provider-logo card. Three numbered stops—local transaction, identity confirmation and return to 衡迹—make the redirect boundary visible without showing protocol secrets. Mineral blue owns the primary action and boundary rail; Juniper marks the active trace; Paper/Mist preserve the same calm logbook language as the recording flows. No new palette, font, gradient-heavy hero or chatbot motif was introduced.

Mobile presents one login action after the trace and keeps the detailed trust boundary below it. Wide H5 turns that boundary into a right-hand evidence rail, so the action remains dominant while exact callback, tab lifetime and failure behavior stay inspectable. Cancellation uses product-owned copy and never displays provider text. Status is announced through `role=status`/`aria-live`, focus remains visible, and reduced-motion mode removes the moving progress bar.

Reviewed evidence:

- [390 × 844 mobile login-ready capture](../../output/playwright/iteration-029-oidc-login-mobile.png)
- [390 × 844 mobile provider-denial capture](../../output/playwright/iteration-029-oidc-denied-mobile.png)
- [1440 × 1000 wide login-boundary capture](../../output/playwright/iteration-029-oidc-login-wide.png)

The browser review verified that a default protected entry reaches login, the authorization path exposes state/nonce/S256 but no stored code, callback parameters disappear, provider denial leaves a clean URL, and all three captures have no page/console errors. Open design gates remain 320 px, system large text, complete keyboard/screen-reader traversal, offline/provider-latency states and real-provider branding/consent review.

## Implementation review — iteration 031

The progress-photo surface is an **Alignment Contact Sheet / 对位联系表**, not a transformation dashboard. Print-registration corners, center axes and a neutral capture silhouette establish consistent framing without detecting or judging a body. The comparison signature is an **onion-skin seam**: two same-view retained photos occupy one frame while a user-controlled opacity slider and registration crosses reveal visual differences. There is no score, gauge, “good/bad posture” color or automatic before/after claim.

Paper and Mist retain the private-logbook character; Mineral owns actions and the comparison seam; Juniper marks user-selected retention and capture-ready machine checks; amber is limited to adjust-the-camera guidance. Noto Sans SC handles Chinese reading, Barlow Condensed labels the contact sheet and metric mono keeps dates/opacity compact. Retention choices use structured rectangular fields rather than promotional cards, and every upload repeats both the analysis consent and—only when selected—the separate long-term retention consent.

Reviewed evidence:

- [390 × 844 mobile capture register](../../output/playwright/iteration-031-progress-photos-mobile.png)
- [1440 × 1000 wide comparison/contact sheet](../../output/playwright/iteration-031-progress-photos-wide.png)

The real-browser review uploaded two synthetic portrait fixtures through the production H5 build, confirmed all four bounded quality explanations, rendered the same-view overlay, changed responsive width and exercised explicit deletion. The page had no API or application errors; the Taro production build retained only known non-blocking dependency/chunk warnings. The desktop evidence intentionally shows comparison/history detail after scroll, while mobile evidence shows the first-screen hierarchy and capture guide. Open design gates remain 320 px, system large text, full screen-reader/keyboard traversal, real-camera safe-area behavior and research with explicitly consented users; no real-person dataset was used in this round.

## Implementation review — iteration 032

The workout sheet now states its completion rule directly below the live set summary: all checked sets become “已完成”; any unchecked set becomes “部分完成”. The note uses the existing muted evidence-copy style, so it clarifies data authority without competing with pain guidance, save feedback or the primary action. No new color, badge or score was introduced for this backend invariant.

The in-app browser review dismissed the known Taro development warning layer, then saved one `3/3 · 360 kg` session and one `2/3 · 240 kg` session through the real API. The ledger displayed `已完成` and `部分完成` respectively, while the editor reset for the next entry. Existing iteration-005 mobile/wide captures remain the visual baseline because the change adds only one explanatory line; the new DOM-backed flow is recorded in the iteration archive. Open design gates remain 320 px, system large text, full keyboard/screen-reader traversal and offline/stale recovery.

## Implementation review — iteration 034

The release-hardening pass exercises the narrowest supported H5 width with enlarged text instead of adding a new visual motif. At 320 px with the responsive root size raised by 125%, onboarding and the Week Fold keep a single reading column and report document width equal to viewport width. The checked-in evidence captures first-screen onboarding, the complete large-text plan and the isolated AI authorization control.

The browser review exposed a semantic trap hidden by snapshots: Taro's H5 `Button` renders as `TARO-BUTTON-CORE`, so giving it `role="checkbox"` and `tabIndex=0` made it focusable but did not make Space activate it. A shared keyboard adapter now handles non-repeating Space/Enter, prevents page movement and reuses the same guarded state transition as pointer activation. Shift+Tab/Tab returned to the control, computed focus was a 3 px solid outline, Space changed `aria-checked` to true and enabled the AI action. Unit coverage protects disabled, repeating and irrelevant keys. Real screen-reader announcements, remaining routes at system text extremes and physical WeChat devices remain open.

## Evidence freshness review — iteration 035

Material recovery drift reuses the Week Fold's misaligned-paper state without pretending that a record transition is an alarm or diagnosis. The seam changes from profile revisions to `PLAN EVIDENCE → CURRENT RECORDS`, and the card names one bounded reason before stating that the summary is not medical judgment. Amber remains the review color; no red, readiness gauge, body score, coach avatar or automatic adoption is introduced.

The stale fold stays readable and skippable. Substitutions, adoption and AI explanation are frozen until the user chooses “按最新记录重排本周”; the original plan ID then advances as an immutable revision. The 390 px browser proof first adds a confirmed energy record to a missing-evidence plan, explicitly verifies disabled adoption/substitution and enabled skip, captures the state, then regenerates to v2 with a current evidence summary. Normal workout/meal additions are protected as no-op behavior by PostgreSQL coverage rather than shown as noisy UI.

Reviewed evidence:

- [390 × 844 evidence-shift fold](../../output/playwright/iteration-035-evidence-shift-mobile.png)

## Plan-to-actual reconciliation review — iteration 036

The Week Fold now carries a quiet **PLANNED ↔ RECORDED** ledger card beneath the selected session. It deliberately starts as `未关联`, lists recent workouts without preselecting one and states that the system does not match by title, date or duration. Only the user's button press changes the exact day mark from a dot to a check. A bound card shows both plan and workout revisions; if the workout later changes, the current revision appears without replacing the originally selected revision.

An old-plan link is labeled `旧版关联` and never migrates itself to the current fold. Both current and old links expose one explicit unlink action. The active and closed states reuse Paper, Mineral and Juniper rather than adding success pressure, streaks or adherence scores. Partial actual workouts remain labeled partial instead of being promoted to completion.

Today adds a compact planned/recorded card before the confirmed evidence rail. It appears only for an accepted session on the local Today date. Returning from Plan now refreshes both dashboard and plan projection on page show, so the card changes without a full reload. The production H5 review found and fixed that cached-page refresh gap, then found that a successful XHR `204` was surfaced by Chromium as `net::ERR_ABORTED`; the unlink API now returns a strict `200` closure receipt.

Reviewed evidence:

- [390 × 844 explicit plan/workout link](../../output/playwright/iteration-036-plan-link-mobile.png)

## Exercise-catalog review — iteration 037

The workout sheet now separates the reusable movement directory from the factual set ledger. A compact search field scans starter names, aliases, equipment and owner notes; starter and custom entries share the same quiet paper-card language, while `我的动作` and explicit version copy keep ownership visible. Choosing a definition copies its tracking mode and equipment into the draft instead of leaving users to infer fields from a broad category.

Custom creation and correction use a focused sheet with category, tracking mode and multi-select equipment. Selecting `其他` reveals a required explanation. Correction copy says that the current draft and saved workouts keep their earlier snapshot; archive copy says the entry leaves search while old training evidence remains. No popularity score, unsafe exercise ranking or automatic plan recommendation is introduced.

The 390 px production-browser review created `壶铃摆动`, found it through the alias `KB Swing`, added and saved it with explicit `次数 / 负重` and `壶铃`, then corrected the directory name while confirming that the saved workout retained the original name. It also caught a Taro H5 attribute/CSS mismatch: `disabled="false"` still matched `[disabled]` and visually faded an enabled selection. The final component emits the attribute only when selected and uses an explicit selected class, with the browser asserting that the action is enabled and full-opacity.

Reviewed evidence:

- [390 × 844 custom exercise catalog](../../output/playwright/iteration-037-user-exercise-catalog-mobile.png)

## Exercise-observation review — iteration 038

The workout ledger now keeps only small per-exercise trend links, while a dedicated lazy page gives one stable movement enough room for identity, 7/30/90-day evidence, one-unit comparison and revision detail. This separation was both an information-design and performance decision: the first embedded panel exceeded the WeApp page-JavaScript budget; the final workout page returned below the gate without hiding the feature.

The observation screen states `仅完成组` in the top rail and repeats that same-name movements are not merged. Equal visible labels receive a short stable-key suffix. The summary separates sessions with completed evidence, completed sets and the tracking-mode-appropriate metric. The restrained bar plot compares only kilograms, minutes or kilometers at a time; below it, the evidence ledger exposes completed/total sets, repetitions, volume, duration, distance and workout revision so a chart never becomes an unexplained score.

The 390 px production-browser review recorded three sets while leaving a `99 kg` set incomplete. The screen displayed `2/3`, `20` repetitions and `240 kg`, then a workout correction changed one completed load and the reopened projection showed `270 kg · 训练 v2`. Copy does not celebrate maxima, grade technique or advise adding load. Browser request/page/console error capture remained empty.

Reviewed evidence:

- [390 × 844 stable-key exercise observation](../../output/playwright/iteration-038-exercise-trend-mobile.png)

## Owner-food register review — iteration 039

The meal sheet now treats the food picker as a fact-selection surface and sends mutable definition work to a dedicated **OWNED FOOD REGISTER**. The register names its three operations—define, correct, snapshot—and states that a meal copies the selected name, nutrition and reference. User values are described as confirmed reference data rather than laboratory measurements; the page never adds a target, “healthy” score or intake recommendation.

Create/correct uses a compact per-100-g grid, visible category choices and a required basis field. Revision history sits inside the correction sheet, while archive requires a separate dialog that explains the definition leaves search but historical meals/favorites stay intact. The photo boundary remains visible above the editor: custom entries do not silently join the candidate allow-list.

The first embedded implementation passed behavior tests but made the WeApp nutrition page `46,721` bytes. Moving the register into a lazy route returned the largest page to `39,472` bytes and made the definition/fact distinction clearer. The 390 px browser proof creates a recipe estimate, selects it into the meal draft, corrects the live definition, verifies the draft keeps the old name/value/reference, reads R2/R1 and archives without erasing the draft. Browser request/page/console error capture remained empty.

Reviewed evidence:

- [390 × 844 owner-food register](../../output/playwright/iteration-039-user-food-catalog-mobile.png)

## Daily nutrition-observation review — iteration 040

The meal ledger links to a dedicated **NUTRITION OBSERVATION** page whose signature is an **Evidence Ribbon**, not a target ring. Every compact cell is one requested-timezone local date. Juniper depth shows relative recorded magnitude for the selected nutrient; diagonal hatching means no meal record; a centered dot means meals exist but that nutrient is unlabelled. Pattern and shape carry the state before color does.

The 7/30/90 controls change both the complete date ribbon and the summary. Four quiet fields expose recorded days, missing days, saved meals and an explicitly labelled recorded-day-only average. Energy/P/C/F/fiber switches never introduce green/red thresholds, goal percentages or food-quality language. A separate label-coverage note names known fiber items against all food items, while the seven-day text ledger repeats “no record does not mean zero intake.”

The 390 px production-browser review saved one current meal, opened the default 30-day ribbon, proved one recorded day and 29 missing days, then switched to seven days and fiber. The first assertion found two equal visible values named only `1`; the final summary fields expose distinct accessible names such as `有记录日 1` and `已保存餐次 1`. Request/page/console error capture remained empty.

The new lazy route raises only total trees. H5 entry, largest async JavaScript, WeApp vendor and largest page JavaScript remain under their unchanged ceilings. The visual direction follows the existing Mineral/Juniper logbook language but spends its one expressive device on the evidence ribbon rather than adding decoration.

Reviewed evidence:

- [390 × 844 daily nutrition observation](../../output/playwright/iteration-040-nutrition-observation-mobile.png)

## Health metric-observation review — iteration 041

The record editor keeps its immediate seven-entry preview and links the active exact metric to a dedicated **METRIC OBSERVATION** page. The signature **Calibration Strip** uses thin neutral stems on one canonical scale; it deliberately omits trend arrows, normal zones, goal lines and positive/negative colors. High and low are labelled as numeric position only.

The page states `ONE METRIC · ONE CANONICAL UNIT`, then separates confirmed record count, recorded dates and recorded-value average marked `非目标`. The ledger restores the user's original display value/unit and adds canonical conversion only when needed, followed by source, occurrence timezone and revision. AI candidates are absent by query rule and named in the empty-state boundary.

The 390 px production-browser review saved 72.4 kg, opened exact `body.weight`, verified one confirmed record/date and one calibration mark, read manual source/timezone, then changed the window to seven days. The large title remains the thesis; the quiet strip is the sole expressive element. Request/page/console error capture remained empty.

Reviewed evidence:

- [390 × 844 exact health metric observation](../../output/playwright/iteration-041-health-metric-observation-mobile.png)

## Recoverable local-draft review — iteration 042

The three record editors now share a compact **LOCAL / 24H ticket** instead of a generic toast. A mineral side rail names the retention boundary; the paper body shows whether the draft is waiting for a restore decision or already represents the current form, plus exact saved-at and automatic-clear times. Restore is an explicit primary action and discard remains equally visible.

The ticket says what is absent—photos, authorization material and AI review content—without presenting application storage as a secure vault. It never auto-restores over the form. A restored health draft asks the user to recheck value, unit and occurrence time; workout and meal copy similarly asks for completion/portion review. Save/cancel/discard removes the ticket and local value.

The 390 px production-browser flow changed a weight value, observed the debounced saved state, refreshed into a restore decision, restored 71.2 kg and saved it. Separate flows repeat restore/discard for workout and restore/save for meal, while privacy coverage proves logout and erasure initiation clear all three keys. The first bundle measurement exposed all three guards inside the meal route; moving each guard into its owning page model returned the largest lazy JavaScript below the unchanged 200 KB ceiling.

Reviewed evidence:

- [390 × 844 recoverable health draft](../../output/playwright/iteration-042-recoverable-draft-mobile.png)

## Explicit occurrence-time review — iteration 043

The three record sheets now use one compact **LOCAL TIME / IANA ZONE** field group beneath their factual inputs. Local minute is the primary control; the quieter zone line makes conversion visible without turning the editor into a scheduling interface. Blank copy says “now,” resolved copy names the exact UTC offset and invalid/future/DST-gap copy stays inline at the fact being corrected.

A repeated daylight-saving minute expands into two equal UTC-offset choices. Neither is visually recommended, and saving stays blocked until the user chooses. Workout renders separate start/end groups; correction shows the stored minute/zone while preserving invisible seconds unless a control changes. Repeat clears the old occurrence rather than presenting it as today's fact.

The 390 px production-browser review first rejected a future value, then showed both `UTC-04:00` and `UTC-05:00` for New York's repeated `2025-11-02 01:30` minute. The final reviewed state uses `2026-07-18 16:00 · Asia/Shanghai`, states `UTC+08:00` and submits `2026-07-18T08:00:00.000Z`. Meal and workout lifecycle tests prove their corresponding instants without adding visual target/adherence language.

Reviewed evidence:

- [390 × 844 explicit occurrence time](../../output/playwright/iteration-043-occurrence-time-mobile.png)

## Conflict-safe correction-draft review — iteration 044

The existing **LOCAL / 24H ticket** now changes its language when the payload is an unsaved correction. It says `发现一份未完成修改`, prints the base revision as `基于 Rn` and explains that server change makes the copy invalid. `恢复修改` and `放弃这份修改` describe consequences directly; no color or optimistic success mark implies that the server has already accepted anything.

Restore performs its version check before entering correction mode. A current target returns to the normal editor and keeps the ticket visible as `未保存修改已暂存`; a stale/deleted target removes the ticket and says the current server record was not overwritten. Network failure keeps the ticket for retry. Record, meal and workout flows separately prove restore/save, stale refusal and restore/cancel, while existing privacy flows continue to prove logout/erasure clearing.

The reviewed 390 px capture shows the recovery decision before the body editor, with the revision, saved time and expiry readable without a modal. The ticket remains visually secondary to the page thesis and does not expose aggregate IDs.

Reviewed evidence:

- [390 × 844 conflict-safe correction draft](../../output/playwright/iteration-044-correction-draft-mobile.png)

## Timezone-safe history-calendar review — iteration 045

Today's trend card now opens a separate **HISTORY LEDGER / 28D** sheet. The upper evidence map keeps all 28 local dates present: recorded days use the existing mineral/juniper vocabulary, while open days remain visible and quiet rather than disappearing. Every cell has a full accessible label; compact `身 / 训 / 餐` marks are reinforced by a text legend and never encode completion.

The lower selected-day card deliberately says that an empty day is an evidence gap, not a behavioral conclusion. Its three backfill actions share one hierarchy, with body/recovery as the primary action and training/nutrition still directly available. Routing carries date and timezone only. In the destination editor the date-only value is explained as incomplete, avoids an alarming invalid style and still cannot save until `HH:mm` is entered.

The 390 × 844 production-browser review seeded one day with one record from each domain, verified all 28 controls and the explicit blank-day copy, then opened body backfill. Date-only save failed visibly, a real minute saved successfully and returning to the calendar changed that day's source count without a reload workaround. Request, page and console error capture remained empty.

Reviewed evidence:

- [390 × 844 timezone-safe history calendar](../../output/playwright/iteration-045-history-calendar-mobile.png)

## Progressive record-history review — iteration 046

The three record ledgers now open with 20 current aggregates and state `已载入 N` rather than implying an exact lifetime total. A full-width quiet outline action continues into older pages; once exhausted, a low-emphasis end label makes the list state explicit. The same global control style is used by body/recovery, training and meals so pagination does not introduce a new visual dialect.

Loading older data is user-initiated, disables the action while in flight and appends without rearranging the visible page. Errors reuse each editor's existing status region and leave already loaded evidence intact. No infinite scroll is used: explicit control is easier to discover, focus does not jump, and a long ledger does not trigger hidden network work.

The 390 px production-browser review created 21 health records, showed only 20 initially, loaded the oldest entry, edited it, reloaded and restored the off-page correction through one exact owner read. The visible saved-on-device notice retained the base revision and safety copy; request/page/console error capture remained empty. Training and meal pages share the same control contract, while PostgreSQL coverage proves all three cursors.

- [390 × 844 progressive record history](../../output/playwright/iteration-046-progressive-history-mobile.png)

## Progressive revision-sheet review — iteration 047

The body/recovery, training and meal audit sheets now open with the newest 10 immutable versions instead of rendering an aggregate's lifetime correction trail. When an older suffix exists, the established full-width quiet outline action says `继续载入更早版本`; it disables during the request and changes to the low-emphasis `已载入全部版本` terminal label only after exhaustion.

Already loaded revisions remain in newest-first order and visible if continuation fails; errors reuse the page's existing status surface. The interaction deliberately avoids infinite scroll, exact lifetime totals and any suggestion that a later revision is healthier or better. Revision/action/time labels remain evidence metadata rather than scores.

The 390 × 844 production-browser review created versions R1–R12, proved that opening rendered exactly R12–R3, then loaded the stable R2/R1 suffix and terminal state. The screenshot retains the sheet heading and newest versions for orientation; request/page/console error capture remained empty. PostgreSQL coverage separately proves all three domains, concurrent head creation and deletion-history behavior.

- [390 × 844 progressive revision history](../../output/playwright/iteration-047-progressive-revisions-mobile.png)

## Progressive definition-ledger review — iteration 048

Exercise and food definitions now share one compact **REVISION LEDGER**. It lists immutable `R#`, create/correct/archive action, saved name and change time without ranking definitions or implying that a newer exercise or nutrient value is safer, healthier or verified. Food keeps the ledger in its dedicated register; action correction gains visible audit evidence inside its existing editor.

Both surfaces open with 10 versions, use the established quiet full-width `继续载入更早版本` action and end with `已载入全部版本`. The action disables in flight; already loaded evidence remains on continuation failure and the page's existing status region carries the error. New-definition forms omit an artificial empty ledger.

The 390 × 844 browser review creates food definition R1–R12, proves 10 initial rows, loads the R2/R1 suffix and captures the complete compact ledger. The action lifecycle separately proves R1 after creation and R2/R1 after correction. Request, page and console error capture remained empty.

- [390 × 844 progressive definition history](../../output/playwright/iteration-048-progressive-definition-revisions-mobile.png)

## Progressive weekly-plan ledger review — iteration 049

Week Fold's existing **VERSION TRACE / 决定历史** card now opens with the newest 10 generated, modified, accepted or skipped plan snapshots. It reuses the established quiet full-width continuation action as `继续载入更早决定`, disables it while reading and ends with `已载入全部决定版本`. Revision, action and time remain audit evidence; the interaction does not imply that a newer decision is more effective or healthier.

Older pages append below the visible decisions without re-sorting. A decision made after the first page cannot enter that issued older suffix, while refreshing the current plan resets the ledger to its new head. Continuation failure leaves loaded evidence visible and reports through the page's existing status surface. Plan freshness, substitutions, AI consent and safety copy remain separate from pagination.

The 390 × 844 production-browser review advanced one plan to v11, proved exactly 10 initial rows, loaded the final generated v1 snapshot and captured the complete terminal ledger. Request, page and console error capture remained empty; PostgreSQL coverage separately proves concurrent new-head insertion, cross-plan/missing-anchor rejection and exact owner concealment.

- [390 × 844 progressive weekly-plan history](../../output/playwright/iteration-049-progressive-plan-revisions-mobile.png)

## Lazy owner-action register review — iteration 050

Workout recording now treats the action picker as a fact-selection surface and sends mutable definition work to the shared lazy **OWNED MOVEMENT REGISTER**. The register states its three operations—define, correct, snapshot—and names the boundary directly: later correction changes future choices, not the open workout draft or historical training.

The action view reuses the owner-food register's paper shell, quiet category controls, amber correction accent and compact **REVISION LEDGER** rather than introducing a second definition-management dialect. Category, tracking mode and equipment remain explicit text controls; `其他器械` still requires an explanation. Archive requires a separate confirmation and says exactly which evidence remains.

The 390 × 844 production-browser review enters a non-default workout title, creates `壶铃摆动`, returns to the unchanged draft, selects and saves the action snapshot, then corrects the live definition to `双手壶铃摆动`. R2/R1 remain readable in the register while the saved workout still displays the original name. Archive removes only the future choice. Request, page and console error capture remained empty.

The final artifact makes the performance hierarchy match the information hierarchy: workouts fall from 50,338 to 39,297 bytes and the owner register is 30,176 bytes. Reusing the existing lazy owner route avoids a second H5 runtime and shared register styles avoid duplicate visual CSS.

- [390 × 844 lazy owner-action register](../../output/playwright/iteration-050-lazy-exercise-catalog-mobile.png)

## Screenshot review checklist

- The Rhythm Rail remains understandable without color.
- Chinese text does not inherit overly condensed Latin metrics.
- The next action is identifiable in under five seconds.
- Quick record is reachable with one hand on a typical phone viewport.
- Loading, empty, estimated, confirmed, edited, offline, and error states are visually distinct.
- Focus, text scaling, reduced motion, and 320 px width are tested before calling the shell done.
