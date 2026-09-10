import React from 'react';
import { router } from 'expo-router';

import { StylePreferenceScreen } from '@/components/StylePreferenceScreen';
import { showToast } from '@/components/Toast';
import { webAccountScope } from '@/lib/accountScopeRuntime';
import { webStylePreferenceController } from '@/lib/webStylePreferenceRuntime';

function leaveProfileStyle() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/profile');
}

export default function StylePreferencePage() {
  return (
    <StylePreferenceScreen
      mode="profile"
      controller={webStylePreferenceController}
      accountScope={webAccountScope}
      onBack={leaveProfileStyle}
      onSaved={() => {
        showToast('风格偏好已更新', 'success');
        leaveProfileStyle();
      }}
    />
  );
}
