# Deltos long-lived Gmail sessions

This optional, self-hosted Node 20+ authentication service implements Google's **web-server authorization-code + offline-access** flow. It is separate from GitHub Pages. Browser-only Google access tokens cannot silently refresh indefinitely.

## Deployment (Render)

1. Create a managed **Postgres** database and a **Web Service** connected to this repository. Use Root Directory `auth-server`, Build Command `npm install`, Start Command `npm start`.
2. In the Render Web Service, add the environment variables below (secret values must never go into the repository):
   - `DATABASE_URL`: Render Postgres connection URL.
   - `GOOGLE_CLIENT_ID`: the existing **Web application** OAuth 2.0 client ID.
   - `GOOGLE_CLIENT_SECRET`: corresponding Google OAuth client secret; rotate any previously shared secret.
   - `AUTH_BASE_URL`: the deployed service's HTTPS origin, e.g., `https://deltos-auth.onrender.com`, with no trailing slash.
   - `APP_URL`: `https://marcusdhaynes.github.io/Deltos/`.
   - `TOKEN_ENCRYPTION_KEY`: fresh cryptographic random 32 bytes, encoded as base64. Generate locally with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Keep the key backed up securely; losing it makes stored tokens unreadable.
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
