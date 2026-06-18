import { useSyncStore, SyncStatus } from '../stores/syncStore';
import { useConnectivity } from './useConnectivity';

export function useSync() {
  const status = useSyncStore((s) => s.status);
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt);
  const pendingCount = useSyncStore((s) => s.pendingCount);
  const triggerSync = useSyncStore((s) => s.triggerSync);
  const isConnected = useConnectivity();

  const lastSyncLabel = (() => {
    if (!lastSyncAt) return null;
    const diff = Math.floor((Date.now() - new Date(lastSyncAt).getTime()) / 1000);
    if (diff < 60) return `il y a ${diff}s`;
    if (diff < 3600) return `il y a ${Math.floor(diff / 60)}min`;
    return `il y a ${Math.floor(diff / 3600)}h`;
  })();

  return {
    status,
    isConnected,
    pendingCount,
    lastSyncLabel,
    isSyncing: status === SyncStatus.SYNCING,
    isOffline: status === SyncStatus.OFFLINE || !isConnected,
    hasError: status === SyncStatus.ERROR,
    triggerSync,
  };
}
