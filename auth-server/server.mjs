import http from 'node:http';
import crypto from 'node:crypto';
import { Pool } from 'pg';
import { createSessionToken } from './session-token.mjs';

const env = process.env;
const required = ['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','DATABASE_URL','TOKEN_ENCRYPTION_KEY'];
for (const key of required) if (!env[key]) throw Error('Missing server configuration: ' + key);
const authUrl = env.AUTH_BASE_URL || env.RENDER_EXTERNAL_URL;
if (!authUrl) throw Error('Set AUTH_BASE_URL or use a host that supplies RENDER_EXTERNAL_URL');
const base = new URL(authUrl).origin;
const appOrigin = new URL(env.APP_URL || 'https://marcusdhaynes.github.io/Deltos/').origin;
const appReturn = new URL(env.APP_URL || 'https://marcusdhaynes.github.io/Deltos/').href;
if (!base.startsWith('https://') && !base.startsWith('http://localhost')) throw Error('AUTH_BASE_URL must be HTTPS');
// Preserve the original base64 key format while also supporting securely
// auto-generated, high-entropy secrets from infrastructure providers.
const decodedKey = Buffer.from(env.TOKEN_ENCRYPTION_KEY, 'base64');
const key = decodedKey.length === 32 ? decodedKey :
  crypto.createHash('sha256').update(env.TOKEN_ENCRYPTION_KEY, 'utf8').digest();
if (decodedKey.length !== 32 && env.TOKEN_ENCRYPTION_KEY.length < 32)
  throw Error('TOKEN_ENCRYPTION_KEY must be at least 32 random characters or 32 base64-decoded bytes');
const pool = new Pool({ connectionString: env.DATABASE_URL, ssl: env.PGSSL === 'true' ? {rejectUnauthorized:false} : undefined });
const scope = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.settings.basic',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.profile'
].join(' ');
const random = () => crypto.randomBytes(32).toString('base64url');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const encrypt = plaintext => {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  const contents = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), contents]).toString('base64url');
};
const decrypt = ciphertext => {
  const data = Buffer.from(ciphertext, 'base64url');
  if (data.length < 29) throw Error('Invalid encrypted data');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
};
const json = (res, status, value, origin) => {
  res.writeHead(status, {
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store, private',
    'Referrer-Policy':'no-referrer',
    'X-Content-Type-Options':'nosniff',
    ...(origin === appOrigin ? { 'Access-Control-Allow-Origin':appOrigin, 'Vary':'Origin' } : {})
  });
  res.end(JSON.stringify(value));
};
const go = (res, location, setCookie) => {
  res.writeHead(302, {
    'Location':location,
    'Cache-Control':'no-store, private',
    'Referrer-Policy':'no-referrer',
    ...(setCookie ? {'Set-Cookie':setCookie} : {})
  });
  res.end();
};
const cookies = raw => Object.fromEntries((raw || '').split(';').map(item => {
  const pos = item.indexOf('=');
  return pos === -1 ? [] : [item.slice(0,pos).trim(), item.slice(pos+1).trim()];
}).filter(entry => entry.length === 2));
async function tokenRequest(body) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams(body), signal:AbortSignal.timeout(15000)
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error('Google token exchange failed');
    error.code = typeof data.error === 'string' ? data.error : '';
    error.googleStatus = response.status;
    throw error;
  }
  return data;
}
const sessionToken = createSessionToken({
  pool,
  encrypt,
  decrypt,
  hash,
  requestRefresh: refreshToken => tokenRequest({
    client_id:env.GOOGLE_CLIENT_ID,
    client_secret:env.GOOGLE_CLIENT_SECRET,
    grant_type:'refresh_token',
    refresh_token:refreshToken
  })
});

async function handler(req, res) {
  const origin = req.headers.origin;
  const pathname = new URL(req.url || '/',base).pathname;
  if (req.method === 'OPTIONS') {
    if (origin !== appOrigin) return json(res, 403, {error:'Origin not allowed'},origin);
    res.writeHead(204, {
      'Access-Control-Allow-Origin':appOrigin,
      'Access-Control-Allow-Methods':'GET,DELETE,OPTIONS',
      'Access-Control-Allow-Headers':'Authorization,Content-Type',
      'Access-Control-Max-Age':'3600',
      'Vary':'Origin'
    });
    return res.end();
  }
  if (pathname === '/health' && req.method === 'GET') {
    try { await pool.query('SELECT 1'); return json(res,200,{status:'ok'},origin); }
    catch { return json(res,503,{status:'unavailable'},origin); }
  }
  if (pathname === '/auth/start' && req.method === 'GET') {
    const state = random();
    const verifier = random();
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const pending = encrypt(JSON.stringify({state,verifier,issued:Date.now()}));
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    for (const [key,value] of Object.entries({
      client_id:env.GOOGLE_CLIENT_ID,
      redirect_uri:base+'/auth/callback',
      response_type:'code',
      access_type:'offline',
      prompt:'consent',
      include_granted_scopes:'true',
      scope,
      state,
      code_challenge:challenge,
      code_challenge_method:'S256'
    })) url.searchParams.set(key,value);
    return go(res,url.href,'deltos_auth_state='+pending+'; HttpOnly; Secure; SameSite=Lax; Path=/auth; Max-Age=600');
  }
  if (pathname === '/auth/callback' && req.method === 'GET') {
    const query = new URL(req.url,base).searchParams;
    const clear = 'deltos_auth_state=; HttpOnly; Secure; SameSite=Lax; Path=/auth; Max-Age=0';
    if (query.has('error')) return go(res,appReturn+'#deltos_auth_error=access_denied',clear);
    try {
      const raw = cookies(req.headers.cookie).deltos_auth_state;
      const pending = JSON.parse(decrypt(raw));
      if (query.get('state') !== pending.state || Date.now()-pending.issued > 600000)
        throw Error('OAuth state mismatch or expired');
      const tokens = await tokenRequest({
        code:query.get('code') || '',
        client_id:env.GOOGLE_CLIENT_ID,
        client_secret:env.GOOGLE_CLIENT_SECRET,
        redirect_uri:base+'/auth/callback',
        code_verifier:pending.verifier,
        grant_type:'authorization_code'
      });
      if (!tokens.refresh_token) throw Error('No offline refresh token from Google');
      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers:{Authorization:'Bearer '+tokens.access_token}
      });
      if (!response.ok) throw Error('Gmail profile could not be verified');
      const profile = await response.json();
      if (!profile.emailAddress) throw Error('Gmail account missing');
      const session = random();
      await pool.query(
        "INSERT INTO deltos_sessions(session_hash,email,refresh_cipher,access_cipher,access_expires_ms,last_used,expires_at) VALUES ($1,$2,$3,$4,$5,NOW(),NOW()+INTERVAL '90 days')",
        [hash(session),profile.emailAddress.toLowerCase(),encrypt(tokens.refresh_token),
         encrypt(tokens.access_token),
         Date.now()+Math.max(60,Number(tokens.expires_in || 3600)-60)*1000]
      );
      return go(res,appReturn+'#deltos_session='+encodeURIComponent(session),clear);
    } catch (error) {
      console.error('Google OAuth callback failed:', error instanceof Error ? error.message : 'Unknown error');
      return go(res,appReturn+'#deltos_auth_error=connection_failed',clear);
    }
  }
  if (pathname === '/session/token' && req.method === 'GET') {
    if (origin && origin !== appOrigin) return json(res,403,{error:'Origin not allowed'},origin);
    const authorization = req.headers.authorization || '';
    if (!authorization.startsWith('Bearer ')) return json(res,401,{error:'Not connected'},origin);
    try {
      const fresh = await sessionToken(authorization.slice(7));
      if (!fresh) return json(res,401,{error:'Session expired; reconnect Gmail'},origin);
      return json(res,200,fresh,origin);
    } catch (error) {
      const status = error?.statusCode === 401 ? 401 : 503;
      return json(res,status,{error:error?.statusCode
        ? error.message : 'Gmail renewal is temporarily unavailable; your connection is saved.'},origin);
    }
  }
  if (pathname === '/session' && req.method === 'DELETE') {
    if (origin && origin !== appOrigin) return json(res,403,{error:'Origin not allowed'},origin);
    const authorization = req.headers.authorization || '';
    if (!authorization.startsWith('Bearer ')) return json(res,401,{error:'Not connected'},origin);
    await pool.query('DELETE FROM deltos_sessions WHERE session_hash=$1',[hash(authorization.slice(7))]);
    return json(res,200,{disconnected:true},origin);
  }
  return json(res,404,{error:'Not found'},origin);
}
await pool.query("CREATE TABLE IF NOT EXISTS deltos_sessions (session_hash TEXT PRIMARY KEY, email TEXT NOT NULL, refresh_cipher TEXT NOT NULL, access_cipher TEXT, access_expires_ms BIGINT, last_used TIMESTAMPTZ, expires_at TIMESTAMPTZ NOT NULL)");
// Remove stale encrypted grants rather than leaving expired sessions in storage.
const purgeExpiredSessions = async () => {
  try { await pool.query('DELETE FROM deltos_sessions WHERE expires_at<=NOW()'); }
  catch { console.error('Expired session cleanup failed'); }
};
void purgeExpiredSessions();
const sessionCleanupTimer = setInterval(purgeExpiredSessions,6*60*60*1000);
sessionCleanupTimer.unref?.();
const server = http.createServer((req,res) => {
  Promise.resolve(handler(req,res)).catch(error => {
    console.error('Request error:', error instanceof Error ? error.message : 'Unknown error');
    if (!res.headersSent) json(res,500,{error:'Authentication server request failed'},req.headers.origin);
    else res.end();
  });
});
server.listen(Number(env.PORT || 3000), '0.0.0.0', () => console.log('Deltos authentication service listening'));
