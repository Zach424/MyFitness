# ADR-0081: Consent history scales and activates explicitly

Date: 2026-08-05

Status: accepted

## Context

Consent-history read authority added an initial error, retained prefix, two footer actions and one focused retry. The standard 390 px pointer flow was readable, but history-owned text still used fixed pixel sizes and the toggle used a fixed 40 px line height. That did not establish reflow under a narrow viewport with enlarged text, and Taro's custom H5 button still requires explicit evidence for Enter and Space activation.

The accessibility change must not broaden current consent authority, persist history, alter the API or claim untested assistive-technology/device behavior.

## Decision

- Expose the history-owned 8/9/10/11 px type levels through four component variables so a bounded test can override headings, factual labels, failure copy, indexes and controls together without changing Taro's viewport-managed root size.
- Keep minimum control heights but use content-driven line height so enlarged labels can wrap instead of clipping.
- Give history item copy a zero minimum width and permit long failure/version/timestamp text to wrap anywhere within the ruled ledger.
- At 320 × 844 and exact synthetic 16/18/20/22 px overrides, require equal scroll/client width in initial-error, accepted-page and retained-continuation states.
- Exercise the shared Taro activation adapter through Space opening, Enter first-read retry, Space latest-page refresh, Enter continuation, Space same-cursor retry and Enter collapse. Standard pointer tests remain required.
- Keep one focused retry after failure and prove the current optional-consent revocation action remains independently available after history closes.
- Limit claims to Chromium H5 semantics. VoiceOver, TalkBack, browser text-only zoom and physical WeChat-device keyboards remain release evidence.

## Consequences

The complete history state family now reflows without horizontal scrolling under the bounded exact-2× component-text matrix, and both keyboard activation paths exercise every history operation. Long factual values remain visible instead of being clipped or widening the page.

The first implementation used equivalent `rem` values and injected a 200% root font. Iteration 087 ordinary-density visual review showed that Taro already controls the H5 root `rem` size for viewport conversion, so those values enlarged normal rendering as well as the test. The accepted implementation restores the original pixel defaults behind component variables and overrides only those variables in the test. This correction narrows the evidence claim to synthetic component reflow; browser/system text-only scaling remains a release gate.

No runtime dependency, API, storage or consent behavior changes. Main browser validation grows to 92 tests and passes 92/92; OIDC passes 3/3, retaining 95 browser tests. H5/WeApp measure 2,800,513/1,064,360 bytes under unchanged total/entry/route/vendor/page budgets.

## References

- [ADR-0050](0050-taro-keyboard-focus-contract.md)
- [ADR-0079](0079-bounded-consent-receipt-history.md)
- [ADR-0080](0080-consent-history-read-authority.md)
- [Privacy ownership model](../PRIVACY_OWNERSHIP_MODEL.md)
- [Architecture baseline](../ARCHITECTURE.md)
- [Design system review](../../design/DESIGN_SYSTEM.md)
