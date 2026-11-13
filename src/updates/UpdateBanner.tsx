// Update ribbon — thin, top-center, neutral/theme-aware. The ribbon itself
// is the button (click = update); the × dismisses it permanently for that
// version. See updates/UPDATES_SPEC.md.
import React, { useEffect, useState } from 'react';
import {
  checkForUpdate, applyUpdate, isDismissed, dismissVersion, type ReleaseInfo,
} from './updateCheck';

const ribbonStyle: React.CSSProperties = {
  position: 'fixed', top: 8, left: '50%', transform: 'translateX(-50%)',
  zIndex: 9999, display: 'flex', alignItems: 'center', gap: 8,
  padding: '3px 6px 3px 12px', borderRadius: 999, fontSize: 12, lineHeight: 1.4,
  color: 'inherit', background: 'rgba(127,127,127,0.16)',
  border: '1px solid rgba(127,127,127,0.35)', backdropFilter: 'blur(6px)',
  cursor: 'pointer',
};

export const UpdateBanner: React.FC = () => {
  const [info, setInfo] = useState<ReleaseInfo | null>(null);

  useEffect(() => {
    let live = true;
    checkForUpdate()
      .then((found) => {
        if (live && found && !isDismissed(found.version)) setInfo(found);
      })
      .catch(() => { /* silent: no ribbon when the check fails */ });
    return () => { live = false; };
  }, []);

  if (!info) return null;
  return (
    <div
      style={ribbonStyle}
      role="button"
      aria-label={`Update available, version ${info.version}. Activate to update.`}
      onClick={() => applyUpdate(info)}
    >
      <span>Update available · v{info.version}</span>
      <button
        type="button"
        aria-label="Dismiss this update"
        onClick={(e) => { e.stopPropagation(); dismissVersion(info.version); setInfo(null); }}
        style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '0 4px', fontSize: 12 }}
      >
        ×
      </button>
    </div>
  );
};

export default UpdateBanner;
