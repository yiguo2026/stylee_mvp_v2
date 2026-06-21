import { WeatherData, WeatherCondition } from '@/types';
import { getMockWeather, searchCities, getTempTag, getConditionIcon, AVAILABLE_CITIES } from '@/lib/mock/weather';

const QWEATHER_KEY = process.env.EXPO_PUBLIC_QWEATHER_KEY ?? '';
const QWEATHER_HOST = process.env.EXPO_PUBLIC_QWEATHER_HOST ?? 'devapi.qweather.com';
const WEATHER_API = `https://${QWEATHER_HOST}/v7/weather/now`;
const GEO_API = `https://${QWEATHER_HOST}/geo/v2/city/lookup`;
const CACHE_TTL = 15 * 60 * 1000;

const weatherCache = new Map<string, { data: WeatherData; ts: number }>();
const cityIdCache = new Map<string, string>();

// Pre-populate city ID cache for our known cities
const CITY_ID_MAP: Record<string, string> = {
  '北京': '101010100', '上海': '101020100', '广州': '101280101',
  '成都': '101270101', '杭州': '101210101', '深圳': '101280601',
  '武汉': '101200101', '西安': '101110101', '哈尔滨': '101050101',
  '三亚': '101310201', '南京': '101190101', '重庆': '101040100',
  '天津': '101030100', '苏州': '101190401', '长沙': '101250101',
  '大连': '101070201', '青岛': '101120201', '厦门': '101230201',
  '昆明': '101290101', '郑州': '101180101',
  '沈阳': '101070101', '长春': '101060101', '呼和浩特': '101080101',
  '石家庄': '101090101', '太原': '101100101', '济南': '101120101',
  '合肥': '101220101', '南昌': '101240101', '福州': '101230101',
  '南宁': '101300101', '贵阳': '101260101', '拉萨': '101140101',
  '兰州': '101160101', '西宁': '101150101', '银川': '101170101',
  '乌鲁木齐': '101130101', '珠海': '101280701', '东莞': '101281601',
  '佛山': '101280800', '宁波': '101210401', '无锡': '101190201',
  '温州': '101210701', '常州': '101191101', '徐州': '101190801',
  '烟台': '101120501', '威海': '101121301', '泉州': '101230501',
  '漳州': '101230601', '赣州': '101240701', '桂林': '101300501',
  '海口': '101310101', '遵义': '101260201', '洛阳': '101180901',
  '包头': '101080201', '鞍山': '101070301', '抚顺': '101070401',
  '锦州': '101070701', '营口': '101070801', '丹东': '101070601',
  '朝阳': '101071201', '铁岭': '101071101', '盘锦': '101071301',
  '葫芦岛': '101071401', '辽阳': '101071001', '本溪': '101070501',
  '阜新': '101070901',
};
Object.entries(CITY_ID_MAP).forEach(([city, id]) => cityIdCache.set(city, id));

const ICON_TO_CONDITION: Record<string, WeatherCondition> = {
  '100': '晴', '150': '晴',
  '101': '多云', '102': '多云', '103': '多云',
  '151': '多云', '152': '多云', '153': '多云',
  '104': '阴',
  '300': '小雨', '305': '小雨', '309': '小雨',
  '313': '小雨', '314': '小雨', '350': '小雨', '399': '小雨',
  '301': '大雨', '302': '大雨', '303': '大雨', '304': '大雨',
  '306': '大雨', '307': '大雨', '308': '大雨',
  '310': '大雨', '311': '大雨', '312': '大雨',
  '315': '大雨', '316': '大雨', '317': '大雨', '318': '大雨',
  '351': '大雨',
  '400': '雪', '401': '雪', '402': '雪', '403': '雪',
  '404': '雪', '405': '雪', '406': '雪', '407': '雪',
  '408': '雪', '409': '雪', '410': '雪', '456': '雪',
  '457': '雪', '499': '雪',
  '500': '阴', '501': '阴', '502': '阴', '503': '阴',
  '504': '阴', '507': '阴', '508': '阴', '509': '阴',
  '510': '阴', '511': '阴', '512': '阴', '513': '阴',
  '514': '阴', '515': '阴',
  '900': '晴', '901': '晴', '999': '晴',
};

function iconToCondition(code: string): WeatherCondition {
  return ICON_TO_CONDITION[code] ?? '多云';
}

async function getCityId(cityName: string): Promise<string | null> {
  if (cityIdCache.has(cityName)) return cityIdCache.get(cityName)!;

  // Local map lookup first (no network needed)
  if (CITY_ID_MAP[cityName]) {
    cityIdCache.set(cityName, CITY_ID_MAP[cityName]);
    return CITY_ID_MAP[cityName];
  }

  if (!QWEATHER_KEY) return null;

  // Try GeoAPI (may be blocked by security restrictions on some plans)
  try {
    const url = `${GEO_API}?location=${encodeURIComponent(cityName)}&key=${QWEATHER_KEY}&lang=zh`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.code === '200' && json.location?.length > 0) {
      const id = json.location[0].id as string;
      cityIdCache.set(cityName, id);
      return id;
    }
  } catch {}

  return null;
}

export async function fetchWeather(cityName: string): Promise<WeatherData> {
  const cached = weatherCache.get(cityName);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  if (!QWEATHER_KEY) return getMockWeather(cityName);

  const locationId = await getCityId(cityName);
  if (!locationId) return getMockWeather(cityName);

  try {
    const url = `${WEATHER_API}?location=${locationId}&key=${QWEATHER_KEY}&lang=zh`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.code !== '200') return getMockWeather(cityName);

    const now = json.now;
    const condition = iconToCondition(now.icon);
    const data: WeatherData = {
      city: cityName,
      temp: parseInt(now.temp, 10) || 20,
      condition,
      icon: getConditionIcon(condition),
      humidity: now.humidity ? parseInt(now.humidity, 10) : undefined,
      wind: now.windDir && now.windScale ? `${now.windDir}${now.windScale}级` : undefined,
    };
    weatherCache.set(cityName, { data, ts: Date.now() });
    return data;
  } catch {
    return getMockWeather(cityName);
  }
}

export interface CityResult {
  name: string;
  id: string;
  adm1?: string; // province
}

export async function searchCitiesOnline(query: string): Promise<CityResult[]> {
  const localResults = () => searchCities(query).map(c => ({ name: c, id: CITY_ID_MAP[c] ?? '' }));

  if (!query.trim()) return AVAILABLE_CITIES.map(c => ({ name: c, id: CITY_ID_MAP[c] ?? '' }));
  if (!QWEATHER_KEY) return localResults();

  // Try GeoAPI (may be blocked by security restrictions on some plans)
  try {
    const url = `${GEO_API}?location=${encodeURIComponent(query.trim())}&key=${QWEATHER_KEY}&lang=zh&number=20`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.code === '200' && Array.isArray(json.location)) {
      // Cache IDs from API results
      json.location.forEach((loc: any) => { cityIdCache.set(loc.name as string, loc.id as string); });
      return json.location.map((loc: any) => ({
        name: loc.name as string,
        id: loc.id as string,
        adm1: loc.adm1 as string,
      }));
    }
  } catch {}

  // Fallback to local list
  return localResults();
}

export { getMockWeather, searchCities, getTempTag, getConditionIcon, AVAILABLE_CITIES };
