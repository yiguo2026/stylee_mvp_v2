import { create } from 'zustand';
import { DetectedItem, normalizeColor, normalizeMaterial } from '@/types';
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
  const { _userId } = store.getState();
  
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
  try {
    const result = await aiDetectMultiItems(task.sourceUri);
    items = result.items.map((item, index) => ({
      ...item,
      index: typeof item.index === 'number' ? item.index : index,
      sourceImageUri: item.sourceImageUri || task.sourceUri,
    }));
  } catch (err) {
    console.warn('[importStore] aiDetectMultiItems failed:', err);
  }

  // 单品数量完全由真实模型服务（serviceRecognizeMulti）识别结果决定，不再用假数据造多件。
  // 真实服务不可用时，aiDetectMultiItems 已在内部兜底为「单件识别」（1 件），
  // 因此不会误弹多单品选择；只有模型真的识别到 >1 件，才进入多选流程。

  // 极端情况（图片无法编码 / 服务完全无响应且单件兜底也为空）：标记失败让用户重试，
  // 而不是伪造数据。
  if (items.length === 0) {
    store.setState(state => ({
      tasks: state.tasks.map(t => t.id === taskId
        ? { ...t, status: 'failed' as const, error: '识别失败，请重试' }
        : t),
      failedCount: state.failedCount + 1,
    }));
    return;
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
        name: (item.description || `${item.color}${item.category}`).slice(0, 10),
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
        source_label: '相册导入',
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
