import { createRoot } from 'react-dom/client';
import '@zplayer/theme';
import './phone/fonts.css';
import './phone/phone.css';
import { App } from './mock/App';
import { seedPrefsFromUrl } from './mock/bridge';
import { PREFS_KEY } from './mock/usePrefs';
import { startAndroid } from './platform/android';

seedPrefsFromUrl(PREFS_KEY);
startAndroid();
createRoot(document.getElementById('root')!).render(<App />);
