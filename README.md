# Notes

A macOS Notes–style app for Windows, Mac, Linux and Android, with folders and instant cloud sync through Supabase.
Downloads for every platform: https://zain-curricular.github.io/win-notes/ (or the repository's Releases page).

- Three-pane Notes layout: folders sidebar, date-grouped note list (or gallery), editor
- Notes text styles and shortcuts: Title, Heading, Subheading, Body, Monostyled, bulleted/dashed/numbered lists, checklists, block quotes, tables, highlights, text alignment, collapsible headings
- Paste keeps formatting: rich text, Markdown, and the box-drawn tables Claude Code prints in a terminal all become real tables and lists
- Sign in with email and password; edits appear on your other computers in about half a second
- Works offline: changes are saved locally and upload when you reconnect
- Selecting text highlights its other copies in the note, and ⌘D adds the next copy to the selection, as in VS Code
- VS Code line editing: copy a line down or up, and ⌘C / ⌘X with nothing selected copy or cut the whole line
- Change Case from the right-click menu: UPPERCASE, lowercase, Title Case, Sentence case, camelCase, PascalCase, snake_case, SCREAMING_SNAKE_CASE, kebab-case, SCREAMING-KEBAB-CASE, dot.case, path/case and Toggle Case, each of which can be given a key in Keyboard Shortcuts
- Every shortcut can be changed in Keyboard Shortcuts (⌘,), saved on each computer
- Pinning, Recently Deleted (30 days), drag notes onto folders, search with Match Case / Whole Word / Regular Expression, copy/export as Markdown
- Windows 11 Mica / macOS vibrancy sidebar, light and dark mode
- Check for Updates in the account menu, and a check at launch: Windows and the AppImage install the new version on restart; the Mac app, the `.deb` and Android download it for you to open

## Set up the cloud (once)

```sh
supabase login          # opens the browser once
npm install
npm run setup:cloud     # creates the "win-notes" Supabase project, applies the schema, builds the installer
```

The installer lands in `release/`. To use an existing Supabase project instead:
`npm run setup:cloud -- --project-ref <ref> --db-password <password>`.

## Develop

```sh
supabase start          # local Supabase on ports 553xx (see supabase/config.toml)
npm run dev             # uses .env.development.local, pointing at the local Supabase
```

`.env.development.local`:

```
VITE_SUPABASE_URL=http://127.0.0.1:55321
VITE_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY from `supabase status`>
```

Run a second, isolated copy (like a second computer) with `NOTES_PROFILE=B`.

## Mac build

A Mac app has to be built on a Mac. The cloud settings (`.env.production`: Supabase URL and publishable key
only) are committed, so a fresh clone builds a syncing app with no extra setup.

**On the Mac** (needs Node.js 24 from nodejs.org and git):

```sh
git clone https://github.com/zain-curricular/win-notes.git
cd win-notes
npm ci
npm run dist:mac        # → release/Notes-<version>-universal.dmg (Apple silicon and Intel)
```

Later updates: `git pull && npm ci && npm run dist:mac`.

**Or let GitHub build it:** Actions → **Build apps** → **Run workflow**, then download the `.dmg` from the repository's
**Releases** page (also: `gh release download -R zain-curricular/win-notes -p "*.dmg"`).

**Install:** open the `.dmg`, drag **Notes** into Applications. The app is unsigned, so a downloaded copy is
blocked the first time: run `xattr -cr /Applications/Notes.app` in Terminal, or try to open it once and click
**Open Anyway** in System Settings → Privacy & Security. A copy built on that Mac usually opens directly.

## Linux build

Build on Linux (x64; needs Node.js 24 and git). `npm ci` also downloads the Electron binary.

```sh
npm ci
npm run dist:linux      # → release/Notes-<version>.AppImage and release/win-notes_<version>_amd64.deb
```

**Install:** `sudo apt install ./release/win-notes_<version>_amd64.deb` on Ubuntu, Debian or Mint (it registers the
`winnotes://` sign-in links and the AppArmor profile Ubuntu 24.04 needs), or run the AppImage anywhere:
`chmod +x Notes-<version>.AppImage && ./Notes-<version>.AppImage`. An AppImage does not register the `winnotes://`
sign-in links, so after confirming an email, sign in with your password (or use the `.deb`).

## Android build

The Android app lives in `mobile/` (Expo / React Native). It talks to the same Supabase project, so notes
and folders sync live with the Windows and Mac apps, and it edits the same rich-text format: the note editor
is the desktop TipTap editor (`mobile-editor/`, built from `src/renderer/src/editor`) running in a WebView.

**Build on any OS** (needs Node.js 24, JDK 17 and the Android SDK with `ANDROID_HOME` set; Android Studio
installs all of that):

```sh
npm ci                  # repo root: the editor bundle is built from the desktop sources
cd mobile && npm ci && cd ..
npm run dist:android    # → release/Notes-<version>.apk
```

The script bundles the editor page, runs `expo prebuild --clean` to generate `mobile/android/`, builds with Gradle,
checks the signature and copies the APK into `release/`. It installs on any phone with "install unknown apps"
allowed; it is not a Play Store build.

**Android release key.** Release builds are signed with the Notes key and refuse to build without it
(`mobile/plugins/releaseSigning.js`); the script also refuses an APK that carries Expo's public debug certificate.
Set `NOTES_KEYSTORE` (path to the `.p12`), `NOTES_KEYSTORE_PASSWORD`, `NOTES_KEY_ALIAS` and `NOTES_KEY_PASSWORD`. Make
the key once and keep two copies of it and its passwords outside the repository; without it no installed copy can
ever be updated:

```sh
keytool -genkeypair -v -storetype PKCS12 -keystore notes-release.p12 -alias notes -keyalg RSA -keysize 4096 -validity 10000
```

GitHub builds read it from the secrets `ANDROID_KEYSTORE_BASE64` (`base64 -i notes-release.p12`),
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`. The package is `com.winnotes.notes`; builds
before 0.3.0 were `com.winnotes.app`, signed with the public debug key, and the release notes explain moving across.

**Or let GitHub build it:** the **Build apps** workflow also produces the APK and attaches it to the release.

**Develop:** `cd mobile && npx expo run:android` (an emulator or a USB-connected phone with debugging on).
After changing anything under `src/renderer/src/editor` or `mobile-editor/`, run `npm run build:editor`
in the repo root so the mobile app picks it up.

## iPhone and iPad

Not available. `mobile/` has an iOS bundle id, but an iOS build needs Xcode on a recent Mac, and installing it on an
iPhone needs a paid Apple Developer account (TestFlight or the App Store). No iOS build has been made or tested.

## Releasing

1. Bump the version in `package.json`, and `version` + `versionCode` in `mobile/app.config.ts` (Android refuses to
   install over the same `versionCode`).
2. Tag and push: `git tag v<version> && git push origin v<version>`. **Build apps** runs the Checks, then builds the
   Windows installer, the Mac app, the Linux AppImage and `.deb` and the APK into a **draft** release `v<version>`, with
   the install steps from `.github/release-notes.md`, the changes since the previous release, `SHA256SUMS` and a build
   provenance attestation for every file. It refuses to touch a release that is already published.
3. Check the draft's files, then publish it. Only then do the download page and the desktop apps' "Notes <version> is
   available" notice see it.

**Download page:** `site/` is a one-page download site that links the newest release for every platform and lists every
published version with its files. Turn it on once in
Settings → Pages → Source **GitHub Actions**, then run **Deploy download page** from the Actions tab. It is served at
`https://zain-curricular.github.io/win-notes/` and redeploys when `site/` changes.

## Shortcuts

Cmd on Mac, Ctrl on Windows.

| Action | Shortcut |
| --- | --- |
| New note / new folder | ⌘N / ⇧⌘N |
| Search | ⌘F |
| Keyboard Shortcuts (change any key) | ⌘, |
| Match Case / Whole Word / Regular Expression, in search | ⌥⌘C / ⌥⌘W / ⌥⌘R (Alt+C / Alt+W / Alt+R on Windows) |
| List / gallery | ⌘1 / ⌘2 |
| Zoom in / out / actual size | ⌘= / ⌘- / ⌘0 (⌘+ and the numpad keys also zoom) |
| Toggle sidebar | ⌃⌘S (Ctrl+Alt+S on Windows) |
| Title / Heading / Subheading / Body / Monostyled | ⇧⌘T / ⇧⌘H / ⇧⌘J / ⇧⌘B / ⇧⌘M |
| Bulleted / dashed / numbered list | ⇧⌘7 / ⇧⌘8 / ⇧⌘9 |
| Checklist / tick item | ⇧⌘L / ⇧⌘U |
| Block quote / divider / table | ⌘' / ⌘L / ⌥⌘T |
| Table rows and columns | ⌥⌘ + arrow keys |
| Align left / center / right | ⌘{ / ⌘\| / ⌘} |
| Select next copy / all copies of the selection, in a note | ⌘D / ⌘F2 |
| Duplicate note, outside a note | ⌘D |
| Copy line down / up | ⇧⌥↓ / ⇧⌥↑ (Shift+Alt+Down / Up on Windows) |
| Copy / cut the whole line, with nothing selected | ⌘C / ⌘X; ⌘V then pastes it as its own line |
