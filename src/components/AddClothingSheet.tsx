import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Platform, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { Colors, Spacing, Radius, Fonts, T } from '@/constants/theme';

const isWeb = Platform.OS === 'web';

interface AddClothingSheetProps {
  visible: boolean;
  onClose: () => void;
}

function SheetContent({ onClose }: { onClose: () => void }) {
  const [picking, setPicking] = React.useState(false);

  const handlePickImages = async () => {
    setPicking(true);
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setPicking(false);
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
      });
      if (result.canceled) {
        setPicking(false);
        return;
      }
      const uris = result.assets.map(a => a.uri);
      onClose();
      router.push({ pathname: '/wardrobe/add', params: { images: JSON.stringify(uris) } });
    } catch {
      setPicking(false);
    }
  };

  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <TouchableOpacity style={styles.modalOption} onPress={handlePickImages} disabled={picking}>
          <Feather name="image" size={18} color={Colors.ink} style={styles.modalOptionIcon} />
          <View style={styles.modalOptionTextWrap}>
            <Text style={styles.modalOptionText}>相册导入</Text>
            <Text style={styles.modalOptionSub}>支持一次选择1张或多张，AI后台识别</Text>
          </View>
          {picking && <ActivityIndicator size="small" color={Colors.terracotta} />}
        </TouchableOpacity>

        <TouchableOpacity style={styles.modalCancel} onPress={onClose}>
          <Feather name="x-circle" size={16} color={Colors.walnut} />
          <Text style={styles.modalCancelText}>取消</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function AddClothingSheet({ visible, onClose }: AddClothingSheetProps) {
  if (isWeb) {
    if (!visible) return null;
    return (
      <View style={styles.webLayer}>
        <SheetContent onClose={onClose} />
      </View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <SheetContent onClose={onClose} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  webLayer: { ...StyleSheet.absoluteFillObject, zIndex: 220 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: Colors.paper, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    padding: Spacing.four, gap: Spacing.two, paddingBottom: Spacing.six,
  },
  modalOption: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.two,
    paddingVertical: Spacing.three, paddingHorizontal: Spacing.two,
    borderBottomWidth: 1, borderBottomColor: Colors.line,
  },
  modalOptionIcon: { width: 20, textAlign: 'center' },
  modalOptionTextWrap: { flex: 1, gap: 2 },
  modalOptionText: { ...T.bodyText, fontSize: 16, color: Colors.ink },
  modalOptionSub: { ...T.micro, color: Colors.walnut2 },
  modalCancel: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, paddingVertical: Spacing.three, marginTop: Spacing.one },
  modalCancelText: { ...T.bodyText, fontSize: 16, color: Colors.walnut },
});
