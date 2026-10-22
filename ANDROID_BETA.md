# Deltos Android APK — one-click beta build

## Download an installable test APK

Open [Installable Android APK](https://github.com/marcusdhaynes/Deltos/actions/workflows/android-apk.yml), select **Run workflow** on **main**, and open the resulting run. Once **Build and verify APK** succeeds, download the **Deltos-Android-Installable-APK** artifact and extract the ZIP. It contains **Deltos-Android-Beta.apk**, an Android-installable, cryptographically signed APK.

The workflow runs automatically when the website UI (`index.html`), Tauri app, icon, package manifest, or Android workflow changes. It is independent of the older **Native build checks**, which uploaded an *unsigned* release APK that cannot be installed normally.

The artifact is an **Android beta package**, not a Google Play production release.

## Test installation

Copy `Deltos-Android-Beta.apk` to an Android phone. Open it in Files and permit installation from that source if Android asks. Use a device you control. Don't disable Play Protect to bypass a detected threat. If updating a previous beta with a *different signing key*, uninstall the old app first; its local data will be deleted. Always export/backup anything important before uninstalling.

## Important Gmail limitation

The present Android wrapper successfully *compiles*, but native Google login is not production ready:

- `src-tauri/src/lib.rs` has no native OAuth receiver/plugin implementation.
- In `index.html`, the Tauri login path `Ke()` depends on an unconfigured OAuth client and invokes unimplemented `oauth_listen`/`oauth_wait_code` commands.
- Google's OAuth service does not allow Google account authorization inside an app-controlled WebView (possible `403 disallowed_useragent`).
- The secure persistent-login backend has not been verified as connected to this APK.

**Do not market this as a fully functioning Gmail client.** Demo UI testing and packaging can be verified independently. To enable Gmail, register an Android OAuth client with Google for `com.marcusdhaynes.deltos` and the actual signed certificate fingerprints; implement authorization in Chrome Custom Tabs or the system browser with a verified native callback and PKCE; then test account connection, renewal, logout, message rendering, sending, drafts, deletion, and the four-way gestures on Android.

See the [Google WebView OAuth policy](https://developers.googleblog.com/en/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/) and [Tauri Android distribution](https://tauri.app/distribute/google-play/).

Features that currently depend on the browser being open (e.g. scheduled sends/reminders) also need a genuine Android background scheduler and notification implementation before being advertised as reliable when the app is closed.

## Long-lived signing identity for seamless updates

The workflow generates a *temporary signing certificate for each run* unless the owner adds these four protected [GitHub Actions secrets](https://github.com/marcusdhaynes/Deltos/settings/secrets/actions):

- `DELTOS_ANDROID_KEYSTORE_BASE64`: Base64 content of a private Android keystore file
- `DELTOS_ANDROID_KEYSTORE_PASSWORD`: The keystore password
- `DELTOS_ANDROID_KEY_ALIAS`: The key's alias
- `DELTOS_ANDROID_KEY_PASSWORD`: The private key password (optional if same as keystore password)

Never commit keystore files or passwords. Keep a secure offline backup of the signing key; losing the release key blocks seamless upgrades of independently distributed APKs. Once configured, GitHub Actions signs future builds with the same certificate. The workflow does not create Google OAuth credentials or change the Google Play enrollment/verification requirements.

For Play Store distribution, also prepare a signed **AAB**, privacy policies, required Google verification and Play Console release testing. A properly signed APK alone does not meet these requirements.

## Acceptance checklist

1. GitHub APK build succeeds and Android `apksigner verify` passes.
2. Install on a real Android device, launch, rotate screen, background/foreground app and reboot.
3. Run Inbox, Triage, Starred, Opened, Drafts, Trash, filters and four-way swipe controls; confirm stamps and touch hit areas.
4. Complete **system-browser-based** Google OAuth and verify token refresh after an hour and after process death. (Not implemented yet.)
5. Exercise live Gmail send/undo/delete/draft actions with disposable test accounts.
6. Verify release signing identity remains stable between versions and install an update without uninstalling.
7. Verify notifications, reminders and scheduled actions while backgrounded or force-closed; do not promise background behavior if unimplemented.
