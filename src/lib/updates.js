import pkg from '../../package.json';

export const APP_VERSION = pkg.version;
export const GITHUB_REPO = 'NALYD2400/Sprint';

export function isNewerVersion(latest, current) {
  if (!latest || !current) return false;
  const parts = (version) => version.replace(/^v/, '').trim().split('.').map((part) => parseInt(part, 10) || 0);
  const latestParts = parts(latest);
  const currentParts = parts(current);
  for (let index = 0; index < Math.max(latestParts.length, currentParts.length); index++) {
    const difference = (latestParts[index] || 0) - (currentParts[index] || 0);
    if (difference) return difference > 0;
  }
  return false;
}
