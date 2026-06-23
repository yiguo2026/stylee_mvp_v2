import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, SafeAreaView, ActivityIndicator, Alert, Image,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors, Spacing, Radius, Shadow, T } from '@/constants/theme';
import { CategoryIcon } from '@/components/CategoryIcon';
import { aiGenerateTryOnSuggestion, TryOnSuggestion } from '@/lib/ai';
import { supabase } from '@/lib/supabase';

export default function TryOnScreen() {
  const { outfitId, items: itemsParam } = useLocalSearchParams<{ outfitId?: string; items?: string }>();
  const [outfitItems, setOutfitItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [suggestion, setSuggestion] = useState<TryOnSuggestion | null>(null);

  useEffect(() => {
    loadItems();
  }, [outfitId]);

  const loadItems = async () => {
    setLoading(true);
    try {
      if (itemsParam) {
        setOutfitItems(JSON.parse(itemsParam));
      } else if (outfitId) {
        const { data } = await supabase
          .from('outfit_items')
          .select(`item_id, role, wardrobe_items(name, category, color, image_url)`)
          .eq('outfit_id', outfitId);
        if (data) {
          setOutfitItems(data.map((r: any) => ({
            item_id: r.item_id,
            name: r.wardrobe_items?.name ?? '单品',
            category: r.wardrobe_items?.category ?? '',
            color: r.wardrobe_items?.color ?? '',
            image_url: r.wardrobe_items?.image_url,
          })));
        }
      }
    } catch {}
    setLoading(false);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const result = await aiGenerateTryOnSuggestion(outfitItems);
      setSuggestion(result);
    } catch {
      Alert.alert('生成失败', '请稍后重试');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.title}>AI 试穿</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Outfit Items */}
        <Text style={styles.sectionTitle}>搭配单品</Text>
        {loading ? (
          <ActivityIndicator color={Colors.terracotta} style={{ marginTop: Spacing.four }} />
        ) : outfitItems.length === 0 ? (
          <Text style={styles.emptyText}>暂无搭配单品信息</Text>
        ) : (
          <View style={styles.itemsList}>
            {outfitItems.map((item, i) => (
              <View key={item.item_id ?? i} style={styles.itemRow}>
                <View style={styles.itemIcon}>
                  {item.image_url
                    ? <Image source={{ uri: item.image_url }} style={styles.itemImage} resizeMode="cover" />
                    : <CategoryIcon category={item.category} size={24} color={Colors.walnut2} />
                  }
                </View>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemMeta}>{item.color} · {item.category}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Generate Button */}
        <TouchableOpacity
          style={[styles.generateBtn, generating && styles.disabled]}
          onPress={handleGenerate}
          disabled={generating || outfitItems.length === 0}
        >
          {generating
            ? <ActivityIndicator color={Colors.paper} />
            : <Text style={styles.generateBtnText}>✨ 生成试穿建议</Text>
          }
        </TouchableOpacity>

        {/* Result */}
        {suggestion && (
          <View style={styles.resultCard}>
            {/* Score */}
            <View style={styles.scoreRow}>
              <Text style={styles.scoreLabel}>适配度</Text>
              <View style={styles.scoreBar}>
                <View style={[styles.scoreFill, { width: `${suggestion.compatibility_score}%` }]} />
              </View>
              <Text style={styles.scoreNum}>{suggestion.compatibility_score}%</Text>
            </View>

            {/* Suggestion */}
            <Text style={styles.suggestionTitle}>试穿效果</Text>
            <Text style={styles.suggestionText}>{suggestion.suggestion}</Text>

            {/* Tips */}
            <Text style={styles.tipsTitle}>穿搭小贴士</Text>
            {suggestion.tips.map((tip, i) => (
              <View key={i} style={styles.tipRow}>
                <Text style={styles.tipDot}>•</Text>
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))}

            {/* Placeholder for try-on image */}
            <View style={styles.tryOnImagePlaceholder}>
              <Ionicons name="image-outline" size={48} color={Colors.walnut2} />
              <Text style={styles.tryOnImageHint}>AI 试穿效果图</Text>
              <Text style={styles.tryOnImageSub}>接入图片生成模型后即可生成真人试穿图</Text>
            </View>
          </View>
        )}

        {/* Empty state before generation */}
        {!suggestion && !generating && outfitItems.length > 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>👗</Text>
            <Text style={styles.emptyTitle}>点击上方按钮生成试穿建议</Text>
            <Text style={styles.emptySub}>AI 将根据你的搭配和体型给出专业建议</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.paper },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.four, paddingVertical: Spacing.three,
    borderBottomWidth: 1, borderBottomColor: Colors.line,
  },
  back: { ...T.bodyText, color: Colors.ink, width: 60 },
  title: { ...T.sectionTitle },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },

  sectionTitle: { ...T.subTitle },
  itemsList: { gap: Spacing.two },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.two,
    backgroundColor: Colors.paperCard, borderRadius: Radius.md,
    padding: Spacing.two + 2, borderWidth: 1, borderColor: Colors.line,
  },
  itemIcon: {
    width: 48, height: 48, borderRadius: Radius.md,
    backgroundColor: Colors.vintageCream, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  itemImage: { width: 48, height: 48, borderRadius: Radius.md },
  itemInfo: { flex: 1, gap: 2 },
  itemName: { ...T.itemName },
  itemMeta: { ...T.micro },

  generateBtn: {
    backgroundColor: Colors.ink, borderRadius: Radius.md,
    paddingVertical: Spacing.two + 4, alignItems: 'center', marginTop: Spacing.two,
  },
  disabled: { opacity: 0.6 },
  generateBtnText: { ...T.buttonPrimary, color: Colors.paper, fontSize: 16 },

  resultCard: {
    backgroundColor: Colors.paperCard, borderRadius: Radius.lg,
    padding: Spacing.three, gap: Spacing.three,
    borderWidth: 1, borderColor: Colors.line, ...Shadow.one,
  },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  scoreLabel: { ...T.tag, color: Colors.walnut, fontWeight: '600' },
  scoreBar: {
    flex: 1, height: 8, borderRadius: 4, backgroundColor: Colors.line,
    overflow: 'hidden',
  },
  scoreFill: { height: '100%', borderRadius: 4, backgroundColor: Colors.sage },
  scoreNum: { ...T.statNum, fontSize: 16, color: Colors.sage, minWidth: 40 },

  suggestionTitle: { ...T.formLabel, marginTop: Spacing.one },
  suggestionText: { ...T.bodyText, fontSize: 14, lineHeight: 22, color: Colors.ink },

  tipsTitle: { ...T.formLabel, marginTop: Spacing.one },
  tipRow: { flexDirection: 'row', gap: Spacing.one, alignItems: 'flex-start' },
  tipDot: { ...T.bodyText, color: Colors.sage, fontWeight: '700' },
  tipText: { ...T.bodyText, fontSize: 13, color: Colors.walnut, flex: 1, lineHeight: 20 },

  tryOnImagePlaceholder: {
    alignItems: 'center', justifyContent: 'center', gap: Spacing.one,
    paddingVertical: Spacing.five, backgroundColor: Colors.vintageCream,
    borderRadius: Radius.lg, marginTop: Spacing.two,
    borderWidth: 1, borderColor: Colors.linen, borderStyle: 'dashed',
  },
  tryOnImageHint: { ...T.bodyText, fontSize: 13, color: Colors.walnut, fontWeight: '600' },
  tryOnImageSub: { ...T.micro, color: Colors.walnut2 },

  emptyText: { ...T.bodyText, color: Colors.walnut2, textAlign: 'center', marginTop: Spacing.three },
  emptyState: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five, marginTop: Spacing.three },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: { ...T.emptyTitle },
  emptySub: { ...T.itemDesc, textAlign: 'center', lineHeight: 22 },
});
