import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Colors, Fonts, Radius, Spacing, T } from '@/constants/theme';

export default function GammaHome() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>← 返回</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>Gamma</Text>
        <View style={styles.headerSide} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.badge}><Text style={styles.badgeText}>DIRECT MODEL EXPERIMENT</Text></View>
        <Text style={styles.title}>更短的模型路径</Text>
        <Text style={styles.desc}>独立于现有识别、标准化和 B0–B6/RAG 搭配流程。App 仍只访问 Model Service，模型密钥不会进入客户端。</Text>

        <TouchableOpacity style={styles.card} onPress={() => router.push('/gamma/import')}>
          <Text style={styles.cardIndex}>01</Text>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>导入 + 标准化</Text>
            <Text style={styles.cardDesc}>Qwen 视觉识别一次，再直接进行图片编辑。</Text>
          </View>
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} onPress={() => router.push('/gamma/outfit')}>
          <Text style={styles.cardIndex}>02</Text>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>直接生成搭配</Text>
            <Text style={styles.cardDesc}>DeepSeek 一次生成完整方案，缺少的单品由 Qwen 并行生成图片。</Text>
          </View>
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>

        <View style={styles.note}>
          <Text style={styles.noteTitle}>实验边界</Text>
          <Text style={styles.noteText}>Gamma 不替换现有功能。它使用相同登录鉴权和衣橱数据，但不调用现有多层推理管线，便于单独比较速度、质量和成本。</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.paper },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.four, paddingVertical: Spacing.three, borderBottomWidth: 1, borderBottomColor: Colors.line },
  back: { ...T.bodyText, width: 64 },
  headerTitle: { ...T.sectionTitle },
  headerSide: { width: 64 },
  content: { padding: Spacing.four, paddingBottom: Spacing.six },
  badge: { alignSelf: 'flex-start', backgroundColor: Colors.signalSoft, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6, marginTop: Spacing.two },
  badgeText: { fontFamily: Fonts.uiSemiBold, color: Colors.signal, fontSize: 10, letterSpacing: 1.2 },
  title: { ...T.storyTitle, marginTop: Spacing.three },
  desc: { ...T.bodyText, color: Colors.gray1, marginTop: Spacing.two, marginBottom: Spacing.five },
  card: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.lineStrong, borderRadius: Radius.lg, padding: Spacing.three, marginBottom: Spacing.three, backgroundColor: Colors.paperCard },
  cardIndex: { fontFamily: Fonts.numericSerif, fontSize: 22, color: Colors.gray2, width: 42 },
  cardBody: { flex: 1 },
  cardTitle: { ...T.subTitle, fontFamily: Fonts.uiSemiBold },
  cardDesc: { ...T.itemDesc, marginTop: 4 },
  arrow: { fontSize: 28, color: Colors.gray1, marginLeft: Spacing.two },
  note: { marginTop: Spacing.four, padding: Spacing.three, borderRadius: Radius.md, backgroundColor: Colors.accentSoft },
  noteTitle: { ...T.formLabel, color: Colors.accent, fontFamily: Fonts.uiSemiBold },
  noteText: { ...T.itemDesc, color: Colors.inkSoft, marginTop: Spacing.two },
});
