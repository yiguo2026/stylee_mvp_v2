import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { Colors, Spacing, Radius, Fonts, T } from '@/constants/theme';

const isWeb = Platform.OS === 'web';

interface AddClothingSheetProps {
  visible: boolean;
  onClose: () => void;
  /** 可选：打开心愿单（衣橱页为同页 Modal，无独立路由时通过此回调触发） */
  onOpenWishlist?: () => void;
}

function SheetContent({ onClose, onOpenWishlist }: { onClose: () => void; onOpenWishlist?: () => void }) {
  const insets = useSafeAreaInsets();
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

  // 一键导入衣橱 — 复用已有批量导入路由
  const handleBatchImport = () => {
    onClose();
    router.push('/wardrobe/batch');
  };

  // 心愿单 — 优先用回调打开同页 Modal，否则回退到衣橱页
  const handleOpenWishlist = () => {
    onClose();
    if (onOpenWishlist) {
      onOpenWishlist();
    } else {
      router.push('/(tabs)/wardrobe');
    }
  };

  return (
    <View style={styles.modalOverlay}>
      <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, Spacing.three) }]}>
        {/* 一键导入衣橱 — 醒目入口 */}
        <TouchableOpacity style={styles.importPrimary} onPress={handleBatchImport} activeOpacity={0.85}>
          <View style={styles.importPrimaryIcon}>
            <Feather name="shopping-bag" size={18} color={Colors.paper} />
          </View>
          <View style={styles.modalOptionTextWrap}>
            <Text style={styles.importPrimaryText}>一键导入衣橱</Text>
            <Text style={styles.importPrimarySub}>从购物截图/订单批量识别</Text>
          </View>
          <Feather name="chevron-right" size={18} color={Colors.accent} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.modalOption} onPress={handlePickImages} disabled={picking}>
          <Feather name="image" size={18} color={Colors.ink} style={styles.modalOptionIcon} />
          <View style={styles.modalOptionTextWrap}>
            <Text style={styles.modalOptionText}>相册导入</Text>
            <Text style={styles.modalOptionSub}>支持一次选择1张或多张，AI后台识别</Text>
          </View>
          {picking && <ActivityIndicator size="small" color={Colors.terracotta} />}
        </TouchableOpacity>

        {/* 心愿单 — 次级快捷入口 */}
        <TouchableOpacity style={styles.wishlistLink} onPress={handleOpenWishlist} activeOpacity={0.7}>
          <Feather name="heart" size={14} color={Colors.accent} />
          <Text style={styles.wishlistLinkText}>从心愿单转入衣橱</Text>
          <Feather name="arrow-right" size={14} color={Colors.accent} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.modalCancel} onPress={onClose}>
          <Feather name="x-circle" size={16} color={Colors.walnut} />
          <Text style={styles.modalCancelText}>取消</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function AddClothingSheet({ visible, onClose, onOpenWishlist }: AddClothingSheetProps) {
  if (isWeb) {
    if (!visible) return null;
    return (
      <View style={styles.webLayer}>
        <SheetContent onClose={onClose} onOpenWishlist={onOpenWishlist} />
      </View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <SheetContent onClose={onClose} onOpenWishlist={onOpenWishlist} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  webLayer: { ...StyleSheet.absoluteFillObject, zIndex: 220 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: Colors.paper, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    paddingTop: Spacing.three, paddingHorizontal: Spacing.four, gap: Spacing.two,
  },

  // 一键导入衣橱 — 醒目卡片入口
  importPrimary: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.two,
    padding: Spacing.three, borderRadius: Radius.md,
    backgroundColor: Colors.accentSoft, borderWidth: 1, borderColor: Colors.accentSoft,
  },
  importPrimaryIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  importPrimaryText: { ...T.bodyText, fontFamily: Fonts.uiSemiBold, fontSize: 16, color: Colors.ink },
  importPrimarySub: { ...T.micro, color: Colors.walnut2 },

  modalOption: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.two,
    paddingVertical: Spacing.three, paddingHorizontal: Spacing.two,
    borderBottomWidth: 1, borderBottomColor: Colors.line,
  },
  modalOptionIcon: { width: 20, textAlign: 'center' },
  modalOptionTextWrap: { flex: 1, gap: 2 },
  modalOptionText: { ...T.bodyText, fontSize: 16, color: Colors.ink },
  modalOptionSub: { ...T.micro, color: Colors.walnut2 },

  // 心愿单 — 次级快捷入口
  wishlistLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: Spacing.two,
  },
  wishlistLinkText: { ...T.buttonSecondary, color: Colors.accent },

  modalCancel: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, paddingVertical: Spacing.three, marginTop: Spacing.one },
  modalCancelText: { ...T.bodyText, fontSize: 16, color: Colors.walnut },
});
