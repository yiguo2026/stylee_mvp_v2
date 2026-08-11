import React, { ReactNode } from 'react';
import {
  Image,
  ImageSourcePropType,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import {
  GarmentMediaTone,
  garmentMediaBackgroundByTone,
} from './garmentMediaTone';

export interface StyleeGarmentMediaProps {
  imageUri?: string | null;
  imageSource?: ImageSourcePropType;
  tone?: GarmentMediaTone;
  placeholder?: ReactNode;
  children?: ReactNode;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function StyleeGarmentMedia({
  imageUri,
  imageSource,
  tone = 'neutral',
  placeholder,
  children,
  accessibilityLabel,
  style,
}: StyleeGarmentMediaProps) {
  const resolvedImageSource = imageSource ?? (imageUri ? { uri: imageUri } : undefined);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: garmentMediaBackgroundByTone[tone] },
        style,
      ]}
    >
      {resolvedImageSource ? (
        <Image
          accessibilityLabel={accessibilityLabel}
          source={resolvedImageSource}
          style={styles.image}
          resizeMode="contain"
        />
      ) : placeholder}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
