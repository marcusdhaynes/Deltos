# Deltos — let testers sign in with Gmail

## Why testers get "app is in testing" / "trial mode"

Deltos requests `gmail.modify`, `gmail.settings.basic`, `gmail.send` and `userinfo.profile` from Google. Those Gmail permissions mean the **Google Auth Platform OAuth application**, not the Deltos website, decides which Google Accounts are allowed. Editing the website, redeploying GitHub Pages, or disabling a Deltos message cannot override Google's access checks.

**Current web OAuth client ID:** `340468814938-l3nubq3sen9e6h5ahbf0d7ptftlalndg.apps.googleusercontent.com`. This is a public client identifier, **not** a secret. In Google Cloud, select the project containing this exact OAuth client. If you create a *new* OAuth project, change Deltos's client ID and the backend client ID together—otherwise you'll configure the wrong project.

## Option A — invite up to 100 Gmail accounts right now (recommended for closed beta)

1. Sign in to the owner Google account at https://console.cloud.google.com/auth/audience
2. Choose the project containing the above OAuth client. Under **Audience**, confirm user type is **External** and publishing status **Testing**.
3. Under **Test users**, choose **Add users**. Enter the actual Google Account email addresses your invited testers will use, then **Save**.
4. Ask each tester to retry the Google sign-in on https://marcusdhaynes.github.io/Deltos/ using the **same** Google Account you approved.
5. Google may still show an **app in testing** warning; approved testers can consent. Do not tell anyone to ignore unrelated browser or security alerts.
6. Testing-mode authorizations expire after **seven days** for these Gmail scopes; testers may need to reconnect. A project has a hard cap of 100 listed test users.

If an approved tester is still denied, check the exact signed-in Google Account, whether the right Cloud project/client was edited, whether the app is **Internal**, and whether a Workspace admin/Advanced Protection account blocks external apps.

## Option B — public sign-in without adding emails one by one

1. In the owner Google Cloud project's **Audience** page, select **Publish app** to change **Testing** to **In production**.
2. People not listed as test users may then attempt to connect. Until the app receives Google verification for its requested sensitive/restricted scopes, **Google displays an unverified-app warning and limits access to at most 100 users**. Some organizations may still prohibit access.
3. Submit **Branding**, **Audience**, **Data Access**, privacy-policy, scope justification, screenshots, demo video, and domain-ownership information for Google verification. Restricted Gmail scopes can require additional security assessment. See [OAUTH_VERIFICATION.md](OAUTH_VERIFICATION.md).
4. Only successful Google verification removes the unverified-app cap/warning. **Publishing is not verification**.

For a first small beta, Option A limits exposure and avoids prematurely presenting Deltos as production-ready. Use disposable Gmail accounts for testing operations that delete or modify mail.

## Tester message

> Deltos is currently a Gmail beta. Please send the project owner the Google email address you want to use so they can approve it as a test account. Once approved, visit https://marcusdhaynes.github.io/Deltos/ and click the Google sign-in icon. Use the same Google Account you submitted. You can explore Deltos's demo without connecting Gmail while your request is pending.

Do **not** ask testers for passwords, verification codes, or Google OAuth tokens.

## Exact path to fix

- [Google Auth Platform Audience](https://console.cloud.google.com/auth/audience)
- [Google OAuth client credentials](https://console.cloud.google.com/auth/clients)
- [Google's official publishing/testing behavior](https://support.google.com/cloud/answer/15549945)
- [Restricted-scope verification requirements](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)

**The Google Cloud owner must make the Audience/Test users or Publish app change. It is not a GitHub setting, and the Deltos developer's Gmail account connector does not administer Google Cloud consent-screen settings.**
