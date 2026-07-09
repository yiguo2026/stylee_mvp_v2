import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, SafeAreaView, Image, Platform, useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Colors, Spacing, Radius, T, Fonts } from '@/constants/theme';
import { CategoryIcon } from '@/components/CategoryIcon';
import { AIResultBanner } from '@/components/AIResultBanner';
import { Toast } from '@/components/Toast';
import { useTryOnStore } from '@/stores/tryonStore';
import { trimWhitespace } from '@/lib/trimImage';
import * as MediaLibrary from 'expo-media-library';
// expo-file-system v19 将 downloadAsync / cacheDirectory 移到了 legacy 入口
import * as FileSystem from 'expo-file-system/legacy';

const isWeb = Platform.OS === 'web';

export default function TryOnResultScreen() {
  const { width: winW, height: winH } = useWindowDimensions();
  const { lastResult } = useTryOnStore();

  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  }, []);

  const handleSave = useCallback(async () => {
    const image = lastResult?.image;
    if (typeof image !== 'string') {
      // 本地示例图（mock 降级）无法写入相册
      showToast('示例图片暂无法保存');
      return;
    }

    try {
      if (isWeb) {
        // Web：触发浏览器下载
        const a = document.createElement('a');
        a.href = image;
        a.download = `stylee-tryon-${Date.now()}.png`;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast('已开始下载图片');
        return;
      }

      // 原生：请求相册权限 → 远程图先下载到本地 → 写入相册
      const { granted } = await MediaLibrary.requestPermissionsAsync();
      if (!granted) {
        showToast('无相册权限，无法保存');
        return;
      }
      let localUri = image;
      if (image.startsWith('http')) {
        const dl = await FileSystem.downloadAsync(
          image,
          `${FileSystem.cacheDirectory}stylee-tryon-${Date.now()}.png`,
        );
        localUri = dl.uri;
      }
      await MediaLibrary.saveToLibraryAsync(localUri);
      showToast('已保存到相册');
    } catch (e) {
      console.warn('[TryOnResult] save failed:', e);
      showToast('保存失败，请稍后重试');
    }
  }, [lastResult, showToast]);

  if (!lastResult) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.headerBack}>← 返回</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>试穿效果</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.center}>
          <Text style={styles.emptyText}>还没有试穿结果，快去生成一张吧</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backLink}>← 返回</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const { image, sceneLabel, outfitName, items, meta } = lastResult;
  const imageSource = typeof image === 'string' ? { uri: image } : image;
  // 结果图按真实宽高比自适应；并在 Web 端自动裁掉图片自带的四周白边，只留内容区域。
  const [imageRatio, setImageRatio] = useState(3 / 4);
  const [trimmedUri, setTrimmedUri] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setTrimmedUri(null);
    if (typeof image === 'string' && image) {
      // 先按原图比例兜底
      Image.getSize(
        image,
        (w, h) => { if (!cancelled && w > 0 && h > 0) setImageRatio(w / h); },
        () => { /* 忽略失败，保留默认 */ },
      );
      // Web 端尝试裁掉图片自带的白边，并用裁剪后的内容比例重设展示
      trimWhitespace(image).then(res => {
        if (!cancelled && res) {
          setTrimmedUri(res.uri);
          setImageRatio(res.ratio);
        }
      });
      return () => { cancelled = true; };
    }
    if (image && typeof image !== 'string') {
      const src: any = Image.resolveAssetSource ? Image.resolveAssetSource(image as any) : null;
      if (src?.width && src?.height) setImageRatio(src.width / src.height);
    }
    return () => { cancelled = true; };
  }, [image]);
  const displaySource = trimmedUri ? { uri: trimmedUri } : imageSource;
  // 给一个最大高度上限（防止极窄比例导致图片顶天立地）。
  const maxImageHeight = Math.min(winH * 0.72, winW * 1.4);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.headerBack}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>试穿效果</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {meta ? <AIResultBanner {...meta} /> : null}

        {/* 试穿大图（Web 端已自动裁掉图片自带的白边，卡片按内容比例填满） */}
        {displaySource ? (
          <View style={[styles.imageCard, { aspectRatio: imageRatio, maxHeight: maxImageHeight }]}>
            <Image
              source={displaySource}
              style={styles.resultImage}
              resizeMode="cover"
            />
          </View>
        ) : null}

        {/* 场景 + 搭配信息 */}
        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>场景</Text>
            <Text style={styles.infoValue} numberOfLines={1}>{sceneLabel}</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>搭配</Text>
            <Text style={styles.infoValue} numberOfLines={1}>{outfitName}</Text>
          </View>
        </View>

        {/* 搭配单品 */}
        {items.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>搭配单品</Text>
            <View style={styles.itemsList}>
              {items.map((item, idx) => (
                <View key={`${idx}-${item.name}-${item.category}`} style={styles.itemRow}>
                  <View style={styles.itemIcon}>
                    {item.image_url
                      ? <Image source={{ uri: item.image_url }} style={styles.itemImage} resizeMode="cover" />
                      : <CategoryIcon category={item.category ?? ''} size={24} color={Colors.walnut2} />
                    }
                  </View>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemMeta}>{item.color ?? ''}{item.category ? ` · ${item.category}` : ''}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* 保存按钮 */}
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.8}>
          <Text style={styles.saveBtnText}>保存图片</Text>
        </TouchableOpacity>
      </ScrollView>

      <Toast message={toast} visible={!!toast} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  emptyText: { ...T.bodyText, color: Colors.walnut2, textAlign: 'center', paddingHorizontal: Spacing.four },
  backLink: { ...T.buttonSecondary, color: Colors.terracotta },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.four, paddingVertical: Spacing.three,
    borderBottomWidth: 1, borderBottomColor: Colors.line,
  },
  headerBack: { ...T.bodyText, color: Colors.ink, width: 60 },
  headerTitle: { ...T.sectionTitle },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },

  imageCard: {
    borderRadius: Radius.lg, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.line,
    backgroundColor: Colors.paper,
  },
  resultImage: { width: '100%', height: '100%', backgroundColor: Colors.paper },

  infoRow: {
    flexDirection: 'row', backgroundColor: Colors.paperCard,
    borderRadius: Radius.lg, padding: Spacing.three,
    borderWidth: 1, borderColor: Colors.line,
  },
  infoItem: { flex: 1, alignItems: 'center', gap: 2 },
  infoDivider: { width: 1, backgroundColor: Colors.line },
  infoLabel: { ...T.micro, color: Colors.walnut2 },
  infoValue: { ...T.tag, color: Colors.ink, fontFamily: Fonts.uiSemiBold, fontSize: 12, textAlign: 'center' },

  section: { gap: Spacing.two },
  sectionTitle: { ...T.bodyText, fontFamily: Fonts.uiSemiBold, fontSize: 15, color: Colors.ink },

  itemsList: { gap: Spacing.two },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.two,
    backgroundColor: Colors.paperCard, borderRadius: Radius.md,
    padding: Spacing.two + 2,
  },
  itemIcon: {
    width: 44, height: 44, borderRadius: Radius.md,
    backgroundColor: Colors.paperCard, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  itemImage: { width: 44, height: 44, borderRadius: Radius.md },
  itemInfo: { flex: 1, gap: 2 },
  itemName: { ...T.itemName },
  itemMeta: { ...T.micro },

  saveBtn: {
    backgroundColor: Colors.ink, borderRadius: Radius.md,
    paddingVertical: Spacing.two + 6, alignItems: 'center', marginTop: Spacing.one,
  },
  saveBtnText: { ...T.buttonPrimary, color: Colors.paper, fontSize: 16 },
});
