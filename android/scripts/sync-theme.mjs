// Updates the optional static board and Android preview fixtures.
//   node scripts/sync-theme.mjs        (or: npm run sync, inside frontend/)
//
// - ../shared/theme/  ->  mock/theme/  (CSS only, for the static A1 board)
// - ../design-mock/src/mock/data.ts and usePlayer.ts  ->  frontend/src/shared/   (fake library and player)
//
// Both app frontends import @zplayer/theme directly.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const theme = join(root, '..', 'shared', 'theme');
const designMock = join(root, '..', 'design-mock', 'src', 'mock');

function copy(from, to, files, label) {
  mkdirSync(to, { recursive: true });
  for (const file of files) {
    const text = readFileSync(join(from, file), 'utf8');
    const note = file.endsWith('.css') ? `/* Copied from ${label}/${file} by scripts/sync-theme.mjs. Do not edit here. */\n`
      : `// Copied from ${label}/${file} by scripts/sync-theme.mjs. Do not edit here.\n`;
    writeFileSync(join(to, file), note + text);
  }
  console.log(`synced ${files.length} files into ${to}`);
}

// The static board and standalone design mock are optional local projects.
if (existsSync(join(root, 'mock', 'index.html'))) {
  copy(theme, join(root, 'mock', 'theme'), ['tokens.css', 'base.css', 'controls.css', 'lists.css', 'player.css'], 'shared/theme');
}

const previewFiles = ['data.ts', 'usePlayer.ts'];
if (previewFiles.every(file => existsSync(join(designMock, file)))) {
  copy(designMock, join(root, 'frontend', 'src', 'shared'), previewFiles, 'design-mock/src/mock');
}
