import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Animated, StyleSheet, Text, View, Platform } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Colors, Fonts } from '@/constants/theme';

/**
 * Global Toast — 手机屏幕内定位、支持 success / error / info 三态。
 * 使用方式（任意页面）：
 *   import { showToast } from '@/components/Toast';
 *   showToast('缓存已清除');            // 默认 info
 *   showToast('保存成功', 'success');
 *   showToast('保存失败，请稍后重试', 'error');
 *
 * 需要在根 layout 内挂载 <ToastHost /> 一次。
 */

export type ToastVariant = 'info' | 'success' | 'error';

interface ToastPayload {
  id: number;
  message: string;
  variant: ToastVariant;
  duration: number;
}

type Listener = (t: ToastPayload) => void;
const listeners = new Set<Listener>();
let uid = 0;

export function showToast(
  message: string,
  variant: ToastVariant = 'info',
  duration = 1800,
) {
  const payload: ToastPayload = { id: ++uid, message, variant, duration };
  listeners.forEach(fn => fn(payload));
}

/** 兼容既有 <Toast message visible /> 的调用（保留旧签名，避免破坏引用） */
export function Toast({ message, visible }: { message: string; visible: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 180,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [visible, opacity]);
  if (!visible) return null;
  return (
    <View pointerEvents="none" style={styles.wrap}>
      <Animated.View style={[styles.bubble, styles.bubbleInfo, { opacity }]}>
        <Text style={styles.text} numberOfLines={2}>{message}</Text>
      </Animated.View>
    </View>
  );
}

/** 全局 Toast 挂载点，需要且仅需要在根 _layout 内放一次 */
export function ToastHost() {
  const [current, setCurrent] = useState<ToastPayload | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-12)).current;
  const hideTimer = useRef<any>(null);

  const dismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(translateY, { toValue: -12, duration: 160, useNativeDriver: Platform.OS !== 'web' }),
    ]).start(() => setCurrent(null));
  }, [opacity, translateY]);

  useEffect(() => {
    const onShow: Listener = (t) => {
      if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
      setCurrent(t);
      opacity.setValue(0);
      translateY.setValue(-12);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(translateY, { toValue: 0, duration: 180, useNativeDriver: Platform.OS !== 'web' }),
      ]).start();
      hideTimer.current = setTimeout(dismiss, t.duration);
    };
    listeners.add(onShow);
    return () => {
      listeners.delete(onShow);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [opacity, translateY, dismiss]);

  if (!current) return null;

  const variantStyle =
    current.variant === 'success' ? styles.bubbleSuccess :
    current.variant === 'error'   ? styles.bubbleError   : styles.bubbleInfo;

  const iconName =
    current.variant === 'success' ? 'check-circle' :
    current.variant === 'error'   ? 'alert-circle' : 'info';

  return (
    <View pointerEvents="none" style={styles.wrap}>
      <Animated.View style={[styles.bubble, variantStyle, { opacity, transform: [{ translateY }] }]}>
        <Feather name={iconName as any} size={16} color={Colors.paper} style={styles.icon} />
        <Text style={styles.text} numberOfLines={2}>{current.message}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0, right: 0, top: 64,
    alignItems: 'center',
    zIndex: 9999,
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '82%',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  bubbleInfo:    { backgroundColor: 'rgba(30, 24, 20, 0.92)' },
  bubbleSuccess: { backgroundColor: 'rgba(38, 132, 90, 0.95)' },
  bubbleError:   { backgroundColor: 'rgba(200, 60, 60, 0.95)' },
  icon: { marginRight: 8 },
  text: {
    fontSize: 13,
    color: Colors.paper,
    fontFamily: Fonts.uiSemiBold,
    textAlign: 'left',
    flexShrink: 1,
  },
});
