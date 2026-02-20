/**
 * Tesla – Even G2 app entry.
 */

import { createRoot } from 'react-dom/client';
import '@jappyjan/even-realities-ui/styles.css';
import { App } from './App';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<App />);
}
