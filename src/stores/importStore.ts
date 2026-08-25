import { create } from 'zustand';
import { DetectedItem, normalizeColor, normalizeMaterial } from '@/types';
import { useWardrobeStore } from '@/stores/wardrobeStore';
import { aiDetectMultiItems, aiStandardizeGarment } from '@/lib/ai';
import type { GarmentStandardizationResult } from '@/lib/ai';
import { buildItemName, ensureUniqueName } from '@/lib/itemNaming';
import { persistGarmentMaster } from '@/lib/uploadImage';
import { track } from '@/lib/track';
import { acceptedRecognitionItems } from '@/lib/recognitionPolicy';
import {
  canOperateImportTask,
  formatRecognitionFailure,
  summarizeImportTasks,
  tasksForUser,
} from '@/lib/importTaskPolicy';

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
  ownerUserId: string;
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
  requestId?: string;
  failedStage?: string;
  errorType?: string;
  serverDurationMs?: number;
}

interface ImportState {
  tasks: ImportTask[];
  isProcessing: boolean;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  pendingSelectionCount: number;
  activeUserId: string | null;

  // Actions
  startImport: (uris: string[], userId: string) => void;
  setActiveUser: (userId: string | null) => void;
  confirmSelection: (taskId: string, selectedItems: DetectedItem[]) => void;
  retryFailed: (taskId: string) => void;
  clearCompleted: () => void;
  removeTask: (taskId: string) => void;
}

let taskIdCounter = 0;

// ─── Store ────────────────────────────────────────────────

export const useImportStore = create<ImportState>((set, get) => ({
  tasks: [],
  isProcessing: false,
  totalCount: 0,
  completedCount: 0,
  failedCount: 0,
  pendingSelectionCount: 0,
  activeUserId: null,

  setActiveUser: (userId) => {
    set((state) => {
      const tasks = tasksForUser(state.tasks, userId);
      return {
        activeUserId: userId,
        tasks,
        ...summarizeImportTasks(tasks),
        isProcessing: false,
      };
    });
  },

  startImport: (uris: string[], userId: string) => {
    const newTasks: ImportTask[] = uris.map((uri) => ({
      id: `import_${Date.now()}_${++taskIdCounter}`,
      ownerUserId: userId,
      sourceUri: uri,
      status: 'pending',
    }));

    try { track('wardrobe_import_start', { source: 'album' }); } catch {}

    set(state => {
      const retainedTasks = state.activeUserId === userId ? tasksForUser(state.tasks, userId) : [];
      const allTasks = [...retainedTasks, ...newTasks];
      return {
        tasks: allTasks,
        ...summarizeImportTasks(allTasks),
        isProcessing: true,
        activeUserId: userId,
      };
    });

    // Start processing
    void processQueue();
  },

  confirmSelection: (taskId: string, selectedItems: DetectedItem[]) => {
    const activeUserId = get().activeUserId;
    if (!canOperateImportTask(get().tasks.find((task) => task.id === taskId), activeUserId)) return;
    set(state => ({
      ...(() => {
        const tasks = state.tasks.map(t =>
        t.id === taskId
          ? { ...t, status: 'selected' as const, confirmedItems: selectedItems }
          : t
        );
        return { tasks, ...summarizeImportTasks(tasks) };
      })(),
    }));
    void processQueue();
  },

  retryFailed: (taskId: string) => {
    const activeUserId = get().activeUserId;
    if (!canOperateImportTask(get().tasks.find((task) => task.id === taskId), activeUserId)) return;
    set(state => ({
      ...(() => {
        const tasks = state.tasks.map(t => t.id === taskId ? {
          ...t,
          status: 'pending' as const,
          error: undefined,
          requestId: undefined,
          failedStage: undefined,
          errorType: undefined,
          serverDurationMs: undefined,
        } : t);
        return { tasks, ...summarizeImportTasks(tasks), isProcessing: true };
      })(),
    }));
    void processQueue();
  },

  clearCompleted: () => {
    set(state => {
      const remainingTasks = tasksForUser(state.tasks, state.activeUserId)
        .filter(t => t.status !== 'done' && t.status !== 'failed');
      return {
        tasks: remainingTasks,
        ...summarizeImportTasks(remainingTasks),
      };
    });
  },

  removeTask: (taskId: string) => {
    const activeUserId = get().activeUserId;
    if (!canOperateImportTask(get().tasks.find((task) => task.id === taskId), activeUserId)) return;
    set(state => {
      const newTasks = state.tasks.filter(t => t.id !== taskId);
      return {
        tasks: newTasks,
        ...summarizeImportTasks(newTasks),
      };
    });
  }
}));

// ─── Background Processing ────────────────────────────────

async function processQueue() {
  const store = useImportStore;
  const { activeUserId } = store.getState();

  if (!activeUserId) return;

  while (true) {
    const currentState = store.getState();
    if (currentState.activeUserId !== activeUserId) return;
    const tasks = tasksForUser(currentState.tasks, activeUserId);
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
      await handleDetection(nextTask.id, activeUserId);
    } else if (nextTask.status === 'selected') {
      await handleFinalize(nextTask.id, activeUserId);
    }
  }
}

function taskIsActive(taskId: string, ownerUserId: string): boolean {
  const state = useImportStore.getState();
  return state.activeUserId === ownerUserId
    && canOperateImportTask(state.tasks.find((task) => task.id === taskId), ownerUserId);
}

async function handleDetection(taskId: string, ownerUserId: string) {
  const store = useImportStore;
  const task = store.getState().tasks.find(t => t.id === taskId);
  if (!canOperateImportTask(task, ownerUserId)) return;
  
  store.setState(state => ({
    tasks: state.tasks.map(t => t.id === taskId ? { ...t, status: 'detecting' } : t)
  }));

  let items: DetectedItem[] = [];
  let diagnostics: {
    requestId?: string;
    failedStage?: string;
    errorType?: string;
    serverDurationMs?: number;
  } = {};
  try {
    const result = await aiDetectMultiItems(task.sourceUri);
    diagnostics = {
      requestId: result.meta.requestId,
      failedStage: result.meta.failedStage,
      errorType: result.meta.errorType,
      serverDurationMs: result.meta.serverDurationMs,
    };
    items = acceptedRecognitionItems(result.meta.ok, result.items).map((item, index) => ({
      ...item,
      index: typeof item.index === 'number' ? item.index : index,
      sourceImageUri: item.sourceImageUri || task.sourceUri,
    }));
  } catch (err) {
    console.warn('[importStore] aiDetectMultiItems failed:', err);
  }

  if (!taskIsActive(taskId, ownerUserId)) return;

  if (items.length === 0) {
    store.setState(state => ({
      ...(() => {
        const tasks = state.tasks.map(t => t.id === taskId ? {
          ...t,
          status: 'failed' as const,
          error: formatRecognitionFailure(diagnostics),
          ...diagnostics,
        } : t);
        return { tasks, ...summarizeImportTasks(tasks) };
      })(),
    }));
    return;
  }

  // 完全按「这张图片识别出几件单品」来决定走哪个流程：
  //   • 识别到 >1 件  → needs_selection，弹出选择让用户勾选要导入哪些
  //   • 识别到 1 件    → 直接进入标准化/上传（无需打扰用户）
  // 不再有任何演示开关或强制多单品逻辑，路由完全由识别结果驱动。
  if (items.length > 1) {
    store.setState(state => ({
      ...(() => {
        const tasks = state.tasks.map(t => t.id === taskId ? {
          ...t,
          status: 'needs_selection' as const,
          allDetectedItems: items,
          ...diagnostics,
        } : t);
        return { tasks, ...summarizeImportTasks(tasks) };
      })(),
    }));
    try { track('wardrobe_import_result', { status: 'multi_selection', item_count: items.length, duration_ms: 0 }); } catch {}
  } else {
    store.setState(state => ({
      ...(() => {
        const tasks = state.tasks.map(t => t.id === taskId ? {
          ...t,
          status: 'selected' as const,
          confirmedItems: items,
          ...diagnostics,
        } : t);
        return { tasks, ...summarizeImportTasks(tasks) };
      })(),
    }));
  }
}

async function handleFinalize(taskId: string, ownerUserId: string) {
  const store = useImportStore;
  const task = store.getState().tasks.find(t => t.id === taskId);
  if (!canOperateImportTask(task, ownerUserId) || !task.confirmedItems) return;
  const finalizeStart = Date.now();

  try {
    // 用于本次导入内 + 衣橱已有单品的同名去重（保证标题唯一且 ≤10 字）
    const existingNames = new Set(
      useWardrobeStore.getState().items
        .map(i => (i.name || '').trim())
        .filter(Boolean),
    );

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
      const standardizationPromise: Promise<GarmentStandardizationResult> =
        aiStandardizeGarment(sourceUri, item.category, photoType, {
          color: item.color,
          material: item.material,
          description: item.description,
        }).catch((err) => {
          console.warn('[importStore] aiStandardizeGarment failed:', err);
          return {
            url: null,
            skipped: false,
            acceptance: { ok: false, reason: 'missing' },
            meta: { source: 'model-service/error', durationMs: 0, ok: false },
          };
        });
      const [standardized] = await Promise.all([
        standardizationPromise,
        new Promise(resolve => setTimeout(resolve, 2200)),
      ]);

      if (!taskIsActive(taskId, ownerUserId)) return;

      store.setState(state => ({
        tasks: state.tasks.map(t => t.id === taskId ? {
          ...t,
          status: 'uploading',
        } : t)
      }));

      const persistedImage = await persistGarmentMaster({
        sourceUri,
        userId: ownerUserId,
        photoType,
        acceptance: standardized.acceptance,
        diagnostics: standardized.meta,
      });
      if (!persistedImage.ok) throw new Error('原图上传失败');
      if (!taskIsActive(taskId, ownerUserId)) return;
      const finalImageUrl = persistedImage.imageUrl;

      store.setState(state => ({
        tasks: state.tasks.map(t => t.id === taskId ? {
          ...t,
          standardizedImageUri: finalImageUrl,
          standardizationFallback: persistedImage.status === 'fallback_original',
        } : t)
      }));

      // 统一命名规则：[记忆点]+[颜色]+[细分品类]，≤10 字，衣橱内去重
      const itemName = ensureUniqueName(
        buildItemName({
          category: item.category,
          color: item.color,
          material: item.material,
          style: item.style,
          fit_type: item.fit_type,
          sleeve_length: item.sleeve_length,
          description: item.description,
          brand: item.brand,
        }),
        existingNames,
      );
      existingNames.add(itemName);

      // Save to wardrobe. The primary image is the standardized/bg-removed image when available.
      const { addItem } = useWardrobeStore.getState();
      // 仅将 AI 实际识别出且非空、且真正写入 item 的字段计入 recognized_fields（此路径仅落库 material）
      const recognizedFields: string[] = [];
      if (item.material) recognizedFields.push('material');
      const saved = await addItem({
        user_id: ownerUserId,
        name: itemName,
        category: item.category,
        color: normalizeColor(item.color),
        material: item.material ? normalizeMaterial(item.material) : undefined,
        image_url: finalImageUrl,
        ai_recognized_attrs: {
          async_import: true,
          detection_index: item.index,
          ...persistedImage.metadata,
          recognized_fields: recognizedFields,
        },
        source_type: 'album_ai',
        source_label: '相册导入',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any);
      if (!saved) throw new Error('衣橱保存失败');
    }

    store.setState(state => ({
      ...(() => {
        const tasks = state.tasks.map(t => t.id === taskId ? { ...t, status: 'done' as const } : t);
        return { tasks, ...summarizeImportTasks(tasks) };
      })(),
    }));
    try { track('wardrobe_import_result', { status: 'success', item_count: task.confirmedItems?.length ?? 1, duration_ms: Date.now() - finalizeStart }); } catch {}
  } catch (err: any) {
    if (!taskIsActive(taskId, ownerUserId)) return;
    store.setState(state => ({
      ...(() => {
        const tasks = state.tasks.map(t => t.id === taskId ? {
          ...t,
          status: 'failed' as const,
          error: err.message || '导入失败',
        } : t);
        return { tasks, ...summarizeImportTasks(tasks) };
      })(),
    }));
    try { track('wardrobe_import_result', { status: 'failed', item_count: 0, duration_ms: Date.now() - finalizeStart, error_code: err.message }); } catch {}
  }
}
