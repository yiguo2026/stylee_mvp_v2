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
import { CategoryIcon } from '@/components/CategoryIcon';
import { ConfirmModal } from '@/components/ConfirmModal';
import { ProfileEditModal } from '@/components/ProfileEditModal';
import { supabase } from '@/lib/supabase';
import { TAG_DISPLAY } from '@/types';

const GENDER_LABEL: Record<string, string> = {
  female: '女', male: '男', other: '其他', private: '不公开',
};

function getTagName(tagId: string, fallback?: string): string {
  return TAG_DISPLAY[tagId] ?? fallback ?? tagId;
}

export default function ProfileTab() {
  const { profile, stylePreferences, signOut, user, fetchProfile } = useUserStore();
  const { items } = useWardrobeStore();
  const [savedOutfitCount, setSavedOutfitCount] = useState(0);
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
  }, [user?.id]);

  const liked = stylePreferences.filter(p => p.preference_type === 'like');
  const disliked = stylePreferences.filter(p => p.preference_type === 'dislike');

  // Compute insight data
  const favStyle = liked.length > 0 ? getTagName(liked[0].tag_id, liked[0].tag?.tag_name) : '—';
  const utilization = items.length > 0 ? Math.min(Math.round((savedOutfitCount / items.length) * 100), 100) : 0;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.pageTitle}>我的</Text>

        {/* Profile Header — gradient card */}
        <View style={styles.profileHeaderGradient}>
          <View style={styles.avatarWrapper}>
            <TouchableOpacity style={styles.avatar} onPress={() => setShowEditModal(true)}>
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
              ) : profile?.nickname?.[0] ? (
                <Text style={styles.avatarEmoji}>{profile.nickname[0]}</Text>
              ) : (
                <Text style={styles.avatarEmoji}>👩</Text>
              )}
              <View style={styles.editAvatarBadge}>
                <Text style={styles.editAvatarIcon}>✏️</Text>
              </View>
            </TouchableOpacity>
          </View>
          <View style={styles.profileHeaderInfo}>
            <Text style={styles.profileNick}>{profile?.nickname ?? '未设置昵称'}</Text>
            <Text style={styles.profileId}>Stylee ID: {user?.id?.slice(0, 8) ?? '—'}</Text>
            <TouchableOpacity onPress={() => setShowEditModal(true)}>
              <Text style={styles.profileEditBtn}>编辑资料</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.profileMetaRow}>
            <Text style={styles.profileMetaTag}>入驻 {profile?.created_at
              ? Math.max(1, Math.ceil((Date.now() - new Date(profile.created_at).getTime()) / 86400000))
              : 1} 天</Text>
            <Text style={styles.profileMetaTag}>{liked.length > 0 ? getTagName(liked[0].tag_id, liked[0].tag?.tag_name) + '风' : '风格探索中'}</Text>
          </View>
        </View>

        {/* Stats Row */}
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
            <Text style={styles.statNum}>{stylePreferences.filter(p => p.preference_type === 'like').length}</Text>
            <Text style={styles.statLabel}>收藏搭配</Text>
          </View>
        </View>

        {/* Insight Bar */}
        <View style={styles.insightBar}>
          <View style={styles.insightItem}>
            <Text style={styles.insightVal}>{favStyle}</Text>
            <Text style={styles.insightLabel}>最爱风格</Text>
          </View>
          <View style={styles.insightDivider} />
          <View style={styles.insightItem}>
            <Text style={styles.insightVal}>{utilization}%</Text>
            <Text style={styles.insightLabel}>衣橱利用率</Text>
          </View>
          <View style={styles.insightDivider} />
          <View style={styles.insightItem}>
            <Text style={styles.insightVal}>{savedOutfitCount}</Text>
            <Text style={styles.insightLabel}>本月穿搭</Text>
          </View>
        </View>

        {/* Style Preference Card */}
        <TouchableOpacity style={styles.styleCard} onPress={() => router.push('/profile/style')}>
          <View style={styles.styleCardHeader}>
            <Text style={styles.styleCardTitle}>🎨 我的风格偏好</Text>
            <Text style={styles.styleCardArrow}>›</Text>
          </View>
          <View style={styles.styleCardTags}>
            {liked.length > 0 ? liked.map(p => (
              <View key={p.preference_id} style={[styles.stylePill, styles.stylePillLiked]}>
                <Text style={styles.stylePillText}>{getTagName(p.tag_id, p.tag?.tag_name)}</Text>
              </View>
            )) : null}
            {disliked.length > 0 ? disliked.map(p => (
              <View key={p.preference_id} style={[styles.stylePill, styles.stylePillDisliked]}>
                <Text style={styles.stylePillText}>{getTagName(p.tag_id, p.tag?.tag_name)}</Text>
              </View>
            )) : null}
            {liked.length === 0 && disliked.length === 0 && (
              <Text style={styles.stylePillEmpty}>点击设置你喜欢的风格 →</Text>
            )}
          </View>
        </TouchableOpacity>

        {/* More Settings Entry */}
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

  // Gradient profile header
  profileHeaderGradient: {
    backgroundColor: Colors.paperCard,
    borderRadius: Radius.lg,
    padding: Spacing.three,
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderColor: Colors.line,
    ...Shadow.one,
  },
  avatarWrapper: {},
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#764ba2',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 32, color: '#fff' },
  avatarImage: { width: 72, height: 72, borderRadius: 36 },
  editAvatarBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.paper,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.line,
  },
  editAvatarIcon: { fontSize: 12 },
  profileHeaderInfo: { alignItems: 'center', gap: 4 },
  profileNick: { ...T.sectionTitle, fontSize: 20 },
  profileId: { ...T.micro, color: Colors.walnut2 },
  profileEditBtn: {
    ...T.tag, color: '#6C5CE7',
    paddingHorizontal: Spacing.three,
    paddingVertical: 4,
    borderRadius: Radius.xl,
    backgroundColor: '#F0EDFF',
    overflow: 'hidden',
    marginTop: 4,
  },
  profileMetaRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  profileMetaTag: {
    ...T.micro,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: Colors.vintageCream,
    overflow: 'hidden',
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.paperCard,
    borderRadius: Radius.lg,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: Colors.line,
    ...Shadow.one,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statNum: { ...T.statNum },
  statLabel: { ...T.micro },
  statDivider: { width: 1, backgroundColor: Colors.line },

  // Insight bar
  insightBar: {
    flexDirection: 'row',
    backgroundColor: Colors.paperCard,
    borderRadius: Radius.lg,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: Colors.line,
    ...Shadow.one,
  },
  insightItem: { flex: 1, alignItems: 'center', gap: 2 },
  insightVal: { ...T.statNum, fontSize: 18 },
  insightLabel: { ...T.micro },
  insightDivider: { width: 1, backgroundColor: Colors.line },

  // Style preference card
  styleCard: {
    backgroundColor: Colors.paperCard,
    borderRadius: Radius.lg,
    padding: Spacing.three,
    gap: Spacing.two,
    borderWidth: 1,
    borderColor: Colors.line,
    ...Shadow.one,
  },
  styleCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  styleCardTitle: { ...T.bodyText, fontWeight: '700', fontSize: 16, color: Colors.ink },
  styleCardArrow: { color: Colors.walnut2, fontSize: 16 },
  styleCardTags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  stylePill: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderRadius: Radius.xl,
  },
  stylePillLiked: {
    backgroundColor: Colors.sage,
  },
  stylePillDisliked: {
    backgroundColor: '#FF3B30',
  },
  stylePillText: { ...T.tag, color: Colors.paper },
  stylePillEmpty: { ...T.tag, color: Colors.walnut2, fontStyle: 'italic' },

  // Section
  section: {
    backgroundColor: Colors.paperCard,
    borderRadius: Radius.lg,
    padding: Spacing.three,
    gap: Spacing.two,
    borderWidth: 1,
    borderColor: Colors.line,
    ...Shadow.one,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { ...T.subTitle },
  sectionLink: { ...T.buttonSecondary, color: Colors.terracotta },
  wardrobeRow: { flexDirection: 'row', gap: Spacing.two },
  miniCard: { width: 80, gap: 4 },
  miniImage: { width: 80, height: 80, borderRadius: Radius.md },
  miniPlaceholder: {
    width: 80, height: 80, borderRadius: Radius.md,
    backgroundColor: Colors.vintageCream,
    alignItems: 'center', justifyContent: 'center',
  },
  miniName: { ...T.micro, textAlign: 'center' },
  miniAdd: {
    width: 80, height: 80, borderRadius: Radius.md,
    backgroundColor: Colors.paper,
    borderWidth: 1, borderColor: Colors.line,
    borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  emptyText: { ...T.emptyTitle, fontSize: 13, letterSpacing: 0.78, textAlign: 'center' },

  // Settings entry
  settingsEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.paperCard,
    borderRadius: Radius.lg,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: Colors.line,
    gap: Spacing.two,
    ...Shadow.one,
  },
  settingsIcon: { fontSize: 20 },
  settingsText: { ...T.bodyText, flex: 1, color: Colors.ink },
  settingsArrow: { color: Colors.walnut2, fontSize: 16 },
});
