import { createRef } from 'react';

export const navigationRef = createRef();

export function navigate(name, params) {
  if (navigationRef.current?.isReady()) {
    navigationRef.current.navigate(name, params);
  }
}

export function reset(state) {
  if (navigationRef.current?.isReady()) {
    navigationRef.current.reset(state);
  }
}
