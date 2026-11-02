import '@fontsource-variable/fraunces';
import '@fontsource-variable/figtree';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { repo } from './app/progress';
import { startAutoSync } from './sync/sync';
import './ui/app.css';

registerSW({ immediate: true });
// Pide al navegador que no borre los datos de la app para liberar espacio.
void navigator.storage?.persist?.();
startAutoSync(repo);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
