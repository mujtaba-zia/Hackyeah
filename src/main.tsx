import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

// No StrictMode: its dev-only double mount boots two Phaser games, and the
// discarded one keeps the visible canvas while its scene is torn down.
createRoot(document.getElementById('root')!).render(<App />);
