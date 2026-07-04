import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors, Fonts, Spacing } from '@/constants/theme';

interface AILoadingProps {
  title: string;
  subtitle?: string;
  steps: string[];
  /** 进度条从 1% 平滑爬升到 ~99% 的时长（毫秒），由父组件在完成时卸载本组件 */
  durationMs?: number;
  hint?: string;
  style?: ViewStyle;
}

export function AILoading({ title, subtitle, steps, durationMs = 10000, hint, style }: AILoadingProps) {
  const progressAnim = useRef(new Animated.Value(0)).current;
  const breath = useRef(new Animated.Value(0)).current;
  const [percent, setPercent] = useState(1);

  // 1% -> 99% 平滑爬升（末段减速，模拟真实进度）
  useEffect(() => {
    const id = progressAnim.addListener(({ value }) => {
      setPercent(Math.max(1, Math.min(99, Math.round(value))));
    });
    Animated.timing(progressAnim, {
      toValue: 99,
      duration: durationMs,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => progressAnim.removeListener(id);
  }, [progressAnim, durationMs]);

  // 呼吸闪烁动画（缩放 + 透明度循环）
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [breath]);

  const badgeScale = breath.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.05] });
  const glowOpacity = breath.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.5] });
  const glowScale = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const sparkleOpacity = breath.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });

  const activeIndex = Math.min(steps.length - 1, Math.floor((percent / 100) * steps.length));

  return (
    <View style={[styles.container, style]}>
      {/* 呼吸圆形徽标 */}
      <View style={styles.badgeWrap}>
        <Animated.View style={[styles.glow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />
        <Animated.View style={[styles.badge, { transform: [{ scale: badgeScale }] }]}>
          <Animated.View style={{ opacity: sparkleOpacity }}>
            <Ionicons name="sparkles" size={40} color="#E8B646" />
          </Animated.View>
        </Animated.View>
      </View>

      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

      {/* 进度条 + 百分比 */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${percent}%` }]} />
      </View>
      <Text style={styles.percent}>{percent}%</Text>

      {/* 步骤清单 */}
      <View style={styles.steps}>
        {steps.map((label, i) => {
          const done = i < activeIndex;
          const current = i === activeIndex;
          return (
            <View key={label} style={styles.stepRow}>
              {done ? (
                <View style={styles.circleDone}>
                  <Ionicons name="checkmark" size={13} color={Colors.paper} />
                </View>
              ) : (
                <View style={[styles.circleTodo, current && styles.circleCurrent]} />
              )}
              <Text style={[styles.stepText, (done || current) && styles.stepTextActive, current && styles.stepTextCurrent]}>
                {label}
              </Text>
            </View>
          );
        })}
      </View>

      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.97)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.five,
  },
  badgeWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.four },
  glow: {
    position: 'absolute', width: 130, height: 130, borderRadius: 65,
    backgroundColor: '#E8B646',
  },
  badge: {
    width: 118, height: 118, borderRadius: 59,
    backgroundColor: Colors.paper,
    borderWidth: 3, borderColor: Colors.ink,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 24, fontFamily: Fonts.titleSerif, color: Colors.ink, textAlign: 'center' },
  subtitle: { marginTop: Spacing.two, fontSize: 15, fontFamily: Fonts.ui, color: Colors.gray2, textAlign: 'center' },
  progressTrack: {
    width: '100%', maxWidth: 320, height: 7, borderRadius: 4,
    backgroundColor: Colors.line, overflow: 'hidden', marginTop: Spacing.four,
  },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: Colors.ink },
  percent: { marginTop: Spacing.two, fontSize: 15, fontFamily: Fonts.uiSemiBold, color: Colors.gray1 },
  steps: { marginTop: Spacing.four, alignSelf: 'center', gap: Spacing.three },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2 },
  circleDone: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.ink,
    alignItems: 'center', justifyContent: 'center',
  },
  circleTodo: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: Colors.lineStrong, backgroundColor: Colors.paper,
  },
  circleCurrent: { borderColor: Colors.ink },
  stepText: { fontSize: 15, fontFamily: Fonts.ui, color: Colors.gray2 },
  stepTextActive: { color: Colors.gray1 },
  stepTextCurrent: { color: Colors.ink, fontFamily: Fonts.uiSemiBold },
  hint: { marginTop: Spacing.four, fontSize: 12, fontFamily: Fonts.ui, color: Colors.gray2, textAlign: 'center' },
});
