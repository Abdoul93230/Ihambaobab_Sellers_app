import {
  pushMutation,
  getPendingMutations,
  markMutationDone,
  markMutationError,
  markMutationSyncing,
  getPendingMutationsCount,
  cleanupMutations,
} from '../db/database';
import { useSyncStore } from '../stores/syncStore';

const updateCount = async () => {
  const n = await getPendingMutationsCount();
  useSyncStore.getState().setPendingCount(n);
};

export const mutationQueue = {
  push: async (type, payload) => {
    const id = await pushMutation(type, payload);
    await updateCount();
    return id;
  },

  getPending: async () => {
    return getPendingMutations();
  },

  // Réserve atomiquement une mutation — retourne false si déjà prise par un autre worker
  reserveForSync: async (id) => {
    return markMutationSyncing(id);
  },

  markDone: async (id) => {
    await markMutationDone(id);
    await updateCount();
  },

  markError: async (id) => {
    await markMutationError(id);
    await updateCount();
  },

  cleanup: async () => {
    await cleanupMutations();
    await updateCount();
  },

  // Compatibilité — plus d'AsyncStorage à réinitialiser
  reset: () => {},
};
