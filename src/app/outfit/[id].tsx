import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { Colors, Spacing, Radius, T } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { CategoryIcon } from '@/components/CategoryIcon';

interface OutfitItemDetail {
  item_id: string;
  name: string;
  category: string;
  color: string;
  role: string | null;
  image_url?: string | null;
}

interface OutfitDetail {
  outfit_id: string;
  name: string | null;
  ai_comment: string | null;
  source: string;
  created_at: string;
  is_favorited?: boolean;
  items: OutfitItemDetail[];
}

function mapItems(rawItems: any[]): OutfitItemDetail[] {
  return (Array.isArray(rawItems) ? rawItems : [])
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
    .map((r: any) => ({
      item_id: r.item_id,
      role: r.role ?? null,
      name: r.wardrobe_items?.name ?? '未知单品',
      category: r.wardrobe_items?.category ?? '',
      color: r.wardrobe_items?.color ?? '',
      image_url: r.wardrobe_items?.image_url ?? null,
    }));
}

export default function OutfitDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [outfit, setOutfit] = useState<OutfitDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOutfit = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('outfits')
      .select('outfit_id, name, ai_comment, source, created_at, outfit_items(item_id, role, display_order, wardrobe_items(name, category, color, image_url))')
      .eq('outfit_id', id)
      .maybeSingle();

    if (error || !data) {
      if (error) console.warn('[OutfitDetail] fetch error:', error.message);
      setOutfit(null);
      setLoading(false);
      return;
    }

    const { data: fav } = await supabase
      .from('outfit_favorites')
      .select('favorite_id')
      .eq('outfit_id', id)
      .maybeSingle();

    setOutfit({
      outfit_id: data.outfit_id,
      name: data.name,
      ai_comment: data.ai_comment,
      source: data.source,
      created_at: data.created_at,
      is_favorited: !!fav,
      items: mapItems(data.outfit_items ?? []),
    });
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchOutfit(); }, [fetchOutfit]);

  const openItem = (itemId: string) => {
    router.push({ pathname: '/wardrobe/[id]', params: { id: itemId } });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{outfit?.name ?? '搭配详情'}</Text>
        <View style={styles.headerRight}>
          {outfit?.is_favorited ? <Feather name="heart" size={18} color={Colors.terracotta} /> : null}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={Colors.terracotta} /></View>
      ) : !outfit ? (
        <View style={styles.center}><Text style={styles.notFound}>未找到该搭配</Text></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {outfit.items.length ? (
            <View style={styles.flatlay}>
              {outfit.items.map(item => (
                <TouchableOpacity
                  key={item.item_id}
                  style={styles.flatlayItem}
                  activeOpacity={0.8}
                  onPress={() => openItem(item.item_id)}
                >
                  {item.image_url ? (
                    <Image source={{ uri: item.image_url }} style={styles.flatlayImg} resizeMode="cover" />
                  ) : (
                    <View style={styles.flatlayPlaceholder}>
                      <CategoryIcon category={item.category} size={40} color={Colors.walnut2} />
                    </View>
                  )}
                  <Text style={styles.flatlayName} numberOfLines={1}>{item.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          <Text style={styles.date}>
            保存于 {new Date(outfit.created_at).toLocaleDateString('zh-CN', {
              year: 'numeric', month: 'long', day: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </Text>

          {outfit.ai_comment ? (
            <View style={styles.commentCard}>
              <Text style={styles.commentLabel}>AI 搭配点评</Text>
              <Text style={styles.commentText}>{outfit.ai_comment}</Text>
            </View>
          ) : null}

          <Text style={styles.itemsTitle}>搭配单品</Text>
          {outfit.items.length ? (
            outfit.items.map(item => (
              <TouchableOpacity
                key={item.item_id}
                style={styles.itemRow}
                activeOpacity={0.7}
                onPress={() => openItem(item.item_id)}
              >
                <View style={styles.itemIconWrap}>
                  {item.image_url ? (
                    <Image source={{ uri: item.image_url }} style={styles.itemThumb} resizeMode="cover" />
                  ) : (
                    <CategoryIcon category={item.category} size={20} color={Colors.walnut2} />
                  )}
                </View>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemMeta}>{item.color} · {item.category}</Text>
                </View>
                {item.role ? <Text style={styles.itemRole}>{item.role}</Text> : null}
                <Feather name="chevron-right" size={16} color={Colors.walnut2} />
              </TouchableOpacity>
            ))
          ) : (
            <Text style={styles.noItems}>单品信息暂无</Text>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFound: { ...T.emptyTitle, fontSize: 14 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.four, paddingVertical: Spacing.three,
    borderBottomWidth: 1, borderBottomColor: Colors.line,
  },
  back: { ...T.buttonSecondary, color: Colors.walnut },
  headerTitle: { ...T.sectionTitle, fontSize: 18, flex: 1, textAlign: 'center', marginHorizontal: Spacing.two },
  headerRight: { width: 48, alignItems: 'flex-end' },

  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },

  flatlay: { gap: Spacing.three, alignItems: 'center' },
  flatlayItem: { width: '100%', alignItems: 'center', gap: Spacing.one },
  flatlayImg: {
    width: '78%', aspectRatio: 4 / 3, borderRadius: Radius.lg,
    backgroundColor: Colors.paperCard, borderWidth: 1, borderColor: Colors.line,
  },
  flatlayPlaceholder: {
    width: '78%', aspectRatio: 4 / 3, borderRadius: Radius.lg,
    backgroundColor: Colors.paperCard, borderWidth: 1, borderColor: Colors.line,
    alignItems: 'center', justifyContent: 'center',
  },
  flatlayName: { ...T.itemDesc, fontSize: 13, color: Colors.walnut2, textAlign: 'center' },

  date: { ...T.caption, fontSize: 13, letterSpacing: 0.78 },
  commentCard: {
    backgroundColor: Colors.signalSoft, borderRadius: Radius.lg,
    padding: Spacing.three, gap: Spacing.one, borderWidth: 1, borderColor: Colors.line,
  },
  commentLabel: { ...T.formLabel },
  commentText: { ...T.bodyText, fontSize: 14 },

  itemsTitle: { ...T.subTitle },
  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.paperCard, borderRadius: Radius.md,
    padding: Spacing.two + 2, gap: Spacing.two,
    borderWidth: 1, borderColor: Colors.line,
  },
  itemIconWrap: {
    width: 40, height: 40, borderRadius: Radius.md, overflow: 'hidden',
    backgroundColor: Colors.paper, alignItems: 'center', justifyContent: 'center',
  },
  itemThumb: { width: '100%', height: '100%' },
  itemInfo: { flex: 1 },
  itemName: { ...T.itemName },
  itemMeta: { ...T.micro },
  itemRole: { ...T.micro, backgroundColor: Colors.paper, paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.sm },
  noItems: { ...T.emptyTitle, fontSize: 14, textAlign: 'center', marginTop: 8 },
});
