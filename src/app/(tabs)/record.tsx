import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, ActivityIndicator,
  Modal, Platform, Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors, Spacing, Radius, Shadow, T, Fonts } from '@/constants/theme';
import { useUserStore } from '@/stores/userStore';
import { CategoryIcon } from '@/components/CategoryIcon';
import { supabase } from '@/lib/supabase';

const isWeb = Platform.OS === 'web';

// AI outfit hero image pool — deterministic pick based on outfit_id.
const OUTFIT_HERO_ASSETS = [
  require('../../../assets/tryon/casual.png'),
  require('../../../assets/tryon/street.png'),
  require('../../../assets/tryon/office.png'),
  require('../../../assets/tryon/layered.png'),
  require('../../../assets/tryon/home.png'),
  require('../../../assets/tryon/elegant.png'),
  require('../../../assets/tryon/sporty.png'),
];
function pickOutfitHero(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  const idx = Math.abs(hash) % OUTFIT_HERO_ASSETS.length;
  return OUTFIT_HERO_ASSETS[idx];
}

// ── Types ────────────────────────────────────────────────
interface SavedOutfit {
  outfit_id: string;
  name: string | null;
  ai_comment: string | null;
  source: string;
  created_at: string;
  is_favorited?: boolean;
  items?: OutfitItemDetail[];
}

interface OutfitItemDetail {
  item_id: string;
  name: string;
  category: string;
  color: string;
  role: string | null;
}

// ── Calendar helpers ─────────────────────────────────────
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月',
  '7月', '8月', '9月', '10月', '11月', '12月'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}
function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

type RecordTab = 'worn' | 'favorite';

// ── Main Component ────────────────────────────────────────
export default function RecordTab() {
  const { user } = useUserStore();
  const params = useLocalSearchParams<{ tab?: string }>();

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate());
  const [activeTab, setActiveTab] = useState<RecordTab>('worn');

  const [outfitsByDay, setOutfitsByDay] = useState<Record<string, SavedOutfit[]>>({});
  const [favorites, setFavorites] = useState<SavedOutfit[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailOutfit, setDetailOutfit] = useState<SavedOutfit | null>(null);
  const [loadingItems, setLoadingItems] = useState(false);

  // Fetch worn outfits for calendar
  const fetchMonthOutfits = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);

    const start = new Date(viewYear, viewMonth, 1).toISOString();
    const end = new Date(viewYear, viewMonth + 1, 0, 23, 59, 59).toISOString();

    const { data, error } = await supabase
      .from('outfits')
      .select('outfit_id, name, ai_comment, source, created_at')
      .eq('user_id', user.id)
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: false });

    setLoading(false);

    if (error) { console.warn('[Record] fetchMonthOutfits error:', error.message); return; }
    if (!data) return;
    const grouped: Record<string, SavedOutfit[]> = {};
    data.forEach((o: SavedOutfit) => {
      const key = toDateKey(new Date(o.created_at));
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(o);
    });
    setOutfitsByDay(grouped);
  }, [user?.id, viewYear, viewMonth]);

  // Fetch favorited outfits
  const fetchFavorites = useCallback(async () => {
    if (!user?.id) return;
    const { data, error: favError } = await supabase
      .from('outfit_favorites')
      .select(`
        favorite_id,
        outfit_id,
        outfits ( outfit_id, name, ai_comment, source, created_at )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (favError) { console.warn('[Record] fetchFavorites error:', favError.message); return; }

    if (data) {
      const favs: SavedOutfit[] = data
        .map((r: any) => r.outfits)
        .filter(Boolean)
        .map((o: any) => ({
          outfit_id: o.outfit_id,
          name: o.name,
          ai_comment: o.ai_comment,
          source: o.source,
          created_at: o.created_at,
          is_favorited: true,
        }));
      setFavorites(favs);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      if (params.tab === 'favorite') setActiveTab('favorite');
      else if (params.tab === 'worn') setActiveTab('worn');
      fetchMonthOutfits();
      fetchFavorites();
    }, [fetchMonthOutfits, fetchFavorites, params.tab])
  );

  const openDetail = async (outfit: SavedOutfit) => {
    setDetailOutfit(outfit);
    setLoadingItems(true);

    const { data } = await supabase
      .from('outfit_items')
      .select(`
        item_id, role,
        wardrobe_items ( name, category, color )
      `)
      .eq('outfit_id', outfit.outfit_id);

    setLoadingItems(false);

    if (data) {
      const items: OutfitItemDetail[] = data.map((r: any) => ({
        item_id: r.item_id,
        role: r.role,
        name: r.wardrobe_items?.name ?? '未知单品',
        category: r.wardrobe_items?.category ?? '',
        color: r.wardrobe_items?.color ?? '',
      }));
      setDetailOutfit(prev => prev ? { ...prev, items } : null);
    }
  };

  const detailSheet = (
    <SafeAreaView style={styles.modalSafe}>
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>{detailOutfit?.name ?? '搭配详情'}</Text>
        <TouchableOpacity onPress={() => setDetailOutfit(null)}>
          <Text style={styles.modalClose}>关闭</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.modalContent}>
        {detailOutfit ? (
          <View style={styles.heroWrap}>
            <Image
              source={pickOutfitHero(detailOutfit.outfit_id)}
              style={styles.heroImage}
              resizeMode="cover"
            />
            <View style={styles.heroBadge}>
              <Feather name="zap" size={11} color={Colors.paper} />
              <Text style={styles.heroBadgeText}>AI 生成穿搭</Text>
            </View>
          </View>
        ) : null}

        {detailOutfit ? (
          <Text style={styles.modalDate}>
            保存于 {new Date(detailOutfit.created_at).toLocaleDateString('zh-CN', {
              year: 'numeric', month: 'long', day: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </Text>
        ) : null}

        {detailOutfit?.ai_comment ? (
          <View style={styles.commentCard}>
            <Text style={styles.commentLabel}>AI 搭配点评</Text>
            <Text style={styles.commentText}>{detailOutfit.ai_comment}</Text>
          </View>
        ) : null}

        <Text style={styles.itemsTitle}>搭配单品</Text>
        {loadingItems ? (
          <ActivityIndicator size="small" color={Colors.walnut2} style={{ marginTop: 16 }} />
        ) : detailOutfit?.items?.length ? (
          detailOutfit.items.map(item => (
            <View key={item.item_id} style={styles.itemRow}>
              <View style={styles.itemIconWrap}>
                <CategoryIcon category={item.category} size={20} color={Colors.walnut2} />
              </View>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemMeta}>{item.color} · {item.category}</Text>
              </View>
              {item.role ? <Text style={styles.itemRole}>{item.role}</Text> : null}
            </View>
          ))
        ) : (
          <Text style={styles.noItems}>单品信息暂无</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
    setSelectedDay(null);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
    setSelectedDay(null);
  };

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();

  const selectedKey = selectedDay
    ? `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`
    : null;
  const selectedOutfits = selectedKey ? (outfitsByDay[selectedKey] ?? []) : [];

  const monthTotal = Object.values(outfitsByDay).reduce((sum, arr) => sum + arr.length, 0);
  const weekCount = Object.entries(outfitsByDay).filter(([key]) => {
    const d = new Date(key);
    const now = new Date();
    return now.getTime() - d.getTime() < 7 * 24 * 3600 * 1000;
  }).reduce((sum, [, arr]) => sum + arr.length, 0);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.pageTitle}>记录</Text>
        <Text style={styles.headerStats}>共 {monthTotal} 套 · 本周 {weekCount} 套</Text>
      </View>

      {/* Month navigator */}
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={prevMonth} style={styles.navBtn}>
          <Feather name="chevron-left" size={20} color={Colors.ink} />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{viewYear}年 {MONTH_NAMES[viewMonth]}</Text>
        <TouchableOpacity
          onPress={nextMonth}
          style={styles.navBtn}
          disabled={isCurrentMonth}
        >
          <Feather name="chevron-right" size={20} color={isCurrentMonth ? Colors.line : Colors.ink} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'worn' && styles.tabActive]}
          onPress={() => setActiveTab('worn')}
        >
          <Text style={[styles.tabText, activeTab === 'worn' && styles.tabTextActive]}>已穿搭配</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'favorite' && styles.tabActive]}
          onPress={() => setActiveTab('favorite')}
        >
          <Text style={[styles.tabText, activeTab === 'favorite' && styles.tabTextActive]}>收藏搭配</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'worn' ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Calendar */}
          <View style={styles.calendar}>
            <View style={styles.weekRow}>
              {WEEKDAYS.map(d => (
                <Text key={d} style={styles.weekDay}>{d}</Text>
              ))}
            </View>
            <View style={styles.daysGrid}>
              {Array.from({ length: firstDay }, (_, i) => `${viewYear}-${viewMonth}-${i}`).map(slotKey => (
                <View key={`empty-${slotKey}`} style={styles.dayCell} />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                const key = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const hasOutfit = !!outfitsByDay[key]?.length;
                const outfitCount = outfitsByDay[key]?.length ?? 0;
                const isToday = isCurrentMonth && day === today.getDate();
                const isSelected = day === selectedDay;

                return (
                  <TouchableOpacity
                    key={day}
                    style={[styles.dayCell, isToday && styles.dayCellToday, isSelected && styles.dayCellSelected]}
                    onPress={() => setSelectedDay(day)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.dayNum, isToday && styles.dayNumToday, isSelected && styles.dayNumSelected]}>
                      {day}
                    </Text>
                    {hasOutfit ? (
                      <View style={styles.dotRow}>
                        {Array.from({ length: Math.min(outfitCount, 3) }, (_, i) => `${key}-dot-${i}`).map(dotKey => (
                          <View key={dotKey} style={[styles.dot, isSelected && styles.dotSelected]} />
                        ))}
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Selected day outfits */}
          {selectedDay ? (
            <View style={styles.dayDetail}>
              <Text style={styles.dayDetailTitle}>
                {viewMonth + 1}月{selectedDay}日
                {isCurrentMonth && selectedDay === today.getDate() ? '（今天）' : ''}
              </Text>
              {selectedOutfits.length === 0 ? (
                <View style={styles.emptyDay}>
                  <Feather name="calendar" size={28} color={Colors.walnut2} />
                  <Text style={styles.emptyDayText}>这天没有保存搭配</Text>
                </View>
              ) : (
                selectedOutfits.map(outfit => (
                  <TouchableOpacity
                    key={outfit.outfit_id}
                    style={styles.outfitCard}
                    onPress={() => openDetail(outfit)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.outfitCardLeft}>
                      <MaterialCommunityIcons name="hanger" size={22} color={Colors.walnut2} />
                    </View>
                    <View style={styles.outfitCardInfo}>
                      <Text style={styles.outfitName}>{outfit.name ?? '搭配'}</Text>
                      {outfit.ai_comment ? (
                        <Text style={styles.outfitComment} numberOfLines={2}>{outfit.ai_comment}</Text>
                      ) : null}
                      <Text style={styles.outfitTime}>
                        {new Date(outfit.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 保存
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={16} color={Colors.walnut2} />
                  </TouchableOpacity>
                ))
              )}
            </View>
          ) : monthTotal === 0 && !loading ? (
            <View style={styles.emptySection}>
              <Text style={styles.emptySub}>每次确认穿搭后，都会自动保存到这里</Text>
            </View>
          ) : null}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {favorites.length === 0 ? (
            <View style={styles.emptySection}>
              <Text style={styles.emptyTitle}>还没有收藏搭配</Text>
              <Text style={styles.emptySub}>在推荐结果页点击「收藏此搭配」即可保存灵感</Text>
            </View>
          ) : (
            favorites.map(outfit => (
              <TouchableOpacity
                key={outfit.outfit_id}
                style={styles.outfitCard}
                onPress={() => openDetail(outfit)}
                activeOpacity={0.8}
              >
                <View style={styles.outfitCardLeft}>
                  <Feather name="heart" size={20} color={Colors.terracotta} />
                </View>
                <View style={styles.outfitCardInfo}>
                  <Text style={styles.outfitName}>{outfit.name ?? '搭配'}</Text>
                  {outfit.ai_comment ? (
                    <Text style={styles.outfitComment} numberOfLines={2}>{outfit.ai_comment}</Text>
                  ) : null}
                  <Text style={styles.outfitTime}>
                    {new Date(outfit.created_at).toLocaleDateString('zh-CN')} 收藏
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color={Colors.walnut2} />
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

      {loading ? <ActivityIndicator size="small" color={Colors.walnut2} style={{ marginTop: Spacing.two }} /> : null}

      {/* Outfit Detail Modal */}
      {isWeb ? (
        detailOutfit ? <View style={styles.webLayer}>{detailSheet}</View> : null
      ) : (
        <Modal
          visible={!!detailOutfit}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setDetailOutfit(null)}
        >
          {detailSheet}
        </Modal>
      )}
    </SafeAreaView>
  );
}

const CELL_SIZE = 44;

const styles = StyleSheet.create({
  webLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 220,
  },
  safe: { flex: 1, backgroundColor: Colors.paper, position: 'relative' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
    minHeight: 44,
  },
  pageTitle: { ...T.pageTitle },
  headerStats: { ...T.micro, color: Colors.walnut },

  content: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },

  // Month nav
  monthNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.paperCard, borderRadius: Radius.lg,
    paddingVertical: Spacing.two, paddingHorizontal: Spacing.three,
    borderWidth: 1, borderColor: Colors.line, ...Shadow.one,
  },
  navBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { ...T.subTitle, fontSize: 17 },

  // Tabs
  tabRow: {
    flexDirection: 'row', gap: Spacing.one,
    backgroundColor: Colors.paperCard, borderRadius: Radius.md,
    padding: 3, borderWidth: 1, borderColor: Colors.line,
  },
  tab: {
    flex: 1, paddingVertical: Spacing.two - 2,
    borderRadius: 10, alignItems: 'center',
  },
  tabActive: { backgroundColor: Colors.ink },
  tabText: { ...T.tag, color: Colors.ink },
  tabTextActive: { ...T.tag, color: Colors.paper },

  // Calendar
  calendar: {
    backgroundColor: Colors.paperCard, borderRadius: Radius.lg,
    padding: Spacing.two, borderWidth: 1, borderColor: Colors.line, ...Shadow.one,
  },
  weekRow: { flexDirection: 'row', marginBottom: Spacing.one },
  weekDay: { ...T.micro, flex: 1, textAlign: 'center', fontFamily: Fonts.uiSemiBold, paddingVertical: 4 },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: `${100 / 7}%`, height: CELL_SIZE, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 6, borderRadius: Radius.sm },
  dayCellToday: {},
  dayCellSelected: { backgroundColor: Colors.ink, borderRadius: Radius.md },
  dayNum: { fontFamily: T.tag.fontFamily, fontSize: 14, color: Colors.ink },
  dayNumToday: { color: Colors.terracotta, fontFamily: Fonts.uiSemiBold },
  dayNumSelected: { color: Colors.paper, fontFamily: Fonts.uiSemiBold },
  dotRow: { flexDirection: 'row', gap: 2, marginTop: 2 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.sage },
  dotSelected: { backgroundColor: Colors.paper },

  // Day detail
  dayDetail: { gap: Spacing.two },
  dayDetailTitle: { ...T.subTitle },
  emptyDay: {
    backgroundColor: Colors.paperCard, borderRadius: Radius.lg,
    padding: Spacing.four, alignItems: 'center', gap: Spacing.one,
    borderWidth: 1, borderColor: Colors.line,
  },
  emptyDayText: { ...T.emptyTitle, fontSize: 14 },

  outfitCard: {
    backgroundColor: Colors.paperCard, borderRadius: Radius.lg,
    padding: Spacing.three, flexDirection: 'row', alignItems: 'center',
    gap: Spacing.two, borderWidth: 1, borderColor: Colors.line, ...Shadow.one,
  },
  outfitCardLeft: {
    width: 48, height: 48, backgroundColor: Colors.paperCard,
    borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center',
  },
  outfitCardInfo: { flex: 1, gap: 2 },
  outfitName: { ...T.itemName, fontSize: 15 },
  outfitComment: { ...T.itemDesc, fontSize: 12, lineHeight: 18 },
  outfitTime: { ...T.micro },

  // Empty sections
  emptySection: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.six, marginTop: Spacing.three },
  emptyTitle: { ...T.emptyTitle },
  emptySub: { ...T.itemDesc, textAlign: 'center', lineHeight: 22 },

  // Modal
  modalSafe: { flex: 1, backgroundColor: Colors.paper },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.four, borderBottomWidth: 1, borderBottomColor: Colors.line,
  },
  modalTitle: { ...T.sectionTitle },
  modalClose: { ...T.buttonSecondary, color: Colors.terracotta },
  modalContent: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  heroWrap: {
    width: '100%', aspectRatio: 3 / 4, borderRadius: Radius.lg, overflow: 'hidden',
    backgroundColor: Colors.paperCard, position: 'relative',
    borderWidth: 1, borderColor: Colors.line,
  },
  heroImage: { width: '100%', height: '100%' },
  heroBadge: {
    position: 'absolute', top: 12, left: 12,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(30,24,20,0.72)',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
  },
  heroBadgeText: { fontSize: 11, color: Colors.paper, fontFamily: Fonts.uiSemiBold },
  modalDate: { ...T.caption, fontSize: 13, letterSpacing: 0.78 },
  commentCard: {
    backgroundColor: Colors.signalSoft, borderRadius: Radius.lg,
    padding: Spacing.three, gap: Spacing.one, borderWidth: 1, borderColor: Colors.line,
  },
  commentLabel: { ...T.formLabel },
  commentText: { ...T.bodyText, fontSize: 14 },
  itemsTitle: { ...T.subTitle },
  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.paperCard, borderRadius: Radius.md,
    padding: Spacing.two + 2, gap: Spacing.two,
    borderWidth: 1, borderColor: Colors.line,
  },
  itemIconWrap: {
    width: 40, height: 40, borderRadius: Radius.md,
    backgroundColor: Colors.paperCard, alignItems: 'center', justifyContent: 'center',
  },
  itemInfo: { flex: 1 },
  itemName: { ...T.itemName },
  itemMeta: { ...T.micro },
  itemRole: { ...T.micro, backgroundColor: Colors.paper, paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.sm },
  noItems: { ...T.emptyTitle, fontSize: 14, textAlign: 'center', marginTop: 8 },
});
