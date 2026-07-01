import { useState } from 'react';
import {
  View, Text, TouchableOpacity, Image,
  StyleSheet, ScrollView, SafeAreaView, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Spacing, Radius, T } from '@/constants/theme';
import { useUserStore } from '@/stores/userStore';
import { useWardrobeStore } from '@/stores/wardrobeStore';

const isWeb = Platform.OS === 'web';

export default function BatchImportScreen() {
  const { user } = useUserStore();
  const { addItem } = useWardrobeStore();
  const [importing, setImporting] = useState(false);
  const [importedUris, setImportedUris] = useState<string[]>([]);
  const [importCount, setImportCount] = useState(0);
  const [showResult, setShowResult] = useState(false);

  const handleBatchImport = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (result.canceled || !user?.id) return;

    setImporting(true);
    const uris: string[] = [];
    let count = 0;
    try {
      for (const asset of result.assets) {
        await addItem({
          user_id: user.id,
          name: '未命名单品',
          category: '上装',
          color: '未知',
          source_type: 'album_ai',
          source_label: '批量导入',
          status: 'active',
          image_url: asset.uri,
        });
        uris.push(asset.uri);
        count++;
      }
      setImportedUris(uris);
      setImportCount(count);
      setShowResult(true);
    } catch {
      // Show partial results
      if (uris.length > 0) {
        setImportedUris(uris);
        setImportCount(uris.length);
        setShowResult(true);
      }
    } finally {
      setImporting(false);
    }
  };

  const handleFinish = () => {
    router.back();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { if (router.canGoBack()) router.back(); }} hitSlop={12}>
          <Text style={styles.headerBack}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>导入单品</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.inner}>
        <Text style={styles.desc}>从相册选择照片，一键导入衣橱</Text>

        {/* Batch import option */}
        {!showResult && (
          <View style={styles.batchGroup}>
            <TouchableOpacity style={styles.batchOption} onPress={handleBatchImport} disabled={importing}>
              <Text style={styles.batchIcon}>🖼️</Text>
              <View style={styles.batchInfo}>
                <Text style={styles.batchTitle}>
                  {importing ? '导入中...' : '从相册批量导入'}
                </Text>
                <Text style={styles.batchDesc}>选择多张照片，一键导入衣橱</Text>
              </View>
              <Text style={styles.batchArrow}>›</Text>
            </TouchableOpacity>
          </View>
        )}

        {importing && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={Colors.ink} size="large" />
            <Text style={styles.loadingText}>正在导入并识别...</Text>
          </View>
        )}

        {/* Result */}
        {showResult && (
          <View style={styles.resultSection}>
            <View style={styles.successBanner}>
              <View style={styles.successCheck}>
                <Text style={styles.successCheckText}>✓</Text>
              </View>
              <View>
                <Text style={styles.successText}>已成功导入 {importCount} 件单品</Text>
                <Text style={styles.successSub}>点击下方缩略图可预览，进入衣橱后可编辑名称和分类</Text>
              </View>
            </View>

            {importedUris.length > 0 && (
              <View style={styles.previewGrid}>
                {importedUris.map((uri, i) => (
                  <View key={i} style={styles.previewThumb}>
                    <Image source={{ uri }} style={styles.previewImage} />
                  </View>
                ))}
              </View>
            )}

            <TouchableOpacity style={styles.finishBtn} onPress={handleFinish}>
              <Text style={styles.finishText}>完成</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Tip card */}
        {!showResult && (
          <View style={styles.tipCard}>
            <Text style={styles.tipTitle}>💡 小贴士</Text>
            <Text style={styles.tipContent}>
              导入后，AI 会自动识别每件衣物的类别，你可以在衣橱中逐件确认和修改。
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.paper },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  headerBack: { ...T.bodyText, color: Colors.ink, width: 60 },
  headerTitle: { ...T.sectionTitle },
  headerRight: { width: 60 },
  scroll: { flex: 1 },
  inner: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  desc: { ...T.bodyText, color: Colors.walnut2, fontSize: 14, lineHeight: 22 },

  // Batch option
  batchGroup: {
    backgroundColor: Colors.paperCard,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
    overflow: 'hidden',
  },
  batchOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    gap: Spacing.two,
  },
  batchIcon: { fontSize: 24 },
  batchInfo: { flex: 1, gap: 2 },
  batchTitle: { ...T.bodyText, fontWeight: '600', fontSize: 15, color: Colors.ink },
  batchDesc: { ...T.micro, color: Colors.walnut2 },
  batchArrow: { color: Colors.walnut2, fontSize: 16 },

  // Loading
  loadingWrap: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.four },
  loadingText: { ...T.bodyText, color: Colors.ink },

  // Result
  resultSection: { gap: Spacing.three },
  successBanner: {
    backgroundColor: Colors.signalSoft,
    borderRadius: Radius.lg,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  successCheck: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.signal,
    alignItems: 'center', justifyContent: 'center',
  },
  successCheckText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  successText: { ...T.bodyText, fontWeight: '600', color: Colors.signal, fontSize: 14 },
  successSub: { ...T.micro, color: Colors.walnut2, marginTop: 2 },
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  previewThumb: {
    width: '23%',
    aspectRatio: 1,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    backgroundColor: Colors.paperCard,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  previewImage: { width: '100%', height: '100%' },
  finishBtn: {
    backgroundColor: Colors.ink,
    borderRadius: Radius.md,
    paddingVertical: Spacing.two + 4,
    alignItems: 'center',
  },
  finishText: { ...T.buttonPrimary, color: Colors.paper },

  // Tip
  tipCard: {
    backgroundColor: Colors.signalSoft,
    borderRadius: Radius.lg,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  tipTitle: { ...T.bodyText, fontWeight: '600', color: Colors.ink, fontSize: 14 },
  tipContent: { ...T.micro, color: Colors.walnut2, lineHeight: 20 },
});
