// Generates public/fixtures/synthetic-wave.json: an open right hand waving side to side.
// It is a stand-in until real recordings exist (issue 005). Run: npm run fixtures:synthetic
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FPS = 30;
const SECONDS = 4;
const WRIST = { x: 0.5, y: 0.78 };
const SCALE = 1.35;

// Open palm in hand-local units: wrist at the origin, fingers pointing up (negative y).
// Each finger: [angle from vertical in degrees, segment lengths base→tip]. Order matches MediaPipe.
const THUMB = { base: { x: 0.05, y: -0.06 }, angle: -38, segments: [0.06, 0.05, 0.04, 0.035] };
const FINGERS = [
  { base: { x: 0.07, y: -0.17 }, angle: -10, segments: [0.07, 0.045, 0.035] }, // index 5–8
  { base: { x: 0.025, y: -0.18 }, angle: -2, segments: [0.075, 0.05, 0.038] }, // middle 9–12
  { base: { x: -0.02, y: -0.17 }, angle: 6, segments: [0.07, 0.045, 0.035] }, // ring 13–16
  { base: { x: -0.06, y: -0.15 }, angle: 15, segments: [0.055, 0.035, 0.03] }, // pinky 17–20
];

/** The 21 landmarks of the template hand, in hand-local coordinates. */
function templateHand() {
  const points = [{ x: 0, y: 0, z: 0 }];
  /** Pushes the base point, then one point per segment along `angle` (0° = straight up). */
  const chain = ({ base, angle, segments }) => {
    const a = (angle * Math.PI) / 180;
    let p = { ...base, z: -0.005 };
    points.push(p);
    for (const len of segments) {
      p = { x: p.x - Math.sin(a) * len, y: p.y - Math.cos(a) * len, z: p.z - 0.008 };
      points.push(p);
    }
  };
  // Thumb: CMC (1) then MCP, IP, tip (2–4).
  chain({ ...THUMB, segments: THUMB.segments.slice(1) });
  FINGERS.forEach(chain);
  return points;
}

const round = (v) => Math.round(v * 10000) / 10000;

function frameAt(i, template) {
  const t = i / FPS;
  const swing = (Math.sin(t * Math.PI * 2 * 0.75) * 25 * Math.PI) / 180; // ±25° at 0.75 Hz
  const drift = Math.sin(t * Math.PI * 2 * 0.25) * 0.05;
  const cos = Math.cos(swing);
  const sin = Math.sin(swing);
  return {
    handedness: 'Right',
    timestamp: round((i * 1000) / FPS),
    landmarks: template.map(({ x, y, z }) => ({
      x: round(WRIST.x + drift + SCALE * (x * cos - y * sin)),
      y: round(WRIST.y + SCALE * (x * sin + y * cos)),
      z: round(z),
    })),
  };
}

const template = templateHand();
if (template.length !== 21) throw new Error(`template has ${template.length} landmarks, expected 21`);
const fixture = {
  name: 'synthetic-wave',
  fps: FPS,
  frames: Array.from({ length: FPS * SECONDS }, (_, i) => frameAt(i, template)),
};

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'fixtures', 'synthetic-wave.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(fixture) + '\n');
console.log(`Wrote ${fixture.frames.length} frames to ${out}`);
