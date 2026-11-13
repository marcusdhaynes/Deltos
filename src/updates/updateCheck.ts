// Uniform auto-update check — see updates/UPDATES_SPEC.md.
// Fetches the latest GitHub Release for this repo and compares semver.
export const GITHUB_REPO = 'marcusdhaynes/Deltos';
export const CURRENT_VERSION = '0.1.0';
export const LATEST_RELEASE_URL =
  `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
// Dismissal is persisted PER VERSION: localStorage key
// `updates:dismissed:<version>` — that version's ribbon never reappears.
const dismissedKey = (version: string) => `updates:dismissed:${version}`;

export interface ReleaseInfo {
  version: string;
  tag: string;
  notes: string;
  url: string;
  downloadUrl: string | null;
}

export function parseSemver(v: string): number[] {
  return v.replace(/^v/i, '').split('.').map((p) => parseInt(p, 10) || 0);
}

export function isNewer(candidate: string, current: string): boolean {
  const a = parseSemver(candidate);
  const b = parseSemver(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

export async function checkForUpdate(): Promise<ReleaseInfo | null> {
  const res = await fetch(LATEST_RELEASE_URL, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) return null;
  const data: any = await res.json();
  const tag = String(data?.tag_name || '');
  if (!tag || !isNewer(tag, CURRENT_VERSION)) return null;
  const asset = Array.isArray(data?.assets) ? data.assets[0] : null;
  return {
    version: tag.replace(/^v/i, ''),
    tag,
    notes: String(data?.body || ''),
    url: String(data?.html_url || ''),
    downloadUrl: asset?.browser_download_url || data?.html_url || null,
  };
}

// Dismissal is permanent for a given version (spec 1.0).
export function isDismissed(version: string): boolean {
  try { return localStorage.getItem(dismissedKey(version)) !== null; } catch { return false; }
}
export function dismissVersion(version: string): void {
  try { localStorage.setItem(dismissedKey(version), '1'); } catch { /* ignore */ }
}

export function applyUpdate(info: ReleaseInfo): void {
  // Web: open the release asset/page, then refresh to pick up the new
  // deployed version. Native (Tauri/APK) builds hand the download URL to
  // the platform installer; Android still requires the user's install tap.
  if (info.downloadUrl) window.open(info.downloadUrl, '_blank', 'noopener');
  window.location.reload();
}
