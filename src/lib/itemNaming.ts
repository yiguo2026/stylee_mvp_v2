// ─────────────────────────────────────────────────────────
// 单品标题统一生成规则（收敛原先散落在 importStore / styleeMapping / ai.ts 的命名逻辑）
//
// 目标：认得出、分得清、读着顺。
//   组装模板： [记忆点] + [颜色] + [细分品类]
//   长度上限： 10 个字（按码点计），超预算时整块丢弃低优先级修饰词，绝不切断词。
//   去重：     衣橱内同名时，优先追加序号后缀，且仍保证 ≤10 字。
// ─────────────────────────────────────────────────────────

/** 标题最大长度（汉字/码点数） */
export const ITEM_NAME_MAX_LEN = 10;

export interface NameableAttrs {
  category: string;
  color?: string;
  material?: string;
  style?: string;
  fit_type?: string;
  sleeve_length?: string;
  description?: string;
  brand?: string;
  /** 未来：识别模型直接产出的自然短名，优先使用（当前服务未返回时留空即可） */
  preferredName?: string;
}

// 细分品类词库：从 description / style 里挖出「人话品类」，替代粗糙的 上装/下装。
// find() 按数组顺序命中，故此处已按「长词在前」排列，避免「牛仔外套」被「外套」抢先。
const SUB_CATEGORY_WORDS: string[] = [
  // 外套（长词优先）
  '牛仔外套', '羽绒服', '冲锋衣', '棒球服', '风衣', '大衣', '夹克', '西装外套', '西装', '棉服', '皮衣', '斗篷',
  // 上装
  'Polo衫', '打底衫', '针织衫', '连帽衫', '衬衫', 'T恤', '卫衣', '毛衣', '开衫', '马甲', '背心', '吊带', '上衣',
  // 连体
  '连衣裙', '吊带裙', '半身裙', '连体裤', '背带裤', '衬衫裙',
  // 下装
  '牛仔裤', '阔腿裤', '西装裤', '运动裤', '休闲裤', '工装裤', '铅笔裤', '直筒裤', '短裤', '长裤', '裙裤',
  // 鞋履
  '老爹鞋', '小白鞋', '运动鞋', '帆布鞋', '乐福鞋', '高跟鞋', '马丁靴', '切尔西靴', '短靴', '长靴', '靴子', '凉鞋', '拖鞋', '皮鞋', '穆勒鞋',
  // 包袋
  '托特包', '斜挎包', '双肩包', '手提包', '链条包', '水桶包', '腋下包', '手拿包', '腰包',
  // 帽巾
  '棒球帽', '鸭舌帽', '贝雷帽', '渔夫帽', '针织帽', '草帽', '围巾', '丝巾', '披肩', '帽子',
  // 配饰
  '腰带', '墨镜', '项链', '耳环', '手链',
].sort((a, b) => [...b].length - [...a].length);

// 粗品类的自然兜底词（识别不到细分品类时用）
const COARSE_DEFAULT: Record<string, string> = {
  上装: '上衣',
  下装: '裤装',
  连体装: '连衣裙',
  外套: '外套',
  鞋履: '鞋',
  包袋: '包',
  帽巾: '帽饰',
  配饰: '配饰',
};

// 记忆点词库（按辨识度优先级：图案 > 廓形/版型 > 风格 > 材质）
const PATTERN_WORDS: string[] = [
  '千鸟格', '格纹', '碎花', '条纹', '波点', '印花', '拼色', '撞色', '扎染', '豹纹', '刺绣', '蕾丝', '镂空',
];

// 版型/廓形：仅取有辨识度的，跳过「修身/常规合身/宽松」这类无记忆点的
const FIT_MEMORY: Record<string, string> = {
  泡泡袖: '泡泡袖', 短款露脐: '短款', 方领: '方领', v领: 'V领',
  A字摆: 'A字', 茧型: '茧型', 伞型: '伞型', 鱼尾: '鱼尾', 包臀: '包臀',
  高腰: '高腰', 微喇: '微喇', 直筒裤: '直筒', 直筒裙: '直筒', 阔腿: '阔腿',
  束脚: '束脚', 廓形: '廓形', 落肩: '落肩', 垫肩: '垫肩',
};

const STYLE_MEMORY_WORDS: string[] = [
  '法式', '复古', '学院', '街头', '极简', '甜美', '工装', '运动', '度假', '老钱',
  '港风', '日系', '美式', '慵懒', '田园', '机能', '西部', '哥特', '浪漫', '先锋',
];

// 有辨识度的材质（跳过 纯棉/涤纶/棉混纺 等泛材质）
const MATERIAL_MEMORY: string[] = [
  '牛仔', '针织', '羊绒', '真丝', '灯芯绒', '亚麻', '羊毛', '雪纺', '丝绒', '摇粒绒', '醋酸', '皮',
];

const cpLen = (s: string) => [...s].length;
const cpClamp = (s: string, n: number) => [...s].slice(0, n).join('');
const clean = (s?: string) => (s || '').trim();

/** 从一段文本里按词库挑出第一个命中的词 */
function pickWord(text: string, words: string[]): string {
  if (!text) return '';
  return words.find(w => text.includes(w)) || '';
}

/** 推断细分品类 */
function resolveSubCategory(attrs: NameableAttrs): string {
  const hint = `${clean(attrs.description)} ${clean(attrs.style)}`;
  const hit = pickWord(hint, SUB_CATEGORY_WORDS);
  if (hit) return hit;
  return COARSE_DEFAULT[clean(attrs.category)] || clean(attrs.category) || '单品';
}

/** 挑一个（且仅一个）记忆点 */
function resolveMemory(attrs: NameableAttrs, subCat: string, colorW: string): string {
  const hint = `${clean(attrs.description)} ${clean(attrs.style)}`;
  // 1) 图案
  let m = pickWord(hint, PATTERN_WORDS);
  // 2) 版型/廓形
  if (!m) m = FIT_MEMORY[clean(attrs.fit_type)] || '';
  // 3) 风格
  if (!m) m = pickWord(hint, STYLE_MEMORY_WORDS);
  // 4) 材质（若品类词里已含该材质则跳过，避免「牛仔牛仔裤」）
  if (!m) {
    const mat = pickWord(`${clean(attrs.material)} ${hint}`, MATERIAL_MEMORY);
    if (mat && !subCat.includes(mat)) m = mat;
  }
  // 去重：记忆点不得与颜色/品类重复
  if (!m) return '';
  if (m === colorW || subCat.includes(m) || m === subCat) return '';
  return m;
}

/**
 * 生成单品标题（≤10 字）。
 * 优先级：模型自然名 preferredName > 规则拼装 [记忆点+颜色+细分品类]。
 */
export function buildItemName(attrs: NameableAttrs): string {
  // 0) 模型直接给的自然名优先（未来 model-service 返回 name 时启用）
  const preferred = clean(attrs.preferredName);
  if (preferred) {
    return cpLen(preferred) <= ITEM_NAME_MAX_LEN ? preferred : cpClamp(preferred, ITEM_NAME_MAX_LEN);
  }

  const subCat = resolveSubCategory(attrs);
  let colorW = clean(attrs.color);
  if (colorW === '未知') colorW = '';
  const memory = resolveMemory(attrs, subCat, colorW);

  // 按 [颜色+记忆点+品类] 组装（颜色在前更符合中文语感）；
  // 超预算时依次丢弃：记忆点 → 颜色，品类永远保留。
  const full = [colorW, memory, subCat].filter(Boolean).join('');
  if (cpLen(full) <= ITEM_NAME_MAX_LEN) return full || '单品';

  const noMem = [colorW, subCat].filter(Boolean).join('');
  if (cpLen(noMem) <= ITEM_NAME_MAX_LEN) return noMem || '单品';

  return (cpLen(subCat) <= ITEM_NAME_MAX_LEN ? subCat : cpClamp(subCat, ITEM_NAME_MAX_LEN)) || '单品';
}

/**
 * 同名去重：若 name 已存在于 existing，追加序号后缀（保证结果仍 ≤10 字）。
 * 仅在追加后超长时，才从末尾轻微裁剪基名腾出空间（现实中极少触发）。
 */
export function ensureUniqueName(
  name: string,
  existing: Set<string> | Iterable<string>,
  maxLen = ITEM_NAME_MAX_LEN,
): string {
  const set = existing instanceof Set ? existing : new Set(existing);
  if (!set.has(name)) return name;
  for (let n = 2; n < 999; n++) {
    const suffix = String(n);
    const allow = maxLen - suffix.length;
    const base = cpLen(name) > allow ? cpClamp(name, allow) : name;
    const candidate = `${base}${suffix}`;
    if (!set.has(candidate)) return candidate;
  }
  return name;
}
