import React, { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  TextInput,
} from 'react-native';
import { Colors, Spacing, Radius, Shadow, T } from '@/constants/theme';
import { showToast } from '@/components/Toast';
import {
  WardrobeItem, OCCASION_TAGS, STYLE_TAGS, CLOTHING_CATEGORIES,
} from '@/types';

type EditorKind = 'text' | 'single' | 'multi';

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
  { key: 'material', label: '材质', kind: 'single', aiCore: true, placeholder: '如：牛仔布',
    options: ['棉', '亚麻', '牛仔布', '羊毛', '针织', '雪纺', '皮革', '涤纶', '丝绸', '灯芯绒'] },
  { key: 'fit_type', label: '版型', kind: 'single', aiCore: true, placeholder: '如：直筒',
    options: ['修身', '合身', '直筒', '宽松', 'Oversize', 'A 型', 'H 型', 'X 型'] },
  { key: 'brand', label: '品牌', kind: 'text', placeholder: '请输入品牌' },
  { key: 'price', label: '价格', kind: 'text', placeholder: '请输入价格（元）' },
  { key: 'color', label: '颜色', kind: 'text', placeholder: '如：蓝色' },
  { key: 'category', label: '分类', kind: 'single', options: [...CLOTHING_CATEGORIES] },
  { key: 'size', label: '尺码', kind: 'single', options: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '均码'] },
  { key: 'season', label: '季节', kind: 'multi', options: ['春', '夏', '秋', '冬', '四季'] },
  { key: 'occasion', label: '场合', kind: 'multi', options: OCCASION_TAGS.map(t => t.label) },
  { key: 'tags', label: '标签', kind: 'multi', options: STYLE_TAGS.map(t => t.label) },
  { key: 'wash_care', label: '洗涤维护', kind: 'text', placeholder: '如：机洗 / 手洗 / 干洗' },
  { key: 'purchase_date', label: '购入日期', kind: 'text', placeholder: '如：2025-06' },
];

const DEF_MAP: Record<string, AttrDef> = Object.fromEntries(ATTR_DEFS.map(d => [d.key, d]));

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
    case 'purchase_date': return item.purchase_date
      ? new Date(item.purchase_date).toLocaleDateString('zh-CN') : '';
    default: return '';
  }
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
    default: return null; // size / wash_care / purchase_date 仅本地
  }
}

interface Props {
  item: WardrobeItem;
  onUpdate: (updates: Partial<WardrobeItem>) => void;
}

export function ItemAttributes({ item, onUpdate }: Props) {
  // 本地展示值：核心两项 + 用户已添加的属性
  const [values, setValues] = useState<Record<string, string>>(() => ({
    material: readValue(item, 'material'),
    fit_type: readValue(item, 'fit_type'),
  }));
  // 已加入列表的「其他属性」key（核心两项始终展示，不在此列）
  const [extras, setExtras] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null); // 正在编辑的 attr key

  const addableDefs = useMemo(
    () => ATTR_DEFS.filter(d => !d.aiCore && !extras.includes(d.key)),
    [extras],
  );

  const commit = (key: string, value: string) => {
    setValues(v => ({ ...v, [key]: value }));
    const upd = toUpdate(key, value);
    // 用户手动校准该属性：把 key 合并进 ai_recognized_attrs.manual_fields（浅合并保留既有元数据，去重）
    const existing: Record<string, unknown> & { manual_fields?: string[] } =
      item.ai_recognized_attrs ?? {};
    const manual_fields = Array.from(new Set([...(existing.manual_fields ?? []), key]));
    onUpdate({
      ...(upd ?? {}),
      ai_recognized_attrs: { ...existing, manual_fields },
    });
  };

  const handleAddAttr = (key: string) => {
    // 统一流程：加入列表 → 就地展开编辑区（有值回填、空值待填）
    const existing = readValue(item, key);
    setValues(v => (existing ? { ...v, [key]: existing } : v));
    setExtras(e => (e.includes(key) ? e : [...e, key]));
    setPickerOpen(false);
    setEditing(key);
  };

  // 即点即选 / 即时输入的即时写入（无「保存」按钮）
  const handleCommit = (key: string, value: string) => {
    commit(key, value);
    const def = DEF_MAP[key];
    // 单选/文本类给一次轻提示；多选逐次切换不打扰
    if (def.kind !== 'multi' && value) {
      showToast(`已更新${def.label}`, 'success');
    }
  };

  const toggleEditing = (key: string) => {
    // 同一时间只展开一个属性的编辑区
    setEditing(prev => (prev === key ? null : key));
  };

  const handleRemove = (key: string) => {
    setExtras(e => e.filter(k => k !== key));
    setEditing(prev => (prev === key ? null : prev));
  };

  const coreKeys = ['material', 'fit_type'];

  // 渲染一行 + 其就地展开的编辑区（accordion）
  const renderRow = (key: string, showBorder: boolean, canRemove: boolean) => {
    const isEditing = editing === key;
    // 「AI 识别」标签：核心属性且未被用户手动校准过时才显示
    const manualFields = item.ai_recognized_attrs?.manual_fields ?? [];
    const showAiBadge = !!DEF_MAP[key].aiCore && !manualFields.includes(key);
    return (
      <React.Fragment key={key}>
        <AttrRow
          def={DEF_MAP[key]}
          value={values[key] ?? ''}
          showBorder={isEditing ? false : showBorder}
          active={isEditing}
          showAiBadge={showAiBadge}
          onPress={() => toggleEditing(key)}
          onRemove={canRemove ? () => handleRemove(key) : undefined}
        />
        {isEditing ? (
          <AttrInlineEditor
            def={DEF_MAP[key]}
            initial={values[key] ?? readValue(item, key)}
            showBorder={showBorder}
            onCommit={(val) => handleCommit(key, val)}
            onClose={() => setEditing(null)}
          />
        ) : null}
      </React.Fragment>
    );
  };

  return (
    <View style={{ gap: Spacing.three }}>
      {/* 属性卡片 */}
      <View style={styles.card}>
        {coreKeys.map((key, i) =>
          renderRow(key, i < coreKeys.length - 1 || extras.length > 0, false),
        )}
        {extras.map((key, i) =>
          renderRow(key, i < extras.length - 1, true),
        )}
      </View>

      {/* 添加属性入口 */}
      {addableDefs.length > 0 ? (
        <TouchableOpacity
          style={styles.addBtn}
          activeOpacity={0.7}
          onPress={() => setPickerOpen(o => !o)}
        >
          <Text style={styles.addBtnPlus}>＋</Text>
          <Text style={styles.addBtnText}>添加属性</Text>
        </TouchableOpacity>
      ) : null}

      {/* 可添加属性选择面板 */}
      {pickerOpen && addableDefs.length > 0 ? (
        <View style={styles.pickerPanel}>
          <Text style={styles.pickerHint}>选择要补充的信息，标记 ● 的已由 AI 识别</Text>
          <View style={styles.chipsWrap}>
            {addableDefs.map(d => {
              const hasVal = !!readValue(item, d.key);
              return (
                <TouchableOpacity
                  key={d.key} style={styles.pickChip} activeOpacity={0.7}
                  onPress={() => handleAddAttr(d.key)}
                >
                  {hasVal ? <View style={styles.dot} /> : null}
                  <Text style={styles.pickChipText}>{d.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ---------- 单行 ----------
function AttrRow({ def, value, showBorder, active, showAiBadge, onPress, onRemove }: {
  def: AttrDef; value: string; showBorder: boolean; active?: boolean; showAiBadge?: boolean;
  onPress: () => void; onRemove?: () => void;
}) {
  return (
    <View style={[styles.row, showBorder && styles.rowBorder, active && styles.rowActive]}>
      <TouchableOpacity style={styles.rowMain} activeOpacity={0.6} onPress={onPress}>
        <View style={styles.rowLabelWrap}>
          <Text style={styles.rowLabel}>{def.label}</Text>
          {showAiBadge ? <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>AI 识别</Text></View> : null}
        </View>
        <View style={styles.rowValueWrap}>
          {value ? (
            <>
              <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
              <Text style={[styles.rowChevron, active && styles.rowChevronActive]}>
                {active ? '收起' : (def.aiCore ? '修正' : '›')}
              </Text>
            </>
          ) : (
            // 空值时只保留单一补充入口，整行可点击进入编辑，不再额外出现「修正」
            <Text style={styles.rowUnset}>
              {active ? '选择或填写…' : (def.aiCore ? '待识别 · 点击补充' : '点击填写')}
            </Text>
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

// ---------- 就地展开编辑区（accordion，无「取消/保存」按钮） ----------
function AttrInlineEditor({ def, initial, showBorder, onCommit, onClose }: {
  def: AttrDef; initial: string; showBorder: boolean;
  onCommit: (value: string) => void; onClose: () => void;
}) {
  const [text, setText] = useState(initial);
  const [multi, setMulti] = useState<string[]>(
    initial ? initial.split('、').filter(Boolean) : [],
  );

  // 自由文本/数值：失焦或提交即保存并收起
  const submitText = () => {
    onCommit(text.trim());
    onClose();
  };

  // 多选：逐次切换即时生效，保持展开以便继续增删
  const toggleMulti = (opt: string) => {
    setMulti(prev => {
      const next = prev.includes(opt) ? prev.filter(x => x !== opt) : [...prev, opt];
      onCommit(next.join('、'));
      return next;
    });
  };

  // 单选：点一下即写入并自动收起
  const pickSingle = (opt: string) => {
    setText(opt);
    onCommit(opt);
    onClose();
  };

  return (
    <View style={[styles.inlineEditor, showBorder && styles.rowBorder]}>
      {def.kind === 'text' && (
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          onBlur={submitText}
          onSubmitEditing={submitText}
          returnKeyType="done"
          placeholder={def.placeholder}
          placeholderTextColor={Colors.walnut2}
          autoFocus
        />
      )}

      {(def.kind === 'single' || def.kind === 'multi') && (
        <View style={styles.editChips}>
          {(def.options ?? []).map(opt => {
            const activeChip = def.kind === 'single' ? text === opt : multi.includes(opt);
            return (
              <TouchableOpacity
                key={opt}
                style={[styles.editChip, activeChip && styles.editChipActive]}
                activeOpacity={0.7}
                onPress={() => def.kind === 'single' ? pickSingle(opt) : toggleMulti(opt)}
              >
                <Text style={[styles.editChipText, activeChip && styles.editChipTextActive]}>{opt}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {def.kind === 'multi' ? (
        <Text style={styles.inlineHint}>可多选，点选即生效；点上方「收起」关闭</Text>
      ) : null}
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
  rowActive: { backgroundColor: Colors.paper },
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
  rowChevronActive: { color: Colors.walnut2 },
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

  pickerPanel: {
    backgroundColor: Colors.paperCard, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.line, padding: Spacing.three, gap: Spacing.two,
  },
  pickerHint: { ...T.micro, color: Colors.walnut2 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  pickChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderColor: Colors.lineStrong, borderRadius: 20,
    paddingHorizontal: Spacing.three, paddingVertical: 7, backgroundColor: Colors.paper,
  },
  pickChipText: { ...T.tag, color: Colors.ink },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.terracotta },

  // inline editor（就地展开编辑区）
  inlineEditor: {
    backgroundColor: Colors.paper,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    gap: Spacing.two,
  },
  inlineHint: { ...T.micro, color: Colors.walnut2 },
  input: {
    ...T.inputText, backgroundColor: Colors.paperCard, borderWidth: 1, borderColor: Colors.line,
    borderRadius: Radius.md, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2, color: Colors.ink,
  },
  editChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  editChip: {
    borderWidth: 1, borderColor: Colors.lineStrong, borderRadius: 20,
    paddingHorizontal: Spacing.three, paddingVertical: 7, backgroundColor: Colors.paper,
  },
  editChipActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  editChipText: { ...T.tag, color: Colors.ink },
  editChipTextActive: { color: Colors.paper },
});
