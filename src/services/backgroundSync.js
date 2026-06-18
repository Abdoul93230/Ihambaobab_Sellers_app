import * as TaskManager from 'expo-task-manager';
import { BACKGROUND_SYNC_TASK } from '../config/constants';

// En background on ne fait QUE pousser les mutations offline
// Le pull est géré par socket.io et AppState en foreground
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    const NetInfo = require('@react-native-community/netinfo').default;
    const net = await NetInfo.fetch();
    if (!net.isConnected) return;

    const { syncService } = require('./syncService');
    await syncService.pushPendingMutations();
  } catch (_) {}
});

export async function registerBackgroundSync() {
  try {
    const BackgroundTask = require('expo-background-task');
    await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, {
      minimumInterval: 60 * 15, // 15min — seulement pour les mutations offline
    });
  } catch (_) {
    // Expo Go ne supporte pas le background task — silencieux
  }
}

export async function unregisterBackgroundSync() {
  try {
    const BackgroundTask = require('expo-background-task');
    await BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
  } catch (_) {}
}
