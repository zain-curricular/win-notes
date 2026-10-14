# Notes

A macOS Notes–style app for Windows and Mac, with folders and instant cloud sync through Supabase.

- Three-pane Notes layout: folders sidebar, date-grouped note list (or gallery), editor
- Notes text styles and shortcuts: Title, Heading, Subheading, Body, Monostyled, bulleted/dashed/numbered lists, checklists, block quotes, tables, highlights, collapsible headings
- Paste keeps formatting: rich text, Markdown, and the box-drawn tables Claude Code prints in a terminal all become real tables and lists
- Sign in with email and password; edits appear on your other computers in about half a second
- Works offline: changes are saved locally and upload when you reconnect
- Pinning, Recently Deleted (30 days), drag notes onto folders, search, copy/export as Markdown
- Windows 11 Mica / macOS vibrancy sidebar, light and dark mode

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

## Shortcuts

Cmd on Mac, Ctrl on Windows.

| Action | Shortcut |
| --- | --- |
| New note / new folder | ⌘N / ⇧⌘N |
| Search | ⌘F |
| List / gallery | ⌘1 / ⌘2 |
| Toggle sidebar | ⌃⌘S (Ctrl+Alt+S on Windows) |
| Title / Heading / Subheading / Body / Monostyled | ⇧⌘T / ⇧⌘H / ⇧⌘J / ⇧⌘B / ⇧⌘M |
| Bulleted / dashed / numbered list | ⇧⌘7 / ⇧⌘8 / ⇧⌘9 |
| Checklist / tick item | ⇧⌘L / ⇧⌘U |
| Block quote / divider / table | ⌘' / ⌘L / ⌥⌘T |
| Table rows and columns | ⌥⌘ + arrow keys |
| Duplicate note | ⌘D |
