# Deltos release and disaster recovery policy

The canonical branch is **`main`**. Every push to `main` is a separate
recoverable version. Do not use force-push or rewrite branch history.

## Automatic versions

- The preferred CI build version is `v0.1.N`, where `N` is the full Git commit count
  reachable from the exact commit being released. Each CI runner fetches the
  complete Git history and stamps the **same** version into the package,
  Tauri application configuration, Rust package and dormant update checker.
  The source tree on `main` is not modified by the stamp.
- `.github/workflows/source-snapshots.yml` attempts a semantic GitHub Release for each
  new main commit, falling back to a `snapshot-<SHA>` prerelease if GitHub blocks that label, with an exact source ZIP, SHA-256, full Git bundle and checksum.
  After successfully building its web distribution, it also stores a web ZIP
  and checksum. The current `main` head alone can be marked **Latest** after
  a successful web build.
- `.github/workflows/native.yml` builds Windows EXE/MSI, Linux AppImage/DEB/RPM,
  and macOS DMG bundles. Exact files, bundle archives and checksums are attached
  to the **same release tag**, after a successful native build.
- `.github/workflows/android-apk.yml` builds and verifies a signed Android APK
  and stores it and its checksum on the same release.
- `.github/workflows/ios.yml` attempts an **unsigned iOS Simulator app** on
  every commit. An installable, signed iPhone IPA is built only when Apple
  Developer signing material exists and the repo variable
  `DELTOS_IOS_SIGNED_RELEASES_ENABLED` is set to `true`.
  Unsigned Simulator archives are *not* installable iPhone applications.

Older `snapshot-<SHA>` prereleases remain in GitHub from before semantic
versioning was added. They are historical rollback points and should not be
deleted. A GitHub Release may initially contain only source files; native
assets arrive asynchronously when builds pass. A failed or missing asset
is **not** evidence of a successful platform build.

## Retention, safety and missing prerequisites

- GitHub Release files/tags remain available until someone deletes them or
  the repository/account is lost. They are not subject to the temporary
  90-day GitHub Actions artifacts expiry.
- Release assets include checksums so restored files can be verified.
  Git bundles contain history as of the release (earlier commits included).
- GitHub-hosted releases are **not an independent backup** of the same GitHub
  account. Maintain a separate private off-GitHub mirror of the Git repository
  and installers for protection against account compromise, accidental deletion
  or provider outage.
- GitHub branch protection MUST be enabled by the repository owner in
  **Settings → Rules → Rulesets**. Target `main`: forbid force pushes and
  deletion, require a pull request and successful browser/build checks before
  merging. This repository's `main` was found **unprotected** during audit;
  adding workflow files does not change GitHub's branch rules.
- Android currently supports temporary **per-build test signing** if stable
  secrets are absent. This makes an APK installable but may require uninstalling
  the old APK first. To allow safe in-place updates, configure the stable
  `DELTOS_ANDROID_KEYSTORE_BASE64`, `DELTOS_ANDROID_KEYSTORE_PASSWORD`,
  `DELTOS_ANDROID_KEY_PASSWORD`, and `DELTOS_ANDROID_KEY_ALIAS` secrets and
  securely preserve the original signing key off GitHub.
- Production iPhone IPAs require Apple Developer credentials and provisioning.
  Simulator builds are a recovery/development artifact, not an alternative.
- Releases do **not** back up a user's Gmail account, OAuth tokens,
  local device state, or Supabase/PostgreSQL records. Back up data separately
  and test restoration. Never put credentials in GitHub releases.

## Rollback without destroying history

1. In [GitHub Releases](https://github.com/marcusdhaynes/Deltos/releases),
   select the last tested release. Verify SHA-256 for the matching platform
   installer before installing. Do not run an unsigned or untrusted binary.
2. For source rollback, fetch the selected release's exact Git SHA and create
   a new recovery branch from it. For example:
   ```sh
   git fetch origin --tags
   git switch -c recovery/deltos-rollback <tested-commit-sha>
   ```
3. Restore only the required changes to `main` by a reviewed revert or PR.
   **Do not force-push or reset `main`**; doing so risks orphaning history.
4. To restore a repository from its full history bundle:
   ```sh
   git clone Deltos-history-<sha>.bundle deltos-recovered
   ```
   Confirm the expected commit hashes and run the browser/native CI tests
   before redeploying or installing an older app.
5. Restore Supabase and user data with their own verified backup procedure,
   independently of source rollback.

## Monitoring

Every workflow has a GitHub Actions run. Review all required jobs for the
same commit and confirm each platform asset appears in its release.
The presence of a release **does not** mean all platform builds passed.
If any job fails, resolve that failure and re-run its job for the same commit
rather than deleting or overwriting an older release.
