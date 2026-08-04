import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Modal, ActivityIndicator, Platform, TextInput,
} from 'react-native';
import { Colors, Spacing, Radius, Shadow, T } from '@/constants/theme';
import { ds } from '@/design-system';

const isWeb = Platform.OS === 'web';

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message?: string;
  cancelText?: string;
  confirmText?: string;
  confirmStyle?: 'destructive' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  singleButton?: boolean;
  /** 可选：要求用户输入特定文字才能点击确认 */
  confirmVerificationText?: string;
}

export function ConfirmModal({
  visible,
  title,
  message,
  cancelText = '取消',
  confirmText = '确认',
  confirmStyle = 'primary',
  onConfirm,
  onCancel,
  loading,
  singleButton,
  confirmVerificationText,
}: ConfirmModalProps) {
  const [verificationInput, setVerificationInput] = React.useState('');

  // Reset input when modal becomes visible
  React.useEffect(() => {
    if (visible) {
      setVerificationInput('');
    }
  }, [visible]);

  const isVerified = !confirmVerificationText || verificationInput === confirmVerificationText;

  const content = (
    <View style={styles.overlay}>
      <View style={styles.dialog}>
        <Text style={styles.title}>{title}</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}

        {confirmVerificationText ? (
          <View style={styles.verificationContainer}>
            <Text style={styles.verificationHint}>
              请输入「{confirmVerificationText}」以确认：
            </Text>
            <TextInput
              style={styles.verificationInput}
              value={verificationInput}
              onChangeText={setVerificationInput}
              placeholder={`输入 ${confirmVerificationText}`}
              placeholderTextColor={ds.color.semantic.text.tertiary}
              autoFocus
            />
          </View>
        ) : null}

        <View style={styles.buttons}>
          {!singleButton && (
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>{cancelText}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[
              singleButton ? styles.singleConfirmBtn : styles.confirmBtn,
              confirmStyle === 'destructive' && styles.destructiveBtn,
              (!isVerified || loading) && styles.disabledBtn,
            ]}
            onPress={onConfirm}
            disabled={!isVerified || loading}
          >
            {loading
              ? <ActivityIndicator color={ds.color.semantic.text.inverse} size="small" />
              : <Text style={styles.confirmText}>{confirmText}</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  if (isWeb) {
    if (!visible) return null;
    return <View style={styles.webLayer}>{content}</View>;
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  webLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 240,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  dialog: {
    backgroundColor: Colors.paper,
    borderRadius: Radius.lg,
    padding: Spacing.four,
    width: '100%',
    maxWidth: 340,
    gap: Spacing.three,
    ...Shadow.three,
  },
  title: {
    ...T.sectionTitle,
    textAlign: 'center',
  },
  message: {
    ...T.bodyText,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 22,
  },
  buttons: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: Spacing.two + 4,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
    alignItems: 'center',
  },
  cancelText: {
    ...T.buttonSecondary,
    color: Colors.walnut,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: Spacing.two + 4,
    borderRadius: Radius.md,
    backgroundColor: Colors.ink,
    alignItems: 'center',
  },
  singleConfirmBtn: {
    flex: 1,
    paddingVertical: Spacing.two + 4,
    borderRadius: Radius.md,
    backgroundColor: Colors.ink,
    alignItems: 'center',
  },
  destructiveBtn: {
    backgroundColor: Colors.accent,
  },
  disabledBtn: {
    opacity: 0.4,
  },
  confirmText: {
    ...T.buttonPrimary,
    color: Colors.paper,
  },
  verificationContainer: {
    gap: ds.space[1],
  },
  verificationHint: {
    ...T.support,
    color: ds.color.semantic.text.secondary,
  },
  verificationInput: {
    ...T.bodyText,
    borderWidth: 1,
    borderColor: ds.color.semantic.border.default,
    borderRadius: ds.radius.md,
    paddingHorizontal: ds.space[3],
    paddingVertical: ds.space[2],
    backgroundColor: ds.color.semantic.surface.input,
    color: ds.color.semantic.text.primary,
  },
});
