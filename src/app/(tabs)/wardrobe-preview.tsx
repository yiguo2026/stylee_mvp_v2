import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { T } from '@/constants/theme';
import {
  ds,
  StyleeChoiceChip,
  StyleePageHeader,
  StyleeSearchField,
  StyleeWardrobeCard,
  StyleeWardrobeGrid,
} from '@/design-system';

const categories = [
  ['全部', '71'],
  ['上装', '21'],
  ['下装', '15'],
  ['连体装', '3'],
  ['外套', '9'],
  ['鞋履', '12'],
] as const;

const previewItems = [
  {
    name: '棒球帽',
    metadata: '白色 · 帽巾',
    source: require('../../../public/preset-items/baseball-cap.png'),
  },
  {
    name: '工装长裤',
    metadata: '黑色 · 下装',
    source: require('../../../public/preset-items/black-trousers.png'),
  },
  {
    name: '女款乐福鞋',
    metadata: '白色 · 鞋履',
    source: require('../../../public/preset-items/womens-loafers.png'),
  },
  {
    name: '高跟鞋',
    metadata: '黑色 · 鞋履',
    source: require('../../../public/preset-items/high-heels.png'),
  },
  {
    name: 'A字裙',
    metadata: '米白 · 下装',
    source: require('../../../public/preset-items/a-line-skirt.png'),
  },
  {
    name: '男士皮鞋',
    metadata: '黑色 · 鞋履',
    source: require('../../../public/preset-items/mens-leather-shoes.png'),
  },
] as const;

export default function WardrobeDesignPreview() {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('全部');

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>
      <StyleePageHeader
        title="衣橱"
        actionLabel="添加衣物"
        actionIcon="plus"
        onActionPress={() => undefined}
      />
      <View style={styles.searchRow}>
        <StyleeSearchField
          accessibilityLabel="搜索衣橱单品"
          onChangeText={setQuery}
          placeholder="搜索单品..."
          testID="wardrobe-preview-search"
          value={query}
        />
      </View>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryList}
        >
          {categories.map(([label, count]) => (
            <StyleeChoiceChip
              key={label}
              label={label}
              onPress={() => setSelectedCategory(label)}
              selected={selectedCategory === label}
              selectionMode="single"
              trailingContent={(
                <View style={[
                  styles.count,
                  selectedCategory === label && styles.countSelected,
                ]}>
                  <Text style={[
                    styles.countText,
                    selectedCategory === label && styles.countTextSelected,
                  ]}>
                    {count}
                  </Text>
                </View>
              )}
              accessibilityLabel={`${label}，${count}件`}
            />
          ))}
        </ScrollView>
        <StyleeWardrobeGrid testID="wardrobe-preview-grid">
          {previewItems.map((item) => (
            <StyleeWardrobeCard
              key={item.name}
              imageSource={item.source}
              metadata={item.metadata}
              name={item.name}
              onPress={() => undefined}
            />
          ))}
        </StyleeWardrobeGrid>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: ds.color.semantic.surface.base,
  },
  searchRow: {
    width: '100%',
    maxWidth: ds.layout.contentMaxReading,
    alignSelf: 'center',
    paddingHorizontal: ds.component.wardrobeGrid.screenPadding,
    marginTop: ds.component.wardrobeGrid.controlsGap,
    marginBottom: ds.component.wardrobeGrid.controlsGap,
  },
  scroll: {
    flex: 1,
  },
  categoryList: {
    paddingHorizontal: ds.component.wardrobeGrid.screenPadding,
    paddingBottom: ds.component.wardrobeGrid.controlsGap,
    gap: ds.component.choiceChip.groupGap,
  },
  count: {
    minWidth: ds.typography.support.lineHeight,
    height: ds.typography.support.lineHeight,
    paddingHorizontal: ds.space[0.5],
    borderRadius: ds.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ds.color.semantic.status.neutralSubtle,
  },
  countSelected: {
    backgroundColor: ds.color.semantic.surface.floating,
  },
  countText: {
    ...T.support,
    color: ds.color.semantic.text.secondary,
  },
  countTextSelected: {
    color: ds.color.semantic.text.primary,
  },
});
