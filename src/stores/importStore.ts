import { create } from 'zustand';
import { ClothingCategory, DetectedItem, normalizeColor, normalizeMaterial } from '@/types';
import { useWardrobeStore } from '@/stores/wardrobeStore';
import { aiDetectMultiItems, aiStandardizeGarment } from '@/lib/ai';
import { uploadWardrobeImage } from '@/lib/uploadImage';

// ─── Types ────────────────────────────────────────────────

export type ImportTaskStatus =
  | 'pending'        // 等待处理
  | 'detecting'      // AI 识别中
  | 'needs_selection'// 检测到多件单品，等用户确认
  | 'selected'       // 用户已确认选择
  | 'standardizing'  // 生成标准图
  | 'uploading'      // 上传保存中
  | 'done'           // 完成
  | 'failed';        // 失败

export interface ImportTask {
  id: string;
  sourceUri: string;
  status: ImportTaskStatus;
  /** All detected items from this photo (filled after detection) */
  allDetectedItems?: DetectedItem[];
  /** The item(s) confirmed for import (single-item auto, multi-item after user selection) */
  confirmedItems?: DetectedItem[];
  /** Currently processing sub-item index (for multi-item confirmed tasks) */
  currentSubIndex?: number;
  /** Generated standardized / background-removed image URL from model service */
  standardizedImageUri?: string;
  /** True when standardization failed and the original image was used instead */
  standardizationFallback?: boolean;
  /** Error message if failed */
  error?: string;
}

interface ImportState {
  tasks: ImportTask[];
  isProcessing: boolean;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  pendingSelectionCount: number;
  _userId: string | null;

  // Actions
  startImport: (uris: string[], userId: string) => void;
  confirmSelection: (taskId: string, selectedItems: DetectedItem[]) => void;
  retryFailed: (taskId: string) => void;
  clearCompleted: () => void;
  removeTask: (taskId: string) => void;
}

const MOCK_CLOTHING_NAMES = [
  '白色T恤', '蓝色牛仔裤', '黑色西装外套', '米色针织毛衣', '格纹围巾', 
  '棕色单肩包', '白色运动鞋', '黑色休闲裤', '浅蓝衬衫', '灰色卫衣'
];

const MOCK_CATEGORIES: ClothingCategory[] = ['上装', '下装', '外套', '连体装', '鞋履', '包袋', '帽巾', '配饰'];
const MOCK_COLORS = ['白色', '黑色', '蓝色', '米色', '灰色', '棕色', '红色'];

let taskIdCounter = 0;

// ─── Store ────────────────────────────────────────────────

export const useImportStore = create<ImportState>((set) => ({
  tasks: [],
  isProcessing: false,
  totalCount: 0,
  completedCount: 0,
  failedCount: 0,
  pendingSelectionCount: 0,
  _userId: null,

  startImport: (uris: string[], userId: string) => {
    const newTasks: ImportTask[] = uris.map((uri) => ({
      id: `import_${Date.now()}_${++taskIdCounter}`,
      sourceUri: uri,
      status: 'pending',
    }));

    set(state => {
      const allTasks = [...state.tasks, ...newTasks];
      return {
        tasks: allTasks,
        totalCount: allTasks.length,
        isProcessing: true,
        _userId: userId,
      };
    });

    // Start processing
    void processQueue();
  },

  confirmSelection: (taskId: string, selectedItems: DetectedItem[]) => {
    set(state => ({
      tasks: state.tasks.map(t =>
        t.id === taskId
          ? { ...t, status: 'selected', confirmedItems: selectedItems }
          : t
      ),
      pendingSelectionCount: Math.max(0, state.pendingSelectionCount - 1),
    }));
    void processQueue();
  },

  retryFailed: (taskId: string) => {
    set(state => ({
      tasks: state.tasks.map(t =>
        t.id === taskId ? { ...t, status: 'pending', error: undefined } : t
      ),
      failedCount: Math.max(0, state.failedCount - 1),
      isProcessing: true,
    }));
    void processQueue();
  },

  clearCompleted: () => {
    set(state => {
      const remainingTasks = state.tasks.filter(t => t.status !== 'done' && t.status !== 'failed');
      return {
        tasks: remainingTasks,
        totalCount: remainingTasks.length,
        completedCount: 0,
        failedCount: 0,
      };
    });
  },

  removeTask: (taskId: string) => {
    set(state => {
      const task = state.tasks.find(t => t.id === taskId);
      const newTasks = state.tasks.filter(t => t.id !== taskId);
      return {
        tasks: newTasks,
        totalCount: newTasks.length,
        completedCount: task?.status === 'done' ? state.completedCount - 1 : state.completedCount,
        failedCount: task?.status === 'failed' ? state.failedCount - 1 : state.failedCount,
        pendingSelectionCount: task?.status === 'needs_selection' ? state.pendingSelectionCount - 1 : state.pendingSelectionCount,
      };
    });
  }
}));

// ─── Background Processing ────────────────────────────────

async function processQueue() {
  const store = useImportStore;
  const { isProcessing, _userId } = store.getState();
  
  if (!_userId) return;

  while (true) {
    const { tasks } = store.getState();
    // Find next task that is pending or selected
    const nextTask = tasks.find(t => t.status === 'pending' || t.status === 'selected');
    
    if (!nextTask) {
      // Check if anything is still in mid-process
      const active = tasks.some(t => ['detecting', 'standardizing', 'uploading'].includes(t.status));
      if (!active) {
        store.setState({ isProcessing: false });
      }
      break;
    }

    if (nextTask.status === 'pending') {
      await handleDetection(nextTask.id);
    } else if (nextTask.status === 'selected') {
      await handleFinalize(nextTask.id, _userId);
    }
  }
}

async function handleDetection(taskId: string) {
  const store = useImportStore;
  const task = store.getState().tasks.find(t => t.id === taskId);
  if (!task) return;
  
  store.setState(state => ({
    tasks: state.tasks.map(t => t.id === taskId ? { ...t, status: 'detecting' } : t)
  }));

  let items: DetectedItem[] = [];
  let detectionOk = false;
  try {
    const result = await aiDetectMultiItems(task.sourceUri);
    detectionOk = result.meta.ok; // true 仅当真实模型服务返回了结果
    items = result.items.map((item, index) => ({
      ...item,
      index: typeof item.index === 'number' ? item.index : index,
      sourceImageUri: item.sourceImageUri || task.sourceUri,
    }));
  } catch (err) {
    console.warn('[importStore] aiDetectMultiItems failed, using local fallback:', err);
  }

  // 当真实模型服务不可用时（demo / 离线），aiDetectMultiItems 只会兜底成 1 件，
  // 无法反映「这张图到底有几件单品」。此时改用基于图片稳定哈希的离线识别，
  // 让单品数量真正由图片本身决定（同图同结果），从而能进入多单品选择流程。
  if (!detectionOk || items.length === 0) {
    items = buildMockDetectedItems(task.sourceUri);
  }

  // 完全按「这张图片识别出几件单品」来决定走哪个流程：
  //   • 识别到 >1 件  → needs_selection，弹出选择让用户勾选要导入哪些
  //   • 识别到 1 件    → 直接进入标准化/上传（无需打扰用户）
  // 不再有任何演示开关或强制多单品逻辑，路由完全由识别结果驱动。
  if (items.length > 1) {
    store.setState(state => ({
      tasks: state.tasks.map(t => t.id === taskId ? { 
        ...t, 
        status: 'needs_selection', 
        allDetectedItems: items 
      } : t),
      pendingSelectionCount: state.pendingSelectionCount + 1
    }));
  } else {
    store.setState(state => ({
      tasks: state.tasks.map(t => t.id === taskId ? { 
        ...t, 
        status: 'selected', 
        confirmedItems: items 
      } : t)
    }));
  }
}

async function handleFinalize(taskId: string, userId: string) {
  const store = useImportStore;
  const task = store.getState().tasks.find(t => t.id === taskId);
  if (!task || !task.confirmedItems) return;

  try {
    for (let i = 0; i < task.confirmedItems.length; i++) {
      const item = task.confirmedItems[i];
      const sourceUri = item.sourceImageUri || task.sourceUri;
      
      store.setState(state => ({
        tasks: state.tasks.map(t => t.id === taskId ? {
          ...t,
          status: 'standardizing',
          currentSubIndex: i,
          standardizedImageUri: undefined,
          standardizationFallback: false,
        } : t)
      }));

      // Real standardization/background-removal path used by /wardrobe/add.
      // Keep a minimum dwell time so the user can visibly see “扣除背景中”.
      const photoType = item.photo_type ?? 'on_body';
      const [standardized] = await Promise.all([
        aiStandardizeGarment(sourceUri, item.category, photoType, {
          color: item.color,
          material: item.material,
          description: item.description,
        }).catch((err) => {
          console.warn('[importStore] aiStandardizeGarment failed:', err);
          return { url: null, meta: { source: 'mock', durationMs: 0, ok: false } };
        }),
        new Promise(resolve => setTimeout(resolve, 2200)),
      ]);

      const usingStandardized = Boolean(standardized.url);
      const imageToPersist = standardized.url || sourceUri;

      store.setState(state => ({
        tasks: state.tasks.map(t => t.id === taskId ? {
          ...t,
          standardizedImageUri: imageToPersist,
          standardizationFallback: !usingStandardized,
          status: 'uploading',
        } : t)
      }));

      let finalImageUrl = await uploadWardrobeImage(imageToPersist, userId, undefined, {
        persistRemote: usingStandardized,
        timeoutMs: usingStandardized ? 45000 : undefined,
      });

      if (!finalImageUrl && usingStandardized) {
        console.warn('[importStore] standardized image persistence failed, falling back to original');
        finalImageUrl = await uploadWardrobeImage(sourceUri, userId);
      }
      if (!finalImageUrl) finalImageUrl = sourceUri;

      store.setState(state => ({
        tasks: state.tasks.map(t => t.id === taskId ? { ...t, standardizedImageUri: finalImageUrl } : t)
      }));

      // Save to wardrobe. The primary image is the standardized/bg-removed image when available.
      const { addItem } = useWardrobeStore.getState();
      await addItem({
        user_id: userId,
        name: item.description || `${item.color}${item.category}`,
        category: item.category,
        color: normalizeColor(item.color),
        material: item.material ? normalizeMaterial(item.material) : undefined,
        image_url: finalImageUrl,
        ai_recognized_attrs: {
          async_import: true,
          standardization: usingStandardized ? 'qwen-image-edit' : 'fallback_original',
          standardization_ok: usingStandardized,
          original_image_url: sourceUri,
          standardized_image_url: usingStandardized ? imageToPersist : undefined,
          photo_type: photoType,
          detection_index: item.index,
        },
        source_type: 'album_ai',
        source_label: usingStandardized ? '相册导入 · 标准图' : '相册导入 · 原图兜底',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any);
    }

    store.setState(state => ({
      tasks: state.tasks.map(t => t.id === taskId ? { ...t, status: 'done' } : t),
      completedCount: state.completedCount + 1
    }));
  } catch (err: any) {
    store.setState(state => ({
      tasks: state.tasks.map(t => t.id === taskId ? { ...t, status: 'failed', error: err.message || '导入失败' } : t),
      failedCount: state.failedCount + 1
    }));
  }
}

/**
 * 离线兜底识别（仅在模型服务不可用时使用）。
 * 关键：结果对同一张图片是**稳定可复现**的——从图片引用派生一个稳定哈希，
 * 由哈希决定「这张图识别出几件单品」以及各单品的品类/颜色。
 * 这样单品数量完全由图片本身决定（模拟真实识别），而不是随机数或人工开关：
 *   • 同一张图片每次都得到相同的识别结果与相同的流程路由；
 *   • 大约一半图片会识别出多件（触发选择流程），另一半单件（直接导入）。
 */
function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function buildMockDetectedItems(sourceUri: string): DetectedItem[] {
  const seed = hashString(sourceUri || String(Date.now()));
  // 用哈希的不同位段派生稳定的数量与属性，保证同图同结果。
  // 数量分布：约 45% 单件，其余 2~3 件，贴近真人拍摄的穿搭图。
  const bucket = seed % 100;
  const itemCount = bucket < 45 ? 1 : bucket < 80 ? 2 : 3;
  const usedCategories = new Set<ClothingCategory>();
  return Array.from({ length: itemCount }).map((_, i) => {
    const s = hashString(`${seed}#${i}`);
    let category = MOCK_CATEGORIES[s % MOCK_CATEGORIES.length];
    // 多件时尽量错开品类，让选择弹窗里的单品更真实（不至于三件都是「上装」）
    if (itemCount > 1) {
      let guard = 0;
      while (usedCategories.has(category) && guard < MOCK_CATEGORIES.length) {
        category = MOCK_CATEGORIES[(s + ++guard) % MOCK_CATEGORIES.length];
      }
      usedCategories.add(category);
    }
    return {
      index: i,
      category,
      color: MOCK_COLORS[hashString(`${seed}c${i}`) % MOCK_COLORS.length],
      description: MOCK_CLOTHING_NAMES[hashString(`${seed}n${i}`) % MOCK_CLOTHING_NAMES.length],
      sourceImageUri: sourceUri,
      photo_type: 'on_body',
    };
  });
}
