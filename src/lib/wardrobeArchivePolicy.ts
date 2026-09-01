import type { WardrobeItem } from '@/types';

export function buildWardrobeArchiveUpdate(
  updatedAt: string,
): Pick<WardrobeItem, 'status' | 'updated_at'> {
  return { status: 'archived', updated_at: updatedAt };
}
