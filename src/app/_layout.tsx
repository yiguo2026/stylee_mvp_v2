import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Stack, router, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  PlayfairDisplay_400Regular,
  PlayfairDisplay_400Regular_Italic,
  PlayfairDisplay_500Medium,
  PlayfairDisplay_500Medium_Italic,
  PlayfairDisplay_600SemiBold,
  PlayfairDisplay_600SemiBold_Italic,
} from '@expo-google-fonts/playfair-display';
import {
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import { supabase } from '@/lib/supabase';
import { webAuthCoordinator, webAccountScope } from '@/lib/webAuthRuntime';
import { runAuthEffect, type AuthEffectPorts } from '@/lib/authEffectRunner';
import type { AuthEffect } from '@/lib/authSessionCoordinator';
import { useUserStore } from '@/stores/userStore';
import { ds, StyleeButton, StyleeInlineStatus } from '@/design-system';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ToastHost, showToast } from '@/components/Toast';
import { useImportStore } from '@/stores/importStore';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

SplashScreen.preventAutoHideAsync();

const authEffectPorts: AuthEffectPorts = {
  activateImportOwner: (accountId) => { useImportStore.getState().setActiveUser(accountId); },
  hydrate: (accountId) => { useUserStore.getState().hydrateFromCache(accountId); },
  resolveGender: (stamp) => useUserStore.getState().resolveRouteGender(stamp),
  startProfileRead: () => { void useUserStore.getState().fetchProfile(); },
  navigate: (path) => { router.replace(path); },
  notifyBlocked: (message) => { showToast(message, 'error'); },
};

export default function RootLayout() {
  const authPhase = useSyncExternalStore(webAuthCoordinator.subscribe,
    webAuthCoordinator.getSnapshot, webAuthCoordinator.getSnapshot);
  const pathname = usePathname();
  const designPreviewEnabled = process.env.EXPO_PUBLIC_DESIGN_SYSTEM_PREVIEW === '1';
  const isDesignPreview = designPreviewEnabled && pathname.startsWith('/wardrobe-preview');
  const isPublicPreview = isDesignPreview || pathname.startsWith('/outfit-layout-demo');
  const pendingSelectionCount = useImportStore((state) => state.pendingSelectionCount);
  const tasks = useImportStore((state) => state.tasks);
  const pendingToastCountRef = useRef(0);
  const publicPreviewRef = useRef(isPublicPreview);
  publicPreviewRef.current = isPublicPreview;
  const previousPublicPreviewRef = useRef(isPublicPreview);

  const [fontsLoaded, fontError] = useFonts({
    ...Ionicons.font,
    ...MaterialCommunityIcons.font,
    PlayfairDisplay_400Regular,
    PlayfairDisplay_400Regular_Italic,
    PlayfairDisplay_500Medium,
    PlayfairDisplay_500Medium_Italic,
    PlayfairDisplay_600SemiBold,
    PlayfairDisplay_600SemiBold_Italic,
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  const fontsReady = fontsLoaded || !!fontError;

  useEffect(() => {
    if (fontError) {
      console.warn('[Fonts] load error (graceful degradation):', fontError);
    } else if (fontsLoaded) {
      console.log('[Fonts] Icon fonts + PlayfairDisplay + Inter loaded');
    }
    if (fontsReady) {
      SplashScreen.hideAsync();
    }
  }, [fontsReady]);

  useEffect(() => {
    if (!fontsReady) return;
    let active = true;
    const schedule = (effect: AuthEffect) => {
      queueMicrotask(() => {
        if (active) void runAuthEffect(effect, {
          scope: webAccountScope,
          isEffectCurrent: webAuthCoordinator.isEffectCurrent,
          get publicPreview() { return !active || publicPreviewRef.current; },
          ports: authEffectPorts,
        });
      });
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const effect = webAuthCoordinator.accept(event, session);
      schedule(effect);
    });
    const fallbackSerial = webAuthCoordinator.signalSerial();
    void supabase.auth.getSession().then(
      ({ data, error }) => {
        if (active) schedule(webAuthCoordinator.acceptFallback(fallbackSerial, { session: data.session, error }));
      },
      (error: unknown) => {
        if (active) schedule(webAuthCoordinator.acceptFallback(fallbackSerial, { session: null, error }));
      },
    );
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [fontsReady]);

  useEffect(() => {
    if (!fontsReady) return;
    const leavingPreview = previousPublicPreviewRef.current && !isPublicPreview;
    previousPublicPreviewRef.current = isPublicPreview;
    if (!leavingPreview) return;
    let active = true;
    queueMicrotask(() => {
      if (active) void runAuthEffect(webAuthCoordinator.resume(), {
        scope: webAccountScope,
        isEffectCurrent: webAuthCoordinator.isEffectCurrent,
        get publicPreview() { return !active || publicPreviewRef.current; },
        ports: authEffectPorts,
      });
    });
    return () => { active = false; };
  }, [fontsReady, isPublicPreview]);

  useEffect(() => {
    const shouldNotify = !isPublicPreview
      && pendingSelectionCount > pendingToastCountRef.current && pathname !== '/wardrobe';
    if (shouldNotify) {
      const firstPendingTask = tasks.find((task) => task.status === 'needs_selection');
      showToast(`${pendingSelectionCount}张照片待确认`, 'info', 2600, {
        onPress: () => {
          if (firstPendingTask?.id) {
            router.push({
              pathname: '/(tabs)/wardrobe',
              params: { scrollTop: '1', openImportTask: firstPendingTask.id },
            });
            return;
          }
          router.push('/(tabs)/wardrobe?scrollTop=1');
        },
      });
    }
    pendingToastCountRef.current = pendingSelectionCount;
  }, [pathname, pendingSelectionCount, tasks, isPublicPreview]);

  if (!fontsReady) return null;

  if (!isPublicPreview && (authPhase === 'booting' || authPhase === 'blocked')) {
    return (
      <ErrorBoundary>
        <StatusBar style="dark" />
        <View style={styles.recovery}>
          <StyleeInlineStatus tone={authPhase === 'blocked' ? 'attention' : 'neutral'} showIcon={false}>
            {authPhase === 'blocked' ? '账号状态异常，请重新加载页面或关闭后重新打开应用' : '正在恢复账号，请稍候'}
          </StyleeInlineStatus>
          {authPhase === 'blocked' && Platform.OS === 'web' ? (
            <StyleeButton label="重新加载页面" onPress={() => {
              if (typeof window !== 'undefined') window.location.reload();
            }} />
          ) : null}
        </View>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: ds.color.semantic.surface.base } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="wardrobe/add" options={{ presentation: 'modal' }} />
        <Stack.Screen name="wardrobe/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="outfit/result" options={{ presentation: 'card' }} />
        <Stack.Screen name="outfit-layout-demo" options={{ presentation: 'card' }} />
      </Stack>
      <ToastHost />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  recovery: {
    flex: 1,
    justifyContent: 'center',
    padding: ds.space[4],
    gap: ds.space[4],
    backgroundColor: ds.color.semantic.surface.base,
  },
});
