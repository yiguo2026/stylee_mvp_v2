import { View, Text, TouchableOpacity, StyleSheet, Image, SafeAreaView, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Colors, Spacing, Radius, Shadow, Fonts } from '@/constants/theme';
import { CategoryIcon } from '@/components/CategoryIcon';

export default function InspirationDetailScreen() {
  const params = useLocalSearchParams<{
    title: string; tag: string; desc: string;
    image_url: string; style_tags: string; occasion_tags: string;
    items: string;
  }>();

  const title = decodeURIComponent(params.title ?? '');
  const tag = decodeURIComponent(params.tag ?? '');
  const desc = decodeURIComponent(params.desc ?? '');
  const imageUrl = decodeURIComponent(params.image_url ?? '');
  const styleTags = params.style_tags ? decodeURIComponent(params.style_tags).split(',') : [];
  const occasionTags = params.occasion_tags ? decodeURIComponent(params.occasion_tags).split(',') : [];

  let breakdownItems: { name: string; category: string; color: string; image_url?: string }[] = [];
  try {
    if (params.items) breakdownItems = JSON.parse(decodeURIComponent(params.items));
  } catch {}

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Hero Image — no overlay */}
        <View style={styles.heroWrap}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <View style={styles.heroPlaceholder} />
          )}
          <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.closeBtnText}>关闭</Text>
          </TouchableOpacity>
        </View>

        {/* Title & Description */}
        <View style={styles.titleSection}>
          <Text style={styles.heroTag}># {tag}</Text>
          <Text style={styles.heroTitle}>{title}</Text>
          <Text style={styles.heroDesc}>{desc}</Text>
        </View>

        {/* Style Tags */}
        {(styleTags.length > 0 || occasionTags.length > 0) && (
          <View style={styles.tagSection}>
            <View style={styles.tagRow}>
              {styleTags.map(t => (
                <View key={t} style={styles.tagPill}>
                  <Text style={styles.tagPillText}>{t}</Text>
                </View>
              ))}
              {occasionTags.map(t => (
                <View key={t} style={[styles.tagPill, styles.tagPillOccasion]}>
                  <Text style={[styles.tagPillText, styles.tagPillTextOccasion]}>{t}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Item Breakdown */}
        {breakdownItems.length > 0 && (
          <View style={styles.breakdownSection}>
            <Text style={styles.breakdownTitle}>单品拆解</Text>
            {breakdownItems.map((item, idx) => (
              <View key={idx} style={styles.breakdownItem}>
                <View style={styles.breakdownThumb}>
                  {item.image_url ? (
                    <Image source={{ uri: item.image_url }} style={styles.breakdownThumbImg} resizeMode="cover" />
                  ) : (
                    <View style={styles.breakdownThumbPlaceholder}>
                      <CategoryIcon category={item.category} size={24} color={Colors.walnut2} />
                    </View>
                  )}
                </View>
                <View style={styles.breakdownInfo}>
                  <Text style={styles.breakdownName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.breakdownMeta}>{item.category} · {item.color}</Text>
                </View>
                <Text style={styles.breakdownArrow}>›</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.paper },
  content: { paddingBottom: Spacing.six },

  heroWrap: {
    width: '100%', aspectRatio: 3 / 4, position: 'relative',
    backgroundColor: Colors.ink,
  },
  heroImage: { width: '100%', height: '100%' },
  heroPlaceholder: { width: '100%', height: '100%', backgroundColor: Colors.paperCard },

  closeBtn: {
    position: 'absolute', top: 12, right: 12,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { fontSize: 16, color: Colors.inkSoft },

  // Title section below image
  titleSection: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three, gap: 4 },
  heroTag: {
    fontSize: 11, color: Colors.terracotta, fontFamily: Fonts.uiSemiBold,
  },
  heroTitle: { fontSize: 22, fontFamily: Fonts.cnDisplay, color: Colors.ink },
  heroDesc: { fontSize: 14, color: Colors.walnut, lineHeight: 22 },

  // Tags
  tagSection: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagPill: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9,
    backgroundColor: Colors.signal,
  },
  tagPillOccasion: { borderWidth: 1, borderColor: Colors.accent, backgroundColor: Colors.accentSoft },
  tagPillText: { fontSize: 12, fontFamily: Fonts.ui, color: Colors.paper },
  tagPillTextOccasion: { color: Colors.accent },

  // Item Breakdown
  breakdownSection: {
    marginHorizontal: Spacing.four, marginTop: Spacing.three,
    backgroundColor: Colors.paperCard, borderRadius: Radius.lg,
    padding: Spacing.three, gap: Spacing.two,
    ...Shadow.one,
  },
  breakdownTitle: { fontSize: 15, fontFamily: Fonts.uiSemiBold, color: Colors.ink, marginBottom: Spacing.one },
  breakdownItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1, borderBottomColor: Colors.line,
  },
  breakdownThumb: {
    width: 48, height: 48, borderRadius: 12, overflow: 'hidden',
    backgroundColor: Colors.paperCard,
  },
  breakdownThumbImg: { width: '100%', height: '100%' },
  breakdownThumbPlaceholder: {
    width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center',
  },
  breakdownInfo: { flex: 1, gap: 2 },
  breakdownName: { fontSize: 14, fontFamily: Fonts.uiSemiBold, color: Colors.ink },
  breakdownMeta: { fontSize: 12, color: Colors.walnut2 },
  breakdownArrow: { fontSize: 16, color: Colors.walnut2 },
});
