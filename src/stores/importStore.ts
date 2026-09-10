import { create } from 'zustand';
import { DetectedItem, normalizeColor, normalizeMaterial } from '@/types';
import { useWardrobeStore } from '@/stores/wardrobeStore';
import { aiDetectMultiItems, aiStandardizeGarment } from '@/lib/ai';
import type { GarmentStandardizationResult } from '@/lib/ai';
import { buildItemName, ensureUniqueName } from '@/lib/itemNaming';
import { persistBatchImportMaster } from '@/lib/uploadImage';
import { track } from '@/lib/track';
import {
  acceptedRecognitionItems,
  canStandardizeDetectedTarget,
  missingTargetBoxIndices,
} from '@/lib/recognitionPolicy';
import {
  createSingleFlightScheduler,
  processImportSubtasks,
  resetImportSubtasksForRetry,
  type ImportSubtaskState,
} from '@/lib/importBatchProcessor';
import {
  canOperateImportTask,
  formatRecognitionFailure,
  summarizeImportTasks,
  tasksForUser,
} from '@/lib/importTaskPolicy';
import { importPrivateReset } from '@/lib/privateStateReset';

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
  /** Per-garment progress. Successful entries are immutable across retries. */
  itemStates?: ImportSubtaskState<string>[];
  /** True when repeated provider timeouts paused untouched garments. */
  circuitOpen?: boolean;
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
  resetPrivateState: () => undefined;
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
    void scheduleProcessQueue();
  },

  confirmSelection: (taskId: string, selectedItems: DetectedItem[]) => {
    const activeUserId = get().activeUserId;
    const target = get().tasks.find((task) => task.id === taskId);
    if (!canOperateImportTask(target, activeUserId)
        || target.status !== 'needs_selection') return;
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
    void scheduleProcessQueue();
  },

  retryFailed: (taskId: string) => {
    const activeUserId = get().activeUserId;
    const target = get().tasks.find((task) => task.id === taskId);
    if (!canOperateImportTask(target, activeUserId) || target.status !== 'failed') return;
    const targetBoxMissing = target.itemStates?.some(
      (itemState) => itemState.failureStage === 'target_bbox_missing',
    );
    const retryConfirmedItems = Boolean(
      target.confirmedItems?.length && target.itemStates?.length && !targetBoxMissing,
    );
    set(state => ({
      ...(() => {
        const tasks = state.tasks.map(t => t.id === taskId ? {
          ...t,
          status: retryConfirmedItems ? 'selected' as const : 'pending' as const,
          itemStates: retryConfirmedItems
            ? resetImportSubtasksForRetry(t.itemStates ?? [])
            : undefined,
          confirmedItems: retryConfirmedItems ? t.confirmedItems : undefined,
          allDetectedItems: retryConfirmedItems ? t.allDetectedItems : undefined,
          circuitOpen: false,
          error: undefined,
          requestId: undefined,
          failedStage: undefined,
          errorType: undefined,
          serverDurationMs: undefined,
        } : t);
        return { tasks, ...summarizeImportTasks(tasks), isProcessing: true };
      })(),
    }));
    void scheduleProcessQueue();
  },

  clearCompleted: () => {
    set(state => {
      const remainingTasks = tasksForUser(state.tasks, state.activeUserId)
        .filter(t => t.status !== 'done');
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
  },

  resetPrivateState: () => {
    set(importPrivateReset());
    return undefined;
  },
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

const scheduleProcessQueue = createSingleFlightScheduler(
  processQueue,
  () => {
    const state = useImportStore.getState();
    return Boolean(
      state.activeUserId
      && tasksForUser(state.tasks, state.activeUserId)
        .some((task) => task.status === 'pending' || task.status === 'selected'),
    );
  },
);

function taskIsActive(taskId: string, ownerUserId: string): boolean {
  const state = useImportStore.getState();
  return state.activeUserId === ownerUserId
    && canOperateImportTask(state.tasks.find((task) => task.id === taskId), ownerUserId);
}

async function handleDetection(taskId: string, ownerUserId: string) {
  const store = useImportStore;
  const task = store.getState().tasks.find(t => t.id === taskId);
  if (!canOperateImportTask(task, ownerUserId) || task.status !== 'pending') return;
  
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
  if (!canOperateImportTask(task, ownerUserId)
      || task.status !== 'selected'
      || !task.confirmedItems) return;
  const finalizeStart = Date.now();
  const detectedItemCount = task.allDetectedItems?.length ?? task.confirmedItems.length;
  const missingTargetBoxes = missingTargetBoxIndices(detectedItemCount, task.confirmedItems);
  if (missingTargetBoxes.length > 0) {
    const missingSet = new Set(missingTargetBoxes);
    const itemStates: ImportSubtaskState<string>[] = task.confirmedItems.map((_item, index) => (
      missingSet.has(index)
        ? {
            index,
            status: 'failed',
            attempts: 0,
            failureStage: 'target_bbox_missing',
            retryable: false,
          }
        : {
            index,
            status: 'waiting',
            attempts: 0,
            failureStage: 'preflight_blocked',
            retryable: true,
          }
    ));
    store.setState(state => ({
      ...(() => {
        const tasks = state.tasks.map(t => t.id === taskId ? {
          ...t,
          status: 'failed' as const,
          itemStates,
          error: '单品定位不完整，本批尚未导入；请重试识别',
          failedStage: 'target_bbox_missing',
        } : t);
        return { tasks, ...summarizeImportTasks(tasks) };
      })(),
    }));
    return;
  }

  const existingNames = new Set(
    useWardrobeStore.getState().items
      .map(i => (i.name || '').trim())
      .filter(Boolean),
  );

  const batch = await processImportSubtasks({
    items: task.confirmedItems,
    initialStates: task.itemStates,
    concurrency: 2,
    maxAttempts: 2,
    timeoutCircuitThreshold: 2,
    onUpdate: (itemStates) => {
      if (!taskIsActive(taskId, ownerUserId)) return;
      const processing = itemStates.find((itemState) => itemState.status === 'processing');
      store.setState(state => ({
        tasks: state.tasks.map(t => t.id === taskId ? {
          ...t,
          status: processing ? 'standardizing' : t.status,
          currentSubIndex: processing?.index,
          itemStates: [...itemStates],
        } : t),
      }));
    },
    process: async (item, index) => {
      if (!taskIsActive(taskId, ownerUserId)) {
        return { ok: false, failureStage: 'cancelled', retryable: false };
      }
      const importKey = taskId + ':' + index;
      const existing = useWardrobeStore.getState().items.find((wardrobeItem) => (
        wardrobeItem.ai_recognized_attrs?.import_key === importKey
      ));
      if (existing) {
        return { ok: true, value: existing.item_id };
      }
      const sourceUri = item.sourceImageUri || task.sourceUri;
      const photoType = item.photo_type ?? 'on_body';
      if (!canStandardizeDetectedTarget(detectedItemCount, item.bbox_2d)) {
        return { ok: false, failureStage: 'target_bbox_missing', retryable: false };
      }
      let standardized: GarmentStandardizationResult;
      try {
        standardized = await aiStandardizeGarment(sourceUri, item.category, photoType, {
          color: item.color,
          material: item.material,
          description: item.description,
          bbox_2d: item.bbox_2d,
        });
      } catch (err) {
        console.warn('[importStore] aiStandardizeGarment failed:', err);
        return { ok: false, failureStage: 'client_error', retryable: true };
      }

      if (!standardized.acceptance.ok) {
        return {
          ok: false,
          failureStage: standardized.meta.failedStage || 'standardization_rejected',
          retryable: true,
        };
      }
      if (!taskIsActive(taskId, ownerUserId)) {
        return { ok: false, failureStage: 'cancelled', retryable: false };
      }

      store.setState(state => ({
        tasks: state.tasks.map(t => t.id === taskId ? {
          ...t,
          status: 'uploading',
          currentSubIndex: index,
        } : t),
      }));
      const persistedImage = await persistBatchImportMaster({
        sourceUri,
        userId: ownerUserId,
        photoType,
        acceptance: standardized.acceptance,
        diagnostics: standardized.meta,
      });
      if (!persistedImage.ok) {
        return {
          ok: false,
          failureStage: persistedImage.reason,
          retryable: persistedImage.reason !== 'standardization_failed',
        };
      }
      if (!taskIsActive(taskId, ownerUserId)) {
        return { ok: false, failureStage: 'cancelled', retryable: false };
      }

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
      const recognizedFields: string[] = [];
      if (item.material) recognizedFields.push('material');
      if (item.fit_type) recognizedFields.push('fit_type');
      if (item.sleeve_length) recognizedFields.push('sleeve_length');
      const saved = await useWardrobeStore.getState().addItem({
        user_id: ownerUserId,
        import_key: importKey,
        name: itemName,
        category: item.category,
        color: normalizeColor(item.color),
        material: item.material ? normalizeMaterial(item.material) : undefined,
        fit_type: item.fit_type,
        sleeve_length: item.sleeve_length,
        image_url: persistedImage.imageUrl,
        ai_recognized_attrs: {
          async_import: true,
          import_key: importKey,
          detection_index: item.index,
          detected_item_count: task.allDetectedItems?.length ?? task.confirmedItems?.length ?? 1,
          description: item.description || undefined,
          ...persistedImage.metadata,
          recognized_fields: recognizedFields,
        },
        source_type: 'album_ai',
        source_label: '相册导入',
        status: 'active',
      } as any);
      if (!saved) {
        return { ok: false, failureStage: 'wardrobe_save_failed', retryable: true };
      }
      return { ok: true, value: saved.item_id };
    },
  });

  if (!taskIsActive(taskId, ownerUserId)) return;
  const succeeded = batch.states.filter((state) => state.status === 'succeeded').length;
  const failed = batch.states.filter((state) => state.status === 'failed').length;
  const waiting = batch.states.filter((state) => state.status === 'waiting').length;
  const unresolved = failed + waiting;
  store.setState(state => ({
    ...(() => {
      const tasks = state.tasks.map(t => t.id === taskId ? {
        ...t,
        status: unresolved > 0 ? 'failed' as const : 'done' as const,
        itemStates: batch.states,
        circuitOpen: batch.circuitOpen,
        currentSubIndex: undefined,
        standardizedImageUri: undefined,
        standardizationFallback: false,
        failedStage: batch.circuitOpen ? 'client_timeout' : undefined,
        error: unresolved > 0
          ? '已导入 ' + succeeded + ' 件 · ' + unresolved + ' 件待重试；失败原图未加入衣橱'
          : undefined,
      } : t);
      return { tasks, ...summarizeImportTasks(tasks) };
    })(),
  }));
  try {
    track('wardrobe_import_result', {
      status: unresolved > 0 ? 'failed' : 'success',
      item_count: succeeded,
      duration_ms: Date.now() - finalizeStart,
      error_code: unresolved > 0
        ? (batch.circuitOpen ? 'client_timeout' : 'partial_failure')
        : undefined,
    });
  } catch {}
}
