import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';
import { ds, dsShadow, StyleeWardrobeGrid } from '@/design-system';

/**
 * 骨架屏基础块：柔和呼吸式 shimmer。用来在数据未回来时占位，替代「转圈」，
 * 让用户第一眼就看到内容的轮廓，主观感受更快。
 */
export function SkeletonBlock({ style }: { style?: ViewStyle | ViewStyle[] }) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 850, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 850, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.9] });

  return <Animated.View style={[styles.block, style, { opacity }]} />;
}

/** 衣橱网格骨架：进入衣橱首屏、数据未回来时占位，替代空态闪现 */
export function WardrobeSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <StyleeWardrobeGrid>
      {Array.from({ length: count }).map((_, i) => (
        <View key={`wardrobe-skeleton-${i}`} style={styles.card}>
          <SkeletonBlock style={styles.cardMedia} />
          <View style={styles.cardInfo}>
            <SkeletonBlock style={styles.lineWide} />
            <SkeletonBlock style={styles.lineNarrow} />
          </View>
        </View>
      ))}
    </StyleeWardrobeGrid>
  );
}

/** 搭配列表骨架：记录页/收藏页加载时占位（横向卡片：缩略图 + 两行文字） */
export function OutfitListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={`outfit-skeleton-${i}`} style={styles.row}>
          <SkeletonBlock style={styles.rowThumb} />
          <View style={styles.rowInfo}>
            <SkeletonBlock style={styles.lineWide} />
            <SkeletonBlock style={styles.lineNarrow} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: ds.color.semantic.surface.input,
    borderRadius: ds.radius.sm,
  },

  // 衣橱卡片骨架
  card: {
    width: '100%',
    backgroundColor: ds.color.semantic.surface.card,
    borderRadius: ds.component.wardrobeCard.radius,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ds.color.semantic.border.subtle,
    ...dsShadow.one,
  },
  cardMedia: {
    width: '100%',
    aspectRatio: ds.component.wardrobeCard.mediaAspectRatio,
  },
  cardInfo: {
    minHeight: ds.component.wardrobeCard.infoMinimumHeight,
    paddingHorizontal: ds.component.wardrobeCard.infoHorizontalPadding,
    paddingVertical: ds.component.wardrobeCard.infoVerticalPadding,
    gap: ds.space[1],
    justifyContent: 'center',
  },

  // 搭配列表骨架
  list: { gap: ds.space[2] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ds.space[2],
    padding: ds.space[3],
    backgroundColor: ds.color.semantic.surface.card,
    borderRadius: ds.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ds.color.semantic.border.subtle,
    ...dsShadow.one,
  },
  rowThumb: {
    width: ds.size.control.hero,
    height: ds.size.control.hero,
    borderRadius: ds.radius.md,
  },
  rowInfo: { flex: 1, gap: ds.space[1] },

  // 通用文字占位行
  lineWide: { width: '68%', height: ds.space[3] },
  lineNarrow: { width: '42%', height: ds.space[2] },
});
