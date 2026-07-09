import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Modal, ActivityIndicator, Platform, KeyboardAvoidingView,
} from 'react-native';
import { Colors, Spacing, Radius, T } from '@/constants/theme';

const isWeb = Platform.OS === 'web';

interface Props {
  visible: boolean;
  initialValue: string;
  onClose: () => void;
  onSave: (value: string) => Promise<void> | void;
}

/**
 * 轻量单字段编辑弹窗 —— 用于用户名等单字段快速编辑
 */
export function NicknameEditModal({ visible, initialValue, onClose, onSave }: Props) {
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setValue(initialValue);
      setSaving(false);
    }
  }, [visible, initialValue]);

  const trimmed = value.trim();
  const canSave = trimmed.length > 0 && trimmed !== initialValue && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave(trimmed);
    } finally {
      setSaving(false);
    }
  };

  const content = (
    <View style={styles.overlay}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.center}
      >
        <View style={styles.dialog}>
          <Text style={styles.title}>修改用户名</Text>
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={setValue}
            placeholder="请输入新的用户名"
            placeholderTextColor={Colors.walnut2}
            maxLength={20}
            autoFocus
          />
          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.btn, styles.cancelBtn]}
              onPress={onClose}
              disabled={saving}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.confirmBtn, !canSave && styles.disabled]}
              onPress={handleSave}
              disabled={!canSave}
              activeOpacity={0.7}
            >
              {saving
                ? <ActivityIndicator color={Colors.paper} size="small" />
                : <Text style={styles.confirmText}>保存</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );

  if (!visible) return null;

  if (isWeb) {
    return <View style={styles.webLayer}>{content}</View>;
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  webLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 250,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  dialog: {
    width: '84%',
    maxWidth: 360,
    backgroundColor: Colors.paper,
    borderRadius: Radius.lg,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  title: {
    ...T.sectionTitle,
    textAlign: 'center',
  },
  input: {
    ...T.inputText,
    backgroundColor: Colors.paperCard,
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    color: Colors.ink,
  },
  buttons: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  btn: {
    flex: 1,
    borderRadius: Radius.md,
    paddingVertical: Spacing.two + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    backgroundColor: Colors.paperCard,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  confirmBtn: {
    backgroundColor: Colors.ink,
  },
  disabled: { opacity: 0.4 },
  cancelText: { ...T.buttonSecondary, color: Colors.ink },
  confirmText: { ...T.buttonPrimary, color: Colors.paper },
});
