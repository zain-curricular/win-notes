**Install**

- **Windows:** run `Notes-Setup-<version>.exe`. If SmartScreen appears, choose *More info → Run anyway* (the installer is not code-signed yet).
- **Mac:** open the `.dmg` and drag Notes into Applications. If macOS will not open it, use *System Settings → Privacy & Security → Open Anyway* (the app is not notarised yet).
- **Linux (x64):**
  - On Ubuntu, Debian and Mint, install the `.deb` with `sudo apt install ./win-notes_<version>_amd64.deb`.
  - On any other distribution, run the `.AppImage` with `chmod +x Notes-<version>.AppImage && ./Notes-<version>.AppImage`. Sign-in links from emails open the app only when it is installed from the `.deb`.
- **Android:** open the `.apk` on the phone and allow installing unknown apps when asked.

**Updates**

From 0.3.2, Notes checks for a new version when it starts and every six hours, and *Check for Updates…* in the account menu (and the Notes menu on Mac) checks straight away.

- **Windows** and the **Linux `.AppImage`** download the update in the background and install it when you click *Restart to Update*.
- **Mac** and the **Linux `.deb`** download the new installer, check it against `SHA256SUMS`, and open it when you click *Open Installer*.
- **Android** offers the new `.apk`. It installs over the current app and keeps your notes.

**Moving from the Android app before 0.3.0**

Versions before 0.3.0 were signed with a key that is public, so the new app has a new name and installs next to the old one. Nothing is deleted until you remove the old app yourself:

1. In the old app, make sure you are signed in and online, and wait a minute so every change syncs. If you used it without an account, sign in or create one now: your notes upload on the first sign-in.
2. Install the new `.apk` and sign in. Your notes appear.
3. Once you can see them all, uninstall the old app. Keep only the new one: the old one can be replaced by anyone's copy.

**Check a download**

Every file is listed in `SHA256SUMS`. Compare with `sha256sum <file>` (Linux), `shasum -a 256 <file>` (Mac) or `Get-FileHash <file>` (Windows). With the GitHub CLI, `gh attestation verify <file> --repo zain-curricular/win-notes` proves it was built by this repository's release workflow.
