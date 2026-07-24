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
  const pendingSelectionCount = useImportStore((state) => state.pendingSelectionCount);
  const tasks = useImportStore((state) => state.tasks);
  const pendingToastCountRef = useRef(0);
  const { setSession, fetchProfile } = useUserStore();

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
      setSession(session);
      await fetchProfile();
      const { profile } = useUserStore.getState();
      // DB trigger auto-creates users with gender='private'; onboarding sets it to female/male/other.
      // Only skip onboarding if profile exists AND user has explicitly set gender.
      if (profile && profile.gender !== 'private') {
        router.replace('/(tabs)');
      } else {
        router.replace('/onboarding/step1-info');
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setSession(null);
        router.replace('/(auth)/login');
      } else if (event === 'INITIAL_SESSION') {
        if (session) {
          handleSignIn(session);
        } else {
          setSession(null);
          router.replace('/(auth)/login');
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [fontsReady]);

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
      </Stack>
      <ToastHost />
    </ErrorBoundary>
  );
}
