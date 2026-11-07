# Air Control

Control a website with your hands through the webcam: point to move, pinch to click, swipe to go next. Runs 100% in the browser; video never leaves your device.

**Live:** https://air-control-koee.vercel.app/

## Privacy

Your camera video and hand landmarks are processed only in your browser. Nothing is uploaded: there is no server-side code, and the MediaPipe model and WASM runtime are served from this site (`public/mediapipe/`), not a CDN.

The browser enforces this. [`vercel.json`](vercel.json) sends these headers on every page:

- `Content-Security-Policy: default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; worker-src 'self' blob:; script-src 'self' 'wasm-unsafe-eval'`
  - `connect-src 'self'` blocks `fetch`, XHR, WebSocket and beacon requests to any other origin, so even a bug or a compromised dependency can't send frames or landmarks away.
  - `'wasm-unsafe-eval'` is the one allowance MediaPipe needs: it lets the browser compile the hand tracker's WebAssembly. Plain `'unsafe-eval'` (JavaScript `eval`) stays blocked.
  - `blob:` in `img-src`, `media-src` and `worker-src` covers the camera stream and locally generated files (the dev capture download).
- `Permissions-Policy: camera=(self)`: only this site, never an embedded frame, may ask for the camera.
- `Referrer-Policy: strict-origin-when-cross-origin`.

`vite preview` reads the same headers from `vercel.json`, so the Playwright tests run under the real policy. `e2e/privacy.spec.ts` fails if the app requests any other origin or triggers a CSP violation, both in demo (fixture) mode and with a fake camera running the real model.

Check the deployed headers with `curl -I https://air-control-koee.vercel.app/`.

## Develop

```sh
npm install
npm run dev        # local dev server
npm test           # unit tests (Vitest)
npm run typecheck  # TypeScript, no emit
npm run build      # production build to dist/
```

Project plan: [`issues/000-prd-air-control.md`](issues/000-prd-air-control.md).
