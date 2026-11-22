// Design preview: edit shared/theme and see it instantly in the standalone mock with fake data.
//   npm run design        copy the theme into ../design-mock, keep copying on every save, start the mock
//   npm run theme:sync    copy once and exit
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, watch } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, '..', 'shared', 'theme');
const mock = resolve(root, '..', 'design-mock');
const target = join(mock, 'src', 'theme');

if (!existsSync(join(mock, 'package.json'))) {
  console.error(`design-mock not found at ${mock}`);
  process.exit(1);
}
const sync = () => {
  mkdirSync(target, { recursive: true });
  for (const file of readdirSync(source).filter(name => /\.(tsx?|css)$/.test(name))) {
    copyFileSync(join(source, file), join(target, file));
  }
};
sync();
console.log('theme copied to design-mock');
if (process.argv.includes('--once')) process.exit(0);

let timer;
watch(source, { recursive: true }, () => {
  clearTimeout(timer);
  timer = setTimeout(() => { sync(); console.log('theme copied to design-mock'); }, 120);
});
if (!existsSync(join(mock, 'node_modules'))) {
  console.log('installing design-mock packages (first run only)…');
}
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const install = existsSync(join(mock, 'node_modules')) ? Promise.resolve(0)
  : new Promise(done => spawn(npm, ['install'], { cwd: mock, stdio: 'inherit', shell: true }).on('exit', done));
install.then(() => {
  const dev = spawn(npm, ['run', 'dev'], { cwd: mock, stdio: 'inherit', shell: true });
  dev.on('exit', code => process.exit(code ?? 0));
});
