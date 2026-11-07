export interface LandingOptions {
  onTryIt: () => void;
}

/** Renders the landing screen into `root`, replacing its contents. */
export function renderLanding(root: HTMLElement, { onTryIt }: LandingOptions): void {
  root.innerHTML = `
    <main class="landing">
      <h1>Air Control</h1>
      <p class="pitch">Control this page with your hand. Point to move, pinch to click.</p>
      <button type="button" class="try-it">Try it</button>
      <p class="privacy">Video never leaves your device.</p>
      <section class="privacy-note" aria-labelledby="privacy-heading">
        <h2 id="privacy-heading">Privacy</h2>
        <p>
          Your camera video and hand landmarks are processed only in your browser. Nothing is uploaded:
          this site's Content Security Policy tells the browser to block any request to another server.
        </p>
      </section>
    </main>
  `;
  root.querySelector<HTMLButtonElement>('.try-it')?.addEventListener('click', onTryIt);
}
