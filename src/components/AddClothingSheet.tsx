import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { Colors, Spacing, Radius, Fonts, T } from '@/constants/theme';
import { setPendingImages } from '@/lib/pendingImages';
import { useWardrobeStore } from '@/stores/wardrobeStore';
import { PRESET_BASIC_ITEMS } from '@/types';

const isWeb = Platform.OS === 'web';

interface AddClothingSheetProps {
  visible: boolean;
  onClose: () => void;
  /** 心愿单数量，用于角标展示 */
  wishlistCount?: number;
}

function SheetContent({
  onClose,
  wishlistCount = 0,
}: {
  onClose: () => void;
  wishlistCount?: number;
}) {
  const insets = useSafeAreaInsets();
  const [picking, setPicking] = React.useState(false);
  const { items } = useWardrobeStore();

  // 全部推荐单品是否都已加入衣橱 —— 用于在入口就提示，避免用户点进去才发现没得可加
  const allPresetAdded = React.useMemo(() => {
    if (items.length === 0) return false;
    const keys = new Set(items.map(it => `${it.name}||${it.category}`));
    return PRESET_BASIC_ITEMS.every(it => keys.has(`${it.name}||${it.category}`));
  }, [items]);

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

  // 快速添加推荐单品 — 从热门基础款补充
  const handleQuickAdd = () => {
    // 推荐单品已全部加入时，入口已给出提示，点击不再跳转，避免"骗进去"
    if (allPresetAdded) return;
    onClose();
    router.push('/wardrobe/quick-add');
  };

  // 心愿单 — 独立 pushed 路由，返回时回到来源页
  const handleOpenWishlist = () => {
    onClose();
    router.push('/wardrobe/wishlist');
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
            <Text style={styles.primarySub}>选择一张或多张图片，AI 自动识别单品</Text>
          </View>
          {picking
            ? <ActivityIndicator size="small" color={Colors.accent} />
            : <Feather name="chevron-right" size={18} color={Colors.accent} />}
        </TouchableOpacity>

        <Text style={styles.groupLabel}>更多方式</Text>

        {/* 快速添加推荐单品 — 从热门基础款补充 */}
        <TouchableOpacity
          style={[styles.option, allPresetAdded && styles.optionDisabled]}
          onPress={handleQuickAdd}
          activeOpacity={allPresetAdded ? 1 : 0.7}
        >
          <Feather name="zap" size={18} color={allPresetAdded ? Colors.walnut2 : Colors.ink} style={styles.optionIcon} />
          <View style={styles.optionTextWrap}>
            <Text style={[styles.optionText, allPresetAdded && styles.optionTextDisabled]}>快速添加推荐单品</Text>
            <Text style={styles.optionSub}>
              {allPresetAdded ? '推荐单品已全部加入衣橱，去「相册导入」补充更多吧' : '从热门基础款中一键补充衣橱'}
            </Text>
          </View>
          {allPresetAdded
            ? <Feather name="check-circle" size={16} color={Colors.walnut2} />
            : <Feather name="chevron-right" size={16} color={Colors.walnut2} />}
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

export function AddClothingSheet({ visible, onClose, wishlistCount }: AddClothingSheetProps) {
  if (isWeb) {
    if (!visible) return null;
    return (
      <View style={styles.webLayer}>
        <SheetContent onClose={onClose} wishlistCount={wishlistCount} />
      </View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <SheetContent onClose={onClose} wishlistCount={wishlistCount} />
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
  optionTextDisabled: { color: Colors.walnut2 },
  optionSub: { ...T.micro, color: Colors.walnut2 },
  optionDisabled: { opacity: 0.6, backgroundColor: Colors.paper },

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
