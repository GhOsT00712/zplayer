# Releasing

A release is built by GitHub Actions (`.github/workflows/release.yml`) when you push a version tag. It
produces a **draft** release with the Windows installer, the signed Android APK and `SHA256SUMS.txt`.
Review the draft (edit the notes, see `docs/` for what to mention) and press Publish.

## Cut a release

1. Bump the version in `windows/app/src-tauri/tauri.conf.json`, `android/app/src-tauri/tauri.conf.json`,
   both `Cargo.toml` files and the `package.json` files, and commit to `main`. The workflow stops if the
   tag does not match the app version.
2. `git tag v0.3.0` and `git push origin v0.3.0`.
3. Watch the run under the repository's Actions tab, then publish the draft.

To rebuild an existing tag, run the workflow by hand (Actions, release, Run workflow) and give the tag.

## One-time setup: signing secrets

The APK must be signed with the same key as earlier releases, or nobody can update in place. Add four
repository secrets (Settings, Secrets and variables, Actions). In PowerShell, from your keystore folder:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$env:USERPROFILE\.zplayer\zplayer-release.jks")) | gh secret set ANDROID_KEYSTORE_BASE64
gh secret set ANDROID_KEYSTORE_PASSWORD   # paste the store password when asked
gh secret set ANDROID_KEY_ALIAS           # zplayer
gh secret set ANDROID_KEY_PASSWORD        # paste the key password when asked
```

The passwords are in `keystore.properties` next to the keystore. Secrets are write-only on GitHub and
are hidden in logs. The workflow prints the APK's certificate SHA-1; it must be
`8B:11:F4:1A:52:8E:8B:BF:E7:DE:81:C5:EF:83:13:2A:12:43:E6:B6`.
