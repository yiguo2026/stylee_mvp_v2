import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, ActivityIndicator,
  Modal,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors, Spacing, Radius, Shadow, T } from '@/constants/theme';
import { useUserStore } from '@/stores/userStore';
import { CategoryIcon } from '@/components/CategoryIcon';
import { supabase } from '@/lib/supabase';

// ── Types ────────────────────────────────────────────────
interface SavedOutfit {
  outfit_id: string;
  name: string | null;
  ai_comment: string | null;
  source: string;
  created_at: string;
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
  return new Date(year, month, 1).getDay(); // 0=Sun
}
function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// CATEGORY_EMOJI removed — now uses CategoryIcon component

// ── Main Component ────────────────────────────────────────
export default function RecordTab() {
  const { user } = useUserStore();

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate());

  // key: "YYYY-MM-DD", value: outfit list for that day
  const [outfitsByDay, setOutfitsByDay] = useState<Record<string, SavedOutfit[]>>({});
  const [loading, setLoading] = useState(false);
  const [detailOutfit, setDetailOutfit] = useState<SavedOutfit | null>(null);
  const [loadingItems, setLoadingItems] = useState(false);

  // Fetch all outfits in the current month
  const fetchMonthOutfits = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);

    const start = new Date(viewYear, viewMonth, 1).toISOString();
    const end = new Date(viewYear, viewMonth + 1, 0, 23, 59, 59).toISOString();

    const { data } = await supabase
      .from('outfits')
      .select('outfit_id, name, ai_comment, source, created_at')
      .eq('user_id', user.id)
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: false });

    setLoading(false);

    if (!data) return;

    // Group by date key
    const grouped: Record<string, SavedOutfit[]> = {};
    data.forEach((o: SavedOutfit) => {
      const key = toDateKey(new Date(o.created_at));
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(o);
    });
    setOutfitsByDay(grouped);
  }, [user?.id, viewYear, viewMonth]);

  useEffect(() => { fetchMonthOutfits(); }, [fetchMonthOutfits]);

  // Open detail modal and load items
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

  // ── Calendar grid ─────────────────────────────────────
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

  // Build selected day key and its outfits
  const selectedKey = selectedDay
    ? `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`
    : null;
  const selectedOutfits = selectedKey ? (outfitsByDay[selectedKey] ?? []) : [];

  // Total outfits this month
  const monthTotal = Object.values(outfitsByDay).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.pageTitle}>穿搭记录</Text>

        {/* Month navigator */}
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={prevMonth} style={styles.navBtn}>
            <Feather name="chevron-left" size={20} color={Colors.ink} />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>
            {viewYear}年 {MONTH_NAMES[viewMonth]}
          </Text>
          <TouchableOpacity
            onPress={nextMonth}
            style={styles.navBtn}
            disabled={isCurrentMonth && viewMonth === today.getMonth() && viewYear === today.getFullYear()}
          >
            <Feather
              name="chevron-right"
              size={20}
              color={isCurrentMonth ? Colors.line : Colors.ink}
            />
          </TouchableOpacity>
        </View>

        {/* Month summary */}
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>
            本月已保存 <Text style={styles.summaryNum}>{monthTotal}</Text> 套搭配
          </Text>
          {loading && <ActivityIndicator size="small" color={Colors.walnut2} />}
        </View>

        {/* Calendar */}
        <View style={styles.calendar}>
          {/* Weekday headers */}
          <View style={styles.weekRow}>
            {WEEKDAYS.map(d => (
              <Text key={d} style={styles.weekDay}>{d}</Text>
            ))}
          </View>

          {/* Day cells */}
          <View style={styles.daysGrid}>
            {/* Empty prefix cells */}
            {Array.from({ length: firstDay }).map((_, i) => (
              <View key={`empty-${i}`} style={styles.dayCell} />
            ))}

            {/* Day cells */}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
              const key = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const hasOutfit = !!outfitsByDay[key]?.length;
              const outfitCount = outfitsByDay[key]?.length ?? 0;
              const isToday = isCurrentMonth && day === today.getDate();
              const isSelected = day === selectedDay;

              return (
                <TouchableOpacity
                  key={day}
                  style={[
                    styles.dayCell,
                    isToday && styles.dayCellToday,
                    isSelected && styles.dayCellSelected,
                  ]}
                  onPress={() => setSelectedDay(day)}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.dayNum,
                    isToday && styles.dayNumToday,
                    isSelected && styles.dayNumSelected,
                  ]}>
                    {day}
                  </Text>
                  {hasOutfit && (
                    <View style={styles.dotRow}>
                      {Array.from({ length: Math.min(outfitCount, 3) }).map((_, i) => (
                        <View
                          key={i}
                          style={[styles.dot, isSelected && styles.dotSelected]}
                        />
                      ))}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Selected day outfits */}
        {selectedDay && (
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
                      <Text style={styles.outfitComment} numberOfLines={2}>
                        {outfit.ai_comment}
                      </Text>
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
        )}

        {/* Recent outfits if no day selected */}
        {!selectedDay && monthTotal === 0 && !loading && (
          <View style={styles.emptyMonth}>
            <MaterialCommunityIcons name="hanger" size={44} color={Colors.walnut2} style={styles.emptyMonthIcon} />
            <Text style={styles.emptyMonthTitle}>这个月还没有搭配记录</Text>
            <Text style={styles.emptyMonthSubtitle}>去穿搭 Tab 生成推荐，点击「就这么穿」即可保存</Text>
          </View>
        )}
      </ScrollView>

      {/* Outfit Detail Modal */}
      <Modal
        visible={!!detailOutfit}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDetailOutfit(null)}
      >
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{detailOutfit?.name ?? '搭配详情'}</Text>
            <TouchableOpacity onPress={() => setDetailOutfit(null)}>
              <Text style={styles.modalClose}>关闭</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent}>
            {/* Date info */}
            {detailOutfit && (
              <Text style={styles.modalDate}>
                保存于 {new Date(detailOutfit.created_at).toLocaleDateString('zh-CN', {
                  year: 'numeric', month: 'long', day: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </Text>
            )}

            {/* AI Comment */}
            {detailOutfit?.ai_comment && (
              <View style={styles.commentCard}>
                <Text style={styles.commentLabel}>AI 搭配点评</Text>
                <Text style={styles.commentText}>{detailOutfit.ai_comment}</Text>
              </View>
            )}

            {/* Items list */}
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
                  {item.role && (
                    <Text style={styles.itemRole}>{item.role}</Text>
                  )}
                </View>
              ))
            ) : (
              <Text style={styles.noItems}>单品信息暂无</Text>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const CELL_SIZE = 44;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.paper },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },

  // 方正悠宋 — page title
  pageTitle: { ...T.pageTitle },

  // Month nav
  monthNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.paperCard,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderWidth: 1, borderColor: Colors.line,
    ...Shadow.one,
  },
  navBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  // navArrow removed — now uses Feather chevron icons
  // 方正悠宋 — month label
  monthLabel: { ...T.subTitle, fontSize: 17 },

  // Summary
  summaryRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  summaryText: { ...T.micro },
  // Playfair Italic — the count number
  summaryNum: { ...T.numInline, color: Colors.terracotta },

  // Calendar
  calendar: {
    backgroundColor: Colors.paperCard,
    borderRadius: Radius.lg,
    padding: Spacing.two,
    borderWidth: 1, borderColor: Colors.line,
    ...Shadow.one,
  },
  weekRow: {
    flexDirection: 'row', marginBottom: Spacing.one,
  },
  weekDay: {
    ...T.micro,
    flex: 1, textAlign: 'center',
    fontWeight: '600',
    paddingVertical: 4,
  },
  daysGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    height: CELL_SIZE,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 6,
    borderRadius: Radius.sm,
  },
  dayCellToday: {
    // subtle background for today when not selected
  },
  dayCellSelected: {
    backgroundColor: Colors.ink,
    borderRadius: Radius.md,
  },
  dayNum: {
    fontFamily: T.tag.fontFamily,
    fontSize: 14, color: Colors.ink, fontWeight: '400',
  },
  dayNumToday: {
    color: Colors.terracotta, fontWeight: '700',
  },
  dayNumSelected: {
    color: Colors.paper, fontWeight: '700',
  },
  dotRow: {
    flexDirection: 'row', gap: 2, marginTop: 2,
  },
  dot: {
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: Colors.sage,
  },
  dotSelected: {
    backgroundColor: Colors.paper,
  },

  // Selected day detail
  dayDetail: {
    gap: Spacing.two,
  },
  // 方正悠宋 — section title
  dayDetailTitle: { ...T.subTitle },
  emptyDay: {
    backgroundColor: Colors.paperCard,
    borderRadius: Radius.lg,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: 1, borderColor: Colors.line,
  },
  // emptyDayEmoji removed — now uses Feather calendar icon
  // 汇文明朝体 — soul voice empty text
  emptyDayText: { ...T.emptyTitle, fontSize: 14 },

  outfitCard: {
    backgroundColor: Colors.paperCard,
    borderRadius: Radius.lg,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1, borderColor: Colors.line,
    ...Shadow.one,
  },
  outfitCardLeft: {
    width: 48, height: 48,
    backgroundColor: Colors.vintageCream,
    borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  // outfitEmoji removed — now uses MaterialCommunityIcons hanger
  outfitCardInfo: { flex: 1, gap: 2 },
  // 方正悠宋 — outfit name
  outfitName: { ...T.itemName, fontSize: 15 },
  // 方正悠宋 — AI comment preview
  outfitComment: { ...T.itemDesc, fontSize: 12, lineHeight: 18 },
  // 苹方 Light — time metadata
  outfitTime: { ...T.micro },
  // outfitArrow removed — now uses Feather chevron-right

  // Empty month
  emptyMonth: {
    backgroundColor: Colors.paperCard,
    borderRadius: Radius.lg,
    padding: Spacing.five,
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1, borderColor: Colors.line,
  },
  emptyMonthIcon: { marginBottom: Spacing.one },
  // 汇文明朝体 — soul voice empty state
  emptyMonthTitle: { ...T.emptyTitle },
  emptyMonthSubtitle: { ...T.itemDesc, textAlign: 'center', lineHeight: 22 },

  // Modal
  modalSafe: { flex: 1, backgroundColor: Colors.paper },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.four,
    borderBottomWidth: 1, borderBottomColor: Colors.line,
  },
  // 方正悠宋 — modal title
  modalTitle: { ...T.sectionTitle },
  modalClose: { ...T.buttonSecondary, color: Colors.terracotta },
  modalContent: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  // 苹方 Light — date caption
  modalDate: { ...T.caption, fontSize: 13, letterSpacing: 0.78 },

  commentCard: {
    backgroundColor: Colors.vintageCream,
    borderRadius: Radius.lg,
    padding: Spacing.three,
    gap: Spacing.one,
    borderWidth: 1,
    borderColor: Colors.linen,
  },
  commentLabel: { ...T.formLabel },
  // 方正悠宋 — AI comment body text
  commentText: { ...T.bodyText, fontSize: 14 },

  // 方正悠宋 — items section title
  itemsTitle: { ...T.subTitle },
  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.paperCard,
    borderRadius: Radius.md,
    padding: Spacing.two + 2,
    gap: Spacing.two,
    borderWidth: 1, borderColor: Colors.line,
  },
  itemIconWrap: {
    width: 40, height: 40, borderRadius: Radius.md,
    backgroundColor: Colors.vintageCream,
    alignItems: 'center', justifyContent: 'center',
  },
  // itemIcon removed — now uses CategoryIcon component
  itemInfo: { flex: 1 },
  // 方正悠宋 — item name
  itemName: { ...T.itemName },
  // 苹方 Light — item meta
  itemMeta: { ...T.micro },
  itemRole: { ...T.micro, backgroundColor: Colors.paper, paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.sm },
  // 汇文明朝体 — empty soul voice
  noItems: { ...T.emptyTitle, fontSize: 14, textAlign: 'center', marginTop: 8 },
});
