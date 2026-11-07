# 015: Privacy hardening

type: AFK
blocked_by: 004
prd: §5 privacy, CLAUDE.md rule on network calls

## What to build
- `vercel.json` with a Content-Security-Policy: `default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; worker-src 'self' blob:; script-src 'self' 'wasm-unsafe-eval'`. Adjust only as much as MediaPipe requires, and document why in the README.
- Also set `Permissions-Policy: camera=(self)` and `Referrer-Policy`.
- A short "Privacy" note on the landing page and a section in the README: video and landmarks are processed only in your browser; nothing is uploaded; the CSP is how the browser enforces that.
- A Playwright test that runs the app in fixture mode and fails if any request goes to an origin other than the site's own.

## Acceptance criteria
- [ ] The deployed site returns the CSP header (check with `curl -I`), and the app still works with no CSP errors in the console.
- [ ] The Playwright no-external-requests test passes in CI.
