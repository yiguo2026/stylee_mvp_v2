import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Modal, ActivityIndicator,
} from 'react-native';
import { Colors, Spacing, Radius, T } from '@/constants/theme';

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
}: ConfirmModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
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
              ]}
              onPress={onConfirm}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color={Colors.paper} size="small" />
                : <Text style={styles.confirmText}>{confirmText}</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  dialog: {
    backgroundColor: Colors.paperRaised,
    borderRadius: Radius.lg,
    padding: Spacing.four,
    width: '100%',
    maxWidth: 340,
    gap: Spacing.three,
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
  confirmText: {
    ...T.buttonPrimary,
    color: Colors.paper,
  },
});
