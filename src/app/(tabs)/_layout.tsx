import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
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
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: Colors.ink,
        tabBarInactiveTintColor: Colors.walnut2,
        tabBarLabelStyle: styles.tabLabel,
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
    backgroundColor: '#FFFFFF',
    borderTopColor: Colors.line,
    borderTopWidth: 1,
    paddingTop: Spacing.one,
    ...Shadow.two,
  },
  tabLabel: {
    fontSize: 11,
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
