import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, SafeAreaView, Alert, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Colors, Spacing, Radius, T } from '@/constants/theme';
import { useUserStore } from '@/stores/userStore';
import { supabase } from '@/lib/supabase';
import { PRESET_STYLE_PREFERENCES, StyleTag } from '@/types';

const isWeb = Platform.OS === 'web';

export default function StylePreferencePage() {
  const { user, stylePreferences, fetchProfile } = useUserStore();

  const [liked, setLiked] = useState<Set<string>>(() => {
    const ids = stylePreferences
      .filter(p => p.preference_type === 'like')
      .map(p => p.tag_id);
    return new Set(ids);
  });

  const [saving, setSaving] = useState(false);

  const toggleLike = (tagId: string) => {
    const next = new Set(liked);
    if (next.has(tagId)) {
      next.delete(tagId);
    } else {
      next.add(tagId);
    }
    setLiked(next);
  };

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const allSelectedTags = Array.from(liked)
        .map(id => PRESET_STYLE_PREFERENCES.find(t => t.tag_id === id))
        .filter(Boolean) as StyleTag[];

      for (const tag of allSelectedTags) {
        await supabase
          .from('tags')
          .upsert({ tag_id: tag.tag_id, tag_name: tag.tag_name, tag_type: tag.tag_type })
          .then(({ error }) => {
            if (error && !error.message.includes('duplicate')) {
              console.warn('[StylePage] tag upsert warn:', tag.tag_id, error.message);
            }
          });
      }

      await supabase.from('user_style_preferences').delete().eq('user_id', user.id);

      const allPrefs = Array.from(liked).map(id => ({
        user_id: user.id,
        tag_id: id,
        preference_type: 'like',
      }));
      for (const pref of allPrefs) {
        const { error: upsertError } = await supabase
          .from('user_style_preferences')
          .upsert(pref as any, { onConflict: 'user_id,tag_id' });
        if (upsertError) throw new Error(`保存偏好失败 (${pref.tag_id}): ${upsertError.message}`);
      }
      await fetchProfile();
      if (isWeb) {
        window.alert('保存成功！你的风格偏好已更新');
      } else {
        Alert.alert('保存成功', '你的风格偏好已更新');
      }
      if (router.canGoBack()) router.back();
    } catch (e: any) {
      if (isWeb) {
        window.alert('保存失败：' + (e.message || '请稍后重试'));
      } else {
        Alert.alert('保存失败', e.message || '请稍后重试');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { if (router.canGoBack()) router.back(); }} hitSlop={12}>
          <Text style={styles.headerBack}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>风格偏好</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          <Text style={[styles.headerSave, saving && { opacity: 0.5 }]}>保存</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.inner}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>😍 点击选择喜欢的风格</Text>
          <View style={styles.tagsWrap}>
            {PRESET_STYLE_PREFERENCES.map(tag => {
              const isLiked = liked.has(tag.tag_id);
              return (
                <TouchableOpacity
                  key={tag.tag_id}
                  style={[styles.tag, isLiked && styles.tagLiked]}
                  onPress={() => toggleLike(tag.tag_id)}
                >
                  <Text style={[styles.tagText, isLiked && styles.tagTextLiked]}>
                    {tag.tag_name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <Text style={styles.footerHint}>绿色 = 喜欢，灰色 = 未选择</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.paper },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  headerBack: { ...T.bodyText, color: Colors.ink },
  headerTitle: { ...T.sectionTitle },
  headerSave: { ...T.bodyText, color: '#6C5CE7', fontWeight: '600' },
  container: { flex: 1 },
  inner: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  card: {
    backgroundColor: Colors.paperCard,
    borderRadius: Radius.lg,
    padding: Spacing.three,
    gap: Spacing.two,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  cardTitle: { ...T.bodyText, fontWeight: '600', color: Colors.ink },
  tagsWrap: {
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
  tagLiked: { backgroundColor: '#34C759', borderColor: '#34C759' },
  tagText: { ...T.tag, color: Colors.walnut },
  tagTextLiked: { ...T.tag, color: Colors.paper },
  footerHint: { ...T.micro, textAlign: 'center', color: Colors.walnut2 },
});
