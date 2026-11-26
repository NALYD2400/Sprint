const manualStops = new Set();
const startTimestamps = new Map();
const uptimeListeners = new Set();
let uptimeTimer;

export function markManualStop(serverId) {
  if (serverId) manualStops.add(serverId);
}

export function unmarkManualStop(serverId) {
  manualStops.delete(serverId);
}

export function isManualStop(serverId) {
  return manualStops.has(serverId);
}

export function recordServerStart(serverId, startedAt = Date.now()) {
  if (serverId && !startTimestamps.has(serverId)) {
    startTimestamps.set(serverId, startedAt);
  }
}

export function clearServerStart(serverId) {
  if (serverId) startTimestamps.delete(serverId);
}

export function getServerStart(serverId) {
  return serverId ? startTimestamps.get(serverId) ?? null : null;
}

export function subscribeToUptime(listener) {
  uptimeListeners.add(listener);
  uptimeTimer ??= setInterval(() => {
    const now = Date.now();
    uptimeListeners.forEach((onTick) => onTick(now));
  }, 1000);

  return () => {
    uptimeListeners.delete(listener);
    if (!uptimeListeners.size) {
      clearInterval(uptimeTimer);
      uptimeTimer = undefined;
    }
  };
}
