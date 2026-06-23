import { Text } from 'react-native';

const CATEGORY_EMOJI: Record<string, string> = {
  '上装': '👔',
  '下装': '👖',
  '连体装': '👗',
  '外套': '🧥',
  '鞋': '👟',
  '包': '🎒',
  '帽子': '🧢',
  '围巾': '🧣',
};

interface Props {
  category: string;
  size?: number;
  color?: string;
}

export function CategoryIcon({ category, size = 32 }: Props) {
  const emoji = CATEGORY_EMOJI[category] ?? '🏷️';
  return <Text style={{ fontSize: size * 0.7 }}>{emoji}</Text>;
}

export function getCategoryEmoji(category: string): string {
  return CATEGORY_EMOJI[category] ?? '🏷️';
}
