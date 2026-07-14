import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Colors, Fonts, Radius, Spacing, T } from '@/constants/theme';
import { gammaOutfit, toGammaWardrobe, type GammaAction, type GammaOutfit, type GammaOutfitItem, type GammaOutfitResponse } from '@/lib/gammaService';
import { uploadWardrobeImage } from '@/lib/uploadImage';
import { useUserStore } from '@/stores/userStore';
import { useWardrobeStore } from '@/stores/wardrobeStore';
import { showToast } from '@/components/Toast';
import type { ClothingCategory } from '@/types';

export default function GammaOutfitScreen() {
  const { user, profile } = useUserStore();
  const { items, fetchItems, addItem } = useWardrobeStore();
  const [instruction, setInstruction] = useState('去海岛度假，清爽舒适，适合拍照');
  const [changeInstruction, setChangeInstruction] = useState('');
  const [response, setResponse] = useState<GammaOutfitResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [targetKey, setTargetKey] = useState<string | null>(null);
  const [addingKey, setAddingKey] = useState<string | null>(null);

  useEffect(() => { if (user) void fetchItems(user.id); }, [user, fetchItems]);

  const run = async (action: GammaAction, target?: GammaOutfitItem) => {
    const text = action === 'generate' ? instruction.trim() : (changeInstruction.trim() || instruction.trim());
    if (!text) { showToast('请先填写穿搭要求', 'error'); return; }
    if (!user) { showToast('请先登录', 'error'); return; }
    setLoading(true);
    setTargetKey(target?.key ?? null);
    const next = await gammaOutfit({
      action,
      instruction: text,
      wardrobe: toGammaWardrobe(items),
      profile: profile ? {
        gender: profile.gender, age: profile.age, profession: profile.profession,
        city: profile.permanent_city, body_shape: profile.body_shape,
      } : {},
      previous_outfit: action === 'generate' ? undefined : response?.outfit,
      target_item_key: target?.key,
      generate_images: true,
    });
    setLoading(false);
    setTargetKey(null);
    if (!next) { showToast('Gamma 搭配生成失败，请重试', 'error'); return; }
    setResponse(next);
    setChangeInstruction('');
  };

  const addRecommended = async (item: GammaOutfitItem) => {
    if (!user || item.source !== 'recommended') return;
    if (!item.image_url) { showToast('这件单品没有可保存的图片', 'error'); return; }
    setAddingKey(item.key);
    try {
      const permanentUrl = await uploadWardrobeImage(item.image_url, user.id, 'gamma', { persistRemote: true, timeoutMs: 45000 });
      if (!permanentUrl) { showToast('生成图片转存失败', 'error'); return; }
      const saved = await addItem({
        user_id: user.id, name: item.name, category: item.category as ClothingCategory,
        color: item.color || '未注明', image_url: permanentUrl,
        ai_recognized_attrs: { engine: 'gamma', generated: true, image_prompt: item.image_prompt },
        source_type: 'ai_recommended', source_label: 'Gamma 推荐', status: 'active',
      });
      if (!saved) { showToast('加入衣橱失败', 'error'); return; }
      showToast('已加入衣橱', 'success');
    } finally { setAddingKey(null); }
  };

  const outfit: GammaOutfit | null = response?.outfit ?? null;
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>← 返回</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>Gamma 搭配</Text><View style={styles.headerSide} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>DIRECT OUTFIT</Text>
        <Text style={styles.title}>你想怎么穿？</Text>
        <TextInput
          style={styles.query} value={instruction} onChangeText={setInstruction} multiline
          placeholder="例如：去海岛度假，清爽舒适，适合拍照" placeholderTextColor={Colors.gray2}
        />
        <TouchableOpacity style={styles.primary} onPress={() => run('generate')} disabled={loading}>
          {loading && !outfit ? <ActivityIndicator color={Colors.paper} /> : <Text style={styles.primaryText}>直接生成搭配</Text>}
        </TouchableOpacity>
        <Text style={styles.closetHint}>本次会把衣橱中的 {items.length} 件单品一次性提供给模型，优先复用已有单品。</Text>

        {outfit && <View style={styles.result}>
          <View style={styles.resultHeader}>
            <View style={{ flex: 1 }}><Text style={styles.outfitName}>{outfit.name}</Text><Text style={styles.comment}>{outfit.comment}</Text></View>
            <Text style={styles.duration}>{(response!.trace.duration_ms / 1000).toFixed(1)}s</Text>
          </View>

          <View style={styles.grid}>{outfit.items.map(item =>
            <View key={item.key} style={styles.itemCard}>
              <View style={styles.itemImageBox}>
                {item.image_url ? <Image source={{ uri: item.image_url }} style={styles.itemImage} resizeMode="cover" /> : <Text style={styles.noImage}>无图片</Text>}
                <View style={[styles.sourceBadge, item.source === 'owned' ? styles.ownedBadge : styles.newBadge]}>
                  <Text style={styles.sourceText}>{item.source === 'owned' ? '衣橱' : '新推荐'}</Text>
                </View>
              </View>
              <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.itemMeta} numberOfLines={1}>{[item.color, item.category].filter(Boolean).join(' · ')}</Text>
              <TouchableOpacity style={styles.smallButton} onPress={() => run('replace_item', item)} disabled={loading}>
                {loading && targetKey === item.key ? <ActivityIndicator size="small" color={Colors.ink} /> : <Text style={styles.smallButtonText}>换这件</Text>}
              </TouchableOpacity>
              {item.source === 'recommended' && <TouchableOpacity style={styles.addButton} onPress={() => addRecommended(item)} disabled={addingKey === item.key}>
                {addingKey === item.key ? <ActivityIndicator size="small" color={Colors.paper} /> : <Text style={styles.addButtonText}>加入衣橱</Text>}
              </TouchableOpacity>}
            </View>)}</View>

          <View style={styles.changeBox}>
            <Text style={styles.changeTitle}>继续调整</Text>
            <TextInput style={styles.changeInput} value={changeInstruction} onChangeText={setChangeInstruction} placeholder="例如：更鲜艳一些 / 鞋子换成凉鞋" placeholderTextColor={Colors.gray2} />
            <TouchableOpacity style={styles.replaceAll} onPress={() => run('replace_all')} disabled={loading}>
              {loading && !targetKey ? <ActivityIndicator color={Colors.ink} /> : <Text style={styles.replaceAllText}>按新要求换整套</Text>}
            </TouchableOpacity>
          </View>
          <Text style={styles.trace}>{response!.trace.text_model} · {response!.trace.image_model} · {response!.trace.action}</Text>
        </View>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.paper },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.four, paddingVertical: Spacing.three, borderBottomWidth: 1, borderBottomColor: Colors.line },
  back: { ...T.bodyText, width: 64 }, headerTitle: { ...T.sectionTitle }, headerSide: { width: 64 },
  content: { padding: Spacing.four, paddingBottom: Spacing.six },
  eyebrow: { ...T.caption, color: Colors.signal, fontFamily: Fonts.uiSemiBold, marginTop: Spacing.two },
  title: { ...T.storyTitle, marginTop: Spacing.two, marginBottom: Spacing.three },
  query: { ...T.inputText, minHeight: 108, borderWidth: 1, borderColor: Colors.lineStrong, borderRadius: Radius.lg, padding: Spacing.three, textAlignVertical: 'top', color: Colors.ink, backgroundColor: Colors.paperCard },
  primary: { height: 52, borderRadius: Radius.md, backgroundColor: Colors.ink, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.three },
  primaryText: { ...T.buttonPrimary, color: Colors.paper },
  closetHint: { ...T.caption, marginTop: Spacing.two },
  result: { marginTop: Spacing.five, borderTopWidth: 1, borderTopColor: Colors.line, paddingTop: Spacing.four },
  resultHeader: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: Spacing.four },
  outfitName: { ...T.pageTitle }, comment: { ...T.itemDesc, marginTop: Spacing.two }, duration: { ...T.caption, color: Colors.signal },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  itemCard: { width: '48%', borderWidth: 1, borderColor: Colors.line, borderRadius: Radius.md, padding: 10, backgroundColor: Colors.paperCard },
  itemImageBox: { aspectRatio: 1, borderRadius: Radius.sm, backgroundColor: Colors.paperRaised, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  itemImage: { width: '100%', height: '100%' }, noImage: { ...T.caption },
  sourceBadge: { position: 'absolute', top: 7, left: 7, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 4 },
  ownedBadge: { backgroundColor: Colors.signal }, newBadge: { backgroundColor: Colors.accent },
  sourceText: { color: Colors.paper, fontSize: 10, fontFamily: Fonts.uiSemiBold },
  itemName: { ...T.itemName, marginTop: 10 }, itemMeta: { ...T.caption, marginTop: 3 },
  smallButton: { marginTop: 10, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.lineStrong },
  smallButtonText: { ...T.buttonSecondary, color: Colors.ink },
  addButton: { marginTop: 7, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.sm, backgroundColor: Colors.ink },
  addButtonText: { ...T.buttonSecondary, color: Colors.paper },
  changeBox: { marginTop: Spacing.four, padding: Spacing.three, backgroundColor: Colors.paperRaised, borderRadius: Radius.lg },
  changeTitle: { ...T.subTitle, fontFamily: Fonts.uiSemiBold },
  changeInput: { ...T.inputText, marginTop: Spacing.two, borderRadius: Radius.md, backgroundColor: Colors.paper, paddingHorizontal: 12, paddingVertical: 11, color: Colors.ink },
  replaceAll: { height: 46, marginTop: Spacing.two, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.ink },
  replaceAllText: { ...T.buttonSecondary, fontFamily: Fonts.uiSemiBold }, trace: { ...T.micro, marginTop: Spacing.three },
});
