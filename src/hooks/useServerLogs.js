import { useEffect, useState } from 'react';
import { clearLogCache, readLogs, subscribeLogs } from '../lib/logStore';

export function useServerLogs(serverId) {
  const [logs, setLogs] = useState(() => readLogs(serverId));

  useEffect(() => {
    if (!serverId) {
      setLogs([]);
      return undefined;
    }

    setLogs(readLogs(serverId));
    return subscribeLogs(serverId, setLogs);
  }, [serverId]);

  const clearLogs = () => {
    clearLogCache(serverId);
    setLogs([]);
  };

  return { logs, clearLogs };
}
