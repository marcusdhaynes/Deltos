// Transaction-safe durable Gmail sessions. Dependencies are injectable for
// isolated tests and no production OAuth credentials are ever exposed here.
export function createSessionToken({pool, requestRefresh, encrypt, decrypt, hash}) {
  return async function sessionToken(sessionId) {
    if (typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(sessionId)) return null;
    const sessionHash = hash(sessionId);
    const db = await pool.connect();
    let inTransaction = false;
    try {
      await db.query('BEGIN');
      inTransaction = true;
      const result = await db.query(
        'SELECT * FROM deltos_sessions WHERE session_hash=$1 AND expires_at>NOW() FOR UPDATE',
        [sessionHash]
      );
      const row = result.rows[0];
      if (!row) {
        await db.query('ROLLBACK');
        inTransaction = false;
        return null;
      }

      let accessToken = row.access_cipher ? decrypt(row.access_cipher) : '';
      let expiresAt = Number(row.access_expires_ms || 0);
      if (!accessToken || expiresAt < Date.now() + 90000) {
        let replacement;
        try {
          replacement = await requestRefresh(decrypt(row.refresh_cipher));
        } catch (error) {
          const revoked = error?.code === 'invalid_grant';
          if (revoked) {
            // A confirmed revoked grant cannot be recovered by retrying. Do not
            // keep dead sessions around and never silently reauthorize a user.
            await db.query('DELETE FROM deltos_sessions WHERE session_hash=$1', [sessionHash]);
            await db.query('COMMIT');
            inTransaction = false;
          }
          const failure = new Error(revoked
            ? 'Gmail permission was revoked or expired. Sign in once to reconnect.'
            : 'Gmail renewal is temporarily unavailable; your connection is saved.');
          failure.statusCode = revoked ? 401 : 503;
          throw failure;
        }
        if (typeof replacement?.access_token !== 'string' || !replacement.access_token) {
          const failure = new Error('Google returned an invalid access token. Your session remains saved.');
          failure.statusCode = 503;
          throw failure;
        }
        accessToken = replacement.access_token;
        expiresAt = Date.now() + Math.max(60, Number(replacement.expires_in || 3600) - 60) * 1000;
        await db.query(
          'UPDATE deltos_sessions SET access_cipher=$2, access_expires_ms=$3 WHERE session_hash=$1',
          [sessionHash, encrypt(accessToken), expiresAt]
        );
      }
      await db.query(
        "UPDATE deltos_sessions SET last_used=NOW(), expires_at=NOW()+INTERVAL '90 days' WHERE session_hash=$1",
        [sessionHash]
      );
      await db.query('COMMIT');
      inTransaction = false;
      return {access_token:accessToken, expires_at:expiresAt, email:row.email};
    } catch (error) {
      if (inTransaction) {
        try { await db.query('ROLLBACK'); }
        catch (rollbackError) { console.error('Session transaction rollback failed'); }
      }
      throw error;
    } finally {
      db.release();
    }
  };
}
