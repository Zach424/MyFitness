# Design system baseline

Status: planned, not yet visually validated

Working brand: 衡迹 / MyFitness

Audience: adult fitness beginners and returners

Primary page job: understand today's next action and record it quickly

## Direction

The interface borrows from a well-kept training logbook: deliberate marks, measured spacing, clear units, and visible revisions. It avoids a generic collection of bright progress rings and avoids using aggression or shame as motivation.

The memorable element is the **Rhythm Rail / 节律轨**: a vertical rail that pairs planned actions with completed evidence across training, meals, body signals, and recovery. A plan mark is outlined; a confirmed record is filled; an AI estimate is hatched until the user confirms it. This single visual grammar makes plan, actual, and uncertainty legible throughout the product.

## Tokens

### Color

| Token name | Hex | Role |
| --- | --- | --- |
| Ink / 墨尺 | `#142426` | Primary text and high-contrast controls |
| Mineral / 矿蓝 | `#244C66` | Brand anchors, links, plan marks |
| Juniper / 杜松 | `#3F756B` | Confirmed records and steady progress |
| Pulse / 脉冲 | `#E96A5B` | Exertion, time-sensitive attention, never routine error decoration |
| Mist / 薄雾 | `#F2F6F5` | App surface and grouped backgrounds |
| Paper / 纸白 | `#FCFDFC` | Cards, forms, reading surfaces |
| Warning / 琥珀 | `#A96821` | Risk checks and uncertain data |

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

## Screenshot review checklist

- The Rhythm Rail remains understandable without color.
- Chinese text does not inherit overly condensed Latin metrics.
- The next action is identifiable in under five seconds.
- Quick record is reachable with one hand on a typical phone viewport.
- Loading, empty, estimated, confirmed, edited, offline, and error states are visually distinct.
- Focus, text scaling, reduced motion, and 320 px width are tested before calling the shell done.
