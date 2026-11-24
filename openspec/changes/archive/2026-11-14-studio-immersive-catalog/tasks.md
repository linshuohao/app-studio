## Implementation
- [x] Fix shared JSON text formatting, precision preservation and display-only state.
- [x] Implement immersive workbench and retain safe return / contextual catalog links.
- [x] Add actual material previews and purpose / implementation classifications.
- [x] Fix layout whitespace and global CSS contamination discovered in real browser use.
## Verification
- [x] Complete browser and API regression, independent review and manual page checks.
- [x] Synchronize authoritative docs and archive with verification receipt.

## Final evidence · 2026-11-14
- Browser: `STUDIO_DIST_DIR=.next/studio-workbench STUDIO_TEST_PORT=3218 STUDIO_TEST_API_PORT=3318 STUDIO_TEST_BROWSER_CHANNEL=chrome pnpm exec playwright test -c apps/studio/playwright.config.ts` — 16/16 passed (32.2s). Existing save/retry/history/publish/Host/account/member flows retained; new tests cover all 14 live material examples, reset, condition toggle, dialog editing, remote search, category filters, readonly autoformat, immersive return cancellation and save state.
- Additional boundary: same browser command with `--grep 'keeps every page'` — 1/1 passed (7.5s), 80-character release name, 72-character form name, long note, 10 route entries × 1440×900 / 1024×768 / 768×600 / 390×844 / 844×390. Measures actual text line rectangles and page overflow rather than treating CSS white-space as proof.
- API: `pnpm --filter @form-engine/api test:integration --testTimeout=15000` — 6/6 passed (3.76s), including authenticated catalog metadata, all 14 compiled previews and existing permissions / versions / release semantics.
- API production build, lint and Studio production build / typecheck passed. Shared JSON checks, generated catalog check and docs build/check pass via workflow verification. Docs generated 59 reading pages; 61 HTML / 8969 links validated. No new ADR: authorized UI refinement and additive catalog display data; existing version / release ownership unchanged.
- Independent read-only reviewer completed two passes: metadata version gate, no-op format state, adaptive JSON height, contextual links and preview lifecycle rechecked. Final small copy / CSS edits self-reviewed; final browser regression covers their routes.
- Real browser: reviewed form list, immersive config/text, history, named release, material list/detail/folding, readonly formatted Manifest, function filtering, members, account and named-release Host. Fixed Studio hover/header styles leaking into material controls, arbitrary history-row wrapping, long member IDs and raw engineering catalog copy. No actual credential changes or form writes during this manual review.
- Screenshots: `studio-immersive-editor.png`, `material-live-preview.png` in /Users/samuel/.codex/visualizations/2026/11/14/01a1d82b-3c60-70b0-b9d3-33d7733f89d3/.
- Original manual-mvp/platform.sqlite SHA256 unchanged: 4da722ff08d0c3e00fb6a8cbdf4f5ffd091df6b31346a12812250250f14459ba. Preview remains isolated on 3219/3319; original 3200 service untouched. No commit/push/deploy. Public GitHub OAuth and future Vue/Flutter implementations remain outside this local verification.
