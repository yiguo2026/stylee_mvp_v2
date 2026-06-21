import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Session } from '@supabase/supabase-js';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { PlayfairDisplay_400Regular_Italic } from '@expo-google-fonts/playfair-display';
import { supabase } from '@/lib/supabase';
import { useUserStore } from '@/stores/userStore';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { setSession, fetchProfile } = useUserStore();

  const [fontsLoaded, fontError] = useFonts({
    // 数字 · Numeric — Playfair Display Italic (from Google Fonts)
    PlayfairDisplay_400Regular_Italic,
  });

  // Fonts are ready when loaded OR when an error occurred (degrade gracefully)
  const fontsReady = fontsLoaded || !!fontError;

  useEffect(() => {
    if (fontError) {
      console.warn('[Fonts] ❌ Load error (graceful degradation):', fontError);
    } else if (fontsLoaded) {
      console.log('[Fonts] ✅ PlayfairDisplay loaded · HiraMinProN + STSong via system');
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
      <Stack screenOptions={{ headerShown: false }}>
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
