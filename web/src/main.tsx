import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import { App } from './App';
import { LanguageProvider } from './i18n/LanguageContext';
import { ConnectionProvider } from './state/connection';

/* Three-voice type system (§8.3): UI voice = IBM Plex Sans, data voice = IBM Plex Mono,
   statement voice = Source Serif 4. Self-hosted via @fontsource (OFL) — no CDN, offline-capable.
   CJK statement voice falls back to system serif stacks (Noto Serif SC / Songti / SimSun);
   full Source-Han-Serif webfont subsetting is a recorded follow-up, not silently faked. */
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/source-serif-4/600.css';
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
        <Toaster position="top-right" closeButton={false} />
      </LanguageProvider>
    </ConnectionProvider>
  </StrictMode>,
);
