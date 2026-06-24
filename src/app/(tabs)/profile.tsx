import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, SafeAreaView, Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors, Spacing, Radius, Shadow, T } from '@/constants/theme';
import { useUserStore } from '@/stores/userStore';
import { useWardrobeStore } from '@/stores/wardrobeStore';
import { ConfirmModal } from '@/components/ConfirmModal';
import { ProfileEditModal } from '@/components/ProfileEditModal';
import { supabase } from '@/lib/supabase';
import { STYLE_TAGS } from '@/types';

function getTagName(tagId: string, fallback?: string): string {
  const found = STYLE_TAGS.find(t => t.id === tagId);
  return found ? found.label : (fallback ?? tagId);
}

export default function ProfileTab() {
  const { profile, stylePreferences, signOut, user, fetchProfile } = useUserStore();
  const { items } = useWardrobeStore();
  const [savedOutfitCount, setSavedOutfitCount] = useState(0);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [showSignOut, setShowSignOut] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (user?.id) fetchProfile();
    }, [user?.id])
  );

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('outfits')
      .select('outfit_id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .then(({ count }) => setSavedOutfitCount(count ?? 0));
    supabase
      .from('outfit_favorites')
      .select('favorite_id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .then(({ count }) => setFavoriteCount(count ?? 0));
  }, [user?.id]);

  const liked = stylePreferences.filter(p => p.preference_type === 'like');
  const favStyle = liked.length > 0 ? getTagName(liked[0].tag_id, liked[0].tag?.tag_name) : '—';
  const utilization = items.length > 0 ? Math.min(Math.round((savedOutfitCount / items.length) * 100), 100) : 0;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.pageTitle}>我的</Text>

        {/* Profile Header */}
        <View style={styles.profileCard}>
          <View style={styles.profileTop}>
            <TouchableOpacity style={styles.avatar} onPress={() => setShowEditModal(true)}>
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
              ) : profile?.nickname?.[0] ? (
                <Text style={styles.avatarText}>{profile.nickname[0]}</Text>
              ) : (
                <Text style={styles.avatarEmoji}>👩</Text>
              )}
              <View style={styles.editBadge}>
                <Text style={styles.editBadgeIcon}>✏️</Text>
              </View>
            </TouchableOpacity>
            <View style={styles.profileInfo}>
              <Text style={styles.profileNick}>{profile?.nickname ?? '未设置昵称'}</Text>
              <Text style={styles.profileId}>Stylee ID: {user?.id?.slice(0, 8) ?? '—'}</Text>
              <TouchableOpacity onPress={() => setShowEditModal(true)}>
                <Text style={styles.editBtn}>编辑资料</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.profileMeta}>
            <Text style={styles.profileMetaTag}>
              入驻 {profile?.created_at
                ? Math.max(1, Math.ceil((Date.now() - new Date(profile.created_at).getTime()) / 86400000))
                : 1} 天
            </Text>
            <Text style={styles.profileMetaTag}>
              {liked.length > 0 ? getTagName(liked[0].tag_id, liked[0].tag?.tag_name) + '风' : '风格探索中'}
            </Text>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <TouchableOpacity style={styles.statItem} onPress={() => router.push('/(tabs)/wardrobe')}>
            <Text style={styles.statNum}>{items.length}</Text>
            <Text style={styles.statLabel}>衣橱单品</Text>
          </TouchableOpacity>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{savedOutfitCount}</Text>
            <Text style={styles.statLabel}>已穿搭配</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{favoriteCount}</Text>
            <Text style={styles.statLabel}>收藏搭配</Text>
          </View>
        </View>

        {/* Style Preference */}
        <TouchableOpacity style={styles.menuCard} onPress={() => router.push('/profile/style')}>
          <View style={styles.menuCardHeader}>
            <Text style={styles.menuCardTitle}>🎨 我的风格偏好</Text>
            <Text style={styles.menuCardArrow}>›</Text>
          </View>
          <View style={styles.styleTags}>
            {liked.length > 0 ? liked.map(p => (
              <View key={p.preference_id} style={[styles.stylePill, styles.stylePillLiked]}>
                <Text style={styles.stylePillText}>{getTagName(p.tag_id, p.tag?.tag_name)}</Text>
              </View>
            )) : (
              <Text style={styles.stylePillEmpty}>点击设置你喜欢的风格 →</Text>
            )}
          </View>
        </TouchableOpacity>

        {/* AI Try-on P2 */}
        <View style={styles.menuCard}>
          <View style={styles.menuCardHeader}>
            <Text style={styles.menuCardTitle}>👗 试穿记录</Text>
            <Text style={styles.tryOnLabel}>去试穿 ›</Text>
          </View>
          <View style={styles.tryOnEmpty}>
            <Text style={styles.tryOnEmptyIcon}>✨</Text>
            <Text style={styles.tryOnEmptyTitle}>还没有试穿记录</Text>
            <Text style={styles.tryOnEmptySub}>使用AI试穿功能后，效果图会展示在这里</Text>
          </View>
        </View>

        {/* Settings */}
        <TouchableOpacity style={styles.settingsEntry} onPress={() => router.push('/profile/settings')}>
          <Text style={styles.settingsIcon}>⚙️</Text>
          <Text style={styles.settingsText}>更多设置</Text>
          <Text style={styles.settingsArrow}>›</Text>
        </TouchableOpacity>
      </ScrollView>

      <ProfileEditModal visible={showEditModal} onClose={() => setShowEditModal(false)} />

      <ConfirmModal
        visible={showSignOut}
        title="退出登录"
        message="确认要退出吗？"
        confirmText="退出"
        confirmStyle="destructive"
        onConfirm={() => { setShowSignOut(false); signOut(); }}
        onCancel={() => setShowSignOut(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.paper },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  pageTitle: { ...T.pageTitle },

  // Profile card
  profileCard: {
    backgroundColor: Colors.paperCard, borderRadius: Radius.lg,
    padding: Spacing.three, alignItems: 'center', gap: Spacing.two,
    borderWidth: 1, borderColor: Colors.line, ...Shadow.one,
  },
  profileTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, width: '100%' },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#764ba2', alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  avatarText: { fontSize: 32, color: '#fff', fontWeight: '700' },
  avatarEmoji: { fontSize: 32, color: '#fff' },
  avatarImage: { width: 72, height: 72, borderRadius: 36 },
  editBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.paper, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.line,
  },
  editBadgeIcon: { fontSize: 12 },
  profileInfo: { flex: 1, gap: 4 },
  profileNick: { ...T.sectionTitle, fontSize: 20 },
  profileId: { ...T.micro, color: Colors.walnut2 },
  editBtn: {
    ...T.tag, color: '#6C5CE7',
    paddingHorizontal: Spacing.three, paddingVertical: 4,
    borderRadius: Radius.xl, backgroundColor: '#F0EDFF',
    overflow: 'hidden', marginTop: 4, alignSelf: 'flex-start',
  },
  profileMeta: { flexDirection: 'row', gap: Spacing.two },
  profileMetaTag: {
    ...T.micro, paddingHorizontal: Spacing.two, paddingVertical: 2,
    borderRadius: Radius.sm, backgroundColor: Colors.vintageCream, overflow: 'hidden',
  },

  // Stats
  statsRow: {
    flexDirection: 'row', backgroundColor: Colors.paperCard,
    borderRadius: Radius.lg, padding: Spacing.three,
    borderWidth: 1, borderColor: Colors.line, ...Shadow.one,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statNum: { ...T.statNum },
  statLabel: { ...T.micro },
  statDivider: { width: 1, backgroundColor: Colors.line },

  // Menu card
  menuCard: {
    backgroundColor: Colors.paperCard, borderRadius: Radius.lg,
    padding: Spacing.three, gap: Spacing.two,
    borderWidth: 1, borderColor: Colors.line, ...Shadow.one,
  },
  menuCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  menuCardTitle: { ...T.bodyText, fontWeight: '700', fontSize: 16, color: Colors.ink },
  menuCardArrow: { color: Colors.walnut2, fontSize: 16 },

  // Style tags
  styleTags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  stylePill: { paddingHorizontal: Spacing.two, paddingVertical: 4, borderRadius: Radius.xl },
  stylePillLiked: { backgroundColor: Colors.sage },
  stylePillText: { ...T.tag, color: Colors.paper },
  stylePillEmpty: { ...T.tag, color: Colors.walnut2, fontStyle: 'italic' },

  // Try-on P2
  tryOnLabel: { ...T.tag, color: '#6C5CE7', fontWeight: '600' },
  tryOnEmpty: { alignItems: 'center', gap: Spacing.one, paddingVertical: Spacing.two },
  tryOnEmptyIcon: { fontSize: 28 },
  tryOnEmptyTitle: { ...T.bodyText, fontSize: 13, color: Colors.walnut },
  tryOnEmptySub: { ...T.micro, color: Colors.walnut2, textAlign: 'center', lineHeight: 18 },

  // Settings entry
  settingsEntry: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.paperCard, borderRadius: Radius.lg,
    padding: Spacing.three, borderWidth: 1, borderColor: Colors.line,
    gap: Spacing.two, ...Shadow.one,
  },
  settingsIcon: { fontSize: 20 },
  settingsText: { ...T.bodyText, flex: 1, color: Colors.ink },
  settingsArrow: { color: Colors.walnut2, fontSize: 16 },
});
