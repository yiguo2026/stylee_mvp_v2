import { useMemo, useState } from 'react';
import {
  Image,
  type ImageSourcePropType,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import {
  ds,
  StyleeChoiceChip,
  StyleeNavigationBar,
  StyleeOutfitCanvas,
} from '@/design-system';
import type { OutfitCanvasLayoutItem } from '@/lib/outfitCanvasLayout';

type ScenarioId = 'base' | 'layered' | 'accessories';
type DemoRole = 'outer' | 'top' | 'bottom' | 'shoes' | 'scarf' | 'hat';
type DemoItem = OutfitCanvasLayoutItem & { imageSource: ImageSourcePropType; meta: string };

const demoItems: Record<DemoRole, DemoItem> = {
  outer: {
    id: 'outer', name: '卡其色风衣', category: '外套', meta: '卡其色 · 外套',
    imageSource: require('../../public/preset-items/khaki-trench.png'),
  },
  top: {
    id: 'top', name: '黑色高领内搭', category: '上装', meta: '黑色 · 上装',
    imageSource: require('../../public/inspirations/items/look1_02_black_turtleneck.png'),
  },
  bottom: {
    id: 'bottom', name: '黑色直筒裤', category: '下装', meta: '黑色 · 下装',
    imageSource: require('../../public/preset-items/black-trousers.png'),
  },
  shoes: {
    id: 'shoes', name: '白色乐福鞋', category: '鞋履', meta: '白色 · 鞋履',
    imageSource: require('../../public/preset-items/womens-loafers.png'),
  },
  scarf: {
    id: 'scarf', name: '米色针织围巾', category: '帽巾', meta: '米色 · 围巾',
    imageSource: require('../../public/preset-items/beige-scarf.png'),
  },
  hat: {
    id: 'hat', name: '白色棒球帽', category: '帽巾', meta: '白色 · 帽子',
    imageSource: require('../../public/preset-items/baseball-cap.png'),
  },
};

const scenarios: Record<ScenarioId, { label: string; roles: DemoRole[]; note: string }> = {
  base: {
    label: '3件基础',
    roles: ['top', 'bottom', 'shoes'],
    note: '鞋子缩小后放在裤子右下方，与裤子轮廓分开；没有配饰时不保留空位。',
  },
  layered: {
    label: '4件叠穿',
    roles: ['outer', 'top', 'bottom', 'shoes'],
    note: '外套后置，内搭与下装保持中央穿着轴线，鞋子独立落在底部。',
  },
  accessories: {
    label: '6件配饰',
    roles: ['outer', 'top', 'bottom', 'shoes', 'scarf', 'hat'],
    note: '帽子和围巾利用右侧自然留白环绕，不压缩或遮挡核心服装。',
  },
};

export default function OutfitLayoutDemoScreen() {
  const [scenarioId, setScenarioId] = useState<ScenarioId>('base');
  const [selectedItemId, setSelectedItemId] = useState('top');
  const current = scenarios[scenarioId];
  const items = useMemo(() => current.roles.map((role) => demoItems[role]), [current.roles]);

  const selectScenario = (next: ScenarioId) => {
    setScenarioId(next);
    const nextRoles = scenarios[next].roles;
    if (!nextRoles.includes(selectedItemId as DemoRole)) setSelectedItemId(nextRoles[0]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StyleeNavigationBar
        title="搭配画布 Demo"
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/profile/settings'))}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.intro}>
          <Text style={styles.eyebrow}>真实组件预览</Text>
          <Text style={styles.title}>透明单品，自适应成套排版</Text>
          <Text style={styles.description}>直接组合衣橱现有透明图，不调用生图；这里和推荐结果页使用同一套布局代码。</Text>
        </View>

        <View accessibilityRole="tablist" style={styles.switcher}>
          {(Object.keys(scenarios) as ScenarioId[]).map((id) => (
            <StyleeChoiceChip
              key={id}
              label={scenarios[id].label}
              selected={scenarioId === id}
              selectionMode="single"
              onPress={() => selectScenario(id)}
            />
          ))}
        </View>

        <StyleeOutfitCanvas
          items={items}
          selectedItemId={selectedItemId}
          onItemPress={(item) => setSelectedItemId(item.id)}
          accessibilityLabel={`${current.label}搭配预览`}
        />

        <View style={styles.note}>
          <Feather name="info" size={ds.size.icon.sm} color={ds.color.semantic.text.positive} />
          <Text style={styles.noteText}>{current.note}</Text>
        </View>

        <View style={styles.itemsSection}>
          <Text style={styles.sectionTitle}>本套单品</Text>
          <Text style={styles.sectionSupport}>{items.length} 件 · 点击单品可定位画布中的位置</Text>
          <View style={styles.itemList}>
            {items.map((item, index) => {
              const selected = selectedItemId === item.id;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setSelectedItemId(item.id)}
                  style={[styles.itemRow, index > 0 && styles.itemDivider, selected && styles.itemSelected]}
                >
                  <View style={styles.thumbnail}>
                    <Image source={item.imageSource} style={styles.thumbnailImage} resizeMode="contain" />
                  </View>
                  <View style={styles.itemCopy}>
                    <Text numberOfLines={1} style={styles.itemName}>{item.name}</Text>
                    <Text numberOfLines={1} style={styles.itemMeta}>{item.meta}</Text>
                  </View>
                  <Feather
                    name={selected ? 'check' : 'chevron-right'}
                    size={ds.size.icon.md}
                    color={selected ? ds.color.semantic.text.accent : ds.color.semantic.text.tertiary}
                  />
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ds.color.semantic.surface.base },
  content: {
    width: '100%',
    maxWidth: ds.layout.contentMaxMobile,
    alignSelf: 'center',
    paddingHorizontal: ds.layout.screenPaddingCompact,
    paddingTop: ds.space[3],
    paddingBottom: ds.space[10],
    gap: ds.space[4],
  },
  intro: { gap: ds.space[1] },
  eyebrow: { ...ds.typography.support, color: ds.color.semantic.text.positive },
  title: { ...ds.typography.heading, color: ds.color.semantic.text.primary },
  description: { ...ds.typography.support, color: ds.color.semantic.text.secondary },
  switcher: { flexDirection: 'row', flexWrap: 'wrap', gap: ds.component.choiceChip.groupGap },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ds.space[2],
    padding: ds.space[3],
    borderRadius: ds.radius.xl,
    backgroundColor: ds.color.semantic.status.positiveSubtle,
  },
  noteText: { ...ds.typography.support, flex: 1, color: ds.color.semantic.text.positive },
  itemsSection: { gap: ds.space[1] },
  sectionTitle: { ...ds.typography.heading, color: ds.color.semantic.text.primary },
  sectionSupport: { ...ds.typography.support, color: ds.color.semantic.text.tertiary },
  itemList: {
    marginTop: ds.space[2],
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ds.color.semantic.border.default,
    borderRadius: ds.radius.xxl,
    backgroundColor: ds.color.semantic.surface.card,
  },
  itemRow: {
    minHeight: ds.size.control.hero,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ds.space[3],
    paddingHorizontal: ds.space[3],
    paddingVertical: ds.space[2],
  },
  itemDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ds.color.semantic.border.default },
  itemSelected: { backgroundColor: ds.color.semantic.status.attentionSubtle },
  thumbnail: {
    width: ds.size.control.medium,
    height: ds.size.control.large,
    overflow: 'hidden',
    borderRadius: ds.radius.lg,
    backgroundColor: ds.color.semantic.surface.input,
  },
  thumbnailImage: { width: '100%', height: '100%' },
  itemCopy: { flex: 1, minWidth: 0 },
  itemName: { ...ds.typography.content, color: ds.color.semantic.text.primary },
  itemMeta: { ...ds.typography.support, color: ds.color.semantic.text.secondary },
});
