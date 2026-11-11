const manualStops = new Set();

export function markManualStop(serverId) {
  if (serverId) manualStops.add(serverId);
}

export function unmarkManualStop(serverId) {
  manualStops.delete(serverId);
}

export function isManualStop(serverId) {
  return manualStops.has(serverId);
}
