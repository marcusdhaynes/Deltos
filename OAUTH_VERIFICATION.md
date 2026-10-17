# Deltos: Google OAuth verification and production activation

**Current state:** Deltos is functional on GitHub Pages, but persistent-login hosting and Google production authorization have **not** been activated. Do not present the app as verified, security-assessed, or generally available until Google and Render confirm those statuses.

## Ownership prerequisites

1. Admin access to the **Google Cloud project containing the existing browser OAuth client ID** `340468814938-l3nubq3sen9e6h5ahbf0d7ptftlalndg.apps.googleusercontent.com`. This ID is public, not a secret.
2. Authorization to create a Render Blueprint and approve its **paid persistent services**. Never enter a Google client secret in the public repository.
3. For broad public launch, one **custom domain owned by Deltos's operator**, verifiable through Google Search Console, with a suitable website origin and OAuth callback hostname. The existing `github.io` and `onrender.com` shared domains may not satisfy Google's ownership-verification requirements. See [Google's domain ownership guidance](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance).

## Render and Google setup

1. Deploy the root `render.yaml` as a Render Blueprint using the [Deploy to Render](https://render.com/deploy?repo=https://github.com/marcusdhaynes/Deltos) flow, and **review/approve monthly charges** first. The Blueprint provisions a Node web service, private managed Postgres, and generated encryption key. Its `GOOGLE_CLIENT_ID` matches the existing browser ID.
2. Enter the **matching** `GOOGLE_CLIENT_SECRET` into Render's protected environment-variable field. If the existing Cloud project is not yours, create a new **Web application** OAuth client in your own Cloud project; update the frontend ID and the Blueprint ID together. Keep the client secret out of chats, screenshots, and source control.
3. Once Render provides the *actual* HTTPS URL, use `https://ACTUAL_HOST/auth/callback` as an **Authorized redirect URI** of that exact Google Web application OAuth client. Enable the Gmail API and add the scopes below in Google Auth Platform's Data Access settings. The current JavaScript origin is `https://marcusdhaynes.github.io` (without the `/Deltos/` path).
4. In GitHub's repository **Settings → Secrets and variables → Actions → Variables**, set `DELTOS_AUTH_BACKEND_URL` to the real Render HTTPS origin, with no path. Re-run **Publish Deltos web**. Its automated preflight now verifies live database health, Google redirect/PKCE parameters, security of state cookies, and rejection of unauthenticated session tokens **before publication**.
5. Confirm a private Gmail test account can sign in, refresh after token expiry, restart its browser, and disconnect completely. Test revocation on the Google Account permissions page. Do not invite external beta testers until this is done.

## OAuth scope justification for Google's review

| OAuth scope | Actual Deltos use | Classification |
|---|---|---|
| `https://www.googleapis.com/auth/gmail.modify` | Read incoming Gmail messages and contents; organize messages using labels and moves to/from Trash; mark messages read/unread; access drafts as required. Read-only scope cannot modify inbox state. | Restricted |
| `https://www.googleapis.com/auth/gmail.settings.basic` | Inspect/create/delete sender-level Gmail filtering rules; no read-only scope supports editing filters. | Restricted |
| `https://www.googleapis.com/auth/gmail.send` | User-initiated send, reply, and forward actions; narrow send-only permission. | Sensitive |
| `https://www.googleapis.com/auth/userinfo.profile` | Display permitted Google profile/avatar information where supported. | User-profile permission |
| `https://mail.google.com/` | Requested **separately only on explicit permanent erase**, because the normal `gmail.modify` grant cannot permanently delete messages via the Gmail API. Treat as a high-risk, separate reviewer disclosure, and consider disabling permanent erase for public testers unless approval is secured. | Restricted |

These descriptions should be reconciled with the **final deployed implementation** and the exact scope set shown in the Google OAuth UI. Do not claim a feature or data use that has not been verified. Consult [Google restricted scopes](https://support.google.com/cloud/answer/13464325) and [scope minimization](https://support.google.com/cloud/answer/13464321).

## Submit for Google approval (public launch)

- Complete Google Auth Platform Branding and Audience settings using the operator's real organization/contact details. Use a publicly reachable app homepage, a privacy policy, and (if requested) terms of service on a verified, owned domain. The current [beta privacy notice](https://marcusdhaynes.github.io/Deltos/privacy.html) is a preliminary notice, not a completed legal review.
- Demonstrate the entire Google consent journey and important Gmail operations in the OAuth verification demo video, including why the narrowest scopes required for these features are used.
- Provide reviewer access with a dedicated test account and instructions that do not expose passwords publicly. Publish/use approved scopes and keep consent-screen metadata accurate.
- Follow Google's specific restricted-scope verification and any applicable **CASA third-party security assessment**. Do not assume approval or a security-assessment exemption. Google may require an annual assessment for restricted-scope applications and additional audits if architecture/data handling change.
- Google OAuth projects in **Testing** mode have refresh grants with a seven-day expiry for nonbasic scopes. This is a Google policy limit, not a reconnect-loop bug; production publishing/verification must be completed for durable user authorizations.

Official references: [Google verification requirements](https://support.google.com/cloud/answer/13464321), [Google security assessments](https://support.google.com/cloud/answer/13465431), [Google testing vs production](https://support.google.com/cloud/answer/15549945).

## Acceptance requirements after activation

Before promoting Deltos to beta, verify the Render `/health` response, the live GitHub Pages backend meta tag, a complete real Google OAuth authorization callback, a repeat access-token renewal without opening another login window, session revocation after Disconnect, and all tests in [BETA_READINESS.md](BETA_READINESS.md).

**No credentials or financial approvals should ever be entered into the public repository or automated support chat.**
