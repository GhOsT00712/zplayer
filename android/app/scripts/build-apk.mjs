// Builds the APK for 64-bit ARM phones: node scripts/build-apk.mjs   (or: npm run apk)
// Add --release for the signed release APK (needs keystore.properties, see README.md): npm run apk:release
//
// `tauri android build` links the Rust library into the Android project with a symbolic link, which
// Windows only allows in Developer Mode. This script works either way: it lets Tauri build the
// frontend and the Rust library, copies the library in itself if the link step fails, then runs
// Gradle without its own Rust step (which would try the link again).
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const release = process.argv.includes('--release');
const kind = release ? 'release' : 'debug';
const Kind = release ? 'Release' : 'Debug';
const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const android = join(app, 'src-tauri', 'gen', 'android');
const lib = join(app, 'src-tauri', 'target', 'aarch64-linux-android', kind, 'libzplayer_android_lib.so');
const jniLib = join(android, 'app', 'src', 'main', 'jniLibs', 'arm64-v8a', 'libzplayer_android_lib.so');
const apk = join(android, 'app', 'build', 'outputs', 'apk', 'arm64', kind, `app-arm64-${kind}.apk`);
const sdk = process.env.ANDROID_HOME ?? join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk');
const env = {
  ...process.env,
  ANDROID_HOME: sdk,
  NDK_HOME: process.env.NDK_HOME ?? join(sdk, 'ndk', '29.0.14206865'),
  GRADLE_OPTS: `${process.env.GRADLE_OPTS ?? ''} -Djava.net.preferIPv4Stack=true`.trim(),
};
const started = Date.now();
const fresh = file => existsSync(file) && statSync(file).mtimeMs >= started - 2000;
const fail = message => { console.error(`\n${message}`); process.exit(1); };

if (release && !existsSync(join(android, 'keystore.properties'))) {
  fail('A release APK must be signed. Create src-tauri/gen/android/keystore.properties first (see README.md).');
}
if (!existsSync(join(android, 'app', 'libs', 'spotify-app-remote-release-0.8.0.aar'))) {
  fail('Spotify App Remote 0.8.0 is required. See app/README.md for the download and install path.');
}

// 1. Frontend (../frontend build:app) and the Rust library, through the Tauri CLI. Node is started
//    directly, without a shell, because its path can contain spaces.
const tauri = createRequire(import.meta.url).resolve('@tauri-apps/cli/tauri.js');
const built = spawnSync(process.execPath, [tauri, 'android', 'build', '--apk', ...(release ? [] : ['--debug']), '--target', 'aarch64', '--ci'],
  { cwd: app, env, stdio: 'inherit' });
if (built.status === 0 && fresh(apk)) { console.log(`\nAPK: ${apk}`); process.exit(0); }

// 2. Without Developer Mode the link step fails. Go on only with a library built just now: an older
//    one would package old screens.
if (!fresh(lib)) fail('The Rust build failed; see the output above.');
console.log('\nTauri could not link the library (no Developer Mode); copying it and running Gradle directly.');
mkdirSync(dirname(jniLib), { recursive: true });
rmSync(jniLib, { force: true }); // a failed link attempt can leave a hard link to an old copy
copyFileSync(lib, jniLib);

// 3. Gradle, skipping its own Rust step. The .bat wrapper needs a shell on Windows.
const windows = process.platform === 'win32';
const gradle = spawnSync(join(android, windows ? 'gradlew.bat' : 'gradlew'),
  [`assembleArm64${Kind}`, '-x', `rustBuildArm64${Kind}`, '--console=plain'], { cwd: android, env, stdio: 'inherit', shell: windows });
if (gradle.status !== 0) fail('Gradle failed; see the output above.');
if (!fresh(apk)) fail('Gradle did not write a new APK.');
console.log(`\nAPK: ${apk}`);
