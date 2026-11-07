# 001: Repo, scaffold and deploy pipeline

type: HITL
blocked_by: none
prd: 000-prd-air-control.md (§4.6 app, §5 hosting/CI)

## What to build
The thinnest possible live site, plus the dev loop every later issue relies on.
- `git init` on `main`; the existing `.gitignore` is kept.
- Vite + plain TypeScript (strict) + Vitest. npm scripts: `dev`, `build`, `preview`, `test`, `typecheck` (`tsc --noEmit`).
- One trivial Vitest test, so `npm test` is green.
- Landing page: project name, one-line pitch, a **"Try it"** button (no behaviour yet), and the line "Video never leaves your device."
- GitHub Actions workflow: `npm ci`, `npm run typecheck`, `npm test` on every push and PR.
- Public GitHub repo `air-control`, pushed.
- Vercel project linked to the repo (free tier), deploying from `main`. Name: `air-control`, or `air-control-koe` if that's taken.

## Needs the human for
Creating the GitHub repo, connecting Vercel, and confirming the final URL.

## Acceptance criteria
- [ ] `npm test` and `npm run typecheck` pass locally.
- [ ] CI runs green on GitHub for the first push.
- [ ] The landing page is live at the Vercel URL and shows the Try it button and the privacy line.
- [ ] The live URL is written in the README (a one-line README is fine for now).
