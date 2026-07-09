import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, SafeAreaView,
} from 'react-native';
import { router } from 'expo-router';
import { Colors, Spacing, T, Fonts } from '@/constants/theme';

/**
 * 用户协议详情页 — 完整内嵌在 App 内，不再跳出到外部浏览器。
 * 内容与 public/terms.html 保持同步。
 */
export default function TermsPage() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { if (router.canGoBack()) router.back(); }} hitSlop={12}>
          <Text style={styles.headerBack}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>用户协议</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.inner}>
        <Text style={styles.pageTitle}>Stylee 用户协议</Text>
        <Text style={styles.updateDate}>更新日期：2026年6月17日</Text>

        <Section title="一、服务说明">
          <P>Stylee 是一款基于人工智能的穿搭推荐应用，根据您的衣橱、风格偏好和天气情况，提供个性化的搭配建议。</P>
        </Section>

        <Section title="二、账号注册">
          <Bullet>您需提供有效的邮箱地址进行注册</Bullet>
          <Bullet>您应妥善保管账号密码，对账号下的活动负责</Bullet>
          <Bullet>不得将账号转让或出借给他人使用</Bullet>
        </Section>

        <Section title="三、用户内容">
          <Bullet>您上传的衣物照片和穿搭数据归您所有</Bullet>
          <Bullet>您授予我们使用这些内容提供服务的必要权限</Bullet>
          <Bullet>您应确保上传内容不侵犯他人权利</Bullet>
        </Section>

        <Section title="四、AI 推荐声明">
          <P>Stylee 的穿搭推荐由 AI 模型生成，仅供参考。我们不保证推荐结果的准确性、适用性或时尚性。用户应根据自身情况判断是否采纳推荐。</P>
        </Section>

        <Section title="五、服务变更与终止">
          <Bullet>我们保留随时修改或终止部分服务的权利</Bullet>
          <Bullet>重大变更将提前通知用户</Bullet>
          <Bullet>您可随时注销账号并删除数据</Bullet>
        </Section>

        <Section title="六、免责声明">
          <P>在法律允许的最大范围内，Stylee 不对以下情况承担责任：</P>
          <Bullet>因不可抗力导致的服务中断</Bullet>
          <Bullet>第三方服务故障导致的功能异常</Bullet>
          <Bullet>AI 推荐结果与用户期望不符</Bullet>
        </Section>

        <Section title="七、知识产权">
          <P>Stylee 应用的界面设计、图标、代码等知识产权归开发者所有，未经许可不得复制、修改或分发。</P>
        </Section>

        <Section title="八、适用法律">
          <P>本协议适用中华人民共和国法律。如发生争议，双方应友好协商解决。</P>
        </Section>

        <Section title="九、联系我们">
          <P>如有问题，请联系：feedback@stylee.app</P>
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
