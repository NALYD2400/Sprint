const operations = new Map();
const listeners = new Set();
let revision = 0;

export const getServerOperation = (id) => operations.get(id) || null;
export const getOperationRevision = () => revision;
export function subscribeServerOperations(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish() {
  revision++;
  listeners.forEach((listener) => listener());
}

/** One operation per server, shared by every view, including during navigation. */
export async function withServerOperation(id, action, execute) {
  if (!id || operations.has(id)) return false;
  operations.set(id, action);
  publish();
  try {
    await execute();
    return true;
  } finally {
    operations.delete(id);
    publish();
  }
}
