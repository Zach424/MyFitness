# Product brief

## Product thesis

Fitness data is usually scattered across notes, watches, food apps, and memory. MyFitness / 衡迹 gives one calm daily view that compares the plan with what actually happened, then turns the difference into the next safe adjustment.

## Initial audience

Adults beginning or resuming structured fitness who want to lose fat, gain muscle, improve fitness, or build consistency. They have limited coaching support and need a record that is faster than a spreadsheet but more accountable than a chat response.

The MVP intentionally excludes minors and therapeutic plans for pregnancy, eating disorders, diabetes, kidney disease, cardiac conditions, or other cases requiring individualized medical care.

## Core user jobs

1. See what matters today without interpreting multiple dashboards.
2. Record a workout, meal, body metric, or recovery signal in under 30 seconds for a common repeat action.
3. Understand weekly change without overreacting to one measurement.
4. Receive a realistic plan that respects time, equipment, experience, preferences, fatigue, and pain signals.
5. Correct AI mistakes and remain in control of every stored fact.
6. Export or delete personal data without contacting support.

## Information architecture

| Area   | User question                           | MVP content                                            |
| ------ | --------------------------------------- | ------------------------------------------------------ |
| Today  | What should I do next?                  | Readiness, next action, plan-vs-actual rail, quick add |
| Record | What happened?                          | Body, workout, nutrition, sleep/recovery entries       |
| Plan   | What is this week trying to achieve?    | Weekly training and nutrition targets, substitutions   |
| Coach  | Why is the plan changing?               | Evidence-backed summary, questions, feedback           |
| Me     | What data and permissions do I control? | Profile, goals, units, consent, export, deletion       |

## MVP functional scope

### Foundation and profile

- WeChat/phone-ready identity boundary, with local demo identity before backend integration.
- Height, weight, age band, goal, experience, available days, session length, equipment, dietary preferences, unit system, and timezone.
- Explicit warnings and safe exit for health-risk answers.

### Records

- Body: weight, waist, optional device-reported body-fat estimate, resting heart rate.
- Workout: exercise, sets, reps, load, duration, distance, RPE, completion, pain/fatigue feedback.
- Nutrition: food, portion, energy and macronutrients; favorites and recent items.
- Recovery: sleep duration/quality, soreness, energy, stress, optional note.
- Every record includes source, unit, occurred-at time, timezone, confidence where estimated, and revision history.

### Insight and planning

- Seven-, thirty-, and ninety-day trends using moving averages where appropriate.
- Weekly summary derived from computed metrics before narrative generation.
- Structured weekly plan with reason, alternatives, version, and user changes.
- AI responses visibly labeled and never treated as medical advice.

### Image assistance

- Food recognition proposes candidates, portion range, uncertainty, and missing ingredients; the user confirms the final record.
- Progress photos support pose alignment and visual comparison only. They do not diagnose posture disorders or infer an exact body-fat percentage.
- EXIF is removed; analysis-only images are deleted by default; retained progress photos require separate consent.

## Explicit exclusions for the first release

- Social feed, leaderboards, live classes, marketplace, coach matching, insurance use, medical records, disease diagnosis, treatment claims, minors, and automatic integration with every wearable ecosystem.

## Success model

North-star metric: completed planned actions per weekly active user.

Supporting metrics:

- Onboarding-to-first-record completion.
- Number of days with at least one meaningful record per week.
- Weekly plan acceptance, modification, skip, and completion rates.
- Seven- and thirty-day retention.
- AI correction and rejection rates by feature and user segment.
- Safety-rule triggers, false positives, and unhandled incidents.
- Image analysis latency and cost per confirmed nutrition record.

Numeric targets will be set after prototype testing and the first 100-user baseline instead of inventing benchmarks without evidence.

## Business model hypothesis

- Free: manual records, core trends, basic weekly recap.
- Pro subscription: adaptive plans, richer AI explanations, photo assistance, long-term comparison and advanced exports.
- No advertising targeted with health data and no sale of user health data.

This hypothesis is not part of the first engineering milestone; retention and trust are the first gates.
