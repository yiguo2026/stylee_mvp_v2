import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { Colors, Spacing, Radius, T } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { CategoryIcon } from '@/components/CategoryIcon';

interface ItemOutfit {
  outfit_id: string;
  name: string | null;
  created_at: string;
  is_favorited?: boolean;
  cover_image?: string | null;
  cover_category?: string;
}

export function ItemOutfits({ itemId }: { itemId: string }) {
  const [outfits, setOutfits] = useState<ItemOutfit[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOutfits = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('outfit_items')
      .select('outfit_id, outfits(outfit_id, name, created_at, outfit_items(display_order, wardrobe_items(category, image_url)))')
      .eq('item_id', itemId);

    if (error) {
      console.warn('[ItemOutfits] fetch error:', error.message);
      setLoading(false);
      return;
    }

    const map = new Map<string, ItemOutfit>();
    (data ?? []).forEach((r: any) => {
      const o = r.outfits;
      if (!o || map.has(o.outfit_id)) return;
      const sorted = (Array.isArray(o.outfit_items) ? o.outfit_items : [])
        .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0));
      const cover = sorted.find((s: any) => s.wardrobe_items?.image_url);
      map.set(o.outfit_id, {
        outfit_id: o.outfit_id,
        name: o.name,
        created_at: o.created_at,
        cover_image: cover?.wardrobe_items?.image_url ?? null,
        cover_category: sorted[0]?.wardrobe_items?.category ?? '',
      });
    });

    const ids = Array.from(map.keys());
    if (ids.length > 0) {
      const { data: favs } = await supabase
        .from('outfit_favorites')
        .select('outfit_id')
        .in('outfit_id', ids);
      (favs ?? []).forEach((f: any) => {
        const o = map.get(f.outfit_id);
        if (o) o.is_favorited = true;
      });
    }

    const list = Array.from(map.values())
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setOutfits(list);
    setLoading(false);
  }, [itemId]);

  useEffect(() => { fetchOutfits(); }, [fetchOutfits]);

  const openOutfit = (outfitId: string) => {
    router.push({ pathname: '/outfit/[id]', params: { id: outfitId } });
  };

  if (loading) {
    return <ActivityIndicator size="small" color={Colors.walnut2} style={{ marginTop: Spacing.two }} />;
  }
  if (outfits.length === 0) {
    return <Text style={styles.empty}>暂无搭配记录</Text>;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.thumbRow}
    >
      {outfits.map(o => (
        <TouchableOpacity
          key={o.outfit_id}
          style={styles.thumbCard}
          activeOpacity={0.8}
          onPress={() => openOutfit(o.outfit_id)}
        >
          <View style={styles.thumbImgWrap}>
            {o.cover_image ? (
              <Image source={{ uri: o.cover_image }} style={styles.thumbImg} resizeMode="cover" />
            ) : (
              <View style={styles.thumbPlaceholder}>
                <CategoryIcon category={o.cover_category ?? ''} size={26} color={Colors.walnut2} />
              </View>
            )}
            {o.is_favorited ? (
              <View style={styles.favBadge}>
                <Feather name="heart" size={9} color={Colors.paper} />
              </View>
            ) : null}
          </View>
          <Text style={styles.thumbName} numberOfLines={1}>{o.name ?? '搭配'}</Text>
          <Text style={styles.thumbDate}>
            {new Date(o.created_at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  empty: { ...T.micro, color: Colors.walnut2, marginTop: Spacing.one },
  thumbRow: { gap: Spacing.two, paddingTop: Spacing.two, paddingRight: Spacing.four },
  thumbCard: { width: 92 },
  thumbImgWrap: {
    width: 92, height: 92, borderRadius: Radius.md, overflow: 'hidden',
    backgroundColor: Colors.paperCard, borderWidth: 1, borderColor: Colors.line,
    position: 'relative',
  },
  thumbImg: { width: '100%', height: '100%' },
  thumbPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.paperCard },
  favBadge: {
    position: 'absolute', top: 5, right: 5,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: Colors.terracotta, alignItems: 'center', justifyContent: 'center',
  },
  thumbName: { ...T.micro, color: Colors.ink, marginTop: 4 },
  thumbDate: { ...T.micro, color: Colors.walnut2 },
});
