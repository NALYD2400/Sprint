import { useSyncExternalStore } from 'react';
import { getServerOperation, getOperationRevision, subscribeServerOperations } from '../lib/serverOperations';

export default function useServerOperations() {
  useSyncExternalStore(subscribeServerOperations, getOperationRevision, getOperationRevision);
  return getServerOperation;
}
