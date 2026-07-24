import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Colors, Fonts, Radius, Shadow, Spacing } from '@/constants/theme';
import { ImportTask, useImportStore } from '@/stores/importStore';

export interface ImportSkeletonCardProps {
  task: ImportTask;
  variant?: 'grid' | 'preview';
  onPress?: (task: ImportTask) => void;
}

type StatusMeta = {
  label: string;
  detail: string;
  accent: string;
  progressDuration: number;
};

const GOLD = '#C8A76A';
const TAUPE = '#8B7355';
const MUTED_RED = '#B85450';

function getStatusMeta(task: ImportTask): StatusMeta {
  switch (task.status) {
    case 'needs_selection':
      return {
        label: `去确认 · ${task.allDetectedItems?.length ?? 0} 件`,
        detail: '识别到多件，点此选择导入',
        accent: GOLD,
        progressDuration: 1800,
      };
    case 'selected':
      return {
        label: '准备扣背景',
        detail: '排队生成衣物标准图',
        accent: TAUPE,
        progressDuration: 1600,
      };
    case 'standardizing':
      return {
        label: '扣除背景中',
        detail: '正在生成干净标准图',
        accent: TAUPE,
        progressDuration: 2200,
      };
    case 'uploading':
      return {
        label: '保存中',
        detail: '即将加入衣橱',
        accent: TAUPE,
        progressDuration: 1200,
      };
    case 'failed':
      return {
        label: '识别失败 · 点击重试',
        detail: task.error || '轻触后重新加入队列',
        accent: MUTED_RED,
        progressDuration: 1800,
      };
    case 'done':
      return {
        label: '已导入',
        detail: '已保存到衣橱',
        accent: '#555F50',
        progressDuration: 1200,
      };
    case 'pending':
      return {
        label: '排队中',
        detail: '等待 AI 识别',
        accent: '#9A9AA0',
        progressDuration: 1600,
      };
    case 'detecting':
    default:
      return {
        label: 'AI 识别中',
        detail: '识别分类、颜色与材质',
        accent: '#9A9AA0',
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
    ? { borderColor: 'rgba(200,167,106,0.62)' }
    : liveTask.status === 'failed'
      ? { borderColor: 'rgba(184,84,80,0.42)' }
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
        disabled={!isInteractive}
        onPress={handlePress}
        onPressIn={() => animatePress(0.98)}
        onPressOut={() => animatePress(1)}
      >
        <Animated.View style={[styles.previewWrap, { transform: [{ scale: pressScale }] }]}> 
          <View style={[styles.previewCard, cardAccentStyle]}>
            <View style={styles.previewPhotoWrap}>
              <Image source={{ uri: liveTask.sourceUri }} style={styles.previewPhoto} resizeMode="cover" />
            </View>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.previewShimmer,
                { transform: [{ translateX: shimmerTranslate }, { rotate: '10deg' }] },
              ]}
            />
            <View style={styles.previewProgressTrack}>
              <Animated.View style={[styles.progressLine, { width: progressWidth, backgroundColor: meta.accent }]} />
            </View>
          </View>
          <Text style={[styles.previewCaption, { color: meta.accent }]} numberOfLines={1}>
            {meta.label}
          </Text>
        </Animated.View>
      </Pressable>
    );
  }

  return (
    <Pressable
      disabled={!isInteractive}
      onPress={handlePress}
      onPressIn={() => animatePress(0.98)}
      onPressOut={() => animatePress(1)}
      style={styles.gridPressable}
    >
      <Animated.View style={[styles.card, cardAccentStyle, { transform: [{ scale: pressScale }] }]}> 
        <View style={styles.visualArea}>
          <View style={styles.photoHalo}>
            <Image source={{ uri: liveTask.sourceUri }} style={styles.sourcePhoto} resizeMode="cover" />
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
          <Text style={[styles.statusLabel, { color: meta.accent }]} numberOfLines={1}>{meta.label}</Text>
          <Text style={styles.statusDetail} numberOfLines={1}>{meta.detail}</Text>
        </View>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressLine, { width: progressWidth, backgroundColor: meta.accent }]} />
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  gridPressable: {
    width: '47.5%',
  },
  card: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
    ...Shadow.one,
  },
  visualArea: {
    width: '100%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  photoHalo: {
    width: 64,
    height: 64,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: Colors.paperRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.05)',
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
    backgroundColor: 'rgba(245,245,245,0.72)',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.72)',
  },
  infoArea: {
    minHeight: 54,
    paddingHorizontal: Spacing.two,
    paddingBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  statusLabel: {
    fontFamily: Fonts.uiLight,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  statusDetail: {
    fontFamily: Fonts.body,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 0.5,
    color: '#8A8A8D',
    textAlign: 'center',
  },
  progressTrack: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 9,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  progressLine: {
    height: '100%',
    opacity: 0.72,
  },
  previewWrap: {
    width: 80,
    gap: 5,
  },
  previewCard: {
    width: 80,
    height: 80,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.one,
  },
  previewPhotoWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    overflow: 'hidden',
    backgroundColor: Colors.paperRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.05)',
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
    backgroundColor: 'rgba(245,245,245,0.72)',
  },
  previewProgressTrack: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 7,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  previewCaption: {
    fontFamily: Fonts.uiLight,
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
});
