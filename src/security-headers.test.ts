// Guards the privacy promise at the browser level: the deployed site's headers stop the page
// from talking to any origin but its own, and only this site may use the camera.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
};

function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp
      .split(';')
      .map((d) => d.trim().split(/\s+/))
      .filter((parts) => parts[0])
      .map(([name, ...values]) => [name ?? '', values]),
  );
}

const onEveryPath = vercel.headers.find((h) => h.source === '/(.*)');
const securityHeaders: Record<string, string> = Object.fromEntries(
  onEveryPath?.headers.map((h) => [h.key, h.value]) ?? [],
);

describe('security headers in vercel.json', () => {
  it('CSP allows network requests and scripts only from this site', () => {
    const csp = directives(securityHeaders['Content-Security-Policy'] ?? '');
    expect(csp.get('default-src')).toEqual(["'self'"]);
    expect(csp.get('connect-src')).toEqual(["'self'"]);
    // 'wasm-unsafe-eval' lets MediaPipe compile its WASM; plain 'unsafe-eval' stays off.
    expect(csp.get('script-src')).toEqual(["'self'", "'wasm-unsafe-eval'"]);
    for (const values of csp.values()) {
      expect(values.some((v) => /^https?:|^\*$/.test(v)), values.join(' ')).toBe(false);
    }
  });

  it('lets only this site use the camera, and sends no referrer to other origins', () => {
    expect(securityHeaders['Permissions-Policy']).toBe('camera=(self)');
    expect(securityHeaders['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  });
});
