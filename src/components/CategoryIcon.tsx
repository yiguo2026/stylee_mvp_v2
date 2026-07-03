import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Feather from '@expo/vector-icons/Feather';
import { Colors } from '@/constants/theme';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const CATEGORY_ICON_MAP: Record<string, IconName> = {
  '上装': 'tshirt-crew-outline',
  '下装': 'hanger',
  '连体装': 'human-female',
  '外套': 'coat-rack',
  '鞋履': 'shoe-formal',
  '包袋': 'bag-personal-outline',
  '帽巾': 'hat-fedora',
  '配饰': 'diamond-stone',
};

interface Props {
  category: string;
  size?: number;
  color?: string;
}

export function CategoryIcon({ category, size = 32, color = Colors.walnut2 }: Props) {
  const name = CATEGORY_ICON_MAP[category];
  if (!name) {
    return <Feather name="tag" size={size * 0.72} color={color} />;
  }
  return <MaterialCommunityIcons name={name} size={size * 0.72} color={color} />;
}

export function getCategoryEmoji(category: string): string {
  return category;
}
