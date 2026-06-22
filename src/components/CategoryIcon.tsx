/**
 * CategoryIcon — flat vector icon for clothing categories.
 * Renders inline; wrap in a styled <View> container at the call site.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors } from '@/constants/theme';

interface Props {
  category: string;
  size?: number;
  color?: string;
}

export function CategoryIcon({ category, size = 32, color = Colors.walnut2 }: Props) {
  switch (category) {
    case '上装':
      return <Ionicons name="shirt-outline" size={size} color={color} />;
    case '下装':
      // MaterialCommunityIcons "hanger" — generic garment on hanger
      return <MaterialCommunityIcons name="hanger" size={size} color={color} />;
    case '连体装':
      return <Ionicons name="female-outline" size={size} color={color} />;
    case '外套':
      return <Ionicons name="layers-outline" size={size} color={color} />;
    case '鞋':
      return <MaterialCommunityIcons name="shoe-formal" size={size} color={color} />;
    case '包':
      return <Ionicons name="bag-outline" size={size} color={color} />;
    case '帽子':
      return <MaterialCommunityIcons name="hat-fedora" size={size} color={color} />;
    case '围巾':
      return <MaterialCommunityIcons name="scarf" size={size} color={color} />;
    default:
      return <MaterialCommunityIcons name="hanger" size={size} color={color} />;
  }
}
