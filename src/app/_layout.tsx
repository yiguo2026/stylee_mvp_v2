import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Session } from '@supabase/supabase-js';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  PlayfairDisplay_400Regular,
  PlayfairDisplay_400Regular_Italic,
  PlayfairDisplay_500Medium,
  PlayfairDisplay_600SemiBold,
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

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { setSession, fetchProfile } = useUserStore();

  const [fontsLoaded, fontError] = useFonts({
    PlayfairDisplay_400Regular,
    PlayfairDisplay_400Regular_Italic,
    PlayfairDisplay_500Medium,
    PlayfairDisplay_600SemiBold,
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
      console.log('[Fonts] PlayfairDisplay + Inter loaded');
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
      if (profile) {
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

  if (!fontsReady) return null;

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.paper } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="wardrobe/add" options={{ presentation: 'modal' }} />
        <Stack.Screen name="wardrobe/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="outfit/result" options={{ presentation: 'card' }} />
      </Stack>
    </>
  );
}
