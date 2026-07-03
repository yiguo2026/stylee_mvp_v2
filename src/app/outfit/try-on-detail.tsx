import { View, Text, TouchableOpacity, StyleSheet, Image, ScrollView, SafeAreaView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Colors, Spacing, Radius, Shadow, T, Fonts } from '@/constants/theme';
import { useTryOnStore, TryOnRecord } from '@/stores/tryonStore';
import { CategoryIcon } from '@/components/CategoryIcon';

const SCENE_IMAGES: Record<string, any> = {
  cafe: require('../../../assets/tryon/casual.png'),
  street: require('../../../assets/tryon/street.png'),
  office: require('../../../assets/tryon/office.png'),
  park: require('../../../assets/tryon/layered.png'),
  home: require('../../../assets/tryon/home.png'),
};

export default function TryOnDetailScreen() {
  const params = useLocalSearchParams();
  const recordId = params.recordId as string | undefined;
  const { records } = useTryOnStore();

  const record: TryOnRecord | undefined = records.find(r => r.id === recordId);

  if (!record) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.headerBack}>← 返回</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>试穿详情</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            记录不存在{recordId ? ` (${recordId})` : ''}，共 {records.length} 条
          </Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backLink}>← 返回</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const sceneImage = SCENE_IMAGES[record.scene] ?? SCENE_IMAGES.cafe;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.headerBack}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>试穿详情</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Result Image */}
        <View style={styles.imageCard}>
          <Image source={sceneImage} style={styles.resultImage} resizeMode="cover" />
        </View>

        {/* Info Row */}
        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>场景</Text>
            <Text style={styles.infoValue}>{record.sceneEmoji} {record.sceneLabel}</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>搭配</Text>
            <Text style={styles.infoValue} numberOfLines={1}>{record.outfitName}</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>时间</Text>
            <Text style={styles.infoValue}>
              {new Date(record.createdAt).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </Text>
          </View>
        </View>

        {/* Selfie */}
        {record.selfieUri && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>面部信息</Text>
            <View style={styles.selfieCard}>
              <Image source={{ uri: record.selfieUri }} style={styles.selfieImage} resizeMode="cover" />
            </View>
          </View>
        )}

        {/* Outfit Items */}
        {record.items.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>搭配单品</Text>
            <View style={styles.itemsList}>
              {record.items.map((item, i) => (
                <View key={i} style={styles.itemRow}>
                  <View style={styles.itemIcon}>
                    {item.image_url
                      ? <Image source={{ uri: item.image_url }} style={styles.itemImage} resizeMode="cover" />
                      : <CategoryIcon category={item.category} size={24} color={Colors.walnut2} />
                    }
                  </View>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemMeta}>{item.color ?? ''} {item.category ? `· ${item.category}` : ''}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
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
  },
  resultImage: { width: '100%', aspectRatio: 3 / 4 },

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

  selfieCard: {
    width: 80, height: 106, borderRadius: Radius.md, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.line,
  },
  selfieImage: { width: 80, height: 106 },

  itemsList: { gap: Spacing.two },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.two,
    backgroundColor: Colors.paperCard, borderRadius: Radius.md,
    padding: Spacing.two + 2, ...Shadow.one,
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
});
