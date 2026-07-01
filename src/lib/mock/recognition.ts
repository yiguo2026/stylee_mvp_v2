import { RecognitionResult, ClothingCategory } from '@/types';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const MOCK_RESULTS: RecognitionResult[] = [
  { category: '上装', color: '白色', material: '棉质', style: '休闲', brand: '' },
  { category: '上装', color: '黑色', material: '真丝', style: '优雅', brand: '' },
  { category: '下装', color: '深蓝', material: '牛仔', style: '休闲', brand: '' },
  { category: '下装', color: '黑色', material: '西装料', style: '正式', brand: '' },
  { category: '外套', color: '卡其', material: '棉麻', style: '休闲', brand: '' },
  { category: '鞋履', color: '白色', material: '皮革', style: '休闲', brand: '' },
  { category: '鞋履', color: '黑色', material: '皮革', style: '正式', brand: '' },
  { category: '包袋', color: '棕色', material: '皮革', style: '复古', brand: '' },
];

export const mockRecognizeClothing = async (imageUri: string): Promise<RecognitionResult> => {
  await delay(1500); // Simulate AI processing time
  const result = MOCK_RESULTS[Math.floor(Math.random() * MOCK_RESULTS.length)];
  return { ...result };
};

export const CATEGORY_OPTIONS: ClothingCategory[] = ['上装', '下装', '连体装', '外套', '鞋履', '包袋', '帽巾', '配饰'];

export const COLOR_OPTIONS = [
  '白色', '黑色', '灰色', '米白', '米色',
  '红色', '粉色', '橙色', '黄色',
  '蓝色', '深蓝', '浅蓝', '绿色', '深绿',
  '紫色', '棕色', '卡其', '藏青',
  '格纹', '条纹', '印花', '多色',
];

export const MATERIAL_OPTIONS = [
  '棉质', '真丝', '雪纺', '亚麻', '棉麻',
  '牛仔', '西装料', '针织', '羊毛', '羊绒',
  '皮革', '人造皮', '涤纶', '尼龙', '羽绒',
];

export const STYLE_OPTIONS = [
  '休闲', '优雅', '正式', '运动', '街头',
  '法式', '复古', '极简', '波西米亚', '学院',
];
