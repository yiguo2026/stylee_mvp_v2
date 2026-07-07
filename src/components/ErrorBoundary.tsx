import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius, T, Fonts } from '@/constants/theme';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
  };

  handleHardReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.container}>
        <Text style={styles.emoji}>😵</Text>
        <Text style={styles.title}>页面出了点问题</Text>
        <Text style={styles.message}>
          {this.state.error?.message || '发生了未知错误'}
        </Text>
        <View style={styles.buttons}>
          <TouchableOpacity style={styles.retryBtn} onPress={this.handleReload}>
            <Text style={styles.retryBtnText}>重试</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.reloadBtn} onPress={this.handleHardReload}>
            <Text style={styles.reloadBtnText}>刷新页面</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: Colors.paper,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: Spacing.five, gap: Spacing.three,
  },
  emoji: { fontSize: 48 },
  title: { ...T.sectionTitle, color: Colors.ink },
  message: { ...T.bodyText, color: Colors.walnut, textAlign: 'center', lineHeight: 22 },
  buttons: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.two },
  retryBtn: {
    backgroundColor: Colors.ink, borderRadius: Radius.md,
    paddingHorizontal: Spacing.four, paddingVertical: Spacing.two + 4,
  },
  retryBtnText: { ...T.buttonPrimary, color: Colors.paper },
  reloadBtn: {
    backgroundColor: Colors.paperCard, borderRadius: Radius.md,
    paddingHorizontal: Spacing.four, paddingVertical: Spacing.two + 4,
    borderWidth: 1, borderColor: Colors.line,
  },
  reloadBtnText: { ...T.buttonSecondary, color: Colors.ink },
});
