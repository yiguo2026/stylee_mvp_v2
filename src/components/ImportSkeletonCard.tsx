import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { T } from '@/constants/theme';
import { ds, dsShadow } from '@/design-system';
import { ImportTask, useImportStore } from '@/stores/importStore';

export interface ImportSkeletonCardProps {
  task: ImportTask;
  variant?: 'grid' | 'preview';
  onPress?: (task: ImportTask) => void;
}

type StatusMeta = {
  label: string;
  detail: string;
  tone: 'attention' | 'neutral' | 'positive';
  progressDuration: number;
};

function getStatusMeta(task: ImportTask): StatusMeta {
  switch (task.status) {
    case 'needs_selection':
      return {
        label: `去确认 · ${task.allDetectedItems?.length ?? 0} 件`,
        detail: '识别到多件，点此选择导入',
        tone: 'attention',
        progressDuration: 1800,
      };
    case 'selected':
      return {
        label: '准备扣背景',
        detail: '排队生成衣物标准图',
        tone: 'neutral',
        progressDuration: 1600,
      };
    case 'standardizing':
      return {
        label: '扣除背景中',
        detail: '正在生成干净标准图',
        tone: 'neutral',
        progressDuration: 2200,
      };
    case 'uploading':
      return {
        label: '保存中',
        detail: '即将加入衣橱',
        tone: 'neutral',
        progressDuration: 1200,
      };
    case 'failed':
      return {
        label: '识别失败 · 点击重试',
        detail: task.error || '轻触后重新加入队列',
        tone: 'attention',
        progressDuration: 1800,
      };
    case 'done':
      return {
        label: '已导入',
        detail: '已保存到衣橱',
        tone: 'positive',
        progressDuration: 1200,
      };
    case 'pending':
      return {
        label: '排队中',
        detail: '等待 AI 识别',
        tone: 'neutral',
        progressDuration: 1600,
      };
    case 'detecting':
    default:
      return {
        label: 'AI 识别中',
        detail: '识别分类、颜色与材质',
        tone: 'neutral',
        progressDuration: 1600,
      };
  }
}

export function isVisibleImportTask(task: ImportTask) {
  return task.status !== 'done';
}

export default function ImportSkeletonCard({
  task,
  variant = 'grid',
  onPress,
}: ImportSkeletonCardProps) {
  const liveTask = useImportStore((state) => state.tasks.find((item) => item.id === task.id) ?? task);
  const retryFailed = useImportStore((state) => state.retryFailed);

  const shimmer = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  const meta = getStatusMeta(liveTask);
  const accentColor = meta.tone === 'positive'
    ? ds.color.semantic.status.positive
    : meta.tone === 'attention'
      ? ds.color.semantic.status.attention
      : ds.color.semantic.status.neutral;

  useEffect(() => {
    shimmer.setValue(0);
    const shimmerLoop = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1600,
        useNativeDriver: true,
      }),
    );
    shimmerLoop.start();
    return () => shimmerLoop.stop();
  }, [shimmer, liveTask.status]);

  useEffect(() => {
    progress.setValue(0);
    const progressLoop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: meta.progressDuration,
        useNativeDriver: false,
      }),
    );
    progressLoop.start();
    return () => progressLoop.stop();
  }, [meta.progressDuration, progress, liveTask.status]);

  const handlePress = () => {
    if (onPress) {
      onPress(liveTask);
      return;
    }
    if (liveTask.status === 'failed') {
      retryFailed(liveTask.id);
    }
  };

  const isInteractive = liveTask.status === 'needs_selection' || liveTask.status === 'failed' || !!onPress;
  const cardAccentStyle = liveTask.status === 'needs_selection'
    ? { borderColor: ds.color.semantic.status.attention }
    : liveTask.status === 'failed'
      ? { borderColor: ds.color.semantic.action.destructive }
      : null;

  const shimmerTranslate = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: variant === 'preview' ? [-96, 126] : [-170, 240],
  });
  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const animatePress = (toValue: number) => {
    if (!isInteractive) return;
    Animated.timing(pressScale, {
      toValue,
      duration: 120,
      useNativeDriver: true,
    }).start();
  };

  if (variant === 'preview') {
    return (
      <Pressable
        accessibilityRole={isInteractive ? 'button' : undefined}
        accessibilityLabel={`${meta.label}，${meta.detail}`}
        accessibilityState={{ disabled: !isInteractive }}
        disabled={!isInteractive}
        onPress={handlePress}
        onPressIn={() => animatePress(0.98)}
        onPressOut={() => animatePress(1)}
      >
        <Animated.View style={[styles.previewWrap, { transform: [{ scale: pressScale }] }]}> 
          <View style={[styles.previewCard, cardAccentStyle]}>
            <View style={styles.previewPhotoWrap}>
              <Image source={{ uri: liveTask.sourceUri }} style={styles.previewPhoto} resizeMode="contain" />
            </View>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.previewShimmer,
                { transform: [{ translateX: shimmerTranslate }, { rotate: '10deg' }] },
              ]}
            />
            <View style={styles.previewProgressTrack}>
              <Animated.View style={[styles.progressLine, { width: progressWidth, backgroundColor: accentColor }]} />
            </View>
          </View>
          <Text style={[styles.previewCaption, { color: accentColor }]} numberOfLines={1}>
            {meta.label}
          </Text>
        </Animated.View>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole={isInteractive ? 'button' : undefined}
      accessibilityLabel={`${meta.label}，${meta.detail}`}
      accessibilityState={{ disabled: !isInteractive }}
      disabled={!isInteractive}
      onPress={handlePress}
      onPressIn={() => animatePress(0.98)}
      onPressOut={() => animatePress(1)}
      style={styles.gridPressable}
    >
      <Animated.View style={[styles.card, cardAccentStyle, { transform: [{ scale: pressScale }] }]}> 
        <View style={styles.visualArea}>
          <View style={styles.photoHalo}>
            <Image source={{ uri: liveTask.sourceUri }} style={styles.sourcePhoto} resizeMode="contain" />
          </View>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.shimmer,
              { transform: [{ translateX: shimmerTranslate }, { rotate: '10deg' }] },
            ]}
          />
        </View>
        <View style={styles.infoArea}>
          <Text style={[styles.statusLabel, { color: accentColor }]} numberOfLines={1}>{meta.label}</Text>
          <Text style={styles.statusDetail} numberOfLines={1}>{meta.detail}</Text>
        </View>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressLine, { width: progressWidth, backgroundColor: accentColor }]} />
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  gridPressable: {
    width: '100%',
  },
  card: {
    width: '100%',
    backgroundColor: ds.color.semantic.surface.card,
    borderRadius: ds.component.wardrobeCard.radius,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ds.color.semantic.border.subtle,
    ...dsShadow.one,
  },
  visualArea: {
    width: '100%',
    aspectRatio: ds.component.wardrobeCard.mediaAspectRatio,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ds.color.semantic.surface.card,
  },
  photoHalo: {
    width: ds.space[16],
    height: ds.space[16],
    borderRadius: ds.radius.xxl,
    overflow: 'hidden',
    backgroundColor: ds.color.semantic.surface.input,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ds.color.semantic.border.subtle,
  },
  sourcePhoto: {
    width: '100%',
    height: '100%',
    opacity: 0.4,
  },
  shimmer: {
    position: 'absolute',
    top: -24,
    bottom: -24,
    width: 54,
    backgroundColor: ds.color.semantic.surface.input,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: ds.color.semantic.surface.floating,
    opacity: 0.72,
  },
  infoArea: {
    minHeight: ds.component.wardrobeCard.infoMinimumHeight,
    paddingHorizontal: ds.component.wardrobeCard.infoHorizontalPadding,
    paddingVertical: ds.component.wardrobeCard.infoVerticalPadding,
    justifyContent: 'center',
  },
  statusLabel: {
    ...T.content,
  },
  statusDetail: {
    ...T.support,
    color: ds.color.semantic.text.secondary,
  },
  progressTrack: {
    position: 'absolute',
    left: ds.component.wardrobeCard.infoHorizontalPadding,
    right: ds.component.wardrobeCard.infoHorizontalPadding,
    bottom: ds.space[0.5],
    height: StyleSheet.hairlineWidth,
    backgroundColor: ds.color.semantic.border.subtle,
    overflow: 'hidden',
  },
  progressLine: {
    height: '100%',
    opacity: 0.72,
  },
  previewWrap: {
    width: 80,
    gap: ds.space[1],
  },
  previewCard: {
    width: 80,
    height: 80,
    borderRadius: ds.radius.xl,
    overflow: 'hidden',
    backgroundColor: ds.color.semantic.surface.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ds.color.semantic.border.subtle,
    alignItems: 'center',
    justifyContent: 'center',
    ...dsShadow.one,
  },
  previewPhotoWrap: {
    width: 38,
    height: 38,
    borderRadius: ds.radius.lg,
    overflow: 'hidden',
    backgroundColor: ds.color.semantic.surface.input,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ds.color.semantic.border.subtle,
  },
  previewPhoto: {
    width: '100%',
    height: '100%',
    opacity: 0.4,
  },
  previewShimmer: {
    position: 'absolute',
    top: -14,
    bottom: -14,
    width: 30,
    backgroundColor: ds.color.semantic.surface.input,
    opacity: 0.72,
  },
  previewProgressTrack: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 7,
    height: StyleSheet.hairlineWidth,
    backgroundColor: ds.color.semantic.border.subtle,
    overflow: 'hidden',
  },
  previewCaption: {
    ...T.support,
    textAlign: 'center',
  },
});
