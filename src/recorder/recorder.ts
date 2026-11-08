// Recorder (PRD §4.8): labelled landmark clips for the training dataset, exported as schema v1.
// Landmarks only, never images. The clip clock runs on tick(dt); samples come from push(frame).
import type { HandFrame, Handedness, Landmark } from '../tracker/tracker';

export const LABELS = ['none', 'point', 'pinch', 'open_palm', 'fist'] as const;
export const LIGHTINGS = ['daylight', 'lamp', 'dim'] as const;
export type Label = (typeof LABELS)[number];
export type Lighting = (typeof LIGHTINGS)[number];

export interface ClipMeta {
  label: Label;
  /** `p01`, `p02`, … */
  participant: string;
  lighting: Lighting;
  session: string;
}

export interface Sample {
  label: Label;
  participant: string;
  handedness: Handedness;
  lighting: Lighting;
  session: string;
  timestamp: number;
  landmarks: Landmark[];
}

export interface DatasetV1 {
  schemaVersion: 1;
  samples: Sample[];
}

export interface ClipSummary {
  label: Label;
  samples: number;
}

export interface RecorderConfig {
  countdownMs: number;
  recordMs: number;
  /**
   * Target sample rate: at most one frame per 1000 / hz ms slot of *clip time* (the tick clock), so a
   * 10 s clip gives ~100 samples even when frame timestamps run slow (e.g. a fixture replaying under load).
   */
  hz: number;
}

export const DEFAULT_RECORDER_CONFIG: RecorderConfig = { countdownMs: 3000, recordMs: 10_000, hz: 10 };

export type RecorderPhase = 'idle' | 'countdown' | 'recording';

const PARTICIPANT = /^p\d{2,}$/;
const SLUG = /^[a-z0-9_-]+$/i;

/** Throws with a readable reason if `meta` can't go into the dataset. */
export function validateMeta(meta: ClipMeta): void {
  if (!LABELS.includes(meta.label)) throw new Error(`Unknown label: ${meta.label}`);
  if (!LIGHTINGS.includes(meta.lighting)) throw new Error(`Unknown lighting: ${meta.lighting}`);
  if (!PARTICIPANT.test(meta.participant)) throw new Error('Participant ID must look like p01');
  if (!SLUG.test(meta.session)) throw new Error('Session ID must be letters, digits, - or _');
}

export function createSessionRecorder(config: RecorderConfig = DEFAULT_RECORDER_CONFIG) {
  const slotMs = 1000 / config.hz;
  const samples: Sample[] = [];
  const clips: ClipSummary[] = [];
  let phase: RecorderPhase = 'idle';
  let remainingMs = 0;
  let clip: { meta: ClipMeta; samples: Sample[]; lastSlot: number } | null = null;

  const finish = () => {
    if (clip) {
      samples.push(...clip.samples);
      clips.push({ label: clip.meta.label, samples: clip.samples.length });
    }
    clip = null;
    phase = 'idle';
    remainingMs = 0;
  };

  return {
    get phase() {
      return phase;
    },
    /** Time left in the current countdown or recording, in ms. */
    get remainingMs() {
      return remainingMs;
    },
    /** Samples captured so far in the clip in progress. */
    get clipSamples() {
      return clip?.samples.length ?? 0;
    },
    /** Finished clips this session, oldest first. */
    get clips(): readonly ClipSummary[] {
      return clips;
    },

    start(meta: ClipMeta) {
      if (phase !== 'idle') throw new Error('A clip is already in progress');
      validateMeta(meta);
      clip = { meta: { ...meta }, samples: [], lastSlot: -1 };
      phase = 'countdown';
      remainingMs = config.countdownMs;
    },

    cancel() {
      clip = null;
      phase = 'idle';
      remainingMs = 0;
    },

    tick(dt: number) {
      if (phase === 'idle') return;
      remainingMs -= dt;
      if (remainingMs > 0) return;
      if (phase === 'countdown') {
        phase = 'recording';
        remainingMs = config.recordMs;
      } else finish();
    },

    push(frame: HandFrame | null) {
      if (phase !== 'recording' || !clip || !frame) return;
      const slot = Math.floor((config.recordMs - remainingMs) / slotMs);
      if (slot <= clip.lastSlot) return;
      clip.lastSlot = slot;
      const { label, participant, lighting, session } = clip.meta;
      // Built field by field, so nothing else on the frame (an image, extra scores) can slip in.
      clip.samples.push({
        label,
        participant,
        handedness: frame.handedness,
        lighting,
        session,
        timestamp: frame.timestamp,
        landmarks: frame.landmarks.map(({ x, y, z }) => ({ x, y, z })),
      });
    },

    toDataset(): DatasetV1 {
      return { schemaVersion: 1, samples: samples.map((s) => ({ ...s, landmarks: s.landmarks.map((p) => ({ ...p })) })) };
    },
  };
}

export type SessionRecorder = ReturnType<typeof createSessionRecorder>;
