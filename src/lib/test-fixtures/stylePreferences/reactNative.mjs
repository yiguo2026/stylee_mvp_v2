import React from 'react';

function host(name, resolveFunctionChild = false) {
  return React.forwardRef(function FixtureHost({ children, ...props }, ref) {
    const rendered = resolveFunctionChild && typeof children === 'function'
      ? children({ pressed: false })
      : children;
    return React.createElement(name, { ...props, ref }, rendered);
  });
}

export const View = host('View');
export const Text = host('Text');
export const SafeAreaView = host('SafeAreaView');
export const ScrollView = host('ScrollView');
export const Pressable = host('Pressable', true);
export const TouchableOpacity = Pressable;
export const ActivityIndicator = host('ActivityIndicator');
export const StyleSheet = { create: (styles) => styles };
export const Platform = { OS: 'web', select: (values) => values.web ?? values.default };
