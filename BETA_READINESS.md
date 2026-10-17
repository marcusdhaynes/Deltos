# Deltos beta release checklist

## Status

The web app compiles and publishes through GitHub Pages. CI now runs Chromium browser regressions, including search alignment, demo startup, keyboard navigation, HTML-email isolation, sender Undo, and the three-second Send hold. The standalone OAuth service has token renewal and rollback tests. These automated tests use a demo or mocked Gmail API, **not a live Gmail account**.

**Do not invite unrestricted Gmail users** until the external OAuth and live-account steps below pass. Never use an important mailbox for a first destructive-action test.

## External owner-controlled setup (required for persistent Gmail)

1. In Render, deploy the repository's root `render.yaml` as a Blueprint. Review the paid Node + persistent PostgreSQL resources before confirming. Keep database and encryption secrets private.
2. Supply the Google Web OAuth client ID and secret as Render service environment values. Add the deployed `https://...onrender.com/auth/callback` to that client's approved Google redirect URIs.
3. Set the GitHub **Actions variable** `DELTOS_AUTH_BACKEND_URL` to the exact HTTPS Render origin (no path), and redeploy the Pages workflow. Verify the published HTML has a populated `deltos-auth-backend` meta tag and the server's `/health` is OK.
4. Complete applicable Google consent-screen publishing, scope declaration, and verification. Until then, restrict access to designated OAuth **test users**; refresh credentials for a Google project in Testing status may expire after seven days.
5. Confirm the [privacy notice](https://marcusdhaynes.github.io/Deltos/privacy.html) accurately reflects the final hosting, retention, and account practices; provide a proper support/privacy contact before a public beta.

## Live-account acceptance tests (dedicated disposable Gmail accounts ONLY)

- [ ] Sign in, reload, close/reopen browser, and confirm the same account is connected.
- [ ] Wait past the Google access-token lifetime; confirm renewal happens without login windows.
- [ ] Simulate backend outage; verify current Gmail tokens work until their natural expiry and the session is retained.
- [ ] Read multipart plain + HTML emails (including accented and RTL content); click Show images only intentionally.
- [ ] Save, edit, reopen, and send drafts; validate Unicode and attachments where supported (do not assume unsupported formats work).
- [ ] Test 10, 50, 100 and Load All, search fields and date filters, and first-press Triage keyboard navigation.
- [ ] Block one disposable sender; verify Gmail filter criteria exactly, all intended existing messages move to Trash, and Undo removes only the new filter and restores messages.
- [ ] Test Trash/Restore; confirm permanent Erase requires explicit separate Google permission.
- [ ] Hold Send three seconds; release early and verify nothing was sent.
- [ ] Disconnect and revoke Google access, then confirm the old session cannot renew.

## Shipping rule

A passing CI build is not proof of real Gmail OAuth permissions, Google compliance, or device functionality. Release to **3–5 invited testers using disposable Gmail mailboxes** only after the checklist above passes. Public/open beta requires completed Google verification and security/privacy review.

## Source paths

- Browser tests: `tests/e2e/`
- Backend regression tests: `auth-server/session-token.test.mjs`
- Browser release gate: `.github/workflows/pages.yml`
- Server deploy: `render.yaml`
- Privacy notice: `public/privacy.html`
