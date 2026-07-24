import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, MaxContentWidth, Radius, Spacing, T } from '@/constants/theme';
import { useImportStore } from '@/stores/importStore';

const SCREEN_HEIGHT = Dimensions.get('window').height;

interface Props {
  visible: boolean;
  onClose: () => void;
  taskId?: string | null;
}

const ItemSelectionSheet: React.FC<Props> = ({ visible, onClose, taskId }) => {
  const insets = useSafeAreaInsets();
  const tasks = useImportStore((state) => state.tasks);
  const confirmSelection = useImportStore((state) => state.confirmSelection);

  const [mounted, setMounted] = useState(visible);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const slideAnim = useRef(new Animated.Value(32)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const taskToSelect = useMemo(() => {
    if (taskId) {
      const matched = tasks.find((task) => task.id === taskId && task.status === 'needs_selection');
      if (matched) return matched;
    }
    return tasks.find((task) => task.status === 'needs_selection');
  }, [taskId, tasks]);

  const pendingCount = tasks.filter((task) => task.status === 'needs_selection').length;

  useEffect(() => {
    if (visible && taskToSelect?.allDetectedItems) {
      setSelectedIds(taskToSelect.allDetectedItems.map((item) => item.index));
    }
  }, [taskToSelect?.allDetectedItems, taskToSelect?.id, visible]);

  useEffect(() => {
    if (visible && taskToSelect) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 85,
          friction: 11,
        }),
      ]).start();
      return;
    }

    if (!mounted) return;

    Animated.parallel([
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 28,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [mounted, opacityAnim, slideAnim, taskToSelect, visible]);

  if (!mounted || !taskToSelect || !taskToSelect.allDetectedItems) return null;

  const toggleItem = (index: number) => {
    setSelectedIds((prev) => (
      prev.includes(index)
        ? prev.filter((id) => id !== index)
        : [...prev, index]
    ));
  };

  const handleConfirm = () => {
    const selectedItems = taskToSelect.allDetectedItems!.filter((item) => selectedIds.includes(item.index));
    confirmSelection(taskToSelect.id, selectedItems);
    onClose();
  };

  return (
    <View pointerEvents="box-none" style={styles.portal}>
      <View style={styles.frame}>
        <Animated.View style={[styles.backdrop, { opacity: opacityAnim }]} />
        <Pressable style={styles.backdropPressTarget} onPress={onClose} />
        <Animated.View
          style={[
            styles.sheetWrap,
            {
              opacity: opacityAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, Spacing.three) }]}> 
            <View style={styles.header}>
              <View style={styles.headerBar} />
              <Text style={styles.title}>检测到多件单品</Text>
              <Text style={styles.subtitle}>
                选择要导入的单品{pendingCount > 1 ? `（剩余 ${pendingCount} 张待确认）` : ''}
              </Text>
            </View>

            <View style={styles.sourcePreview}>
              <Image source={{ uri: taskToSelect.sourceUri }} style={styles.sourceThumbnail} />
              <View style={styles.sourceTextWrap}>
                <Text style={styles.sourceLabel}>来自这张照片</Text>
                <Text style={styles.sourceHint}>保留你想导入衣橱的单品，其余可取消选择</Text>
              </View>
            </View>

            <ScrollView
              style={styles.scrollArea}
              contentContainerStyle={styles.grid}
              showsVerticalScrollIndicator={false}
            >
              {taskToSelect.allDetectedItems.map((item) => {
                const checked = selectedIds.includes(item.index);
                return (
                  <TouchableOpacity
                    key={item.index}
                    style={[styles.itemCard, checked && styles.itemCardSelected]}
                    onPress={() => toggleItem(item.index)}
                    activeOpacity={0.82}
                  >
                    <View style={[styles.colorBadge, { backgroundColor: getColorHex(item.color) }]} />
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemName} numberOfLines={1}>{item.description}</Text>
                      <Text style={styles.itemMeta}>{item.category} · {item.color}</Text>
                    </View>
                    <View style={styles.checkbox}>
                      {checked ? (
                        <Ionicons name="checkmark-circle" size={24} color={Colors.ink} />
                      ) : (
                        <View style={styles.checkboxOutline} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.footer}>
              <TouchableOpacity style={styles.skipButton} onPress={onClose}>
                <Text style={styles.skipButtonText}>稍后再说</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButton, selectedIds.length === 0 && styles.confirmButtonDisabled]}
                onPress={handleConfirm}
                disabled={selectedIds.length === 0}
              >
                <Text style={styles.confirmButtonText}>确认导入 {selectedIds.length} 件</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </View>
    </View>
  );
};

const getColorHex = (colorName: string) => {
  const map: Record<string, string> = {
    白色: '#FFFFFF',
    黑色: '#151515',
    蓝色: '#4F7DFF',
    米色: '#F1E6CF',
    灰色: '#9AA0A6',
    棕色: '#9A684E',
    红色: '#D14343',
    粉色: '#E9AFC0',
    绿色: '#658062',
  };
  return map[colorName] || '#D9D9DD';
};

const styles = StyleSheet.create({
  portal: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 240,
  },
  frame: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,10,10,0.28)',
  },
  backdropPressTarget: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetWrap: {
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.paper,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: Math.min(SCREEN_HEIGHT * 0.72, 620),
    overflow: 'hidden',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    gap: 4,
  },
  headerBar: {
    width: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: Colors.lineStrong,
    marginBottom: Spacing.one,
  },
  title: {
    ...T.sectionTitle,
    fontFamily: Fonts.body,
    fontSize: 18,
    fontWeight: '300',
    letterSpacing: 0.2,
  },
  subtitle: {
    ...T.micro,
    color: Colors.gray1,
    textAlign: 'center',
  },
  sourcePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.line,
  },
  sourceThumbnail: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: Colors.paperRaised,
  },
  sourceTextWrap: {
    flex: 1,
  },
  sourceLabel: {
    ...T.itemName,
    color: Colors.ink,
  },
  sourceHint: {
    ...T.micro,
    marginTop: 2,
    color: Colors.gray1,
  },
  scrollArea: {
    flexGrow: 0,
  },
  grid: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    gap: Spacing.two,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.paperCard,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.three,
    paddingVertical: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  itemCardSelected: {
    borderColor: 'rgba(15,15,15,0.42)',
    backgroundColor: Colors.paper,
  },
  colorBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: Colors.lineStrong,
  },
  itemInfo: {
    flex: 1,
    marginLeft: Spacing.two,
    marginRight: Spacing.two,
  },
  itemName: {
    ...T.itemName,
    color: Colors.ink,
  },
  itemMeta: {
    ...T.micro,
    marginTop: 2,
    color: Colors.gray1,
  },
  checkbox: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOutline: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: Colors.lineStrong,
    backgroundColor: Colors.paper,
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  skipButton: {
    minWidth: 104,
    height: 50,
    paddingHorizontal: Spacing.three,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.paperCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  skipButtonText: {
    ...T.buttonSecondary,
    color: Colors.gray1,
  },
  confirmButton: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F0F0F',
  },
  confirmButtonDisabled: {
    backgroundColor: Colors.lineStrong,
  },
  confirmButtonText: {
    fontSize: 15,
    color: '#FFFFFF',
    fontFamily: Fonts.ui,
    letterSpacing: 0.8,
  },
});

export default ItemSelectionSheet;
