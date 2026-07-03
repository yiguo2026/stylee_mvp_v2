import React from 'react';
import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors, Spacing, Fonts } from '@/constants/theme';

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

  const paddingBottom = Math.max(Spacing.three, insets.bottom);
  const height = 66 + paddingBottom;
  const tabBarStyle = [{ ...styles.tabBar, paddingBottom, height }];

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
    paddingTop: Spacing.one + 2,
  },
  tabItem: {
    paddingTop: 4,
    paddingBottom: 4,
  },
  tabLabel: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 0,
    fontFamily: Fonts.ui,
  },
  iconWrap: {
    width: 40,
    height: 32,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: Colors.paperRaised,
  },
});
