import { create } from 'zustand';

export const useTourOverlayStore = create((set) => ({
  show:         false,
  targets:      {},
  hasPosAccess: true,
  onDone:       null,
  onRemeasure:  null,

  mount: ({ targets, hasPosAccess, onDone, onRemeasure }) =>
    set({ show: true, targets, hasPosAccess, onDone, onRemeasure }),

  unmount: () =>
    set({ show: false, targets: {}, onDone: null, onRemeasure: null }),

  updateTargets: (targets) =>
    set({ targets }),
}));
