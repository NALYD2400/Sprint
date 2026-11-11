import { createContext, useContext, useEffect, useState } from 'react';
import { isTauriEnv, subscribeTauri } from '../lib/tauri';

const EMPTY_METRICS = {
  cpu_usage: 0,
  ram_total_mb: 0,
  ram_used_mb: 0,
  managed_cpu_pct: 0,
  managed_ram_mb: 0,
  active_servers_count: 0,
  server_metrics: {},
};

export const SystemMetricsContext = createContext({ ...EMPTY_METRICS, history: [] });

export function useSystemMetrics() {
  return useContext(SystemMetricsContext);
}

export function useRecordedSystemMetrics() {
  const [metrics, setMetrics] = useState(() => ({ ...EMPTY_METRICS, history: [] }));

  useEffect(() => {
    if (!isTauriEnv()) return undefined;
    let unlisten = null;
    let disposed = false;

    subscribeTauri('system-metrics', (event) => {
      if (disposed) return;
      const { cpu_usage, ram_used_mb, managed_cpu_pct, managed_ram_mb } = event.payload;
      const sample = {
        cpu_usage,
        ram_used_mb,
        managed_cpu_pct,
        managed_ram_mb,
        timestamp: Date.now(),
      };
      setMetrics((previous) => ({
        ...event.payload,
        history: [...previous.history.filter((point) => point.timestamp >= sample.timestamp - 900000), sample].slice(-1000),
      }));
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });

    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, []);

  return metrics;
}
