// Stub de react-native-gesture-handler pour Expo Go sur émulateur x86.
// Les swipe-back sont désactivés par défaut sur Android, donc rien de visible n'est perdu.
import * as React from 'react';
import { View, ScrollView, FlatList, Switch, TouchableHighlight, TouchableOpacity, TouchableWithoutFeedback, TextInput, DrawerLayoutAndroid } from 'react-native';

const Noop = ({ children }) => children ? React.createElement(React.Fragment, null, children) : null;

export const GestureHandlerRootView = View;

export const PanGestureHandler = Noop;
export const TapGestureHandler = Noop;
export const LongPressGestureHandler = Noop;
export const RotationGestureHandler = Noop;
export const PinchGestureHandler = Noop;
export const FlingGestureHandler = Noop;
export const NativeViewGestureHandler = Noop;
export const ManualGestureHandler = Noop;
export const ForceTouchGestureHandler = Noop;
export const HoverGestureHandler = Noop;

export const GestureDetector = Noop;

export const State = {
  UNDETERMINED: 0,
  FAILED: 1,
  BEGAN: 2,
  CANCELLED: 3,
  ACTIVE: 4,
  END: 5,
};
export const GestureState = State;

export const Directions = {
  RIGHT: 1,
  LEFT: 2,
  UP: 4,
  DOWN: 8,
};

export const GestureObjects = {
  Tap: () => ({ onBegin: function() { return this; }, onStart: function() { return this; }, onEnd: function() { return this; }, onFinalize: function() { return this; }, enabled: function() { return this; }, runOnJS: function() { return this; }, maxDuration: function() { return this; }, numberOfTaps: function() { return this; } }),
  Pan: () => ({ onBegin: function() { return this; }, onStart: function() { return this; }, onUpdate: function() { return this; }, onEnd: function() { return this; }, onFinalize: function() { return this; }, enabled: function() { return this; }, runOnJS: function() { return this; }, activeOffsetX: function() { return this; }, activeOffsetY: function() { return this; }, failOffsetX: function() { return this; }, failOffsetY: function() { return this; }, minDistance: function() { return this; }, minPointers: function() { return this; }, maxPointers: function() { return this; } }),
  LongPress: () => ({ onBegin: function() { return this; }, onStart: function() { return this; }, onEnd: function() { return this; }, onFinalize: function() { return this; }, enabled: function() { return this; }, runOnJS: function() { return this; }, minDuration: function() { return this; } }),
  Rotation: () => ({ onBegin: function() { return this; }, onStart: function() { return this; }, onEnd: function() { return this; }, onFinalize: function() { return this; }, enabled: function() { return this; }, runOnJS: function() { return this; } }),
  Pinch: () => ({ onBegin: function() { return this; }, onStart: function() { return this; }, onEnd: function() { return this; }, onFinalize: function() { return this; }, enabled: function() { return this; }, runOnJS: function() { return this; } }),
  Fling: () => ({ onBegin: function() { return this; }, onStart: function() { return this; }, onEnd: function() { return this; }, onFinalize: function() { return this; }, enabled: function() { return this; }, runOnJS: function() { return this; }, direction: function() { return this; } }),
  Native: () => ({ onBegin: function() { return this; }, onStart: function() { return this; }, onEnd: function() { return this; }, onFinalize: function() { return this; }, enabled: function() { return this; }, runOnJS: function() { return this; } }),
  Manual: () => ({ enabled: function() { return this; }, runOnJS: function() { return this; } }),
  Hover: () => ({ onBegin: function() { return this; }, onStart: function() { return this; }, onEnd: function() { return this; }, onFinalize: function() { return this; }, enabled: function() { return this; }, runOnJS: function() { return this; } }),
  Race: (...args) => args,
  Simultaneous: (...args) => args,
  Exclusive: (...args) => args,
};

export const Gesture = GestureObjects;

export const gestureHandlerRootHOC = (Component) => Component;

export { ScrollView, FlatList, Switch, TouchableHighlight, TouchableOpacity, TouchableWithoutFeedback, TextInput, DrawerLayoutAndroid };

export const RectButton = TouchableOpacity;
export const BorderlessButton = TouchableOpacity;
export const BaseButton = View;
export const RawButton = View;

export const enableExperimentalWebImplementation = () => {};
export const enableLegacyWebImplementation = () => {};
export const enableLegacyGestureHandlerRootView = () => {};

export default {};
