# Progress-photo assistance model

Status: privacy-first local implementation with authority-aware reservation/upload/deletion recovery complete through iteration 057

## Product boundary

Progress photos are a private capture-consistency and user-controlled comparison tool. They are not diagnostic images. The system accepts the user's declared `front`, `side` or `back` view, checks only whether the image is usable for later visual alignment and lets the user compare two same-view retained photos.

The system does not infer anatomy, posture disorder, body-fat percentage, health status, attractiveness, progress quality or a recommended intervention. It stores no body score and writes nothing into confirmed health records.

## Contract and lifecycle

```text
reserve + analysis consent
          │
          ├─ analysis_only ─ upload/sanitize/check ─ ready ─ 24h expiry ─ deleted object
          │
          └─ retained + separate retention consent
                          └─ upload/sanitize/check ─ ready ─ explicit delete/withdrawal
```

`progress_photos` stores the declared view, capture time/timezone, retention mode, sanitized media dimensions/hash, quality method/result, consent-event references, upload/retention deadlines and deletion disposition. It never stores the raw upload. Reservations are owner-scoped and idempotent, and an upload token is bound to action, user, photo and expiry.

Lifecycle states are:

- `reserved`: consent receipts and a ten-minute signed upload path exist; no media exists.
- `ready`: a sanitized private JPEG exists and the item can be listed/previewed.
- `deleted`: explicit deletion or consent withdrawal removed user-visible data and enqueued media removal.
- `expired`: an unused reservation or 24-hour analysis-only record crossed its deadline and was reconciled.

## Ambiguous response recovery

The three client writes follow server authority rather than one generic retry rule:

- Reservation is owner/key/request-fingerprint idempotent while `reserved` and uploadable. The page retains the exact captured-at/view/retention/consent payload and key in memory, but no selected file/path. An explicit retry reopens the chooser and sends the same reservation request.
- Upload sanitizes/stores media and transitions one reservation to `ready`; it is not replay-safe. If its response is lost, the page reads the owner-visible ready list and accepts only the exact reserved photo ID. Absence ends the attempt without replaying bytes; reserved/temporary state follows the existing ten-minute/24-hour lifecycle.
- Delete hides the row and transactionally enqueues durable object removal; it is not replayed after an uncertain response. Owner-list absence proves only that the item left the private contact sheet. It does not prove the object deletion job completed.

The page retains non-media capture intent while unresolved and disables ordinary pointer/Enter/Space writes. It persists no request, key, image, path or replay command. The former automatic catch-path delete after upload error is intentionally removed because the upload may have committed before its response disappeared. A normal delete response also uses the narrow list-removal/durable-cleanup language rather than claiming immediate physical-byte deletion.

## Two-purpose consent

`progress_photo_analysis` is required for every reservation. It permits sanitization and the bounded capture-quality check. Withdrawing it:

- deletes every reserved or analysis-only progress photo;
- clears machine quality results from `retained` photos;
- preserves the sanitized media the user separately chose to retain.

`progress_photo_retention` is required only for `retained`. Withdrawing it deletes all progress-photo records and objects for the user, including retained media whose analysis consent was already withdrawn. A later new capture creates new append-only consent events; historical acceptance/revocation intervals remain auditable until account erasure.

## Capture-quality method

`progress-photo-capture-quality-2026-08-04.v1` runs on the sanitized JPEG and emits exactly four checks:

| Check       | Current deterministic boundary                     | Meaning                                     |
| ----------- | -------------------------------------------------- | ------------------------------------------- |
| Orientation | height / width at least 1.2                        | use a portrait frame                        |
| Resolution  | width at least 720 and height at least 960         | enough pixels for the alignment view        |
| Lighting    | mean channel brightness from 20% through 85%       | avoid globally dark or overexposed capture  |
| Contrast    | average channel standard deviation at least 12/255 | keep outline and background distinguishable |

The response contains bounded integer brightness/contrast percentages, strict reason codes and `machineEstimate: true`. `overallStatus=ready` means all four capture conditions passed; it does not mean the body, posture or health is “ready” or normal. `adjust` supplies capture advice and does not block storage or comparison.

## Media custody and storage scopes

Sharp validates JPEG/PNG/still WebP, rejects more than 6 MiB or 20 megapixels, rotates from metadata, bounds the longest edge to 1600 pixels and re-encodes JPEG at quality 82. Metadata is stripped by reconstruction. New object keys are:

```text
<user UUID>/food/<photo UUID>.jpg
<user UUID>/progress/<photo UUID>.jpg
```

Purpose-scoped prefix deletion prevents a food-photo withdrawal from deleting progress photos or the inverse. Exact-object and prefix jobs use the existing durable lease/retry/dead-letter worker; account erasure intentionally deletes the whole user prefix. Legacy unscoped food keys remain accepted for deletion and export compatibility.

Signed preview paths last five minutes, send `private, no-store`, and are accepted only while the row is ready and within retention. The portable export embeds only still-active sanitized JPEG bytes as base64 plus lifecycle/quality provenance; storage keys, idempotency data, fingerprints and signatures are excluded.

## Client alignment contact sheet

The page uses print-registration marks, a neutral body-shaped capture guide and a contact-sheet history. Retained photos of the currently selected declared view can be assigned as baseline/current. An onion-skin overlay changes only current-image opacity and shows a movable visual seam; it calculates no score.

The interface keeps machine language separate from user facts, repeats the two retention choices before every upload, exposes individual deletion and links to the privacy center. Mobile and wide layouts retain visible focus treatment and reduced-motion behavior.

## Validation and known limits

Local evidence covers contract rejection, deterministic quality output, metadata stripping, scoped object keys, signed preview, ownership, 24-hour retention, durable deletion, analysis/retention withdrawal, privacy inventory/export, H5 upload, same-view overlay, responsive layout and explicit deletion.

Known limits:

- Flat brightness/contrast heuristics do not detect uneven lighting, camera distance, clothing changes or occlusion.
- No real-person photos or external dataset are required or retained for this implementation; real-user validation still needs explicit research consent and policy review.
- Local MinIO does not prove production encryption, IAM, lifecycle, versioning, replication or regional custody.
- Retained base64 media can make synchronous portable exports large; closed-beta size measurement remains required.
- Image comparison remains perceptual and cannot establish health outcomes or causation.
