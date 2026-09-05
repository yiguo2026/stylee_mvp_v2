// Replace only external platform/Auth ports and Store data. React, coordinator,
// Core, RootLayout, the route gate, and released status/button components are real.
import React, { useEffect } from 'react';
import { createAccountScope } from '@stymobile/core';
import { createAuthSessionCoordinator } from '../../authSessionCoordinator.ts';

export let webAccountScope;
export let webAuthCoordinator;
export const observations = {};
let pathname;
let listener;
let settleBootstrap;
let bootstrap;
const tasks = [];
export function resetHarness(path, failResetAt) {
  pathname = path;
  listener = null;
  Object.assign(observations, { privateMounts: 0, privateUnmounts: 0, previewMounts: 0, resets: 0,
    authCallbacks: 0, privateEffects: 0, reloads: 0 });
  webAccountScope = createAccountScope([() => {
    observations.resets += 1;
    if (observations.resets === failResetAt) throw new Error('synthetic-reset-failure');
  }]);
  webAuthCoordinator = createAuthSessionCoordinator({ scope: webAccountScope, publishSession: () => undefined });
  bootstrap = new Promise(resolve => { settleBootstrap = resolve; });
}
export const syntheticSession = (id = 'A') => ({ user: { id }, refresh_token: `synthetic-${id}` });
export function completeBootstrap(session) { settleBootstrap({ data: { session }, error: null }); }
export function emitAuth(event, session) { return listener(event, session); }
export function setPath(path) { pathname = path; }
export const supabase = { auth: {
  onAuthStateChange(callback) {
    observations.authCallbacks += 1;
    listener = callback;
    return { data: { subscription: { unsubscribe() { listener = null; } } } };
  },
  getSession: () => bootstrap,
} };
function PrivateSentinel() {
  useEffect(() => {
    observations.privateMounts += 1;
    return () => { observations.privateUnmounts += 1; };
  }, []);
  return React.createElement('private-sentinel');
}
function PreviewSentinel() {
  useEffect(() => { observations.previewMounts += 1; }, []);
  return React.createElement('preview-sentinel');
}
export function Stack() {
  return React.createElement(pathname.startsWith('/outfit-layout-demo') || pathname.startsWith('/wardrobe-preview')
    ? PreviewSentinel : PrivateSentinel);
}
Stack.Screen = () => null;
export const usePathname = () => pathname;
const privateEffect = () => { observations.privateEffects += 1; };
export const router = { replace: privateEffect, push: privateEffect };
const userState = { hydrateFromCache: privateEffect, resolveRouteGender: async () => 'female', fetchProfile: privateEffect };
export const useUserStore = { getState: () => userState };
export const useImportStore = Object.assign(selector => selector({ tasks, pendingSelectionCount: 0 }),
  { getState: () => ({ setActiveUser: privateEffect }) });
export const showToast = privateEffect;
export const ErrorBoundary = ({ children }) => React.createElement(React.Fragment, null, children);
export const ToastHost = () => null;
export const StatusBar = () => null;
export const preventAutoHideAsync = () => Promise.resolve();
export const hideAsync = () => Promise.resolve();
export const useFonts = () => [true, null];
export const View = 'View';
export const Text = 'Text';
export const Pressable = 'Pressable';
export const ActivityIndicator = 'ActivityIndicator';
export const Platform = { OS: 'web', select: values => values.web ?? values.default };
export const StyleSheet = { create: styles => styles };
export const PlayfairDisplay_400Regular = 1, PlayfairDisplay_400Regular_Italic = 1,
  PlayfairDisplay_500Medium = 1, PlayfairDisplay_500Medium_Italic = 1,
  PlayfairDisplay_600SemiBold = 1, PlayfairDisplay_600SemiBold_Italic = 1,
  Inter_300Light = 1, Inter_400Regular = 1, Inter_500Medium = 1, Inter_600SemiBold = 1;
const Icon = () => null;
Icon.font = {};
export default Icon;
