import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabInset, Colors, Fonts } from '@/constants/theme';

/**
 * Global Toast — 手机屏幕内定位、支持 success / error / info 三态。
 * 使用方式（任意页面）：
 *   import { showToast } from '@/components/Toast';
 *   showToast('缓存已清除');
 *   showToast('保存成功', 'success');
 *   showToast('保存失败，请稍后重试', 'error');
 *   showToast('2张照片待确认', 'info', 2500, { onPress: () => {} });
 *
 * 需要在根 layout 内挂载 <ToastHost /> 一次。
 */

export type ToastVariant = 'info' | 'success' | 'error';

export interface ToastOptions {
  onPress?: () => void;
  dismissOnPress?: boolean;
}

interface ToastPayload {
  id: number;
  message: string;
  variant: ToastVariant;
  duration: number;
  onPress?: () => void;
  dismissOnPress?: boolean;
}

type Listener = (toast: ToastPayload) => void;
const listeners = new Set<Listener>();
let uid = 0;

export function showToast(
  message: string,
  variant: ToastVariant = 'info',
  duration = 1800,
  options: ToastOptions = {},
) {
  const payload: ToastPayload = {
    id: ++uid,
    message,
    variant,
    duration,
    onPress: options.onPress,
    dismissOnPress: options.dismissOnPress,
  };
  listeners.forEach((listener) => listener(payload));
}

/** 兼容既有 <Toast message visible /> 的调用（保留旧签名，避免破坏引用） */
export function Toast({ message, visible }: { message: string; visible: boolean }) {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 180,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [opacity, visible]);

  if (!visible) return null;

  return (
    <View pointerEvents="none" style={[styles.wrap, { bottom: getToastBottom(insets.bottom) }]}>
      <Animated.View style={[styles.bubble, styles.bubbleInfo, { opacity }]}> 
        <Text style={styles.text} numberOfLines={2}>{message}</Text>
      </Animated.View>
    </View>
  );
}

/** 全局 Toast 挂载点，需要且仅需要在根 _layout 内放一次 */
export function ToastHost() {
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState<ToastPayload | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 160,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(translateY, {
        toValue: 12,
        duration: 160,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start(() => setCurrent(null));
  }, [opacity, translateY]);

  useEffect(() => {
    const onShow: Listener = (toast) => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      setCurrent(toast);
      opacity.setValue(0);
      translateY.setValue(12);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 180,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]).start();
      hideTimer.current = setTimeout(dismiss, toast.duration);
    };

    listeners.add(onShow);
    return () => {
      listeners.delete(onShow);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [dismiss, opacity, translateY]);

  if (!current) return null;

  const variantStyle =
    current.variant === 'success' ? styles.bubbleSuccess :
    current.variant === 'error' ? styles.bubbleError : styles.bubbleInfo;

  const iconName =
    current.variant === 'success' ? 'check-circle' :
    current.variant === 'error' ? 'alert-circle' : 'info';

  const iconColor =
    current.variant === 'success' ? '#555F50' :
    current.variant === 'error' ? '#B85450' : Colors.ink;

  const bubble = (
    <Animated.View
      style={[
        styles.bubble,
        variantStyle,
        {
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <Feather name={iconName as any} size={14} color={iconColor} style={styles.icon} />
      <Text style={styles.text} numberOfLines={2}>{current.message}</Text>
    </Animated.View>
  );

  const handlePress = () => {
    current.onPress?.();
    if (current.dismissOnPress ?? true) {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      dismiss();
    }
  };

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: getToastBottom(insets.bottom) }]}>
      {current.onPress ? (
        <TouchableOpacity activeOpacity={0.92} onPress={handlePress}>
          {bubble}
        </TouchableOpacity>
      ) : bubble}
    </View>
  );
}

function getToastBottom(insetBottom: number) {
  const baseOffset = Platform.OS === 'web' ? 92 : BottomTabInset + 18;
  return insetBottom + baseOffset;
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 172,
    maxWidth: '82%',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.11,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  bubbleInfo: { backgroundColor: 'rgba(255,255,255,0.96)' },
  bubbleSuccess: { backgroundColor: 'rgba(255,255,255,0.96)', borderColor: 'rgba(85,95,80,0.22)' },
  bubbleError: { backgroundColor: 'rgba(255,255,255,0.96)', borderColor: 'rgba(184,84,80,0.24)' },
  icon: { marginRight: 7 },
  text: {
    fontSize: 12,
    color: Colors.ink,
    fontFamily: Fonts.ui,
    letterSpacing: 0.36,
    textAlign: 'left',
    flexShrink: 1,
    lineHeight: 17,
  },
});
