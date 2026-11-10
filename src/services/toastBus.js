/**
 * Global Event Bus for Sprint Toast Notifications
 */
export function triggerToast({ title, message, type = 'info', duration = 4000 }) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('sprint-toast', {
      detail: { id: Date.now() + Math.random(), title, message, type, duration },
    })
  );
}
