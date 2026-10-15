# Deltos long-lived Gmail sessions

This optional, self-hosted Node 20+ authentication service implements Google's **web-server authorization-code + offline-access** flow. It is separate from GitHub Pages. Browser-only Google access tokens cannot silently refresh indefinitely.

## Simplified deployment (Render Blueprint)

The repository root now includes `render.yaml`. In the **Render dashboard**, create a **Blueprint** from `marcusdhaynes/Deltos`. It configures a Node service, a **persistent managed Postgres** database, HTTPS hosting, health checks, automatic Git deploys, and a generated encryption secret. The Blueprint explicitly uses **paid persistent plans**; review Render's price before approving any resources. Nothing in GitHub alone creates a charge.

Only the external identity-provider steps remain:

1. During Blueprint setup, securely enter `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from the Google Cloud **Web application** OAuth client. Never commit them.
2. Once Render assigns its HTTPS URL, add `https://YOUR-RENDER-SERVICE.onrender.com/auth/callback` to that client's **Authorized redirect URIs** in Google Cloud. Use the actual assigned URL. Complete Google's required OAuth publication / verification; OAuth Testing mode can expire sensitive-scope refresh tokens after seven days.
3. In GitHub repository **Settings → Secrets and variables → Actions → Variables**, create `DELTOS_AUTH_BACKEND_URL` containing the Render service's HTTPS origin (without a path). Re-run the **Publish Deltos web** workflow or push a new commit. The Vite build safely injects this origin into the existing HTML meta tag.
4. Verify `https://YOUR-RENDER-SERVICE.onrender.com/health` reports `{"status":"ok"}`. Then sign in to Deltos one more time. Further token renewals are handled in the background with no popup, until Google revokes permission or the stored session expires.

On Render, `AUTH_BASE_URL` is inferred from the provider's `RENDER_EXTERNAL_URL`. For other hosts, set it explicitly.

## Deployment (Render)

1. Create a managed **Postgres** database and a **Web Service** connected to this repository. Use Root Directory `auth-server`, Build Command `npm install`, Start Command `npm start`.
2. In the Render Web Service, add the environment variables below (secret values must never go into the repository):
   - `DATABASE_URL`: Render Postgres connection URL.
   - `GOOGLE_CLIENT_ID`: the existing **Web application** OAuth 2.0 client ID.
   - `GOOGLE_CLIENT_SECRET`: corresponding Google OAuth client secret; rotate any previously shared secret.
   - `AUTH_BASE_URL`: the deployed service's HTTPS origin, e.g., `https://deltos-auth.onrender.com`, with no trailing slash. Optional on Render (automatically derived from `RENDER_EXTERNAL_URL`).
   - `APP_URL`: `https://marcusdhaynes.github.io/Deltos/`.
   - `TOKEN_ENCRYPTION_KEY`: fresh cryptographic random 32 bytes, encoded as base64 (or a high-entropy value of at least 32 characters from the Render Blueprint). Generate locally with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Keep the key backed up securely; losing it makes stored tokens unreadable.
3. In Google Cloud Console, edit that **same** OAuth client's **Authorized redirect URIs** to include `https://YOUR-AUTH-SERVICE.onrender.com/auth/callback`. The GitHub Pages URL is an Authorized JavaScript Origin for the fallback sign-in; the redirect URI is for the backend OAuth flow.
4. Once the backend's `/health` endpoint works, configure the public `index.html` meta tag `deltos-auth-backend` to the actual HTTPS origin. With no backend URL set, Deltos retains its existing Google Identity Services sign-in and never sends browser access tokens to this backend.

## Security and behavior

- The backend stores **encrypted refresh tokens** and encrypted short-lived Google access tokens in the server database.
- Browser sessions use a random, 256-bit bearer handle; only its SHA-256 hash is stored in Postgres. Browser-side access tokens are still kept in existing Deltos storage for backward compatibility.
- Sessions expire after **90 days of inactivity**; each authorized use extends this window. Google refresh tokens may expire sooner due to revocation, Google policies, changes to the Google account, or the app's OAuth **Testing** status.
- The OAuth authorization response is verified using a ten-minute state and PKCE challenge. Credentials are never written to logs, committed, or placed into public HTML.
- API access is limited to the Deltos website origin; endpoints have no-store headers. For greater production protection, put the browser and server behind one site origin and issue Secure, HttpOnly, SameSite cookies, so session bearer handles are not stored in JavaScript-accessible storage.
- First authorization navigates the current browser tab through Google once; **token refresh itself is silent**, without visible popups.
- If the OAuth project remains in Google **Testing** mode with nonbasic Gmail scopes, Google may limit refresh tokens to seven days. Production publication and (where required) OAuth verification must be completed through Google Cloud for truly durable use.
- If Google revokes the grant or a session expires, the user must authorize again. No solution can override Google consent or revocation.

## Operational notes

Keep the Web Service alive and Postgres persistent. Do not deploy this server into GitHub Pages or commit `.env` files. The stored Google access credentials can modify Gmail. Stronger auditing, rate limits and account monitoring should be added before providing the service to arbitrary public users.

Routes: `GET /health`, `GET /auth/start`, `GET /auth/callback`, `GET /session/token` (Authorization Bearer), `DELETE /session` (Authorization Bearer).
