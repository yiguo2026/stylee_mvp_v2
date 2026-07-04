import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius, T } from '@/constants/theme';
import type { AIMeta } from '@/lib/ai';

export function AIResultBanner({ source, durationMs, ok }: AIMeta) {
  const durationSec = (durationMs / 1000).toFixed(1);

  const isSuccess = ok && source !== 'mock';
  const isFailed = !ok && source !== 'mock';

  return (
    <View style={[styles.banner, isSuccess ? styles.real : isFailed ? styles.failed : styles.mock]}>
      <Text style={[styles.text, isSuccess ? styles.realText : isFailed ? styles.failedText : styles.mockText]}>
        {isSuccess
          ? `✓ ${source} · ${durationSec}s`
          : isFailed
            ? `✗ ${source} · ${durationSec}s（结果不可用，已降级）`
            : `⚠ mock 数据（模型服务不可用）`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.sm,
    alignSelf: 'flex-start',
  },
  real: { backgroundColor: Colors.signalSoft },
  failed: { backgroundColor: Colors.accentSoft },
  mock: { backgroundColor: Colors.accentSoft },
  text: { ...T.caption },
  realText: { color: Colors.signal },
  failedText: { color: Colors.accent },
  mockText: { color: Colors.accent },
});
