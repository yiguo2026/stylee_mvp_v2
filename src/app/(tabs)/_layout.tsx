import React from 'react';
import { Tabs } from 'expo-router';
import { View, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors, Spacing, Shadow, Fonts } from '@/constants/theme';

// ── Tab icon wrapper ──────────────────────────────────────
function TabIcon({
  children,
  focused,
}: {
  children: React.ReactNode;
  focused: boolean;
}) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      {children}
    </View>
  );
}

const ICON_SIZE = 22;
const color = (focused: boolean) => (focused ? Colors.ink : Colors.walnut2);

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  const paddingBottom = Math.max(Spacing.two, insets.bottom);
  const height = 60 + paddingBottom;

  // Web/内嵌浏览器常见底部工具栏会覆盖可视区域，需要把 TabBar 上移
  const webBottomOffset = Platform.OS === 'web' ? Spacing.four : 0;
  const tabBarStyle = Platform.OS === 'web'
    ? [{ ...styles.tabBar, paddingBottom, height, position: 'absolute', left: 0, right: 0, bottom: webBottomOffset }]
    : [{ ...styles.tabBar, paddingBottom, height }];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle,
        tabBarActiveTintColor: Colors.ink,
        tabBarInactiveTintColor: Colors.walnut2,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '穿搭',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused}>
              <Ionicons name="sparkles-outline" size={ICON_SIZE} color={color(focused)} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="wardrobe"
        options={{
          title: '衣橱',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused}>
              <MaterialCommunityIcons name="hanger" size={ICON_SIZE + 2} color={color(focused)} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="record"
        options={{
          title: '记录',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused}>
              <Feather name="calendar" size={ICON_SIZE} color={color(focused)} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '我的',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused}>
              <Feather name="user" size={ICON_SIZE} color={color(focused)} />
            </TabIcon>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.paper,
    borderTopColor: Colors.line,
    borderTopWidth: 1,
    paddingTop: Spacing.one,
    ...Shadow.two,
  },
  tabItem: {
    paddingTop: 2,
    paddingBottom: 2,
  },
  tabLabel: {
    fontSize: 11,
    lineHeight: 14,
    marginBottom: 2,
    fontFamily: Fonts.ui,
  },
  iconWrap: {
    width: 40,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: Colors.paperRaised,
  },
});
