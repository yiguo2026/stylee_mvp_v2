import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, SafeAreaView, Alert, Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useUserStore } from '@/stores/userStore';
import { Colors, Spacing, Radius, T } from '@/constants/theme';
import { PRESET_STYLE_PREFERENCES, PRESET_STYLE_DISLIKES, StyleTag } from '@/types';

const isWeb = Platform.OS === 'web';

const LIKE_COLOR = '#34C759';
const DISLIKE_COLOR = '#FF3B30';

export default function OnboardingStep2() {
  const { user, stylePreferences, fetchProfile } = useUserStore();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const [liked, setLiked] = useState<Set<string>>(
    new Set(stylePreferences.filter(p => p.preference_type === 'like').map(p => p.tag_id))
  );
  const [disliked, setDisliked] = useState<Set<string>>(
    new Set(stylePreferences.filter(p => p.preference_type === 'dislike').map(p => p.tag_id))
  );
  const [loading, setLoading] = useState(false);

  const toggleLike = (tag: StyleTag) => {
    const next = new Set(liked);
    const nextDislike = new Set(disliked);
    if (next.has(tag.tag_id)) {
      next.delete(tag.tag_id);
    } else {
      next.add(tag.tag_id);
      nextDislike.delete(tag.tag_id);
    }
    setLiked(next);
    setDisliked(nextDislike);
  };

  const toggleDislike = (tag: StyleTag) => {
    const next = new Set(disliked);
    const nextLike = new Set(liked);
    if (next.has(tag.tag_id)) {
      next.delete(tag.tag_id);
    } else {
      next.add(tag.tag_id);
      nextLike.delete(tag.tag_id);
    }
    setDisliked(next);
    setLiked(nextLike);
  };

  const handleNext = async () => {
    if (!user?.id) {
      Alert.alert('提示', '请先完成上一步');
      return;
    }
    setLoading(true);
    try {
      // Try delete first, ignore errors
      await supabase.from('user_style_preferences').delete().eq('user_id', user.id);

      // Upsert each preference one by one to avoid 409 conflicts
      const allPrefs: { user_id: string; tag_id: string; preference_type: string }[] = [
        ...Array.from(liked).map(id => ({
          user_id: user.id,
          tag_id: id,
          preference_type: 'like',
        })),
        ...Array.from(disliked).map(id => ({
          user_id: user.id,
          tag_id: id,
          preference_type: 'dislike',
        })),
      ];
      for (const pref of allPrefs) {
        const { error: upsertError } = await supabase
          .from('user_style_preferences')
          .upsert(pref as any, { onConflict: 'user_id,tag_id' });
        if (upsertError) {
          console.warn('[Step2] upsert error for', pref.tag_id, upsertError.message);
        }
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
      <Text style={styles.subtitle}>标记最喜欢和最不喜欢的风格，让我们更懂你的审美</Text>

      <View style={styles.legend}>
        <View style={[styles.legendDot, { backgroundColor: LIKE_COLOR }]} />
        <Text style={styles.legendText}>喜欢</Text>
        <View style={[styles.legendDot, { backgroundColor: DISLIKE_COLOR }]} />
        <Text style={styles.legendText}>不喜欢</Text>
      </View>

      {/* Like section */}
      <Text style={styles.sectionLabel}>😍 点击选择喜欢的风格</Text>
      <View style={styles.tagsGrid}>
        {PRESET_STYLE_PREFERENCES.map(tag => {
          const isLiked = liked.has(tag.tag_id);
          return (
            <TouchableOpacity
              key={tag.tag_id}
              style={[styles.tag, isLiked && styles.tagLiked]}
              onPress={() => toggleLike(tag)}
            >
              <Text style={[styles.tagText, isLiked && styles.tagTextLiked]}>
                {tag.tag_name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Dislike section */}
      <Text style={styles.sectionLabel}>🙅 点击选择不喜欢的风格</Text>
      <View style={styles.tagsGrid}>
        {PRESET_STYLE_DISLIKES.map(tag => {
          const isDisliked = disliked.has(tag.tag_id);
          return (
            <TouchableOpacity
              key={tag.tag_id}
              style={[styles.tag, isDisliked && styles.tagDisliked]}
              onPress={() => toggleDislike(tag)}
            >
              <Text style={[styles.tagText, isDisliked && styles.tagTextDisliked]}>
                {tag.tag_name}
              </Text>
            </TouchableOpacity>
          );
        })}
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
  inner: { padding: Spacing.four, paddingTop: Spacing.six, gap: Spacing.three },
  progress: { flexDirection: 'row', gap: Spacing.one, marginBottom: Spacing.two },
  progressDot: {
    width: 24, height: 4, borderRadius: 2, backgroundColor: Colors.line,
  },
  progressDotActive: { backgroundColor: Colors.ink },
  title: { ...T.pageTitle },
  subtitle: { ...T.bodyText, fontSize: 14, lineHeight: 22 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { ...T.tag, color: Colors.walnut },
  sectionLabel: { ...T.bodyText, fontWeight: '600', color: Colors.ink, fontSize: 14 },
  tagsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  tag: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.paperCard,
  },
  tagLiked: {
    backgroundColor: LIKE_COLOR,
    borderColor: LIKE_COLOR,
  },
  tagDisliked: {
    backgroundColor: DISLIKE_COLOR,
    borderColor: DISLIKE_COLOR,
  },
  tagText: { ...T.tag, color: Colors.walnut },
  tagTextLiked: { ...T.tag, color: '#fff' },
  tagTextDisliked: { ...T.tag, color: '#fff' },
  actions: { gap: Spacing.two, marginTop: Spacing.three, alignItems: 'center' },
  finishBtn: {
    backgroundColor: Colors.ink,
    borderRadius: Radius.md,
    paddingVertical: Spacing.two + 4,
    width: '100%',
    alignItems: 'center',
  },
  disabled: { opacity: 0.6 },
  finishText: { ...T.buttonPrimary, color: Colors.paper },
  skipText: { ...T.buttonSecondary, color: Colors.walnut },
});
