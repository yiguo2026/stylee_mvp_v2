import { WeatherData, WeatherCondition } from '@/types';

const CITIES: Record<string, WeatherData> = {
  '北京': { city: '北京', temp: 18, condition: '多云', icon: '⛅', humidity: 45, wind: '东北风3级' },
  '上海': { city: '上海', temp: 22, condition: '晴', icon: '☀️', humidity: 60, wind: '东风2级' },
  '广州': { city: '广州', temp: 28, condition: '晴', icon: '☀️', humidity: 75, wind: '南风2级' },
  '成都': { city: '成都', temp: 20, condition: '阴', icon: '☁️', humidity: 70, wind: '无风' },
  '杭州': { city: '杭州', temp: 23, condition: '多云', icon: '⛅', humidity: 65, wind: '东风2级' },
  '深圳': { city: '深圳', temp: 27, condition: '晴', icon: '☀️', humidity: 72, wind: '南风3级' },
  '武汉': { city: '武汉', temp: 21, condition: '小雨', icon: '🌧️', humidity: 80, wind: '北风2级' },
  '西安': { city: '西安', temp: 16, condition: '多云', icon: '⛅', humidity: 50, wind: '西风2级' },
  '哈尔滨': { city: '哈尔滨', temp: 12, condition: '小雨', icon: '🌧️', humidity: 55, wind: '北风3级' },
  '三亚': { city: '三亚', temp: 33, condition: '晴', icon: '☀️', humidity: 80, wind: '南风2级' },
  '南京': { city: '南京', temp: 20, condition: '多云', icon: '⛅', humidity: 60, wind: '东风2级' },
  '重庆': { city: '重庆', temp: 24, condition: '阴', icon: '☁️', humidity: 75, wind: '微风' },
  '天津': { city: '天津', temp: 17, condition: '多云', icon: '⛅', humidity: 50, wind: '北风2级' },
  '苏州': { city: '苏州', temp: 22, condition: '晴', icon: '☀️', humidity: 62, wind: '东风2级' },
  '长沙': { city: '长沙', temp: 25, condition: '多云', icon: '⛅', humidity: 68, wind: '南风2级' },
  '大连': { city: '大连', temp: 15, condition: '多云', icon: '⛅', humidity: 55, wind: '南风3级' },
  '青岛': { city: '青岛', temp: 16, condition: '晴', icon: '☀️', humidity: 60, wind: '南风3级' },
  '厦门': { city: '厦门', temp: 26, condition: '晴', icon: '☀️', humidity: 70, wind: '东南风2级' },
  '昆明': { city: '昆明', temp: 22, condition: '多云', icon: '⛅', humidity: 55, wind: '西南风2级' },
  '郑州': { city: '郑州', temp: 19, condition: '多云', icon: '⛅', humidity: 50, wind: '东风2级' },
  '沈阳': { city: '沈阳', temp: 14, condition: '多云', icon: '⛅', humidity: 50, wind: '北风3级' },
  '阜新': { city: '阜新', temp: 12, condition: '晴', icon: '☀️', humidity: 40, wind: '西北风3级' },
  '长春': { city: '长春', temp: 10, condition: '多云', icon: '⛅', humidity: 48, wind: '北风3级' },
  '呼和浩特': { city: '呼和浩特', temp: 13, condition: '晴', icon: '☀️', humidity: 35, wind: '西北风4级' },
  '石家庄': { city: '石家庄', temp: 18, condition: '多云', icon: '⛅', humidity: 50, wind: '南风2级' },
  '太原': { city: '太原', temp: 15, condition: '晴', icon: '☀️', humidity: 42, wind: '西风2级' },
  '济南': { city: '济南', temp: 20, condition: '晴', icon: '☀️', humidity: 55, wind: '南风2级' },
  '合肥': { city: '合肥', temp: 22, condition: '多云', icon: '⛅', humidity: 65, wind: '东风2级' },
  '南昌': { city: '南昌', temp: 24, condition: '多云', icon: '⛅', humidity: 70, wind: '南风2级' },
  '福州': { city: '福州', temp: 26, condition: '晴', icon: '☀️', humidity: 72, wind: '东南风2级' },
  '南宁': { city: '南宁', temp: 28, condition: '多云', icon: '⛅', humidity: 78, wind: '南风2级' },
  '贵阳': { city: '贵阳', temp: 20, condition: '小雨', icon: '🌧️', humidity: 75, wind: '东风2级' },
  '拉萨': { city: '拉萨', temp: 10, condition: '晴', icon: '☀️', humidity: 30, wind: '西风3级' },
  '兰州': { city: '兰州', temp: 14, condition: '晴', icon: '☀️', humidity: 38, wind: '西北风2级' },
  '西宁': { city: '西宁', temp: 8, condition: '多云', icon: '⛅', humidity: 40, wind: '西北风3级' },
  '银川': { city: '银川', temp: 15, condition: '晴', icon: '☀️', humidity: 32, wind: '西北风3级' },
  '乌鲁木齐': { city: '乌鲁木齐', temp: 18, condition: '晴', icon: '☀️', humidity: 28, wind: '西北风3级' },
  '珠海': { city: '珠海', temp: 29, condition: '晴', icon: '☀️', humidity: 78, wind: '南风2级' },
  '东莞': { city: '东莞', temp: 28, condition: '多云', icon: '⛅', humidity: 75, wind: '南风2级' },
  '佛山': { city: '佛山', temp: 28, condition: '多云', icon: '⛅', humidity: 76, wind: '南风2级' },
  '宁波': { city: '宁波', temp: 23, condition: '多云', icon: '⛅', humidity: 68, wind: '东风2级' },
  '无锡': { city: '无锡', temp: 22, condition: '晴', icon: '☀️', humidity: 62, wind: '东风2级' },
  '温州': { city: '温州', temp: 24, condition: '多云', icon: '⛅', humidity: 70, wind: '东南风2级' },
  '常州': { city: '常州', temp: 21, condition: '多云', icon: '⛅', humidity: 60, wind: '东风2级' },
  '徐州': { city: '徐州', temp: 19, condition: '晴', icon: '☀️', humidity: 55, wind: '东风2级' },
  '烟台': { city: '烟台', temp: 17, condition: '晴', icon: '☀️', humidity: 58, wind: '南风3级' },
  '威海': { city: '威海', temp: 16, condition: '多云', icon: '⛅', humidity: 60, wind: '南风3级' },
  '泉州': { city: '泉州', temp: 25, condition: '晴', icon: '☀️', humidity: 72, wind: '东南风2级' },
  '漳州': { city: '漳州', temp: 26, condition: '多云', icon: '⛅', humidity: 74, wind: '南风2级' },
  '赣州': { city: '赣州', temp: 24, condition: '多云', icon: '⛅', humidity: 70, wind: '南风2级' },
  '桂林': { city: '桂林', temp: 25, condition: '小雨', icon: '🌧️', humidity: 80, wind: '东风2级' },
  '海口': { city: '海口', temp: 31, condition: '多云', icon: '⛅', humidity: 82, wind: '南风3级' },
  '遵义': { city: '遵义', temp: 19, condition: '阴', icon: '☁️', humidity: 72, wind: '东风2级' },
  '洛阳': { city: '洛阳', temp: 20, condition: '晴', icon: '☀️', humidity: 48, wind: '东风2级' },
  '包头': { city: '包头', temp: 14, condition: '晴', icon: '☀️', humidity: 30, wind: '西北风4级' },
  '鞍山': { city: '鞍山', temp: 13, condition: '多云', icon: '⛅', humidity: 52, wind: '北风3级' },
  '抚顺': { city: '抚顺', temp: 11, condition: '多云', icon: '⛅', humidity: 55, wind: '北风3级' },
  '锦州': { city: '锦州', temp: 14, condition: '晴', icon: '☀️', humidity: 45, wind: '西北风3级' },
  '营口': { city: '营口', temp: 13, condition: '多云', icon: '⛅', humidity: 55, wind: '北风3级' },
  '丹东': { city: '丹东', temp: 12, condition: '多云', icon: '⛅', humidity: 60, wind: '北风3级' },
  '朝阳': { city: '朝阳', temp: 13, condition: '晴', icon: '☀️', humidity: 38, wind: '西北风3级' },
  '铁岭': { city: '铁岭', temp: 11, condition: '多云', icon: '⛅', humidity: 50, wind: '北风3级' },
  '盘锦': { city: '盘锦', temp: 13, condition: '晴', icon: '☀️', humidity: 48, wind: '北风3级' },
  '葫芦岛': { city: '葫芦岛', temp: 14, condition: '晴', icon: '☀️', humidity: 45, wind: '西北风3级' },
  '辽阳': { city: '辽阳', temp: 12, condition: '多云', icon: '⛅', humidity: 52, wind: '北风3级' },
  '本溪': { city: '本溪', temp: 11, condition: '多云', icon: '⛅', humidity: 58, wind: '北风3级' },
};

export const AVAILABLE_CITIES = Object.keys(CITIES);

export const getMockWeather = (city: string): WeatherData => {
  return CITIES[city] ?? { city, temp: 20, condition: '多云', icon: '⛅', humidity: 55, wind: '微风' };
};

export const searchCities = (query: string): string[] => {
  if (!query.trim()) return AVAILABLE_CITIES;
  const q = query.trim().toLowerCase();
  return AVAILABLE_CITIES.filter(c => c.includes(q));
};

export const getTempTag = (temp: number): string => {
  if (temp >= 25) return 'temp_hot';
  if (temp >= 15) return 'temp_warm';
  if (temp >= 5) return 'temp_cool';
  return 'temp_cold';
};

export const getConditionIcon = (condition: WeatherCondition): string => {
  const map: Record<WeatherCondition, string> = {
    '晴': '☀️',
    '多云': '⛅',
    '阴': '☁️',
    '小雨': '🌧️',
    '大雨': '🌧️',
    '雪': '❄️',
    '雷阵雨': '⛈️',
    '雾': '🌫️',
  };
  return map[condition] ?? '🌤️';
};
