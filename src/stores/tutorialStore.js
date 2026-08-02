import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_KEY = '@ihambaobab_onboarding_done';
const TOUR_KEY       = '@ihambaobab_tour_done';

export const useTutorialStore = create((set) => ({
  loaded:          false,
  onboardingDone:  true,   // true par défaut → pas de flash au démarrage
  tourDone:        true,
  pendingTour:     false,  // PlusScreen → demande de lancer le tour depuis Dashboard

  load: async () => {
    const [ob, tour] = await Promise.all([
      AsyncStorage.getItem(ONBOARDING_KEY),
      AsyncStorage.getItem(TOUR_KEY),
    ]);
    set({ onboardingDone: ob === 'true', tourDone: tour === 'true', loaded: true });
  },

  markOnboardingDone: async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    set({ onboardingDone: true });
  },

  markTourDone: async () => {
    await AsyncStorage.setItem(TOUR_KEY, 'true');
    set({ tourDone: true });
  },

  resetTutorial: async () => {
    await Promise.all([
      AsyncStorage.removeItem(ONBOARDING_KEY),
      AsyncStorage.removeItem(TOUR_KEY),
    ]);
    set({ onboardingDone: false, tourDone: false });
  },

  requestTour:  () => set({ pendingTour: true,  tourDone: false }),
  consumeTour:  () => set({ pendingTour: false }),
}));
