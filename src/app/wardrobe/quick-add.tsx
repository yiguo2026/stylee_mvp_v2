import React, { useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Image,
  ScrollView, ActivityIndicator, SafeAreaView,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { Colors, Fonts, Spacing, Radius, Shadow, T } from '@/constants/theme';
import { useUserStore } from '@/stores/userStore';
import { useWardrobeStore } from '@/stores/wardrobeStore';
import { PRESET_BASIC_ITEMS, ClothingCategory, CLOTHING_CATEGORIES_WITH_ALL } from '@/types';
import { CategoryIcon } from '@/components/CategoryIcon';
import { showToast } from '@/components/Toast';

export default function QuickAddPage() {
  const { user } = useUserStore();
  const { items, addItem, fetchItems } = useWardrobeStore();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [filterCategory, setFilterCategory] = useState<ClothingCategory | '全部'>('全部');
  const [loading, setLoading] = useState(false);

  // Build set of (name+category) already in wardrobe
  const existingKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const item of items) {
      keys.add(`${item.name}||${item.category}`);
    }
    return keys;
  }, [items]);

  const isAdded = (index: number) => {
    const item = PRESET_BASIC_ITEMS[index];
    return existingKeys.has(`${item.name}||${item.category}`);
  };

  const filteredItems = filterCategory === '全部'
    ? PRESET_BASIC_ITEMS
    : PRESET_BASIC_ITEMS.filter(i => i.category === filterCategory);

  const filteredIndices = useMemo(() =>
    filteredItems.map(item => PRESET_BASIC_ITEMS.indexOf(item)),
    [filteredItems]
  );

  const addableIndices = useMemo(() =>
    filteredIndices.filter(i => {
      const item = PRESET_BASIC_ITEMS[i];
      return !existingKeys.has(`${item.name}||${item.category}`);
    }),
    [filteredIndices, existingKeys]
  );

  // 全部推荐单品（不受分类过滤影响）都已加入衣橱？→ 展示空态引导。
  const allPresetAdded = useMemo(
    () => PRESET_BASIC_ITEMS.every(it => existingKeys.has(`${it.name}||${it.category}`)),
    [existingKeys],
  );

  const toggleItem = (index: number) => {
    if (isAdded(index)) return;
    const next = new Set(selected);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelected(next);
  };

  const selectAll = () => {
    if (addableIndices.every(i => selected.has(i)) && addableIndices.length > 0) {
      // All addable are selected → deselect all
      setSelected(new Set());
    } else {
      // Select all addable items
      setSelected(new Set(addableIndices));
    }
  };

  const handleAdd = async () => {
    if (!user?.id || selected.size === 0) return;
    setLoading(true);
    try {
      for (const index of selected) {
        const item = PRESET_BASIC_ITEMS[index];
        await addItem({
          user_id: user.id,
          name: item.name,
          category: item.category,
          color: item.color,
          material: item.material || undefined,
          image_url: item.image_url || undefined,
          source_type: 'manual',
          source_label: '快速添加',
          status: 'active',
        });
      }
      await fetchItems(user.id);
      showToast(`已添加 ${selected.size} 件单品到衣橱`, 'success');
      if (router.canGoBack()) router.back();
    } catch (e: any) {
      showToast('添加失败：' + (e.message || '请稍后重试'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { if (router.canGoBack()) router.back(); }} hitSlop={12}>
          <Text style={styles.headerBack}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>快速添加单品</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {allPresetAdded ? (
          <View style={styles.allDoneWrap}>
            <View style={styles.allDoneIconWrap}>
              <Feather name="check-circle" size={44} color={Colors.ink} />
            </View>
            <Text style={styles.allDoneTitle}>你已经把推荐单品都加进衣橱啦 🎉</Text>
            <Text style={styles.allDoneSub}>
              基础款都齐了，可以从「相册导入」补充更多个性单品；或者直接回衣橱开始搭配。
            </Text>
            <TouchableOpacity
              style={styles.allDonePrimary}
              activeOpacity={0.8}
              onPress={() => {
                if (router.canGoBack()) router.back();
                else router.replace('/(tabs)/wardrobe');
              }}
            >
              <Text style={styles.allDonePrimaryText}>返回衣橱</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.subtitle}>精选热销基础款，点击即可一键加入衣橱</Text>

        <View style={styles.builtinSection}>
          <View style={styles.builtinHeader}>
            <Text style={styles.builtinHeaderTitle}>AI 推荐单品</Text>
            <TouchableOpacity onPress={selectAll}>
              <Text style={styles.builtinSelectAll}>
                {addableIndices.length > 0 && addableIndices.every(i => selected.has(i)) ? '取消全选' : '全选添加'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Category filter */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.categoryRow}>
              {CLOTHING_CATEGORIES_WITH_ALL.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.catBtn, filterCategory === cat && styles.catBtnActive]}
                  onPress={() => setFilterCategory(cat)}
                >
                  <Text style={[styles.catText, filterCategory === cat && styles.catTextActive]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <View style={styles.builtinGrid}>
            {filteredItems.map(item => {
              const realIndex = PRESET_BASIC_ITEMS.indexOf(item);
              const isSelected = selected.has(realIndex);
              const alreadyAdded = isAdded(realIndex);
              return (
                <TouchableOpacity
                  key={realIndex}
                  style={[
                    styles.builtinItem,
                    isSelected && styles.builtinItemSelected,
                    alreadyAdded && styles.builtinItemDisabled,
                  ]}
                  onPress={() => toggleItem(realIndex)}
                  activeOpacity={alreadyAdded ? 1 : 0.7}
                >
                  <View style={[styles.builtinIcon, isSelected && styles.builtinIconSelected, alreadyAdded && styles.builtinIconDisabled]}>
                    {item.image_url ? (
                      <Image source={{ uri: item.image_url }} style={styles.builtinImg} resizeMode="cover" />
                    ) : (
                      <CategoryIcon category={item.category} size={24} color={isSelected ? Colors.ink : Colors.walnut2} />
                    )}
                    {isSelected ? (
                      <View style={styles.builtinCheck}>
                        <Feather name="check" size={10} color={Colors.paper} />
                      </View>
                    ) : null}
                    {alreadyAdded ? (
                      <View style={styles.builtinAddedBadge}>
                        <Text style={styles.builtinAddedText}>已添加</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.builtinInfo}>
                    <Text style={[styles.builtinName, isSelected && styles.builtinNameSelected, alreadyAdded && styles.builtinNameDisabled]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[styles.builtinDesc, alreadyAdded && styles.builtinDescDisabled]} numberOfLines={1}>{item.color} · {item.category}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.selectedCount}>
            已选 {selected.size} 件可添加
          </Text>
        </View>

        {/* Add Button */}
        <TouchableOpacity
          style={[styles.addBtn, (selected.size === 0 || loading) && styles.addBtnDisabled]}
          onPress={handleAdd}
          disabled={selected.size === 0 || loading}
        >
          {loading
            ? <ActivityIndicator color={Colors.paper} />
            : <Text style={styles.addBtnText}>加入衣橱 ({selected.size})</Text>
          }
        </TouchableOpacity>
          </>
        )}
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
  headerBack: { ...T.bodyText, color: Colors.ink, width: 60 },
  headerTitle: { ...T.sectionTitle },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  subtitle: { ...T.bodyText, fontSize: 14, color: Colors.walnut, lineHeight: 22 },

  builtinSection: {
    backgroundColor: Colors.paperCard, borderRadius: Radius.lg,
    padding: Spacing.three, gap: Spacing.two,
    borderWidth: 1, borderColor: Colors.line,
  },
  builtinHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  builtinHeaderTitle: { ...T.bodyText, fontFamily: Fonts.titleSerif, fontSize: 16, color: Colors.ink },
  builtinSelectAll: { ...T.tag, color: Colors.ink, fontFamily: Fonts.uiSemiBold },

  categoryRow: { flexDirection: 'row', gap: Spacing.one },
  catBtn: {
    paddingHorizontal: Spacing.two, paddingVertical: Spacing.one + 2,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.lineStrong,
    backgroundColor: Colors.paper, alignItems: 'center', gap: 2,
  },
  catBtnActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  catText: { ...T.tag, fontSize: 11, color: Colors.ink },
  catTextActive: { ...T.tag, fontSize: 11, color: Colors.paper },

  builtinGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  builtinItem: {
    width: '47%', flexDirection: 'row', alignItems: 'center',
    gap: Spacing.one + 2, backgroundColor: Colors.paperCard,
    borderRadius: Radius.md, padding: Spacing.two,
    ...Shadow.one,
  },
  builtinItemSelected: { borderWidth: 1, borderColor: Colors.ink, backgroundColor: Colors.signalSoft },
  builtinItemDisabled: { opacity: 0.45 },

  builtinIcon: {
    width: 44, height: 44, borderRadius: Radius.md,
    backgroundColor: Colors.paperCard, alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  builtinIconSelected: { backgroundColor: Colors.signalSoft },
  builtinIconDisabled: { backgroundColor: Colors.lineSoft },
  builtinImg: { width: 44, height: 44, borderRadius: Radius.md },
  builtinCheck: {
    position: 'absolute', bottom: -4, right: -4,
    width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.signal,
    alignItems: 'center', justifyContent: 'center',
  },
  builtinAddedBadge: {
    position: 'absolute', bottom: 0, right: 0, left: 0,
    backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 1,
  },
  builtinAddedText: { fontSize: 9, color: '#fff', fontFamily: Fonts.uiSemiBold },

  builtinInfo: { flex: 1, gap: 2 },
  builtinName: { ...T.tag, color: Colors.ink, fontSize: 12, fontFamily: Fonts.uiSemiBold },
  builtinNameSelected: { color: Colors.ink },
  builtinNameDisabled: { color: Colors.walnut2 },
  builtinDesc: { ...T.micro, fontSize: 10, color: Colors.walnut2 },
  builtinDescDisabled: { color: Colors.lineStrong },
  selectedCount: { ...T.tag, fontSize: 12, color: Colors.ink, textAlign: 'center', fontFamily: Fonts.ui },

  addBtn: {
    backgroundColor: Colors.ink, borderRadius: Radius.md,
    paddingVertical: Spacing.two + 4, alignItems: 'center', marginTop: Spacing.two,
  },
  addBtnDisabled: { opacity: 0.4 },
  addBtnText: { ...T.buttonPrimary, color: Colors.paper, fontSize: 16 },

  // 全部推荐单品已加入时的空态
  allDoneWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.six,
    paddingHorizontal: Spacing.four,
  },
  allDoneIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.paperCard,
    borderWidth: 1, borderColor: Colors.line,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  allDoneTitle: {
    ...T.bodyText, fontFamily: Fonts.uiSemiBold, fontSize: 16, color: Colors.ink,
    textAlign: 'center',
  },
  allDoneSub: {
    ...T.bodyText, fontSize: 13, color: Colors.walnut2,
    textAlign: 'center', lineHeight: 20,
    paddingHorizontal: Spacing.two,
  },
  allDonePrimary: {
    marginTop: Spacing.two,
    backgroundColor: Colors.ink, borderRadius: Radius.md,
    paddingVertical: Spacing.two + 4, paddingHorizontal: Spacing.six,
    alignItems: 'center',
  },
  allDonePrimaryText: { ...T.buttonPrimary, color: Colors.paper, fontSize: 15 },
});
