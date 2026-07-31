import React, { Children, ReactNode, useCallback, useState } from 'react';
import {
  LayoutChangeEvent,
  StyleProp,
  StyleSheet,
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
  const [containerWidth, setContainerWidth] = useState(0);
  const tablet = containerWidth >= ds.layout.breakpointTablet;
  const columns = tablet
    ? ds.component.wardrobeGrid.columnsTablet
    : ds.component.wardrobeGrid.columnsMobile;
  const horizontalPadding = tablet
    ? ds.component.wardrobeGrid.screenPaddingTablet
    : ds.component.wardrobeGrid.screenPadding;
  const usableWidth = containerWidth
    - horizontalPadding * 2
    - ds.component.wardrobeGrid.columnGap * (columns - 1);
  const itemWidth = containerWidth > 0 ? Math.max(0, usableWidth / columns) : undefined;

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    setContainerWidth((currentWidth) => (
      Math.abs(currentWidth - nextWidth) > 0.5 ? nextWidth : currentWidth
    ));
  }, []);

  return (
    <View
      onLayout={handleLayout}
      style={[
        styles.grid,
        {
          paddingHorizontal: horizontalPadding,
          columnGap: ds.component.wardrobeGrid.columnGap,
          rowGap: ds.component.wardrobeGrid.rowGap,
        },
        style,
      ]}
      testID={testID}
    >
      {Children.toArray(children).map((child, index) => (
        <View
          key={(child as React.ReactElement).key ?? index}
          style={{ width: itemWidth ?? '100%' }}
        >
          {child}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    width: '100%',
    maxWidth: ds.layout.contentMaxReading,
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
