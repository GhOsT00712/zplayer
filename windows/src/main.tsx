import { createRoot } from 'react-dom/client';
import '@zplayer/theme'; // tokens and base styles first
import { LibraryProvider, type AuthPort } from '@zplayer/library/react';
import { Route, Shell } from '@zplayer/theme';
import { App } from './app/App';
import { StartingPage } from './app/screens/SignedOutPage';
import { environment } from './platform/environment';
import { applyPrefs, loadPrefs } from './platform/usePrefs';
import { SdkEngine } from './playback/sdkEngine';

// Apply the saved theme before the first paint so the window doesn't flash.
applyPrefs(loadPrefs());
// Frameless window: the theme keeps top-right content clear of the window buttons.
document.documentElement.dataset.frameless = '';

const engine = new SdkEngine();
const auth: AuthPort = {
  settings: () => engine.settings(),
  restore: () => engine.restore(),
  signIn: clientId => engine.signIn(clientId),
  signOut: () => engine.signOut(),
  scopes: () => engine.scopes(),
};
const root = createRoot(document.getElementById('root')!);
root.render(<Shell><Route visible><StartingPage /></Route></Shell>);
void environment().then(result => {
  if (!result) return;
  root.render(<LibraryProvider transport={engine.transport} engine={engine} auth={auth}>
    <App engine={engine} environment={result} />
  </LibraryProvider>);
});
