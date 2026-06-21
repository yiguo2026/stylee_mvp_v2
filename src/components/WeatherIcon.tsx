/**
 * WeatherIcon — flat vector icon mapped from Chinese weather condition string.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors } from '@/constants/theme';

interface Props {
  condition: string;
  size?: number;
  color?: string;
}

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const CONDITION_MAP: Record<string, IoniconsName> = {
  '晴':   'sunny-outline',
  '多云': 'partly-sunny-outline',
  '阴':   'cloudy-outline',
  '小雨': 'rainy-outline',
  '大雨': 'rainy-outline',
  '雪':   'snow-outline',
};

export function WeatherIcon({ condition, size = 32, color = Colors.ink }: Props) {
  const name: IoniconsName = CONDITION_MAP[condition] ?? 'partly-sunny-outline';
  return <Ionicons name={name} size={size} color={color} />;
}
