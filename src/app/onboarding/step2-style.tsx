import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, SafeAreaView, Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useUserStore } from '@/stores/userStore';
import { Colors, Spacing, Radius, T } from '@/constants/theme';
import { PRESET_STYLE_PREFERENCES, StyleTag } from '@/types';

const LIKE_COLOR = Colors.signal;

const STYLE_EMOJIS: Record<string, string> = {
  quiet_luxury: '💎', minimalist: '◻️', commute_style: '💼', french: '🥐',
  preppy: '🎓', safari: '🦒', vintage: '📻', street: '🛹',
  sporty_casual: '🏃', rock: '🎸', goth: '🦇', sweet: '🍰',
  romantic: '🌸', bohemian: '🏜️', western: '🤠', utility: '🔧',
  wabi_sabi: '🍵', avantgarde: '📐', urban_cool: '🌃',
};

export default function OnboardingStep2() {
  const { user, stylePreferences, fetchProfile } = useUserStore();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const [liked, setLiked] = useState<Set<string>>(
    new Set(stylePreferences.filter(p => p.preference_type === 'like').map(p => p.tag_id))
  );
  const [loading, setLoading] = useState(false);

  const toggleLike = (tag: StyleTag) => {
    const next = new Set(liked);
    if (next.has(tag.tag_id)) { next.delete(tag.tag_id); }
    else { next.add(tag.tag_id); }
    setLiked(next);
  };

  const handleNext = async () => {
    if (!user?.id) { Alert.alert('提示', '请先完成上一步'); return; }
    setLoading(true);
    try {
      await supabase.from('user_style_preferences').delete().eq('user_id', user.id);
      const allPrefs = Array.from(liked).map(id => ({
        user_id: user.id, tag_id: id, preference_type: 'like',
      }));
      for (const pref of allPrefs) {
        await supabase.from('user_style_preferences').upsert(pref as any, { onConflict: 'user_id,tag_id' });
      }
      await fetchProfile();
      if (from === 'profile') {
        Alert.alert('保存成功', '风格偏好已更新');
        router.back();
      } else {
        router.push('/onboarding/step3-wardrobe');
      }
    } catch (e: any) {
      Alert.alert('保存失败', e.message || '请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
    <ScrollView style={styles.container} contentContainerStyle={styles.inner}>
      <View style={styles.progress}>
        <View style={styles.progressDot} />
        <View style={[styles.progressDot, styles.progressDotActive]} />
        <View style={styles.progressDot} />
      </View>

      <Text style={styles.title}>你的风格偏好</Text>
      <Text style={styles.subtitle}>选择你喜欢的风格，让我们更懂你的审美</Text>

      <View style={styles.legend}>
        <View style={[styles.legendDot, { backgroundColor: LIKE_COLOR }]} />
        <Text style={styles.legendText}>喜欢</Text>
      </View>

      {/* Like section — 看图选风格，双列 */}
      <Text style={styles.sectionLabel}>😍 点击选择喜欢的风格</Text>
      <View style={styles.tagsGrid}>
        {PRESET_STYLE_PREFERENCES.map(tag => {
          const isLiked = liked.has(tag.tag_id);
          const emoji = STYLE_EMOJIS[tag.tag_id] ?? '✨';
          return (
            <TouchableOpacity
              key={tag.tag_id}
              style={[styles.styleCard, isLiked && styles.styleCardLiked]}
              onPress={() => toggleLike(tag)}
              activeOpacity={0.7}
            >
              <Text style={styles.styleEmoji}>{emoji}</Text>
              <Text style={[styles.styleName, isLiked && styles.styleNameLiked]}>
                {tag.tag_name}
              </Text>
              {isLiked && <Text style={styles.styleCheck}>✓</Text>}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Preview */}
      <View style={styles.previewRow}>
        <Text style={styles.previewLabel}>已选：</Text>
        <Text style={styles.previewValue}>
          {liked.size > 0
            ? Array.from(liked).map(id => PRESET_STYLE_PREFERENCES.find(t => t.tag_id === id)?.tag_name).join('、')
            : '—'}
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.finishBtn, loading && styles.disabled]}
          onPress={handleNext}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color={Colors.paper} />
            : <Text style={styles.finishText}>下一步</Text>
          }
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.replace('/(tabs)')}>
          <Text style={styles.skipText}>跳过</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.paper },
  container: { flex: 1 },
  inner: { padding: Spacing.four, paddingTop: Spacing.six, gap: Spacing.three, paddingBottom: Spacing.six },
  progress: { flexDirection: 'row', gap: Spacing.one, marginBottom: Spacing.two },
  progressDot: { width: 24, height: 4, borderRadius: 2, backgroundColor: Colors.line },
  progressDotActive: { backgroundColor: Colors.ink },
  title: { ...T.pageTitle },
  subtitle: { ...T.bodyText, fontSize: 14, lineHeight: 22 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { ...T.tag, color: Colors.walnut },
  sectionLabel: { ...T.bodyText, fontWeight: '600', color: Colors.ink, fontSize: 14 },
  tagsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },

  styleCard: {
    width: '47%',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.paperCard,
    gap: Spacing.one,
  },
  styleCardLiked: { borderColor: LIKE_COLOR, backgroundColor: Colors.signalSoft },
  styleEmoji: { fontSize: 32 },
  styleName: { ...T.tag, color: Colors.ink, fontWeight: '500' },
  styleNameLiked: { color: Colors.signal, fontWeight: '600' },
  styleCheck: {
    position: 'absolute', top: 6, right: 8,
    fontSize: 14, color: LIKE_COLOR, fontWeight: '700',
  },

  previewRow: { flexDirection: 'row', gap: Spacing.one },
  previewLabel: { ...T.formLabel },
  previewValue: { ...T.bodyText, fontSize: 13, flex: 1 },

  actions: { gap: Spacing.two, marginTop: Spacing.three, alignItems: 'center' },
  finishBtn: {
    backgroundColor: Colors.ink, borderRadius: Radius.md,
    paddingVertical: Spacing.two + 4, width: '100%', alignItems: 'center',
  },
  disabled: { opacity: 0.6 },
  finishText: { ...T.buttonPrimary, color: Colors.paper },
  skipText: { ...T.buttonSecondary, color: Colors.walnut },
});
