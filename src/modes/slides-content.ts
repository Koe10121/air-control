// The Slides deck: a short tour of this project. Edit the copy here; the mode only renders it.

export interface Slide {
  title: string;
  /** Short lines, shown as a list. */
  points: string[];
  /** Optional links, shown under the points. External pages open in a new tab. */
  links?: { label: string; href: string }[];
}

export const SLIDES: readonly Slide[] = [
  {
    title: 'Air Control',
    points: [
      'Control a website with your hand, through your webcam.',
      'Point to move the cursor, pinch to click, swipe to change slides.',
      'Swipe your open hand to the right for the next slide, to the left to go back. Arrow keys and the buttons work too.',
    ],
  },
  {
    title: 'The pipeline',
    points: [
      'Camera → MediaPipe Hand Landmarker → 21 hand landmarks per frame.',
      'Landmarks → gesture engine → a smoothed cursor and events (click, swipe, pause, clear).',
      'Gestures, mouse and keyboard → one stream of actions → the current mode.',
      'Every stage is plain TypeScript, running in your browser.',
    ],
  },
  {
    title: 'The gestures',
    points: [
      'Point: the cursor follows your index fingertip.',
      'Pinch: thumb to index finger clicks; hold the pinch to drag or draw.',
      'Swipe: a fast sideways move of the open hand gives next or previous.',
      'Fist for 1 s clears. Open palm held still for 1 s pauses.',
    ],
  },
  {
    title: 'No accidental clicks',
    points: [
      'Pinch hysteresis: closes below 0.25 palm sizes, opens only above 0.40.',
      'A pinch must hold for 3 frames before it presses.',
      'The cursor snaps back to where it was just before the pinch, so pinching does not pull it off target.',
      'A short cooldown after each click, and visual feedback: hover highlight and a closing ring.',
      'Swipes need speed; pause needs stillness. They cannot be mistaken for each other.',
    ],
  },
  {
    title: 'Data',
    points: [
      'Recorded gestures are replayed in automated tests: no camera needed.',
      'Each test asserts exact events, e.g. ten seconds of fidgeting gives zero clicks.',
      'Next: an in-app recorder for a landmark dataset (landmarks only, never images).',
    ],
  },
  {
    title: 'Results',
    points: [
      'Coming soon: rules vs a small trained model (k-NN and an MLP), on people the model never saw.',
      'Accuracy per gesture, false clicks per minute, click success rate and latency.',
      'The numbers will be published in the README, including their limits.',
    ],
  },
  {
    title: 'Privacy by design',
    points: [
      'The camera starts only after you click "Try it".',
      'Video and landmarks never leave your device; the hand model is served from this site.',
      'The browser enforces it: a Content Security Policy blocks requests to any other site.',
      'No analytics, no cookies. Stop the camera at any time.',
    ],
  },
  {
    title: 'Links',
    points: ['Thanks for trying it. The code, the tests and the write-up are all public.'],
    links: [
      { label: 'Source on GitHub', href: 'https://github.com/Koe10121/air-control' },
      { label: 'Live site', href: 'https://air-control-koee.vercel.app/' },
      { label: 'Portfolio', href: 'https://koe-portfolio.vercel.app/' },
    ],
  },
];
