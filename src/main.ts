import './style.css';
import { renderLanding } from './app/landing';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('#app root element missing');

renderLanding(root, {
  onTryIt: () => {
    // Camera + hand tracking arrive in issue 002.
  },
});
