import { useState, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useSyncStore, SyncStatus } from '../stores/syncStore';

export function useConnectivity() {
  const [isConnected, setIsConnected] = useState(true);
  const setStatus = useSyncStore((s) => s.setStatus);
  const triggerSync = useSyncStore((s) => s.triggerSync);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const connected = Boolean(state.isConnected && state.isInternetReachable !== false);
      setIsConnected(connected);
      if (!connected) {
        setStatus(SyncStatus.OFFLINE);
      } else {
        // Synchro immédiate au retour du réseau
        triggerSync();
      }
    });
    return unsub;
  }, []);

  return isConnected;
}
