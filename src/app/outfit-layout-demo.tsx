import { useState } from 'react';
import {
  Image,
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
import { outfitLayoutDemoFixtures, outfitLayoutDemoWardrobe } from '@/data/outfitLayoutDemoFixtures';
import { outfitsRespToApp } from '@/lib/styleeMapping';

const scenarios = outfitLayoutDemoFixtures.map(fixture => {
  const [outfit] = outfitsRespToApp(
    [fixture.outfit], outfitLayoutDemoWardrobe, 'layout-demo', fixture.id,
  );
  const items: OutfitCanvasLayoutItem[] = [
    ...(outfit.items ?? []).map(entry => ({
      id: entry.item_id,
      name: entry.item?.name ?? '',
      category: entry.item?.category ?? '',
      imageUri: entry.item?.image_url,
      owned: true,
      layoutRole: entry.role,
    })),
    ...(outfit.recommended_items ?? []).map((entry, index) => ({
      id: `rec_${index}`,
      name: entry.name,
      category: entry.category,
      imageUri: entry.image_url,
      owned: false,
      layoutRole: entry.role,
    })),
  ];
  return { ...fixture, items };
});

type ScenarioId = typeof scenarios[number]['id'];

const scenarioNote = (kind: typeof scenarios[number]['kind']) => kind === 'structural-stress'
  ? '这是明确三层与丰富配饰的结构压力测试，不是日常合法响应的上限。'
  : '固定合法响应 fixture 通过正式映射和推荐结果页同一套生产画布渲染。';

export default function OutfitLayoutDemoScreen() {
  const [scenarioId, setScenarioId] = useState<ScenarioId>('base-3');
  const [selectedItemId, setSelectedItemId] = useState('base');
  const current = scenarios.find((scenario) => scenario.id === scenarioId) ?? scenarios[0];
  const items = current.items;

  const selectScenario = (next: ScenarioId) => {
    setScenarioId(next);
    const nextItems = scenarios.find((scenario) => scenario.id === next)?.items ?? [];
    if (!nextItems.some((item) => item.id === selectedItemId)) setSelectedItemId(nextItems[0]?.id ?? '');
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
          {scenarios.map((scenario) => (
            <StyleeChoiceChip
              key={scenario.id}
              label={scenario.label}
              selected={scenarioId === scenario.id}
              selectionMode="single"
              onPress={() => selectScenario(scenario.id)}
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
          <Text style={styles.noteText}>{scenarioNote(current.kind)}</Text>
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
                    {item.imageUri ? <Image source={{ uri: item.imageUri }} style={styles.thumbnailImage} resizeMode="contain" /> : null}
                  </View>
                  <View style={styles.itemCopy}>
                    <Text numberOfLines={1} style={styles.itemName}>{item.name}</Text>
                    <Text numberOfLines={1} style={styles.itemMeta}>{item.category}</Text>
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
