import { Gender } from '@/types';  // Gender = 'male' | 'female' | 'other' | 'private'
import { PresetWardrobeItem } from '@/types';

export function isItemVisibleForGender(
  item: Pick<PresetWardrobeItem, 'for_gender'>,
  gender?: Gender | null,
): boolean {
  if (!item.for_gender || item.for_gender.length === 0) return true;  // 中性
  if (!gender || gender === 'other' || gender === 'private') return true;  // 全展示
  if (gender === 'male' || gender === 'female') return item.for_gender.includes(gender);
  return true;
}
