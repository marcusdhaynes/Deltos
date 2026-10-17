// Verifies the REAL deployed authentication service before publishing a page
// that directs people to it. No OAuth credentials, tokens, or email are read.
export async function verifyAuthDeployment(origin, request = fetch) {
  const parsed = new URL(origin);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
      parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw Error('Authentication backend URL must be an HTTPS origin without a path');
  }
  const base = parsed.origin;
  const fetchSafe = (path, method = 'GET') => request(base + path, {
    method, redirect:'manual', cache:'no-store',
    signal:AbortSignal.timeout(12000)
  });
  const health = await fetchSafe('/health');
  if (health.status !== 200) throw Error('Auth health endpoint failed with HTTP ' + health.status);
  const state = await health.json();
  if (state?.status !== 'ok') throw Error('Authentication database health is not OK');
  const auth = await fetchSafe('/auth/start');
  if (auth.status !== 302) throw Error('Google sign-in start did not redirect');
  const url = new URL(auth.headers.get('location') || 'https://invalid.example');
  if (url.origin !== 'https://accounts.google.com' || !url.pathname.startsWith('/o/oauth2/'))
    throw Error('Sign-in did not redirect to the official Google authorization endpoint');
  const expectedCallback = base + '/auth/callback';
  if (url.searchParams.get('redirect_uri') !== expectedCallback)
    throw Error('Google redirect URI does not match the deployed authentication URL');
  if (url.searchParams.get('access_type') !== 'offline' ||
      url.searchParams.get('response_type') !== 'code' ||
      url.searchParams.get('code_challenge_method') !== 'S256' ||
      !url.searchParams.get('code_challenge') ||
      !url.searchParams.get('client_id') || !url.searchParams.get('state'))
    throw Error('Offline Google authorization or PKCE protection is incomplete');
  const cookie = auth.headers.get('set-cookie') || '';
  if (!cookie.includes('HttpOnly') || !cookie.includes('Secure') ||
      !cookie.includes('SameSite=Lax')) throw Error('OAuth state cookie lacks security attributes');
  const token = await fetchSafe('/session/token');
  if (token.status !== 401) throw Error('Unauthenticated token request was not rejected');
  return {status:'ready',callback:expectedCallback};
}
if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const url = process.env.DELTOS_AUTH_BACKEND_URL?.trim();
  if (!url) {
    console.log('Backend URL not set: web demo remains in browser-only sign-in mode.');
  } else {
    try {
      const verified = await verifyAuthDeployment(url);
      console.log('Backend preflight passed:',verified.callback);
    } catch(error) {
      console.error('Backend preflight failed:',error?.message||String(error));
      process.exitCode = 1;
    }
  }
}
