import { createRoot } from 'react-dom/client';
import '@zplayer/theme'; // tokens and base styles first
import { App } from './app/App';
import { StartingPage } from './app/pages';
import { applyPrefs, loadPrefs } from './app/usePrefs';
import { environment } from './environment';
import type { MusicProvider } from './music';
import { SpotifyProvider } from './spotify/SpotifyProvider';
import { Route, Shell } from '@zplayer/theme';

// Apply the saved theme before the first paint so the window doesn't flash.
applyPrefs(loadPrefs());
// Frameless window: the theme keeps top-right content clear of the window buttons.
document.documentElement.dataset.frameless = '';

const provider: MusicProvider = new SpotifyProvider();
const root = createRoot(document.getElementById('root')!);
root.render(<Shell><Route visible><StartingPage /></Route></Shell>);
void environment().then(result => {
  if (result) root.render(<App provider={provider} environment={result} />);
});
