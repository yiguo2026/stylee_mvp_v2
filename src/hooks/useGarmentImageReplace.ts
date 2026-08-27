import { useCallback, useEffect, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { aiRecognizeClothing, aiStandardizeGarment } from '@/lib/ai';
import { mergeReplacementImageAttrs } from '@/lib/outfitImageMetrics';
import { shouldApplyRecognition } from '@/lib/recognitionPolicy';
import { persistGarmentMaster, shouldPersistReplacementImage } from '@/lib/uploadImage';
import type { RecognitionResult, WardrobeItem } from '@/types';

/**
 * 换图上下文：随调用方表单/单品的最新值传入，用于标准化与重新识别时提供更准确的先验。
 */
export interface GarmentImageContext {
  category?: string;
  color?: string;
  material?: string;
  /** 用于标准化的商品描述（一般取单品名称） */
  description?: string;
}

export interface UseGarmentImageReplaceOptions {
  /** 目标单品（必须包含 item_id / user_id；缺失时换图不可用） */
  item: Pick<WardrobeItem, 'item_id' | 'user_id' | 'name' | 'image_url' | 'ai_recognized_attrs'> | undefined;
  /** 写入 store 的更新函数（乐观更新） */
  updateItem: (id: string, updates: Partial<WardrobeItem>) => void | Promise<void>;
  /** 标准化/识别所需上下文，随每次渲染传入最新值 */
  context?: GarmentImageContext;
  /** 标准化成功后是否重新做 AI 识别，默认 true */
  recognize?: boolean;
  /** 识别成功回调：调用方据此回填字段（详情页可选择只填空值，编辑页可整体覆盖表单） */
  onRecognized?: (result: RecognitionResult) => void;
  /** 轻提示回调 */
  onToast?: (msg: string) => void;
}

export interface UseGarmentImageReplaceReturn {
  /** 当前主图 URI（换图后立即更新，后台标准化完成再替换为透明主图） */
  imageUri: string;
  /** 直接设置主图（例如 store 中 item 变化时同步） */
  setImageUri: (uri: string) => void;
  /** 是否正在后台标准化 */
  standardizing: boolean;
  /** 是否正在重新识别 */
  recognizing: boolean;
  /** 标准化或识别任一进行中——用于展示局部「处理中」浮层并禁用换图按钮 */
  processing: boolean;
  /** 打开系统相册选图并就地替换（原图立即生效，标准化/识别后台进行） */
  pickAndReplace: () => Promise<void>;
}

/**
 * 「换图」通用逻辑（详情页与编辑页共用）：
 * - 用 expo-image-picker 从系统相册选图；
 * - 选中后原图立即生效（setImageUri + updateItem(image_url)），用户马上看到；
 * - 后台异步做 aiStandardizeGarment 抠图标准化 + persistGarmentMaster 上传，
 *   成功后替换为透明主图，并可选重新 AI 识别；
 * - 使用并发令牌 bgTokenRef + mountedRef 守卫：连续换图只认最新一次，卸载后不再 setState，
 *   避免旧结果覆盖新图。
 */
export function useGarmentImageReplace(
  opts: UseGarmentImageReplaceOptions,
): UseGarmentImageReplaceReturn {
  const { item, updateItem, recognize = true } = opts;

  const [imageUri, setImageUri] = useState(item?.image_url ?? '');
  const [standardizing, setStandardizing] = useState(false);
  const [recognizing, setRecognizing] = useState(false);

  // 令牌：后台换图任务只在仍是最新一次时生效；识别任务同理
  const bgTokenRef = useRef(0);
  const reqTokenRef = useRef(0);
  const mountedRef = useRef(true);

  // 用 ref 持有最新的 context / 回调，避免闭包捕获旧值（换图与后台任务跨越多次渲染）
  const contextRef = useRef<GarmentImageContext | undefined>(opts.context);
  contextRef.current = opts.context;
  const onRecognizedRef = useRef(opts.onRecognized);
  onRecognizedRef.current = opts.onRecognized;
  const onToastRef = useRef(opts.onToast);
  onToastRef.current = opts.onToast;
  const recognizeRef = useRef(recognize);
  recognizeRef.current = recognize;

  useEffect(() => () => { mountedRef.current = false; }, []);

  const toast = useCallback((msg: string) => {
    if (mountedRef.current) onToastRef.current?.(msg);
  }, []);

  // 主图识别：识别成功后通过回调回填；失败/降级不阻断，仅提示
  const runRecognition = useCallback(async (uri: string) => {
    const token = ++reqTokenRef.current;
    if (mountedRef.current) setRecognizing(true);
    try {
      const { result, meta } = await aiRecognizeClothing(uri);
      if (reqTokenRef.current !== token) return; // 被更新的图片取代，丢弃旧结果
      if (!shouldApplyRecognition(meta.ok, 1)) {
        toast('照片识别失败，已保留原有信息');
        return;
      }
      onRecognizedRef.current?.(result);
      toast('已根据新照片更新商品信息');
    } catch {
      if (reqTokenRef.current === token) toast('照片识别失败，已保留原有信息');
    } finally {
      if (reqTokenRef.current === token && mountedRef.current) setRecognizing(false);
    }
  }, [toast]);

  // 后台异步处理：标准化抠图去背景 + 上传 + 重新识别（不阻塞用户操作）
  const standardizeInBackground = useCallback(async (localUri: string, token: number) => {
    if (!item) return;
    const ctx = contextRef.current ?? {};
    const stillCurrent = () => mountedRef.current && bgTokenRef.current === token;
    try {
      const standardizationResult = await aiStandardizeGarment(
        localUri,
        ctx.category ?? '',
        'flatlay',
        { color: ctx.color, material: ctx.material, description: ctx.description || item.name },
      ).catch((error) => {
        console.warn('[useGarmentImageReplace] aiStandardizeGarment failed:', error);
        return {
          url: null,
          skipped: false as const,
          acceptance: { ok: false as const, reason: 'missing' as const },
          meta: { source: 'model-service/error', durationMs: 0, ok: false, requestId: undefined, failedStage: undefined },
        };
      });
      if (!stillCurrent()) return; // 期间又换了新图或已离开，丢弃旧结果

      const persistedImage = await persistGarmentMaster({
        sourceUri: localUri,
        userId: item.user_id,
        photoType: 'flatlay',
        acceptance: standardizationResult.acceptance,
        diagnostics: standardizationResult.meta,
      });
      if (!stillCurrent()) return;
      if (!persistedImage.ok) {
        toast('背景处理失败，已保留原图');
        return;
      }

      const finalUrl = persistedImage.imageUrl;
      setImageUri(finalUrl);
      await updateItem(item.item_id, {
        image_url: finalUrl,
        ai_recognized_attrs: mergeReplacementImageAttrs(
          item.ai_recognized_attrs,
          persistedImage.metadata,
        ),
      });
      if (!stillCurrent()) return;
      toast(
        persistedImage.status === 'transparent_master'
          ? '已完成背景处理'
          : '背景处理失败，已保留原图',
      );
      if (persistedImage.status === 'transparent_master' && recognizeRef.current) {
        void runRecognition(finalUrl);
      }
    } catch (e) {
      console.warn('[useGarmentImageReplace] standardizeInBackground error:', e);
      if (stillCurrent()) toast('背景处理失败，已保留原图');
    } finally {
      if (stillCurrent()) setStandardizing(false);
    }
  }, [item, updateItem, toast, runRecognition]);

  // 打开系统相册选图 → 原图立即生效 → 后台标准化 / 识别
  const pickAndReplace = useCallback(async () => {
    if (!item) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], quality: 0.7, allowsEditing: true,
    });
    if (result.canceled || !result.assets[0]) return;

    const localUri = result.assets[0].uri;
    if (!shouldPersistReplacementImage(localUri)) return;

    // 换图立即生效：先展示并落地原图，用户可马上继续操作或直接离开，
    // 抠图 / 标准化 / 重新识别在后台异步进行，完成后自动替换为透明主图。
    const token = ++bgTokenRef.current; // 标记本次换图，后台任务只在仍是最新时生效
    setImageUri(localUri);
    void updateItem(item.item_id, { image_url: localUri });
    setStandardizing(true);
    void standardizeInBackground(localUri, token);
  }, [item, updateItem, standardizeInBackground]);

  return {
    imageUri,
    setImageUri,
    standardizing,
    recognizing,
    processing: standardizing || recognizing,
    pickAndReplace,
  };
}
