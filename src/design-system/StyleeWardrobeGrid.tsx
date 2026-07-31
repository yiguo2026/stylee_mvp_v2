import React, { Children, ReactNode } from 'react';
import {
  StyleProp,
  StyleSheet,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { ds } from './tokens';

interface StyleeWardrobeGridProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function StyleeWardrobeGrid({
  children,
  style,
  testID = 'wardrobe-grid',
}: StyleeWardrobeGridProps) {
  const { width } = useWindowDimensions();
  const tablet = width >= ds.layout.breakpointTablet;
  const columns = tablet
    ? ds.component.wardrobeGrid.columnsTablet
    : ds.component.wardrobeGrid.columnsMobile;
  const horizontalPadding = tablet
    ? ds.component.wardrobeGrid.screenPaddingTablet
    : ds.component.wardrobeGrid.screenPadding;
  const maximumWidth = tablet ? ds.layout.contentMaxReading : ds.layout.contentMaxMobile;
  const contentWidth = Math.min(width, maximumWidth);
  const usableWidth = contentWidth
    - horizontalPadding * 2
    - ds.component.wardrobeGrid.columnGap * (columns - 1);
  const itemWidth = usableWidth / columns;

  return (
    <View
      style={[
        styles.grid,
        {
          width: contentWidth,
          paddingHorizontal: horizontalPadding,
          columnGap: ds.component.wardrobeGrid.columnGap,
          rowGap: ds.component.wardrobeGrid.rowGap,
        },
        style,
      ]}
      testID={testID}
    >
      {Children.toArray(children).map((child, index) => (
        <View key={(child as React.ReactElement).key ?? index} style={{ width: itemWidth }}>
          {child}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
