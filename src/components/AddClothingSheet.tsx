import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { Colors, Spacing, Radius, Fonts, T } from '@/constants/theme';
import { setPendingImages } from '@/lib/pendingImages';

const isWeb = Platform.OS === 'web';

interface AddClothingSheetProps {
  visible: boolean;
  onClose: () => void;
  /** 可选：打开心愿单（衣橱页为同页 Modal，无独立路由时通过此回调触发） */
  onOpenWishlist?: () => void;
  /** 心愿单数量，用于角标展示 */
  wishlistCount?: number;
}

function SheetContent({
  onClose,
  onOpenWishlist,
  wishlistCount = 0,
}: {
  onClose: () => void;
  onOpenWishlist?: () => void;
  wishlistCount?: number;
}) {
  const insets = useSafeAreaInsets();
  const [picking, setPicking] = React.useState(false);

  // 相册导入 — 主入口
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
      setPendingImages(uris);
      router.push('/wardrobe/add');
    } catch {
      setPicking(false);
    }
  };

  // 一键导入衣橱 — 从购物截图/订单批量识别
  const handleBatchImport = () => {
    onClose();
    router.push('/wardrobe/batch');
  };

  // 快速添加推荐单品 — 从热门基础款补充
  const handleQuickAdd = () => {
    onClose();
    router.push('/wardrobe/quick-add');
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
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, Spacing.three) }]}>
        <View style={styles.grabber} />
        <Text style={styles.sheetTitle}>补充衣橱</Text>

        {/* 相册导入 — 主入口，最醒目 */}
        <TouchableOpacity style={styles.primary} onPress={handlePickImages} activeOpacity={0.85} disabled={picking}>
          <View style={styles.primaryIcon}>
            <Feather name="image" size={20} color={Colors.paper} />
          </View>
          <View style={styles.optionTextWrap}>
            <Text style={styles.primaryText}>相册导入</Text>
            <Text style={styles.primarySub}>拍照或多选，AI 自动识别单品</Text>
          </View>
          {picking
            ? <ActivityIndicator size="small" color={Colors.accent} />
            : <Feather name="chevron-right" size={18} color={Colors.accent} />}
        </TouchableOpacity>

        <Text style={styles.groupLabel}>更多方式</Text>

        {/* 一键导入衣橱 — 批量识别 */}
        <TouchableOpacity style={styles.option} onPress={handleBatchImport} activeOpacity={0.7}>
          <Feather name="shopping-bag" size={18} color={Colors.ink} style={styles.optionIcon} />
          <View style={styles.optionTextWrap}>
            <Text style={styles.optionText}>一键导入衣橱</Text>
            <Text style={styles.optionSub}>从购物截图 / 订单批量识别</Text>
          </View>
          <Feather name="chevron-right" size={16} color={Colors.walnut2} />
        </TouchableOpacity>

        {/* 快速添加推荐单品 — 从热门基础款补充 */}
        <TouchableOpacity style={styles.option} onPress={handleQuickAdd} activeOpacity={0.7}>
          <Feather name="zap" size={18} color={Colors.ink} style={styles.optionIcon} />
          <View style={styles.optionTextWrap}>
            <Text style={styles.optionText}>快速添加推荐单品</Text>
            <Text style={styles.optionSub}>从热门基础款中一键补充衣橱</Text>
          </View>
          <Feather name="chevron-right" size={16} color={Colors.walnut2} />
        </TouchableOpacity>

        {/* 心愿单 — 查看想要的单品 */}
        <TouchableOpacity style={styles.option} onPress={handleOpenWishlist} activeOpacity={0.7}>
          <Feather name="heart" size={18} color={Colors.accent} style={styles.optionIcon} />
          <View style={styles.optionTextWrap}>
            <Text style={styles.optionText}>心愿单</Text>
            <Text style={styles.optionSub}>查看想要的单品，随时转入衣橱</Text>
          </View>
          {wishlistCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{wishlistCount}</Text>
            </View>
          )}
          <Feather name="chevron-right" size={16} color={Colors.walnut2} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.modalCancel} onPress={onClose}>
          <Text style={styles.modalCancelText}>取消</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function AddClothingSheet({ visible, onClose, onOpenWishlist, wishlistCount }: AddClothingSheetProps) {
  if (isWeb) {
    if (!visible) return null;
    return (
      <View style={styles.webLayer}>
        <SheetContent onClose={onClose} onOpenWishlist={onOpenWishlist} wishlistCount={wishlistCount} />
      </View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <SheetContent onClose={onClose} onOpenWishlist={onOpenWishlist} wishlistCount={wishlistCount} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  webLayer: { ...StyleSheet.absoluteFillObject, zIndex: 220 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  modalContent: {
    backgroundColor: Colors.paper, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    paddingTop: Spacing.two, paddingHorizontal: Spacing.four, gap: Spacing.two,
  },
  grabber: {
    alignSelf: 'center', width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.line, marginBottom: Spacing.two,
  },
  sheetTitle: {
    ...T.bodyText, fontFamily: Fonts.uiSemiBold, fontSize: 15, color: Colors.walnut,
    marginBottom: Spacing.one,
  },

  // 相册导入 — 主入口醒目卡片
  primary: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.two,
    padding: Spacing.three, borderRadius: Radius.md,
    backgroundColor: Colors.accentSoft, borderWidth: 1, borderColor: Colors.accentSoft,
  },
  primaryIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  primaryText: { ...T.bodyText, fontFamily: Fonts.uiSemiBold, fontSize: 16, color: Colors.ink },
  primarySub: { ...T.micro, color: Colors.walnut2, marginTop: 2 },

  groupLabel: { ...T.micro, color: Colors.walnut2, marginTop: Spacing.one },

  // 次级方式行
  option: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.two,
    paddingVertical: Spacing.three, paddingHorizontal: Spacing.two,
    borderRadius: Radius.md, backgroundColor: Colors.paperCard,
    borderWidth: 1, borderColor: Colors.line,
  },
  optionIcon: { width: 22, textAlign: 'center' },
  optionTextWrap: { flex: 1, gap: 2 },
  optionText: { ...T.bodyText, fontSize: 15, color: Colors.ink },
  optionSub: { ...T.micro, color: Colors.walnut2 },

  badge: {
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { fontSize: 10, fontFamily: Fonts.uiSemiBold, color: Colors.paper },

  modalCancel: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: Spacing.three, marginTop: Spacing.one,
  },
  modalCancelText: { ...T.bodyText, fontSize: 16, color: Colors.walnut },
});
