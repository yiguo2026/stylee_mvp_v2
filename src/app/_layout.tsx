import { useEffect, useRef } from 'react';
import { Stack, router, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Session } from '@supabase/supabase-js';
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
import { useUserStore } from '@/stores/userStore';
import { Colors } from '@/constants/theme';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ToastHost, showToast } from '@/components/Toast';
import { useImportStore } from '@/stores/importStore';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const pathname = usePathname();
  const designPreviewEnabled = process.env.EXPO_PUBLIC_DESIGN_SYSTEM_PREVIEW === '1';
  const isDesignPreview = designPreviewEnabled && pathname.startsWith('/wardrobe-preview');
  const isPublicPreview = isDesignPreview || pathname.startsWith('/outfit-layout-demo');
  const pendingSelectionCount = useImportStore((state) => state.pendingSelectionCount);
  const tasks = useImportStore((state) => state.tasks);
  const pendingToastCountRef = useRef(0);
  const authRestoredRef = useRef(false);
  const { setSession } = useUserStore();

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

    const handleSignIn = async (session: Session) => {
      // 幂等：INITIAL_SESSION 事件与 getSession() 兜底可能同时触发，只处理一次
      if (authRestoredRef.current) { setSession(session); return; }
      authRestoredRef.current = true;
      setSession(session);
      if (isPublicPreview) return;
      // 冷启动/记住登录：先用本地缓存的 profile 立即渲染，再解析路由 gender 立刻跳转，
      // 完整 profile + 风格偏好后台刷新，避免开屏对着转圈等 DB。
      const store = useUserStore.getState();
      store.hydrateFromCache(session.user.id);
      const gender = await store.resolveRouteGender();
      void store.fetchProfile();
      // DB trigger auto-creates users with gender='private'; onboarding sets it to female/male/other.
      // Only go to onboarding if we positively know gender is 'private' (never completed).
      if (gender === 'private') {
        router.replace('/onboarding/step1-info');
      } else {
        router.replace('/(tabs)');
      }
    };

    const goToLogin = () => {
      setSession(null);
      if (!isPublicPreview) router.replace('/(auth)/login');
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        authRestoredRef.current = false;
        goToLogin();
      } else if (event === 'INITIAL_SESSION') {
        if (session) handleSignIn(session);
        else if (!authRestoredRef.current) goToLogin();
      }
    });

    // 兜底：直接从持久化存储读取会话，确保“记住登录状态”不会因错过 INITIAL_SESSION 事件而被弹回登录页
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) handleSignIn(data.session);
      else if (!authRestoredRef.current) goToLogin();
    });

    return () => subscription.unsubscribe();
  }, [fontsReady, isPublicPreview]);

  useEffect(() => {
    const shouldNotify = pendingSelectionCount > pendingToastCountRef.current && pathname !== '/wardrobe';
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
  }, [pathname, pendingSelectionCount, tasks]);

  if (!fontsReady) return null;

  return (
    <ErrorBoundary>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.paper } }}>
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
