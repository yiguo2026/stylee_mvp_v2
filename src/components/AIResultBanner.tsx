import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius, T } from '@/constants/theme';
import type { AIMeta } from '@/lib/ai';

export function AIResultBanner({ source, durationMs }: AIMeta) {
  const isReal = source !== 'mock';
  const durationSec = (durationMs / 1000).toFixed(1);

  return (
    <View style={[styles.banner, isReal ? styles.real : styles.mock]}>
      <Text style={[styles.text, isReal ? styles.realText : styles.mockText]}>
        {isReal
          ? `✓ ${source} · ${durationSec}s`
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
  mock: { backgroundColor: Colors.accentSoft },
  text: { ...T.caption },
  realText: { color: Colors.signal },
  mockText: { color: Colors.accent },
});
