# Design system baseline

Status: implemented and visually validated through iteration-083 portable-export client artifact verification

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

## Lazy food-photo proof workbench review — iteration 051

Nutrition now presents photo assistance as one compact `PHOTO PROOF / 按需打开` launcher instead of embedding consent and uncertain AI state inside the meal editor. Its copy states the actual handoff: photos, authorization and unconfirmed candidates stay outside the draft; only confirmed food and grams return. The launcher remains secondary to manual recording and does not imply that a photo is the preferred way to log a meal.

The lazy workbench is grounded in private evidence custody rather than a generic AI upload card. A dark three-step rail names `本次授权 → 私有校样 → 确认后删图`; the single expressive element is the angled `未确认 / PROOF` stamp over the sanitized preview. Review cards use explicit index, food name, visual basis, confidence word, displayed gram range and editable integer input. Color reinforces but never replaces the text labels or selection state.

The 390 × 844 browser review preserves a non-default meal title below the route stack, uploads the fixture image, proves the unconfirmed keys are absent from the saved meal-draft envelope, edits both portions and returns only after server confirmation. The 1440 × 1000 review checks the two-column proof sheet and explicit destructive control. Screenshot inspection caught a Taro H5 inherited-color defect that left the delete label visually blank despite its accessible name; explicit pulse/paper token colors corrected both destructive and primary controls.

Measured structure now matches the information hierarchy: nutrition falls from 45,512 to 36,410 WeApp JavaScript bytes, the private-photo route is 32,956 and the largest page becomes workouts at 39,297. H5 total and largest async JavaScript fall to 2,409,603 and 185,926 bytes.

- [390 × 844 lazy food-photo proof workbench](../../output/playwright/iteration-051-lazy-food-photo-mobile.png)
- [1440 × 1000 lazy food-photo proof workbench](../../output/playwright/iteration-051-lazy-food-photo-wide.png)

## Accessibility state-matrix review — iteration 052

This round does not introduce a new visual motif. It makes the existing hierarchy operable without a pointer: the home quick actions, primary navigation, lazy action register and private food-photo workbench expose the same explicit Enter/Space behavior as their pointer action. Focus rings use the established mineral-blue outline and paper offset; programmatically restored route and dialog targets remain visibly focused instead of relying on browser heuristics.

The action archive dialog names and describes itself, focuses the non-destructive cancel action first and returns to the initiating archive control when cancelled. After a successful archive, focus moves to the stable new-action control because the archived trigger no longer exists. The food-photo workbench focuses its back action on entry, retains text labels such as `未确认 / PROOF`, confidence words, selected-state semantics and explicit action names, and returns focus to the photo launcher after confirmation. Status changes are polite atomic announcements; this is semantic H5 evidence, not a claim that VoiceOver, TalkBack or WeChat devices have been tested.

Taro H5 renders buttons as custom elements, so `role="button"` and `tabIndex` alone did not provide native keyboard activation. The shared activation adapter now handles pointer, Enter and Space through one guarded action. Focus restoration waits for the Taro route transition and targets stable IDs. Every reduced-motion wildcard is scoped to its page root; a global wildcard had changed the router container itself during emulation and was removed.

The 390 × 844 production-browser matrix completes both lazy workbenches with a keyboard, verifies dialog entry/cancel/success focus, route return focus, live status semantics, `aria-pressed` candidate selection and reduced-motion behavior. Existing 1440 × 1000 lifecycle coverage remains green. Three inspected artifacts record the risky states without treating screenshots as screen-reader proof.

- [390 × 844 archived-action dialog focus](../../output/playwright/iteration-052-action-archive-focus-mobile.png)
- [390 × 844 keyboard action workbench](../../output/playwright/iteration-052-keyboard-action-workbench-mobile.png)
- [390 × 844 keyboard food-photo workbench](../../output/playwright/iteration-052-keyboard-food-photo-mobile.png)

## Ambiguous save recovery review — iteration 053

The body-record editor now treats a lost response as an unresolved transaction, not a red generic error and not a success. A warm warning strip keeps the ordinary paper layout intact while the compact `CONNECTION UNCERTAIN / 输入仍保留` eyebrow names both the technical state and the user-relevant guarantee. The body copy says that the record may already have reached the service, that visible input remains unchanged and that retry reuses one request number. This language avoids the false certainty of “保存失败” when the service may already have committed.

The retry control remains the editor's single primary action and changes its label to `重试保存（防重复）`. It stays visibly enabled in mineral blue. Visual review exposed a Taro custom-element detail: `disabled="false"` still matched `.save-button[disabled]`, making a usable retry look disabled at 58% opacity. The selector now requires `disabled="true"`, and browser evidence asserts both enabled semantics and full opacity.

Server refusal, retryable service outage, ambiguous network interruption and an unclassified outcome have different semantic/state labels. Editing any field clears the stale recovery presentation and invalidates the attempted key. There is deliberately no offline queue, background replay badge or promise that corrections have create-level idempotency. The 390 × 844 browser review sends the create request to the real API, lets PostgreSQL commit, aborts only the browser response and then proves that one explicit retry produces one visible record with the same idempotency key.

- [390 × 844 ambiguous save recovery](../../output/playwright/iteration-053-ambiguous-save-recovery-mobile.png)

## Core record recovery family — iteration 054

Workout and meal editors now use the same calm unresolved-transaction grammar as body records. The warm strip and `CONNECTION UNCERTAIN / 输入仍保留` eyebrow remain identical, while the body names the actual aggregate—`这次训练` or `这次餐次`. This repetition is intentional: an interrupted save should be recognizable before the user has to parse page-specific detail.

The screenshots keep each editor's evidence visible around the recovery state. Training still shows completed-set/volume/minute totals and an empty record ledger; nutrition still shows the confirmed food portion/macros and an empty meal ledger. The unchanged draft and zero-count ledger together explain why the page cannot yet claim a visible save, while the enabled mineral retry action provides one next step. Neither view adds a cloud/offline badge or suggests automatic synchronization.

Implementation audit treated every payload control as part of the visual state contract. Changing load unit, any set field, fatigue, pain or note clears a workout recovery attempt. Changing meal type, title, occurrence, food selection, portion or note clears a meal attempt. A Taro `disabled="false"` selector was also corrected on the meal action so retry does not look inactive. Both 390 × 844 reviews commit through the real API, lose only the response, then reuse one key and render one final ledger entry.

- [390 × 844 workout save recovery](../../output/playwright/iteration-054-workout-save-recovery-mobile.png)
- [390 × 844 meal save recovery](../../output/playwright/iteration-054-meal-save-recovery-mobile.png)

## Authority-aware workbench recovery — iteration 055

Sensitive workbenches now distinguish three actions before asking the user to do anything: `SAME REQUEST`, `RECONCILE FIRST` and a terminal state. The visual grammar stays inside the established paper/warning palette. A narrow amber rail and compact uppercase eyebrow state the authority, while the body names what remains safe and what the page refuses to assume. It does not introduce a generic offline badge or imply background synchronization.

The action-create state keeps the full definition form visible and dims the ordinary save control. Its one outlined action says `重试保存定义（防重复）`; the real browser proves the same request key and one resulting definition. The archive state appears inside the existing modal, ahead of its now-disabled destructive control. It requires `核对服务端状态`, then closes only after the active catalog read no longer includes the action. The screenshot deliberately keeps the old confirmation button visible but inert so the reason for the pause is clear.

Photo reservation uses the same-key state before any upload ticket is known. The page retains consent UI but no selected file name/path, preview or candidate in the meal-draft vault. Photo confirmation and deletion use reconcile-first copy. If a committed confirmation disappears from the reviewable list before the response arrives, the workbench shows `NO CONFIRMED HANDOFF / 未写入餐食`, clears the proof view and returns without emitting candidate items. If a delete target disappears, copy is limited to “no reviewable proof” and explicitly avoids claiming that object bytes are physically deleted.

Visual inspection caught a second Taro custom-element issue: a bare `disabled` attribute was not treated as disabled by the browser accessibility tree, even though the component appeared unavailable. The shared activation adapter now publishes `aria-disabled` and blocks both pointer and keyboard callbacks. Recovery actions use explicit inline token color because Taro otherwise rendered their accessible text visually blank.

Four 390 × 844 artifacts cover the risky states; the wide photo deletion reconciliation remains in automated browser proof without adding another visual motif.

- [390 × 844 action-create same-key recovery](../../output/playwright/iteration-055-action-create-recovery-mobile.png)
- [390 × 844 action-archive reconciliation](../../output/playwright/iteration-055-action-archive-reconciliation-mobile.png)
- [390 × 844 photo-reservation same-key recovery](../../output/playwright/iteration-055-photo-reserve-recovery-mobile.png)
- [390 × 844 photo-confirmation terminal handoff](../../output/playwright/iteration-055-photo-confirm-reconciliation-mobile.png)

## Owner-food definition recovery — iteration 056

The owner-food register now uses the same three authority labels as the action and photo workbenches without changing its definition/fact hierarchy. An interrupted create places the amber `SAME REQUEST / 仅同一请求可重试` strip immediately above the retained nutrient/reference form. The ordinary save stays visible but inert, while the only active outline control explicitly says that it retries the food definition with duplicate protection. Editing any form value removes the old recovery state and invalidates that attempted key.

Correction uses `RECONCILE FIRST / 禁止直接重放` and keeps every user-authored nutrient, serving and reference field visible for comparison. The page does not call these values verified nutrition. Only an advanced current server revision whose complete fields match the retained form can close the editor as a recovered success; a same or different revision keeps the comparison honest.

Archive recovery stays inside the existing confirmation dialog ahead of the disabled destructive action. Its copy says that active-catalog absence proves only that the food will not appear in future choices. It does not imply meal/favorite rewriting or any nutritional judgment. Explicit inline token colors keep cancel, destructive and recovery labels visually present in Taro H5, while the shared activation adapter prevents pointer and keyboard replay during uncertainty.

The three 390 × 844 artifacts are real-service response-loss states: create commits before the browser response is aborted, correction commits R2 before loss and archive removes the active definition before loss. The first two viewport screenshots scroll the authority strip into view while retaining enough form context to prove input preservation; the modal screenshot shows the blocked destructive control and narrow custody claim.

- [390 × 844 food-create same-key recovery](../../output/playwright/iteration-056-food-create-recovery-mobile.png)
- [390 × 844 food-correction reconciliation](../../output/playwright/iteration-056-food-update-reconciliation-mobile.png)
- [390 × 844 food-archive reconciliation](../../output/playwright/iteration-056-food-archive-reconciliation-mobile.png)

## Progress-photo recovery — iteration 057

The private contact sheet now applies the same authority strip to three media stages while keeping its existing registration-board aesthetic. Reservation loss uses `SAME REQUEST` below the retained view, 24-hour/retained choice and explicit consent. The page keeps those non-media choices visible, disables the ordinary capture action and asks the user to choose the local image again; no file name, path or data URL is stored.

Upload loss uses `RECONCILE FIRST` in the same position. Its single outline action reads the current private list for the exact reserved photo ID and never resends bytes. A recovered item still says that the machine checks only orientation, resolution, lighting and contrast. If the item is absent, the terminal copy says it was not added to the private list and leaves unused reservation/temporary cleanup to the existing lifecycle.

Delete recovery stays inside the established destructive dialog. The original “keep” and “confirm delete” controls remain visible but inert until the user reads current server state. List absence closes the contact sheet item with the narrow statement that durable object cleanup continues; it never equates an absent row with physical deletion. Normal deletion uses the same custody wording.

Visual review found that Taro preserved the consent toggle's accessible name but rendered its label blank after the control became unavailable. Explicit ink/muted token color restores visible authorization text, and disabled capture-intent controls use enough opacity to remain readable while event-level pointer/keyboard guards enforce the authority state.

- [390 × 844 progress reservation same-key recovery](../../output/playwright/iteration-057-progress-reserve-recovery-mobile.png)
- [390 × 844 progress upload reconciliation](../../output/playwright/iteration-057-progress-upload-reconciliation-mobile.png)
- [390 × 844 progress deletion reconciliation](../../output/playwright/iteration-057-progress-delete-reconciliation-mobile.png)

## Weekly-plan write reconciliation — iteration 058

Week Fold now uses the established amber authority strip for uncertain generation and decisions, but adapts its top rail to the plan model: `WRITE ? → READ` names the transition from an unread write response to an owner-visible projection. The ordinary Week Fold remains fully visible beneath it, including version, status and selected day, so the warning does not replace the evidence the user must compare.

The recovery heading is intentionally factual—`先确认权威状态`—rather than a generic failure or offline badge. `RECONCILE FIRST / 禁止直接重放` names the safety boundary, while the action always reads `核对服务端状态`. During substitution recovery, a second amber line says the current choices remain on the page and will not be submitted again before the read. All normal generate, refresh, substitution, accept and skip controls stay visible but inert; this makes the paused decision legible without implying that the page is frozen or syncing in the background.

Three 390 × 844 artifacts follow the same top-of-scroll composition. Generation keeps the empty draft card visible with its disabled primary action. Modification retains v1, the pending status and the Week Fold below the strip; skipping retains v2 and the adjusted state. After reconciliation the browser asserts v1/v2/v3 and exact result copy, so screenshots document uncertainty rather than serving as success proof.

Visual review confirmed that the amber card remains readable at mobile width, the action occupies a full-width thumb target, and the disabled ordinary action no longer relies on Taro's bare `[disabled]` attribute for opacity. The shared activation adapter publishes `aria-disabled` and blocks pointer, Enter and Space callbacks; real screen-reader and WeChat-device behavior remains a release gate.

- [390 × 844 generation response-loss reconciliation](../../output/playwright/iteration-058-plan-generate-reconciliation-mobile.png)
- [390 × 844 substitution response-loss reconciliation](../../output/playwright/iteration-058-plan-modify-reconciliation-mobile.png)
- [390 × 844 skip response-loss reconciliation](../../output/playwright/iteration-058-plan-skip-reconciliation-mobile.png)

## Plan-to-workout association reconciliation — iteration 059

The Week Fold reuses `WRITE ? → READ` for association uncertainty, but the retained line now names the relationship rather than a generic save: workout title, local plan date and plan revision for create; local date and workout title for unlink. This is important because the relationship card may sit below the viewport after the amber strip appears. The user can still identify the paused intent without scrolling or relying on the check mark.

Both 390 × 844 artifacts preserve the adopted v2 Week Fold beneath the authority strip. Before create reconciliation the selected day dot remains visible but no recorded check is claimed; before unlink reconciliation the check remains because the target is still the last locally known active relationship. The screen therefore distinguishes “response unknown” from “optimistically changed”. Only the read action is live.

Day leaves, workout choices, link/unlink, refresh, substitution and plan-decision controls emit explicit `aria-disabled` and share event-level pointer/Enter/Space guards while the association is unresolved. Their opacity is tied to `aria-disabled='true'`, avoiding Taro's rendered `disabled="false"` selector trap. The amber retained-intent line remains high contrast and the full-width recovery action stays a mobile thumb target.

After reconciliation, functional assertions—not screenshots—prove the exact active tuple and later target absence. Copy says an absent link is no longer active but cannot prove the closure reason, preserving the distinction between current UI state and retained audit history.

- [390 × 844 exact link reconciliation](../../output/playwright/iteration-059-plan-link-reconciliation-mobile.png)
- [390 × 844 unlink reconciliation](../../output/playwright/iteration-059-plan-unlink-reconciliation-mobile.png)

## Exact AI-run reconciliation — iteration 060

The Week Fold AI margin note now owns a smaller recovery surface inside the existing ruled card rather than moving provider uncertainty to the page-wide plan banner. The amber rail says `ORIGINAL REQUEST → STATUS`, `RECONCILE FIRST` and “只读取刚才那次运行”. This makes the recovery authority explicit while preserving the plan evidence above and version history below.

The retained trace names only the target plan revision and promises that the read creates no new authorization, model call or plan version. While unresolved, the consent checkbox and ordinary generate action are replaced by one quiet statement that the existing authorization is already bound to the original request. This avoids the visually blank disabled-label behavior seen in earlier Taro controls and prevents a second consent from looking necessary.

The single amber action reads the exact durable run by its original in-memory key. Functional proof accepts a completed explanation only when its plan ID/revision still match; a result for an older revision enters history without becoming current. The screenshot records uncertainty, not success. Real browser counters prove one POST and one GET, while source/prompt/validator assertions remain functional evidence.

- [390 × 844 exact AI-run reconciliation](../../output/playwright/iteration-060-ai-explanation-reconciliation-mobile.png)

## AI explanation run ledger — iteration 061

Completed explanations leave the crowded Week Fold and open in a dedicated ruled-paper ledger. The entry control is secondary to the current margin note, and the new route starts with a compact back rail, `RUN LEDGER` wordmark and retained-run count. It reloads the current plan before assigning authority, so `CURRENT`, `FROZEN` and `HISTORY` describe live product state rather than trusting the explanation row by itself.

Each run leads with the authority label, plan revision and headline, then exposes a four-cell provenance grid for source, completion time, prompt version and validator version. Model/fixture/fallback source and any deterministic fallback reason are human-readable, while internal provider/model identifiers remain absent. Historical and frozen cards add a plain boundary sentence explaining why they cannot be the current interpretation. The review-only safety note remains inside the expandable content rather than becoming a global product claim.

Only five runs are initially expanded into the list; one full-width outline action reveals five more from the already bounded response. This is progressive disclosure, not pagination or regeneration. Taro pointer/Enter/Space activation shares the established adapter, the back control receives delayed H5 focus, and opening an old revision with Enter is part of browser proof. The 390 × 844 composition preserves two revision cards in one scan; the 1440 × 1100 composition caps reading width instead of stretching provenance cells across the viewport.

- [390 × 844 two-revision AI ledger](../../output/playwright/iteration-061-ai-ledger-mobile.png)
- [1440 × 1100 wide AI ledger](../../output/playwright/iteration-061-ai-ledger-wide.png)

## Today read authority — iteration 062

The Today entry surface now treats “not read” as a visible state rather than a visually plausible empty day. Before the first successful response, the headline says that evidence is not yet read, the readiness card remains an em dash and every trend value is an em dash. The confirmed-evidence card names the count as unknown; only a successful response may render the established empty-state copy and real zeros.

One compact `更新证据` control joins the profile action in the top bar. During a read it carries explicit disabled semantics and names whether it is initially reading or updating an existing snapshot. Offline, refused, unavailable and unknown states use product-owned copy rather than raw server messages. The amber rail states either that no snapshot exists or that the previous successful snapshot remains below; it never claims local caching, synchronization or freshness it cannot prove.

On an initial failure the single full-width retry action receives delayed H5 focus, so Enter recovery is immediate and visible. On a refresh failure, the existing evidence rail, readiness and trend totals remain unchanged while the warning sits directly above them. The 390 × 844 artifact shows unknown count and offline retry without a false empty state; the 1440 × 1000 artifact keeps the prior `4/5` record and trend evidence beside a rejected-refresh warning.

- [390 × 844 initial offline Today](../../output/playwright/iteration-062-today-initial-offline-mobile.png)
- [1440 × 1000 retained Today snapshot](../../output/playwright/iteration-062-today-stale-wide.png)

## Week Fold read authority — iteration 063

Week Fold now separates a plan that has not been read from a successful empty week. The mobile initial-error state keeps the established fold masthead but replaces `NO WEEK YET` with one amber ruled card: `OFFLINE / 连接未完成`, a plain statement that the week is still unknown and one full-width retry. No plan generation control appears until a complete response succeeds.

A later failed version check retains the fold itself beneath a wider amber rail. `RETAINED PLAN v1 · 1 HISTORY ROWS` makes the exact local evidence visible without implying a persistent cache or current server confirmation. The chosen day, planned activity, reasons, food focus, AI card and version history remain readable, while substitutions, decisions, workout association, AI consent/provider calls and ordinary version check all carry disabled semantics. The single retry receives focus only after an explicit failed check; automatic return-to-page reads do not move the user's focus.

Visual review also caught an evidence-timing error: the first mobile screenshot was taken while Taro's horizontal page transition was still moving and looked clipped despite a non-overflowing final layout. The browser capture now waits for the actual plan-page boundary to reach the viewport origin, preserving trustworthy visual evidence without adding a layout workaround.

- [390 × 844 initial offline Week Fold](../../output/playwright/iteration-063-plan-initial-offline-mobile.png)
- [1440 × 1000 retained Week Fold revision](../../output/playwright/iteration-063-plan-stale-wide.png)

## Privacy custody read authority — iteration 064

The privacy custody desk no longer turns an unread account into a plausible zero inventory. Before the first accepted response, the mobile composition keeps the established masthead and safety note but replaces all inventory, consent, export and erasure controls with one amber authority card. Its `OFFLINE / 连接未完成` line explains that both the recoverable erasure receipt and service inventory remain unknown; the single full-width retry receives keyboard focus.

After a consent mutation, a rejected overview refresh retains the last successful nine-item inventory beneath a wider amber rail. `RETAINED INVENTORY · 9 ITEMS` identifies the page-memory evidence without presenting it as current truth. The old active-consent row may remain visible, so export, consent revocation, export skipping, acknowledgement, confirmation input and permanent deletion all carry disabled semantics until retry succeeds. Back, profile editing and logout remain available because they do not act on the uncertain ledger.

The wide evidence keeps the custody rail adjacent to the retained ledger instead of replacing it with a generic error page. Product copy separates offline, refusal, service outage and unknown outcomes; raw backend messages never define the visual state. No polling, background action or persistent inventory cache is implied.

- [390 × 844 initial offline privacy desk](../../output/playwright/iteration-064-privacy-initial-offline-mobile.png)
- [1440 × 1000 retained privacy inventory](../../output/playwright/iteration-064-privacy-stale-wide.png)

## Health-record ledger read authority — iteration 065

The body log now keeps its training-notebook identity while admitting when the recent ledger has not been read. On mobile, the amber ruled authority card sits directly beneath the page thesis and ahead of the optional progress-photo contact sheet. `身体记录还没有读取` names the missing evidence without turning it into an empty-state invitation; the one full-width `重新核对` action is the strongest available action, while the editor remains visible below so typed input is not treated as lost.

The unknown boundary continues inside the layout: the seven-entry counter becomes `—/7`, the recent-log count says `尚未核对`, and the log panel uses a question mark rather than the established plus-sign empty state. Only a successful empty page restores “还没有身体记录” and the invitation to save a first fact. The 390 px capture waits for Taro's page transition to settle and verifies the page itself has no horizontal overflow.

On wide H5, a rejected refresh leaves the accepted 71.8 kg card in its sticky ledger column while the amber rail spans above both editor and log. `RETAINED PAGE · 1 ITEMS` identifies the in-memory page without inventing a timestamp or persistent-cache claim. Save, modify, history and delete are muted and inoperable; back, progress photos, draft fields and the separately read long-term observation route keep their normal hierarchy.

- [390 × 844 unread health-record ledger](../../output/playwright/iteration-065-record-initial-offline-mobile.png)
- [1440 × 1000 retained health-record page](../../output/playwright/iteration-065-record-stale-wide.png)

## Workout ledger and action-directory read authority — iteration 066

The training log now treats its recent sessions and embedded action directory as one recording surface. On mobile, an initial offline response places the amber ruled authority card immediately after the page thesis. The retained count is an em dash, the recent ledger uses a question mark instead of the established empty invitation and the action directory says it has not been checked. Only a successful combined response may show either empty state.

The workout editor remains visible so unsaved title, occurrence time and set input do not look discarded, but save and catalog-dependent choices are visibly inert. The dedicated `管理我的动作` entry remains active because that route reads and governs its own definitions. The single full-width `重新核对` action receives keyboard focus and the settled 390 px page proves no horizontal overflow.

On wide H5, a rejected catalog refresh retains one accepted workout and nine accepted actions alongside `RETAINED SNAPSHOT · 1 SESSIONS · 9 ACTIONS`. Quick repeat, save, card repeat, correction, history, delete and action reuse stay readable but inactive; the independent exercise observation and owner-action register retain their normal hierarchy. The authority rail spans the two-column composition so the warning describes both halves rather than looking like a local catalog error.

Visual review found that Taro's native disabled color made the quick-repeat title nearly disappear. Explicit child colors now retain readable contrast while event-level guards and `aria-disabled` enforce inactivity; muted appearance is not the sole safety mechanism.

- [390 × 844 unread workout ledger and action directory](../../output/playwright/iteration-066-workout-initial-offline-mobile.png)
- [1440 × 1000 retained workout/action snapshot](../../output/playwright/iteration-066-workout-stale-wide.png)

## Nutrition meal-desk read authority — iteration 067

The meal note now treats recent meals, favorites and the reusable food directory as one mise-en-place surface. On mobile, an initial offline response places the amber ruled authority receipt immediately after the page thesis. Its three-cell `MEALS / FAVORITES / FOODS` strip shows em dashes, source tabs use em dashes instead of false zeros and both the meal ledger and food picker use explicit unknown copy. Only a successful combined response may restore empty-state language.

The editor remains visible so title, occurrence time, confirmed photo inputs, portions and notes do not look discarded, but save, food selection and favorite mutation are inert. `管理我的食物`, the photo proof workbench and nutrition trends remain active because each route has its own read boundary. The single full-width `重新核对` action receives keyboard focus and the settled 390 px page proves no horizontal overflow.

On wide H5, a rejected favorite refresh retains `MEALS 1 / FAVORITES 1 / FOODS 10` above the two-column meal desk. The accepted meal remains in its sticky ledger and the repeated rice draft remains in the editor; save, add, favorite, repeat, correction, history and deletion stay readable but inactive. The three-source strip makes the authority scope visible without turning the warning into a generic service banner or a nutrition judgment.

- [390 × 844 unread meal desk](../../output/playwright/iteration-067-nutrition-initial-offline-mobile.png)
- [1440 × 1000 retained meal/favorite/food snapshot](../../output/playwright/iteration-067-nutrition-stale-wide.png)

## Owner-definition register read authority — iteration 068

The two dedicated definition registers now use one visual contract without erasing their domain identities. Before a successful read, the page count and active-definition count are em dashes and the list says it has not been checked; the dominant new/create action is visibly inert. The amber ruled receipt sits between the short register instruction and the definition list, so it describes the exact directory rather than reading as a global account outage.

On wide food H5, a rejected refresh retains `OWNED FOODS 1` and the accepted oatmeal definition below it, with edit muted but readable. On mobile action H5, `OWNED MOVEMENTS —` and the unknown list replace the former false empty invitation. Initial success focuses back after route transition; initial failure focuses retry instead, preventing competing delayed focus from hiding recovery.

- [390 × 844 unread owner-action register](../../output/playwright/iteration-068-action-register-offline-mobile.png)
- [1440 × 1000 retained owner-food register](../../output/playwright/iteration-068-food-register-stale-wide.png)

## Long-term observation read authority — iteration 069

Health, movement and nutrition observations now share a compact evidence-note/update row followed by the same ruled authority receipt used elsewhere, but their retained state stays deliberately read-only rather than looking disabled wholesale. The note names the exact boundary—source identity plus projection for health/movement, current meal projection for nutrition—and keeps non-diagnostic/non-prescriptive language above the visualization.

The mobile health initial-error composition uses `METRIC — · POINTS —`, one full-width retry and an explicit unverified card instead of an empty-observation invitation. The wide nutrition stale composition retains `LOCAL DAYS 90`, one recorded day and the locally selected 7-day ribbon under the warning. Server-backed identity switches and ordinary update are muted, while local time windows and nutrient tabs remain full-strength because they only reshape accepted response data.

Visual review confirms that both evidence states preserve the calm logbook hierarchy: mineral toolbar, amber uncertainty receipt, paper projection. The mobile capture waits for the Taro route boundary; the wide capture resets the nested scroll container after changing time window so the masthead, authority and retained evidence remain in one trustworthy frame.

- [390 × 844 unread health observation](../../output/playwright/iteration-069-health-observation-offline-mobile.png)
- [1440 × 1000 retained nutrition observation](../../output/playwright/iteration-069-nutrition-observation-stale-wide.png)

## Private-photo inventory read authority — iteration 070

The two purpose-separated private-photo routes now share one small inventory grammar without flattening their established visual identities. A ruled `PRIVATE INVENTORY` toolbar states whether the item count is accepted or unknown; one paper receipt below it uses mineral blue while checking and amber when authority is unavailable. The food route keeps its dark proof masthead and rounded workbench, while the progress route keeps its registration-grid contact-sheet composition.

On the 390 × 844 food route, initial transport loss shows `PRIVATE ITEMS UNKNOWN` and one full-width focused retry. The entire intake/proof card is absent, so neither “choose a photo” nor “no candidate” can masquerade as current custody evidence. The footer retains the non-diagnostic/non-recognition caveat and the settled page has no horizontal overflow.

On the 1440 × 1000 progress route, a service outage retains `PRIVATE ITEMS 1 · PAGE MEMORY` and the last accepted capture/contact-sheet evidence. Capture direction, retention choice, consent, baseline/current assignment and deletion remain readable but inactive. The amber receipt spans the content width above the two-column capture/overlay area, making the freeze apply to the whole inventory rather than looking like a local image error. A previously composed opacity view remains a presentation-only control.

Visual review caught that delayed programmatic focus did not always match `:focus-visible` even though the recovery action was the active element. The shared component now provides the same visible mineral outline for `:focus` and `:focus-visible`; automated proof checks the computed indicator rather than focus state alone.

- [390 × 844 unread food-proof inventory](../../output/playwright/iteration-070-food-inventory-offline-mobile.png)
- [1440 × 1000 retained progress-photo inventory](../../output/playwright/iteration-070-progress-inventory-stale-wide.png)

## Profile/goal register read authority — iteration 071

The three-sheet onboarding flow now begins with a register receipt rather than assuming its familiar starter choices are facts. On the 390 × 844 initial-offline state, the numbered progress bars become one partial authority rule and the headline changes to `先确认资料底稿`. No name, age, sex, height, goal, risk or consent control appears. The amber card contains the only primary action, and its programmatic focus ring makes recovery visible without a raw transport message.

After a confirmed absence, a quiet green note explicitly calls every starter choice an unsubmitted draft. For an existing profile, the compact `PROFILE BASE` receipt names the accepted revision and whether the page has local edits. This separates the form's editable intent from the service evidence that may authorize save.

On the 1440 × 1000 stale state, the full v1 form and `保留的本地修改` remain beneath an amber receipt, while both the toolbar and receipt say `保留底稿`. Save is guarded and inert even if the person continues through the local steps. The explanation rail keeps its original privacy hierarchy, so failure handling does not turn onboarding into a generic system-status page.

Visual review corrected the receipt's flex sizing after the first wide capture squeezed its label into a vertical strip. A fixed action basis and flexible summary restored the intended evidence hierarchy. The browser artifact resets the nested scroll container after input focus; this is a test-framing correction, not hidden application scrolling.

- [390 × 844 unread profile/goal register](../../output/playwright/iteration-071-profile-register-offline-mobile.png)
- [1440 × 1000 retained profile v1 and local edit](../../output/playwright/iteration-071-profile-register-stale-wide.png)

## History-calendar read authority — iteration 072

The `HISTORY LEDGER / 28D` sheet now starts with a narrow accepted-range toolbar and an authority receipt before the evidence map. On a 390 × 844 initial transport failure, the toolbar states that range, timezone and counts still require a successful response; the amber receipt contains the only recovery action. The calendar card remains recognizable but says its range is unverified, while the four summary cells use em dashes and the selected-day card says `日期待核对`. No blank cells or zero values impersonate account evidence.

On 1440 × 1000 H5, a 503 refresh retains the exact accepted local range, `Asia/Shanghai`, its 28 cells, one recorded body mark and `1 / 28` summary. The amber receipt names the retained range above the two-column sheet. Day cells and all three backfill actions keep their content but use visibly muted disabled styling plus guarded callbacks, so the evidence stays readable without looking current or actionable.

The focused retry uses the same mineral outline on mobile and wide H5. Visual review also compared a shared authority-component variant; it increased H5 route duplication, so the calendar keeps a page-local rendering while preserving the established mineral-toolbar/amber-receipt/paper-evidence grammar.

- [390 × 844 unread history calendar](../../output/playwright/iteration-072-history-calendar-offline-mobile.png)
- [1440 × 1000 retained history range and recorded day](../../output/playwright/iteration-072-history-calendar-stale-wide.png)

## Aggregate revision-sheet read authority — iteration 073

The body/recovery, workout and meal history sheets now share one compact audit-state grammar without flattening their existing record-specific rows. Opening a sheet immediately preserves its title and requested aggregate. Before the first successful response, a mineral `CHECKING AUDIT` receipt states that revision count and boundary are unknown; transport, refusal, service and unknown failures replace it with an amber product-owned receipt rather than closing the sheet or showing an empty list.

On 390 × 844 workout H5, the initial offline state keeps `全身训练 A历史`, the close control and one full-width focused retry in a single bottom sheet. The receipt says `REVISIONS — · AUDIT BOUNDARY UNKNOWN`; no version row or terminal “all loaded” label appears. A successful retry restores the immutable row without recreating or mutating the workout.

On 1440 × 1000 health H5, a 503 older-page response keeps ten accepted `v12` through `v3` rows visible in the side sheet. `RETAINED 10 REVISIONS · CURSOR FROZEN` names the exact page-memory evidence boundary; the old continuation control remains visible but inactive while the focused retry issues only that suffix read. Scroll margin keeps the complete failure receipt visible when focus returns from the prior continuation position.

Successful empty history has a separate quiet-green confirmation instead of sharing loading or failure copy. The state component uses the established ruled receipt, amber uncertainty and mineral focus language; it adds no health interpretation, revision comparison score or mutation control.

- [390 × 844 unread workout revision sheet](../../output/playwright/iteration-073-workout-history-offline-mobile.png)
- [1440 × 1000 retained health revisions](../../output/playwright/iteration-073-health-history-stale-wide.png)

## Owner-definition revision-ledger read authority — iteration 074

The embedded action and food correction editors now extend the aggregate-history receipt inside their existing `REVISION LEDGER` rail. The rail keeps the definition-specific R-number vocabulary, thin juniper rule and compact metric rows; only its read authority uses the shared mineral checking, amber failure and accepted-empty grammar. This makes an audit outage legible without turning a user-authored definition into unsafe or invalid content.

On 390 × 844 action H5, an initial transport loss keeps the selected strength/repetition/equipment fields, `停用 / 取消 / 保存纠正` actions and current-directory card in view around the amber receipt. `REVISIONS — · AUDIT BOUNDARY UNKNOWN` replaces the former false “temporarily unable” empty row, and the single focused retry restores R1 without closing or resetting the editor.

On 1440 × 1000 food H5, a 503 suffix response keeps R12 through R3 and the unsaved correction form in one wide sheet. The focused `重试载入更早版本` control sits above the retained rows, while the disabled old continuation stays at the bottom and the correction/archive actions remain visually active. This is deliberate: history continuation lost authority, but the current definition came from the separately accepted owner register.

The same successful-empty card, request-generation guard and focus scroll margin now cover all five aggregate/definition history consumers. No view scores nutrient accuracy, movement safety or the meaning of a revision.

- [390 × 844 unread action-definition ledger](../../output/playwright/iteration-074-action-definition-history-offline-mobile.png)
- [1440 × 1000 retained food-definition revisions and correction](../../output/playwright/iteration-074-food-definition-history-stale-wide.png)

## Week Fold decision-history read authority — iteration 075

The Week Fold evidence rail now applies the same bounded audit grammar to plan decisions without turning the whole planning desk into a service-error surface. A failed older-page request inserts an amber `SERVICE PAUSED` receipt immediately above the accepted versions, names `RETAINED 10 REVISIONS · CURSOR FROZEN` and moves focus to one outlined suffix-retry control. The original continuation stays visible at the end of the list but is inert, so its previous cursor cannot appear current.

On 1440 × 1000 H5, the wide composition keeps the v11 current plan, plan-to-workout evidence and AI provenance above the right-hand history rail while v11 through v2 remain readable below the failure receipt. The explanation rail explicitly reads `EXPLANATION RUNS 0 · ACCEPTED SNAPSHOT / 解释档案已核对`, distinguishing an earned empty ledger from an unavailable or simply omitted section. Retrying the plan suffix restores v1 without regenerating a plan or creating an explanation run.

The receipt deliberately does not disable local inspection of the accepted current plan or explanation provenance. It also introduces no plan-quality score, adherence inference, health interpretation or prescriptive copy; the visual state describes only audit-read authority.

- [1440 × 1000 retained weekly-plan decisions and accepted-empty explanations](../../output/playwright/iteration-075-plan-history-stale-wide.png)

## Aggregate-history dialog focus boundary — iteration 076

The body/recovery, workout and meal revision sheets now behave as one keyboard surface while retaining their separate ledger identities. Enter or Space on a row's `历史` control opens the requested sheet; successful entry moves focus to the circular close action, while an initial or continuation failure may supersede it with the amber retry action. The close action uses a visible double mineral ring on Taro's custom element rather than depending on a native `button:focus-visible` selector that H5 does not render.

On 390 × 844 H5, the bottom sheet leaves the blurred record ledger recognizable behind it, keeps `AUDIT TRAIL / 体重历史` above the immutable v12–v7 rows and exposes the focused close action within thumb reach. On 1440 × 1000 H5, the same focus mark anchors the top-right of the narrow audit rail without competing with the retained record editor beneath the scrim. Escape, the circular action and scrim all close through one path and return to the exact row trigger; the stable refresh control is only a fallback when that trigger no longer exists.

The treatment adds no animation, persistence or data copy. It does not claim focus trapping, screen-reader support or physical keyboard behavior on untested WeChat devices; those remain release evidence. Programmatic close during parent refresh deliberately does not restore focus into a ledger whose authority is being replaced.

- [390 × 844 safe focus entry in the health-history bottom sheet](../../output/playwright/iteration-076-history-focus-mobile.png)
- [1440 × 1000 safe focus entry in the health-history side rail](../../output/playwright/iteration-076-history-focus-wide.png)

## Destructive record-dialog focus boundary — iteration 077

The body/recovery, workout and meal delete confirmations now open as one cancel-first keyboard pattern. Enter or Space on a row's guarded delete control moves focus to the non-destructive `取消` action, not the irreversible action. Escape and explicit cancel close through the same boundary and restore the exact row trigger. Once confirmation has been submitted, cancel and Escape become unavailable until the request settles; this prevents a committed operation from looking locally cancelled.

The 390 × 844 record artifact keeps the ledger visibly blurred behind a compact paper dialog, with a double mineral focus ring around cancel and a lower-emphasis brick-red confirmation beside it. The 1440 × 1000 meal artifact preserves the same hierarchy inside the wide ledger/editor composition. Successful deletion removes the trigger and moves focus to the stable ledger-refresh control; a failure leaves the dialog open and returns focus to cancel.

Visual QA found that Taro emits `disabled="false"` on its H5 custom element. The component-library disabled selector therefore overrode the original class color and made cancel nearly invisible even while enabled. The three page styles now use the explicit `aria-disabled="false"` contract to restore dark text, and browser assertions verify the computed color as well as focus. The boundary changes no revision, deletion, audit or health interpretation semantics and remains an automated H5 claim, not real assistive-technology/device proof.

- [390 × 844 cancel-first body-record deletion](../../output/playwright/iteration-077-delete-cancel-mobile.png)
- [1440 × 1000 cancel-first meal deletion](../../output/playwright/iteration-077-delete-cancel-wide.png)

## Aggregate-delete response-loss recovery — iteration 078

The three recording ledgers now move an interrupted DELETE out of the modal and into one amber ruled receipt directly above the affected list. `RESULT UNKNOWN / 先核对再决定` names uncertainty without claiming failure or success. The copy states that the current aggregate must be read before another deletion; the single outlined `核对当前记录` action receives focus, while every row's delete control is visibly unavailable until resolution. Other reading, correction and history controls retain their existing parent-ledger authority.

On 390 × 844 H5, the body receipt remains in the recent-log card immediately before the still-visible R2 row, keeping both the unresolved target and its evidence in one reading column. On 1440 × 1000 H5, the same compact receipt sits at the top of the meal ledger rail without widening or covering the editor. The mineral double focus ring and ochre rule provide shape as well as color, and the action uses explicit `aria-disabled` styling for Taro's custom element.

An owner-visible 404 removes the row and moves focus to ledger refresh without sending another DELETE. If the exact read returns the same revision, the receipt closes, the row regains focus and only a later fresh confirmation can delete. A different revision replaces the row and terminates the old intent. Explicit refusal uses a terminal receipt instead of a read or replay. These are authority labels, not claims about physical media deletion, offline synchronization or global truth outside the authenticated ledger.

- [390 × 844 unresolved body deletion and exact-read action](../../output/playwright/iteration-078-delete-reconciliation-mobile.png)
- [1440 × 1000 unresolved meal deletion in the ledger rail](../../output/playwright/iteration-078-delete-reconciliation-wide.png)

## Aggregate-correction response-loss recovery — iteration 079

The three record editors now reuse their existing inline save-status surface as an authority switch. When an expected-revision PUT loses its response, the eyebrow changes to `RECONCILE FIRST / 禁止直接重放`, the exact draft stays editable and the primary action changes from save to `核对保存结果`. The amber ruled treatment distinguishes uncertainty from both a green success and a red explicit refusal without adding another modal or moving the person away from their input.

On 390 × 844 H5, the body editor keeps the submitted `71.8 kg`, occurrence, source and visible R1 base immediately above the recovery action; the older accepted R1 trend remains readable below. On 1440 × 1000 H5, the meal editor retains its food snapshot, serving and nutrient preview while the R1 ledger card remains in the right rail. This makes the two sides of reconciliation visible together without presenting user-confirmed nutrients as newly verified facts.

The exact read accepts a save only when the current revision advanced and every submitted field matches. The same revision returns the primary action to a fresh explicit save while preserving input; a different revision updates only the comparison base and keeps the draft for review. A missing target disables save until cancel so a correction cannot silently become a create. Any draft mutation invalidates the old recovery action in the same render. These states add no auto-save, offline queue, background replay or correction-idempotency claim.

- [390 × 844 unresolved body correction with retained input](../../output/playwright/iteration-079-correction-reconciliation-mobile.png)
- [1440 × 1000 unresolved meal correction beside accepted R1](../../output/playwright/iteration-079-correction-reconciliation-wide.png)

## Meal-favorite response-loss recovery — iteration 080

An interrupted favorite toggle now becomes one amber ruled evidence receipt at the top of `本餐内容`, next to the meal snapshot it must not change. `FAVORITE UNKNOWN / 先核对收藏清单` states that neither success nor failure is known. The single `核对收藏状态` action receives the mineral double focus ring, while all favorite toggles freeze; meal editing and save retain their existing nutrition authority.

On 390 × 844 H5, the receipt, retained chicken snapshot, entered 120 g serving and calculated meal preview remain in one reading column. The source tab and title survive both the interrupted request and list read. Copy names the exact current-list authority and explicitly says no PUT/DELETE is replayed, rather than presenting an ordinary network error that invites repeated taps.

A matching food/default-serving snapshot proves PUT completion; absence proves DELETE completion. A present-but-different favorite is labeled divergent, while an unchanged list closes the receipt and requires a fresh explicit toggle. Explicit refusal uses a terminal close action. These states do not claim catalog verification, mutate meal facts, persist commands or provide offline synchronization.

- [390 × 844 unresolved favorite save above the retained meal snapshot](../../output/playwright/iteration-080-favorite-reconciliation-mobile.png)

## Profile/goal response-loss recovery — iteration 081

An interrupted profile/goal PUT now turns the existing three-sheet editor into a locked evidence surface. `PROFILE SAVE UNKNOWN / 禁止直接重放` appears below the unchanged safety and consent sheet, names the submitted base revision and provides one full-width `核对保存结果` action. The regular save action disappears until current evidence resolves; step navigation remains available for reviewing the frozen input.

On 390 × 844 H5, all six risk choices retain readable disabled text, the four consent switches remain visibly on, and the amber ruled receipt sits immediately after them. Visual review corrected Taro's native disabled treatment, which initially made unselected risk labels nearly disappear. Explicit muted/juniper text fill now keeps both selected and unselected facts readable without making them look interactive, while the recovery action retains the mineral double focus ring.

Only an advanced/current-first revision with complete profile, goal, constraint, risk-flag and consent-version equality becomes green success. Same-revision or confirmed-absence evidence restores a fresh explicit save; divergent evidence preserves the frozen local input and enters the established discard/load-current choice. Revision alone never implies a safety or consent fact, and the page adds no autosave, background replay or persistent profile draft.

- [390 × 844 unresolved profile save below frozen risk and consent input](../../output/playwright/iteration-081-profile-save-reconciliation-mobile.png)

## Optional-consent revocation response-loss recovery — iteration 082

The privacy desk now distinguishes a failed request from an unknown revocation result. On 390 × 844 H5, the amber ruled receipt appears directly beneath the custody thesis and above the retained nine-item ownership ledger. `REVOCATION UNKNOWN / 禁止重复撤回` names the exact safety boundary, while the plain copy identifies the target authorization, says cleanup counts are unknown and promises one current-ledger read rather than another POST.

The old inventory remains fully readable because it is the last accepted evidence, but download, every consent revocation and all erasure-preparation controls are inert until the single full-width `核对撤回结果` action resolves. Back, profile editing and logout retain their existing authority. The receipt uses the established retained-inventory metric so it cannot be mistaken for a global outage or a background synchronization state.

Only current `已撤回` evidence permits green completion copy, and that copy explicitly withholds cleanup counts lost with the POST response. Current `有效` evidence restores a later fresh confirmation without replay; missing or never-granted state becomes divergent rather than an inferred success. The visual state adds no optimistic check mark, hidden retry, persisted purpose or medical/privacy claim beyond current authorization evidence.

- [390 × 844 unresolved optional-consent revocation above retained custody inventory](../../output/playwright/iteration-082-privacy-revocation-recovery-mobile.png)

## Portable-export client artifact verification — iteration 083

The custody desk now treats transport success and a valid portable artifact as separate states. The export action dynamically loads its file adapter, reads the temporary H5 Blob or WeApp file and accepts only the current JSON media type, exact v4 envelope/collection topology, valid generated time/account UUID and bounded byte length before allowing download or persistent save.

At 390 × 844, a rejected old-version artifact keeps the established masthead, safety thesis and complete nine-item ownership ledger visible. One red product-owned alert states that version/structure verification failed and that no download/save location was written; it exposes neither raw response text nor exported content. A valid artifact instead reports only the schema version, locale-formatted byte length and generated time before the existing download/save wording. No account ID, record body or file path becomes page feedback.

The browser flow proves old-version rejection, wrong-media rejection and one valid real-service download. The visual evidence deliberately captures the rejected artifact because false success is the highest-risk state. H5 Blob URLs are released after use or rejection. The WeApp branch compiles and reads before `saveFile`, but its real-device file-system behavior remains a release gate rather than a screenshot claim.

- [390 × 844 rejected old-version export above retained custody inventory](../../output/playwright/iteration-083-export-verification-mobile.png)

## Screenshot review checklist

- The Rhythm Rail remains understandable without color.
- Chinese text does not inherit overly condensed Latin metrics.
- The next action is identifiable in under five seconds.
- Quick record is reachable with one hand on a typical phone viewport.
- Loading, empty, estimated, confirmed, edited, offline, and error states are visually distinct.
- Focus, text scaling, reduced motion, and 320 px width are tested before calling the shell done; real screen-reader/device support remains a separate release gate.
