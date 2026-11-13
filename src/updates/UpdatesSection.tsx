// Updates section — rendered permanently at the very BOTTOM of Settings.
// See updates/UPDATES_SPEC.md.
import React, { useCallback, useEffect, useState } from 'react';
import {
  CURRENT_VERSION, checkForUpdate, applyUpdate, type ReleaseInfo,
} from './updateCheck';

export const UpdatesSection: React.FC = () => {
  const [info, setInfo] = useState<ReleaseInfo | null>(null);
  const [status, setStatus] = useState<string>('');

  const run = useCallback(async () => {
    setStatus('Checking…');
    try {
      const found = await checkForUpdate();
      setInfo(found);
      setStatus(found ? '' : 'You are up to date.');
    } catch {
      setStatus('Could not check for updates.');
    }
  }, []);

  useEffect(() => { void run(); }, [run]);

  return (
    <section aria-label="Updates" className="updates-section">
      <h2>Updates</h2>
      <p>Current version: v{CURRENT_VERSION}</p>
      <p>Available version: {info ? `v${info.version}` : '—'}</p>
      {info && (
        <div>
          <h3>What's New</h3>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{info.notes}</pre>
        </div>
      )}
      {status && <p role="status">{status}</p>}
      <div>
        <button type="button" onClick={() => void run()}>Check for updates</button>
        {info && (
          <button type="button" onClick={() => applyUpdate(info)}>
            Update to v{info.version}
          </button>
        )}
      </div>
    </section>
  );
};

export default UpdatesSection;
