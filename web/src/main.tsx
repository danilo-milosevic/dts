import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/global.css';
import { bindTokens } from '@/store/settings';
import '@/store/mixer';
import { App } from './App';

bindTokens(); // write design tokens to CSS variables before the first paint

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
