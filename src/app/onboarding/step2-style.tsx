import React from 'react';
import { router } from 'expo-router';

import { StylePreferenceScreen } from '@/components/StylePreferenceScreen';
import { webAccountScope } from '@/lib/accountScopeRuntime';
import { webStylePreferenceController } from '@/lib/webStylePreferenceRuntime';

export default function OnboardingStep2() {
  return (
    <StylePreferenceScreen
      mode="onboarding"
      controller={webStylePreferenceController}
      accountScope={webAccountScope}
      onSaved={() => router.push('/onboarding/step3-wardrobe')}
      onSkipped={() => router.replace('/(tabs)')}
      onReadFailureBypass={() => router.replace('/(tabs)')}
    />
  );
}
