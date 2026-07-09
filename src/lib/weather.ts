import { WeatherData, WeatherCondition } from '@/types';
import { getMockWeather, searchCities, getTempTag, getConditionIcon, AVAILABLE_CITIES } from '@/lib/mock/weather';
import { searchChinaCities } from '@/lib/chinaCities';
import { QWEATHER_KEY, QWEATHER_HOST } from './secrets';
const WEATHER_API = `https://${QWEATHER_HOST}/v7/weather/now`;
const GEO_API = `https://${QWEATHER_HOST}/geo/v2/city/lookup`;
const CACHE_TTL = 15 * 60 * 1000;

const weatherCache = new Map<string, { data: WeatherData; ts: number }>();
const cityIdCache = new Map<string, string>();

// Build city ID map from chinaCities data
import { CHINA_CITIES } from './chinaCities';
const CITY_ID_MAP: Record<string, string> = {};
CHINA_CITIES.forEach(c => { CITY_ID_MAP[c.name] = c.wid; });
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
  // Use local full China city list first (covers all prefecture-level cities)
  const localCities = searchChinaCities(query);
  if (!query.trim()) {
    return localCities.map(c => ({ name: c.name, id: CITY_ID_MAP[c.name] ?? '', adm1: c.adm1 }));
  }
  if (localCities.length > 0) {
    return localCities.map(c => ({ name: c.name, id: CITY_ID_MAP[c.name] ?? '', adm1: c.adm1 }));
  }

  // Try GeoAPI as supplement for cities not in local list
  if (QWEATHER_KEY) {
    try {
      const url = `${GEO_API}?location=${encodeURIComponent(query.trim())}&key=${QWEATHER_KEY}&lang=zh&number=20`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.code === '200' && Array.isArray(json.location) && json.location.length > 0) {
        json.location.forEach((loc: any) => { cityIdCache.set(loc.name as string, loc.id as string); });
        return json.location.map((loc: any) => ({
          name: loc.name as string,
          id: loc.id as string,
          adm1: loc.adm1 as string,
        }));
      }
    } catch {}
  }

  return [];
}

export { getMockWeather, searchCities, getTempTag, getConditionIcon, AVAILABLE_CITIES };
