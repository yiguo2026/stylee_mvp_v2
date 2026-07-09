import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, SafeAreaView,
} from 'react-native';
import { router } from 'expo-router';
import { Colors, Spacing, T, Fonts } from '@/constants/theme';

/**
 * 隐私政策详情页 — 完整内嵌在 App 内。
 * 内容与 public/privacy.html 保持同步。
 */
export default function PrivacyPage() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { if (router.canGoBack()) router.back(); }} hitSlop={12}>
          <Text style={styles.headerBack}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>隐私政策</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.inner}>
        <Text style={styles.pageTitle}>Stylee 隐私政策</Text>
        <Text style={styles.updateDate}>更新日期：2026年6月17日</Text>

        <Section title="一、我们收集的信息">
          <P>为了提供 AI 穿搭推荐服务，我们会收集以下信息：</P>
          <Bullet><B>账号信息</B>：注册时提供的邮箱地址和昵称</Bullet>
          <Bullet><B>个人资料</B>：性别、年龄段、身高、体重等基本信息（可选）</Bullet>
          <Bullet><B>衣橱数据</B>：您上传的衣物照片、分类标签、品牌等信息</Bullet>
          <Bullet><B>风格偏好</B>：您选择的喜欢/不喜欢的风格标签</Bullet>
          <Bullet><B>位置信息</B>：用于获取当地天气数据，提供季节性穿搭建议</Bullet>
          <Bullet><B>使用记录</B>：穿搭历史、保存的搭配方案</Bullet>
        </Section>

        <Section title="二、信息用途">
          <P>我们收集的信息仅用于：</P>
          <Bullet>提供个性化穿搭推荐服务</Bullet>
          <Bullet>根据天气和场景生成搭配建议</Bullet>
          <Bullet>保存和管理您的衣橱数据</Bullet>
          <Bullet>改善服务质量和用户体验</Bullet>
        </Section>

        <Section title="三、信息存储与安全">
          <P>您的数据通过 Supabase 云服务加密存储，传输过程使用 HTTPS 加密。我们采取了合理的技术措施保护您的个人信息安全。</P>
        </Section>

        <Section title="四、信息共享">
          <P>我们不会：</P>
          <Bullet>向第三方出售您的个人数据</Bullet>
          <Bullet>在未经您同意的情况下分享个人信息</Bullet>
          <Bullet>将您的数据用于广告推送</Bullet>
          <P>以下情况除外：法律法规要求、保护公共利益、经您明确同意。</P>
        </Section>

        <Section title="五、第三方服务">
          <P>我们的服务依赖以下第三方：</P>
          <Bullet><B>Supabase</B>：数据存储与认证服务</Bullet>
          <Bullet><B>DeepSeek</B>：AI 穿搭推荐引擎</Bullet>
          <Bullet><B>和风天气</B>：天气数据服务</Bullet>
          <P>这些服务各有独立的隐私政策，我们建议您了解其数据处理方式。</P>
        </Section>

        <Section title="六、您的权利">
          <Bullet>随时查看、修改您的个人资料和衣橱数据</Bullet>
          <Bullet>删除您的账号及相关数据</Bullet>
          <Bullet>撤回对位置信息的授权</Bullet>
        </Section>

        <Section title="七、未成年人保护">
          <P>Stylee 不面向 14 岁以下未成年人。我们不会故意收集未成年人的个人信息。</P>
        </Section>

        <Section title="八、政策更新">
          <P>我们可能会更新本隐私政策。重大变更会通过应用内通知或邮件告知您。</P>
        </Section>

        <Section title="九、联系我们">
          <P>如有隐私相关问题，请联系：feedback@stylee.app</P>
        </Section>

        <View style={styles.footerSpace} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <Text style={styles.paragraph}>{children}</Text>;
}

function B({ children }: { children: React.ReactNode }) {
  return <Text style={styles.bold}>{children}</Text>;
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.paper },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.four, paddingVertical: Spacing.three,
    backgroundColor: Colors.paper, borderBottomWidth: 1, borderBottomColor: Colors.line,
  },
  headerBack: { ...T.bodyText, color: Colors.ink, width: 60 },
  headerTitle: { ...T.sectionTitle },
  headerRight: { width: 60 },

  container: { flex: 1 },
  inner: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },

  pageTitle: {
    fontSize: 20, fontFamily: Fonts.uiSemiBold, color: Colors.ink,
    textAlign: 'center', marginBottom: 4,
  },
  updateDate: {
    fontSize: 13, color: Colors.gray1, textAlign: 'center',
    marginBottom: Spacing.four,
  },

  section: { marginBottom: Spacing.three + 4 },
  sectionTitle: {
    fontSize: 15, fontFamily: Fonts.uiSemiBold, color: Colors.ink,
    marginBottom: Spacing.two,
  },
  paragraph: {
    fontSize: 14, color: Colors.ink, lineHeight: 24,
    marginBottom: 4,
  },
  bold: { fontFamily: Fonts.uiSemiBold, color: Colors.ink },
  bulletRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingLeft: 4, marginBottom: 4,
  },
  bulletDot: {
    fontSize: 14, color: Colors.gray1, lineHeight: 24, width: 14,
  },
  bulletText: {
    flex: 1, fontSize: 14, color: Colors.ink, lineHeight: 24,
  },

  footerSpace: { height: Spacing.six },
});
