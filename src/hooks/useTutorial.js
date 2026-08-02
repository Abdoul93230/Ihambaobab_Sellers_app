import { useEffect } from 'react';
import { useTutorialStore } from '../stores/tutorialStore';

export function useTutorial() {
  const store = useTutorialStore();

  // Charge depuis AsyncStorage une seule fois (le store est partagé → un seul appel)
  useEffect(() => {
    if (!store.loaded) store.load();
  }, []);

  return {
    loaded:            store.loaded,
    onboardingDone:    store.onboardingDone,
    tourDone:          store.tourDone,
    pendingTour:       store.pendingTour,
    markOnboardingDone: store.markOnboardingDone,
    markTourDone:      store.markTourDone,
    resetTutorial:     store.resetTutorial,
    requestTour:       store.requestTour,
    consumeTour:       store.consumeTour,
  };
}
