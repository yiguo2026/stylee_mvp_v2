import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, SafeAreaView, Alert, Platform,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { Colors, Spacing, T, Fonts } from '@/constants/theme';
import { useUserStore } from '@/stores/userStore';
import { supabase } from '@/lib/supabase';
import { PRESET_STYLE_PREFERENCES, StyleTag } from '@/types';

const isWeb = Platform.OS === 'web';
const LIKE_COLOR = Colors.signal;

export default function StylePreferencePage() {
  const { user, stylePreferences, fetchProfile } = useUserStore();

  const [liked, setLiked] = useState<Set<string>>(() => {
    const ids = stylePreferences
      .filter(p => p.preference_type === 'like')
      .map(p => p.tag_id);
    return new Set(ids);
  });

  const [saving, setSaving] = useState(false);

  const toggleLike = (tag: StyleTag) => {
    const next = new Set(liked);
    if (next.has(tag.tag_id)) {
      next.delete(tag.tag_id);
    } else {
      next.add(tag.tag_id);
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
        <Text style={styles.subtitle}>选择你喜欢的风格，让我们更懂你的审美</Text>
        <View style={styles.tagsGrid}>
          {PRESET_STYLE_PREFERENCES.map(tag => {
            const isLiked = liked.has(tag.tag_id);
            return (
              <TouchableOpacity
                key={tag.tag_id}
                style={[styles.styleCard, isLiked && styles.styleCardLiked]}
                onPress={() => toggleLike(tag)}
                activeOpacity={0.7}
              >
                <Text style={[styles.styleName, isLiked && styles.styleNameLiked]}>
                  {tag.tag_name}
                </Text>
                {isLiked ? (
                  <View style={styles.styleCheck}>
                    <Feather name="check" size={12} color={Colors.paper} />
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.previewRow}>
          <Text style={styles.previewLabel}>已选：</Text>
          <Text style={styles.previewValue}>
            {liked.size > 0
              ? Array.from(liked).map(id => PRESET_STYLE_PREFERENCES.find(t => t.tag_id === id)?.tag_name).join('、')
              : '—'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.paper },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.four, paddingVertical: Spacing.three,
    borderBottomWidth: 1, borderBottomColor: Colors.line,
  },
  headerBack: { ...T.bodyText, color: Colors.ink },
  headerTitle: { ...T.sectionTitle },
  headerSave: { ...T.bodyText, color: Colors.ink, fontFamily: Fonts.uiSemiBold },
  container: { flex: 1 },
  inner: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },

  subtitle: { ...T.bodyText, fontSize: 14, lineHeight: 22 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { ...T.tag, color: Colors.walnut },
  sectionLabel: { ...T.bodyText, fontFamily: Fonts.uiSemiBold, color: Colors.ink, fontSize: 14 },
  tagsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },

  styleCard: {
    width: '47%',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: Colors.lineStrong,
    backgroundColor: Colors.paper,
    gap: Spacing.one,
  },
  styleCardLiked: { borderColor: LIKE_COLOR, backgroundColor: Colors.signal },
  styleName: { ...T.tag, color: Colors.ink, fontFamily: Fonts.ui },
  styleNameLiked: { color: Colors.paper, fontFamily: Fonts.uiSemiBold },
  styleCheck: {
    position: 'absolute', top: 8, right: 8,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },

  previewRow: { flexDirection: 'row', gap: Spacing.one },
  previewLabel: { ...T.formLabel },
  previewValue: { ...T.bodyText, fontSize: 13, flex: 1 },
});
