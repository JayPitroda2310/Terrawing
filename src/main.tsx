import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { installDevHooks } from '@/app/devHooks';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root container #root is missing from index.html');

installDevHooks();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
