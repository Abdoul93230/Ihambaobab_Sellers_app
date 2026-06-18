import { useSyncStore } from '../stores/syncStore';

export function useModules() {
  const modules = useSyncStore((s) => s.modules);
  return {
    modules,
    has: (key) => Boolean(modules?.[key]),
  };
}
