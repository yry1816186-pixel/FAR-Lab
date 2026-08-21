import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { LanguageProvider } from './i18n/LanguageContext';
import { ConnectionProvider } from './state/connection';
import './styles.css';

const rootEl = document.getElementById('root');
if (rootEl === null) {
  throw new Error('Fatal: #root element missing in index.html');
}

createRoot(rootEl).render(
  <StrictMode>
    <ConnectionProvider>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </ConnectionProvider>
  </StrictMode>,
);
