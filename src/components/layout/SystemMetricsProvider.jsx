import { SystemMetricsContext, useRecordedSystemMetrics } from '../../hooks/useSystemMetrics';

// Keep recording history while navigating, but update only the views that use it.
export default function SystemMetricsProvider({ children }) {
  const metrics = useRecordedSystemMetrics();
  return <SystemMetricsContext.Provider value={metrics}>{children}</SystemMetricsContext.Provider>;
}
