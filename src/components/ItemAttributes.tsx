import React, { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  TextInput, Pressable, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius, Shadow, MaxContentWidth, T } from '@/constants/theme';
import { showToast } from '@/components/Toast';
import {
  WardrobeItem, OCCASION_TAGS, STYLE_TAGS, CLOTHING_CATEGORIES, MATERIAL_OPTIONS,
} from '@/types';

type EditorKind = 'text' | 'single' | 'multi' | 'date';

interface AttrDef {
  key: string;
  label: string;
  kind: EditorKind;
  options?: string[];
  placeholder?: string;
  aiCore?: boolean; // 由模型识别、默认展示的核心属性
}

// 属性定义 —— 核心两项默认展示，其余按需添加
const ATTR_DEFS: AttrDef[] = [
  { key: 'material', label: '材质', kind: 'single', aiCore: true, placeholder: '如：牛仔',
    options: [...MATERIAL_OPTIONS] },
  { key: 'fit_type', label: '版型', kind: 'single', aiCore: true, placeholder: '如：常规合身',
    options: ['超紧身', '修身', '常规合身', '宽松', '廓形'] },
  { key: 'brand', label: '品牌', kind: 'text', placeholder: '请输入品牌' },
  { key: 'price', label: '价格', kind: 'text', placeholder: '请输入价格（元）' },
  { key: 'color', label: '颜色', kind: 'single',
    options: ['白色', '黑色', '灰色', '米色', '驼色', '棕色', '卡其', '藏青', '蓝色', '绿色', '红色', '粉色', '紫色', '黄色', '橙色', '花色/图案'] },
  { key: 'category', label: '分类', kind: 'single', options: [...CLOTHING_CATEGORIES] },
  { key: 'size', label: '尺码', kind: 'single', options: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '均码'] },
  { key: 'season', label: '季节', kind: 'multi', options: ['春', '夏', '秋', '冬', '四季'] },
  { key: 'occasion', label: '场合', kind: 'multi', options: OCCASION_TAGS.map(t => t.label) },
  { key: 'tags', label: '风格', kind: 'multi', options: STYLE_TAGS.map(t => t.label) },
  { key: 'wash_care', label: '洗涤维护', kind: 'text', placeholder: '如：机洗 / 手洗 / 干洗' },
  { key: 'purchase_date', label: '购入日期', kind: 'date', placeholder: '如：2025-06' },
];

const DEF_MAP: Record<string, AttrDef> = Object.fromEntries(ATTR_DEFS.map(d => [d.key, d]));
const CORE_KEYS = ['material', 'fit_type'];

// 把 WardrobeItem 现有值读成 string（用于回填）
function readValue(item: WardrobeItem, key: string): string {
  switch (key) {
    case 'material': return item.material ?? '';
    case 'fit_type': return item.fit_type ?? '';
    case 'brand': return item.brand ?? '';
    case 'price': return item.price !== undefined && item.price !== null ? String(item.price) : '';
    case 'color': return item.color ?? '';
    case 'category': return item.category ?? '';
    case 'season': return (item.season ?? []).join('、');
    case 'occasion': return (item.occasion_tags ?? [])
      .map(id => OCCASION_TAGS.find(t => t.id === id)?.label ?? id).join('、');
    case 'tags': return (item.tags ?? []).join('、');
    case 'size': return (item.ai_recognized_attrs?.size as string) ?? '';
    case 'wash_care': return (item.ai_recognized_attrs?.wash_care as string) ?? '';
    case 'purchase_date': {
      if (!item.purchase_date) return '';
      const d = new Date(item.purchase_date);
      return isNaN(d.getTime())
        ? String(item.purchase_date)
        : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    default: return '';
  }
}

// 从任意日期字符串里解析出「年 / 月」，用于日期选择器回填
function parseYearMonth(s: string): { y: number | null; mo: number | null } {
  const m = (s ?? '').match(/(\d{4})\D+(\d{1,2})/);
  if (m) return { y: Number(m[1]), mo: Number(m[2]) };
  return { y: null, mo: null };
}

// 把编辑结果映射回 WardrobeItem 字段（尺码/洗涤维护无对应列，仅本地展示）
function toUpdate(key: string, value: string): Partial<WardrobeItem> | null {
  const arr = value ? value.split('、').filter(Boolean) : [];
  switch (key) {
    case 'material': return { material: value };
    case 'fit_type': return { fit_type: value };
    case 'brand': return { brand: value };
    case 'price': { const n = parseFloat(value); return { price: isNaN(n) ? undefined : n }; }
    case 'color': return { color: value };
    case 'category': return { category: value as WardrobeItem['category'] };
    case 'season': return { season: arr as WardrobeItem['season'] };
    case 'occasion': return {
      occasion_tags: arr.map(l => OCCASION_TAGS.find(t => t.label === l)?.id ?? l),
    };
    case 'tags': return { tags: arr as unknown as WardrobeItem['tags'] };
    case 'purchase_date': return { purchase_date: value };
    default: return null; // size / wash_care 存入 ai_recognized_attrs（见 commit）
  }
}

// Bottom Sheet 的内部视图：pick=选择要补充的属性；edit=编辑某个属性
type SheetMode = 'pick' | 'edit';
// 打开来源：row=行内「修正」（编辑完直接关闭）；add=「+添加属性」（编辑完回到列表，支持连续添加）
type SheetOrigin = 'row' | 'add';

export interface AttributesModel {
  item: WardrobeItem;
  values: Record<string, string>;
  extras: string[];
  addableDefs: AttrDef[];
  coreKeys: string[];
  // 行/入口
  openRowEditor: (key: string) => void;
  openAddPicker: () => void;
  handleRemove: (key: string) => void;
  aiBadgeVisible: (key: string) => boolean;
  // sheet 状态
  sheetOpen: boolean;
  sheetMode: SheetMode;
  sheetKey: string | null;
  sheetOrigin: SheetOrigin;
  closeSheet: () => void;
  backToPick: () => void;
  pickAttrToAdd: (key: string) => void;
  handleSinglePicked: (key: string, value: string) => void;
  handleTextSaved: (key: string, value: string) => void;
  handleMultiToggled: (key: string, value: string) => void;
  handleMultiDone: () => void;
}

/**
 * 属性编辑的共享状态与逻辑。
 * 列表（ItemAttributesCard）在滚动内容里渲染，编辑弹层（ItemAttributesSheet）在
 * 屏幕根部渲染以充满「手机容器」，两者共享同一个 model，避免弹层用 RN Modal
 * 逃逸到 document.body 造成「超出手机容器」。
 */
export function useItemAttributes(
  item: WardrobeItem,
  onUpdate: (updates: Partial<WardrobeItem>) => void,
): AttributesModel {
  // 从单品已有数据里回填所有属性值 —— 保证「离开再进来」时，之前补充过的属性
  // 依然显示（此前仅回填了核心两项，导致非核心属性看起来「消失」了）。
  const [values, setValues] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    ATTR_DEFS.forEach(d => {
      const v = readValue(item, d.key);
      if (v || CORE_KEYS.includes(d.key)) seed[d.key] = v;
    });
    return seed;
  });
  // extras：所有「有值的非核心属性」都要作为已添加的行展示。
  const [extras, setExtras] = useState<string[]>(() =>
    ATTR_DEFS.filter(d => !d.aiCore && !!readValue(item, d.key)).map(d => d.key),
  );

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<SheetMode>('edit');
  const [sheetKey, setSheetKey] = useState<string | null>(null);
  const [sheetOrigin, setSheetOrigin] = useState<SheetOrigin>('row');

  const addableDefs = useMemo(
    () => ATTR_DEFS.filter(d => !d.aiCore && !extras.includes(d.key)),
    [extras],
  );

  const commit = (key: string, value: string) => {
    setValues(v => ({ ...v, [key]: value }));
    // 仅在真正写入有效值时，才把非核心属性加入列表；空值不落地、不新增空行
    if (value && !CORE_KEYS.includes(key)) {
      setExtras(e => (e.includes(key) ? e : [...e, key]));
    }
    const upd = toUpdate(key, value);
    const existing: Record<string, unknown> & {
      recognized_fields?: string[];
      manual_fields?: string[];
    } = item.ai_recognized_attrs ?? {};
    const manual_fields = Array.from(new Set([...(existing.manual_fields ?? []), key]));
    // size / wash_care 没有独立数据库列，持久化到已存在的 ai_recognized_attrs JSON 列，
    // 保证离开详情页再进来时仍能读回（配合 store 的乐观更新）。
    const localExtra: Record<string, unknown> = {};
    if (key === 'size' || key === 'wash_care') localExtra[key] = value;
    onUpdate({
      ...(upd ?? {}),
      ai_recognized_attrs: { ...existing, ...localExtra, manual_fields },
    });
  };

  const closeSheet = () => { setSheetOpen(false); setSheetKey(null); };
  const backToPick = () => { setSheetMode('pick'); setSheetKey(null); };

  const openRowEditor = (key: string) => {
    setSheetOrigin('row'); setSheetMode('edit'); setSheetKey(key); setSheetOpen(true);
  };
  const openAddPicker = () => {
    setSheetOrigin('add'); setSheetMode('pick'); setSheetKey(null); setSheetOpen(true);
  };
  const pickAttrToAdd = (key: string) => {
    const existing = readValue(item, key);
    if (existing) setValues(v => ({ ...v, [key]: existing }));
    // 不在此处加入 extras：只有真正保存了有效值后（commit）才落地为属性行，
    // 避免用户点开却未填写就留下空行，产生「没填也提交成功」的错觉。
    setSheetMode('edit'); setSheetKey(key);
  };

  const afterCommitFlow = () => {
    // 设置完一个属性的值后直接收起整个弹层（不再停留在「添加属性」列表）。
    // 若需继续补充，再次点「+ 添加属性」即可；编辑中想换一个属性可用头部「返回」。
    closeSheet();
  };

  const handleSinglePicked = (key: string, value: string) => {
    commit(key, value);
    if (value) showToast(`已更新${DEF_MAP[key].label}`, 'success');
    afterCommitFlow();
  };
  const handleTextSaved = (key: string, value: string) => {
    commit(key, value);
    if (value) showToast(`已更新${DEF_MAP[key].label}`, 'success');
    afterCommitFlow();
  };
  const handleMultiToggled = (key: string, value: string) => { commit(key, value); };
  const handleMultiDone = () => { afterCommitFlow(); };

  const handleRemove = (key: string) => {
    setExtras(e => e.filter(k => k !== key));
    if (sheetKey === key) closeSheet();
  };

  const aiBadgeVisible = (key: string) => {
    const manualFields = item.ai_recognized_attrs?.manual_fields ?? [];
    const recognizedFields = item.ai_recognized_attrs?.recognized_fields ?? [];
    const hasValue = !!(values[key] ?? '');
    return recognizedFields.includes(key) && !manualFields.includes(key) && hasValue;
  };

  return {
    item, values, extras, addableDefs, coreKeys: CORE_KEYS,
    openRowEditor, openAddPicker, handleRemove, aiBadgeVisible,
    sheetOpen, sheetMode, sheetKey, sheetOrigin,
    closeSheet, backToPick, pickAttrToAdd,
    handleSinglePicked, handleTextSaved, handleMultiToggled, handleMultiDone,
  };
}

// ============ 列表卡片（放在滚动内容里）============
export function ItemAttributesCard({ model }: { model: AttributesModel }) {
  const { values, extras, addableDefs, coreKeys, openRowEditor, openAddPicker, handleRemove, aiBadgeVisible } = model;

  const renderRow = (key: string, showBorder: boolean, canRemove: boolean) => (
    <AttrRow
      key={key}
      def={DEF_MAP[key]}
      value={values[key] ?? ''}
      showBorder={showBorder}
      showAiBadge={aiBadgeVisible(key)}
      onPress={() => openRowEditor(key)}
      onRemove={canRemove ? () => handleRemove(key) : undefined}
    />
  );

  return (
    <View style={{ gap: Spacing.three }}>
      <View style={styles.card}>
        {coreKeys.map((key, i) => renderRow(key, i < coreKeys.length - 1 || extras.length > 0, false))}
        {extras.map((key, i) => renderRow(key, i < extras.length - 1, true))}
      </View>

      {addableDefs.length > 0 ? (
        <TouchableOpacity style={styles.addBtn} activeOpacity={0.7} onPress={openAddPicker}>
          <Text style={styles.addBtnPlus}>＋</Text>
          <Text style={styles.addBtnText}>添加属性</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ============ 底部编辑弹层（放在屏幕根部，充满手机容器）============
export function ItemAttributesSheet({ model }: { model: AttributesModel }) {
  const insets = useSafeAreaInsets();
  const {
    item, values, addableDefs, sheetOpen, sheetMode, sheetKey, sheetOrigin,
    closeSheet, backToPick, pickAttrToAdd,
    handleSinglePicked, handleTextSaved, handleMultiToggled, handleMultiDone,
  } = model;

  if (!sheetOpen) return null;
  const sheetDef = sheetKey ? DEF_MAP[sheetKey] : null;

  return (
    <View style={styles.portal}>
      <View style={styles.frame}>
        <Pressable style={styles.backdrop} onPress={closeSheet} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, Spacing.three) }]}>
          <View style={styles.sheetHandle} />

          <View style={styles.sheetHeader}>
            {sheetMode === 'edit' && sheetOrigin === 'add' ? (
              <TouchableOpacity style={styles.sheetSide} onPress={backToPick}>
                <Text style={styles.sheetBackText}>‹ 返回</Text>
              </TouchableOpacity>
            ) : <View style={styles.sheetSide} />}
            <Text style={styles.sheetTitle} numberOfLines={1}>
              {sheetMode === 'pick'
                ? '添加属性'
                : `${sheetDef?.aiCore ? '修正' : '编辑'}${sheetDef?.label ?? ''}`}
            </Text>
            <TouchableOpacity style={[styles.sheetSide, styles.sheetSideRight]} onPress={closeSheet} accessibilityLabel="关闭">
              <Text style={styles.sheetCloseText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetBody}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {sheetMode === 'pick' ? (
              <PickPanel
                defs={addableDefs}
                hasValue={(k) => !!readValue(item, k)}
                onPick={pickAttrToAdd}
              />
            ) : sheetDef ? (
              <SheetEditor
                key={sheetKey!}
                def={sheetDef}
                initial={values[sheetKey!] ?? readValue(item, sheetKey!)}
                onSinglePicked={(val) => handleSinglePicked(sheetKey!, val)}
                onTextSaved={(val) => handleTextSaved(sheetKey!, val)}
                onMultiToggled={(val) => handleMultiToggled(sheetKey!, val)}
                onMultiDone={handleMultiDone}
              />
            ) : null}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

// ---------- 单行 ----------
function AttrRow({ def, value, showBorder, showAiBadge, onPress, onRemove }: {
  def: AttrDef; value: string; showBorder: boolean; showAiBadge?: boolean;
  onPress: () => void; onRemove?: () => void;
}) {
  return (
    <View style={[styles.row, showBorder && styles.rowBorder]}>
      <TouchableOpacity style={styles.rowMain} activeOpacity={0.6} onPress={onPress}>
        <View style={styles.rowLabelWrap}>
          <Text style={styles.rowLabel}>{def.label}</Text>
          {showAiBadge ? <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>AI 识别</Text></View> : null}
        </View>
        <View style={styles.rowValueWrap}>
          {value ? (
            <>
              <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
              <Text style={styles.rowChevron}>›</Text>
            </>
          ) : (
            <Text style={styles.rowUnset}>{def.aiCore ? '待识别 · 点击补充' : '点击填写'}</Text>
          )}
        </View>
      </TouchableOpacity>
      {onRemove ? (
        <TouchableOpacity style={styles.removeBtn} activeOpacity={0.6} onPress={onRemove}>
          <Text style={styles.removeText}>✕</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ---------- 选择要补充的属性 ----------
function PickPanel({ defs, hasValue, onPick }: {
  defs: AttrDef[]; hasValue: (k: string) => boolean; onPick: (key: string) => void;
}) {
  return (
    <View style={{ gap: Spacing.two }}>
      <Text style={styles.pickerHint}>选择要补充的信息，标记 ● 的已有内容</Text>
      <View style={styles.chipsWrap}>
        {defs.map(d => (
          <TouchableOpacity
            key={d.key} style={styles.pickChip} activeOpacity={0.7}
            onPress={() => onPick(d.key)}
          >
            {hasValue(d.key) ? <View style={styles.dot} /> : null}
            <Text style={styles.pickChipText}>{d.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ---------- 弹层内的属性编辑区 ----------
function SheetEditor({ def, initial, onSinglePicked, onTextSaved, onMultiToggled, onMultiDone }: {
  def: AttrDef; initial: string;
  onSinglePicked: (value: string) => void;
  onTextSaved: (value: string) => void;
  onMultiToggled: (value: string) => void;
  onMultiDone: () => void;
}) {
  const [text, setText] = useState(initial);
  const [multi, setMulti] = useState<string[]>(
    initial ? initial.split('、').filter(Boolean) : [],
  );
  // 日期选择器（购入日期）：按年 / 月选择
  const initYM = parseYearMonth(initial);
  const [dateYear, setDateYear] = useState<number | null>(initYM.y);
  const [dateMonth, setDateMonth] = useState<number | null>(initYM.mo);

  const toggleMulti = (opt: string) => {
    setMulti(prev => {
      const next = prev.includes(opt) ? prev.filter(x => x !== opt) : [...prev, opt];
      onMultiToggled(next.join('、'));
      return next;
    });
  };

  if (def.kind === 'text') {
    const trimmed = text.trim();
    const isPrice = def.key === 'price';
    // 价格需为有效的非负数字；其余文本非空即可
    const priceInvalid = isPrice && trimmed.length > 0 && !(Number(trimmed) >= 0);
    const canSave = trimmed.length > 0 && !priceInvalid;
    const submit = () => { if (canSave) onTextSaved(trimmed); };
    return (
      <View style={{ gap: Spacing.two }}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          onSubmitEditing={submit}
          returnKeyType="done"
          keyboardType={isPrice ? 'numeric' : 'default'}
          placeholder={def.placeholder}
          placeholderTextColor={Colors.walnut2}
          autoFocus
        />
        <Text style={styles.inlineHint}>
          {priceInvalid ? '请输入有效的价格数字' : `请输入${def.label}，完成后点下方按钮`}
        </Text>
        <TouchableOpacity
          style={[styles.primaryBtn, !canSave && styles.primaryBtnDisabled]}
          activeOpacity={0.8}
          disabled={!canSave}
          onPress={submit}
        >
          <Text style={styles.primaryBtnText}>完成</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (def.kind === 'date') {
    const nowYear = new Date().getFullYear();
    const years = Array.from({ length: 12 }, (_, i) => nowYear - i);
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    const canSave = dateYear !== null && dateMonth !== null;
    const submit = () => {
      if (!canSave) return;
      onTextSaved(`${dateYear}-${String(dateMonth).padStart(2, '0')}`);
    };
    return (
      <View style={{ gap: Spacing.three }}>
        <Text style={styles.inlineHint}>年份</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.editChipsRow}>
            {years.map(y => {
              const active = dateYear === y;
              return (
                <TouchableOpacity
                  key={y}
                  style={[styles.editChip, active && styles.editChipActive]}
                  activeOpacity={0.7}
                  onPress={() => setDateYear(y)}
                >
                  <Text style={[styles.editChipText, active && styles.editChipTextActive]}>{y}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        <Text style={styles.inlineHint}>月份</Text>
        <View style={styles.editChips}>
          {months.map(mo => {
            const active = dateMonth === mo;
            return (
              <TouchableOpacity
                key={mo}
                style={[styles.editChip, active && styles.editChipActive]}
                activeOpacity={0.7}
                onPress={() => setDateMonth(mo)}
              >
                <Text style={[styles.editChipText, active && styles.editChipTextActive]}>{mo} 月</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, !canSave && styles.primaryBtnDisabled]}
          activeOpacity={0.8}
          disabled={!canSave}
          onPress={submit}
        >
          <Text style={styles.primaryBtnText}>
            {canSave ? `完成（${dateYear}-${String(dateMonth).padStart(2, '0')}）` : '请选择年份和月份'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ gap: Spacing.three }}>
      <View style={styles.editChips}>
        {(def.options ?? []).map(opt => {
          const activeChip = def.kind === 'single' ? text === opt : multi.includes(opt);
          return (
            <TouchableOpacity
              key={opt}
              style={[styles.editChip, activeChip && styles.editChipActive]}
              activeOpacity={0.7}
              onPress={() => {
                if (def.kind === 'single') { setText(opt); onSinglePicked(opt); }
                else { toggleMulti(opt); }
              }}
            >
              <Text style={[styles.editChipText, activeChip && styles.editChipTextActive]}>{opt}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {def.kind === 'multi' ? (
        <>
          <Text style={styles.inlineHint}>可多选，点选即生效</Text>
          <TouchableOpacity style={styles.primaryBtn} activeOpacity={0.8} onPress={onMultiDone}>
            <Text style={styles.primaryBtnText}>完成{multi.length ? `（已选 ${multi.length}）` : ''}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <Text style={styles.inlineHint}>点选即生效并自动收起</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.paperCard, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.line, overflow: 'hidden', ...Shadow.one,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.lineSoft },
  rowMain: {
    flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 4,
  },
  rowLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  rowLabel: { ...T.formLabel },
  aiBadge: {
    backgroundColor: Colors.signalSoft, borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  aiBadgeText: { ...T.micro, color: Colors.terracotta, fontSize: 10 },
  rowValueWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, flexShrink: 1, maxWidth: '60%', justifyContent: 'flex-end' },
  rowValue: { ...T.itemName, flexShrink: 1 },
  rowUnset: { ...T.itemName, color: Colors.walnut2 },
  rowChevron: { ...T.micro, color: Colors.terracotta },
  removeBtn: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  removeText: { ...T.micro, color: Colors.walnut2, fontSize: 14 },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: Colors.lineStrong, borderStyle: 'dashed',
    borderRadius: Radius.md, paddingVertical: Spacing.two + 4,
    backgroundColor: Colors.paper,
  },
  addBtnPlus: { ...T.itemName, color: Colors.terracotta, fontSize: 18 },
  addBtnText: { ...T.buttonSecondary, color: Colors.walnut },

  // Bottom Sheet — 在手机容器内绝对定位，不用 RN Modal（避免逃逸到 document.body）
  portal: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 240,
  },
  frame: {
    flex: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,10,10,0.32)',
  },
  sheet: {
    backgroundColor: Colors.paperCard,
    borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    overflow: 'hidden',
    borderTopWidth: 1, borderColor: Colors.lineSoft,
    ...Shadow.three,
  },
  sheetHandle: {
    alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.lineStrong, marginTop: Spacing.two, marginBottom: Spacing.one,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.three, paddingVertical: Spacing.two,
    borderBottomWidth: 1, borderBottomColor: Colors.lineSoft,
  },
  sheetSide: { minWidth: 56 },
  sheetSideRight: { alignItems: 'flex-end' },
  sheetBackText: { ...T.micro, color: Colors.walnut2 },
  sheetTitle: { ...T.formLabel, flex: 1, textAlign: 'center' },
  sheetCloseText: { ...T.micro, color: Colors.walnut2, fontSize: 16 },
  // 弹层高度随内容自适应：内容少则贴合内容，超过 maxHeight 才在内部滚动
  sheetScroll: { flexGrow: 0, maxHeight: 420 },
  sheetBody: { padding: Spacing.three },

  pickerHint: { ...T.micro, color: Colors.walnut2 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  pickChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderColor: Colors.lineStrong, borderRadius: 20,
    paddingHorizontal: Spacing.three, paddingVertical: 7, backgroundColor: Colors.paper,
  },
  pickChipText: { ...T.tag, color: Colors.ink },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.terracotta },

  inlineHint: { ...T.micro, color: Colors.walnut2 },
  input: {
    ...T.inputText, backgroundColor: Colors.paper, borderWidth: 1, borderColor: Colors.line,
    borderRadius: Radius.md, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2, color: Colors.ink,
  },
  editChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  editChipsRow: { flexDirection: 'row', gap: Spacing.two, paddingRight: Spacing.two },
  editChip: {
    borderWidth: 1, borderColor: Colors.lineStrong, borderRadius: 20,
    paddingHorizontal: Spacing.three, paddingVertical: 7, backgroundColor: Colors.paper,
  },
  editChipActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  editChipText: { ...T.tag, color: Colors.ink },
  editChipTextActive: { color: Colors.paper },

  primaryBtn: {
    backgroundColor: Colors.ink, borderRadius: Radius.md,
    paddingVertical: Spacing.two + 4, alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText: { ...T.buttonSecondary, color: Colors.paper },
});
