import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Colors, Fonts } from '@/constants/theme';

interface ToastProps {
  message: string;
  visible: boolean;
}

export function Toast({ message, visible }: ToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: visible ? 1 : 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: visible ? 0 : 12,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, opacity, translateY]);

  if (!visible && (opacity as any)._value === 0) return null;

  return (
    <View pointerEvents="none" style={styles.wrap}>
      <Animated.View style={[styles.bubble, { opacity, transform: [{ translateY }] }]}>
        <Text style={styles.text} numberOfLines={2}>{message}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 80,
    alignItems: 'center',
    zIndex: 999,
  },
  bubble: {
    maxWidth: '80%',
    backgroundColor: 'rgba(30, 24, 20, 0.92)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
  },
  text: {
    fontSize: 13,
    color: Colors.paper,
    fontFamily: Fonts.uiSemiBold,
    textAlign: 'center',
  },
});
