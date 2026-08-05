# ADR-0050: Explicit Taro H5 keyboard activation and focus restoration

Date: 2026-08-05

Status: accepted

## Context

The lazy owner-action register and private food-photo workbench move users between Taro routes and include high-risk review or archive states. Their controls exposed accessible names, `role="button"` and `tabIndex`, but Taro H5 renders a custom `taro-button-core` element rather than a native HTML button. Browser proof showed that pressing Enter on these elements did not invoke the click handler. Route changes also remove the initiating element until return, while Taro's animated router transition can race immediate focus calls.

The application needs one locally testable behavior for pointer and keyboard users without importing a browser-only dependency into WeApp, leaking sensitive workflow state through navigation parameters or claiming untested screen-reader/device behavior. Reduced-motion emulation must not change the shared Taro router container.

## Decision

- Critical navigation and mutation controls use the dependency-free shared `buttonActivationProps` adapter. It invokes one guarded action for pointer, Enter and Space, prevents native key scrolling and ignores repeated or disabled activation.
- Lazy route targets receive stable element IDs. An H5-only focus helper resolves the target after a bounded 350 ms router-transition delay; it is a no-op when `document` is unavailable, so WeApp compilation does not acquire a DOM assumption.
- A child route focuses its back control on entry. On return, the parent focuses the exact launcher or edit control when it still exists and otherwise uses a stable manager fallback.
- The archive dialog exposes labelled-by and described-by relationships, focuses the safe cancel action first, returns to the archive trigger after cancellation and focuses the new-action control after success because the archived trigger is removed.
- Workflow feedback is a polite atomic status. Candidate selection has an explicit pressed state and remains understandable through text, labels and action names without color alone.
- Reduced-motion rules may target descendants only beneath the owning page root. A page stylesheet must not apply a global `*` transition rule that can mutate Taro's router container.
- Automated H5 browser evidence covers keyboard completion, focus entry/return, status semantics, reduced motion and narrow/wide layouts. Real VoiceOver, TalkBack, WeChat devices and physical-keyboard behavior remain separate release evidence.

## Consequences

Critical H5 workflows now have reproducible keyboard behavior and deterministic focus recovery without a runtime dependency or navigation-state store. The same action guard prevents keyboard and pointer paths from drifting, and page-scoped reduced motion avoids router pollution.

The contract is adopted per critical control; it does not retroactively prove every Taro button or any real assistive-technology/device combination. The focus delay is intentionally coupled to the current router transition duration and must be reviewed if that motion contract changes. Accessibility code and styles increased measured production trees to 2,420,203 H5 bytes and 822,748 WeApp bytes, so the narrow total/page ceilings move to 2,421,000, 823,000 and 40,000 bytes while entry, async-route and vendor ceilings remain unchanged.

Rejected alternatives were relying on `role`/`tabIndex` alone, installing a global key listener, carrying focus through URL/storage state, forcing synchronous focus during route animation and keeping global reduced-motion wildcards.
