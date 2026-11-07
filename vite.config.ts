/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// vercel.json is the single source of the security headers (CSP etc.). `vite preview` serves the
// same ones, so the Playwright tests run the production build under the real policy.
const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
const securityHeaders = Object.fromEntries(
  vercel.headers.find((h) => h.source === '/(.*)')?.headers.map((h) => [h.key, h.value]) ?? [],
);

export default defineConfig({
  preview: { headers: securityHeaders },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
