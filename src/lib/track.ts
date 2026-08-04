/**
 * Stylee MVP 埋点工具
 * - 自动附加公用字段（user_id / anonymous_id / session_id / ts / platform / app_version）
 * - 批量提交到 Supabase analytics_events 表（每满 10 条或每 3s flush 一次）
 * - 失败静默降级到 console.info，不影响业务
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';
import { useUserStore } from '@/stores/userStore';

// ─── Event Types ─────────────────────────────────────────────

export type EventName =
  | 'auth_view'
  | 'auth_success'
  | 'wardrobe_view'
  | 'wardrobe_import_start'
  | 'wardrobe_import_result'
  | 'outfit_generate_click'
  | 'outfit_generate_result'
  | 'outfit_preview_duration'
  | 'outfit_action'
  | 'outfit_detail_view'
  | 'record_view'
  | 'feedback_submit'
  | 'filter_conflict_shown'
  | 'filter_conflict_confirmed';

export interface AuthViewParams {
  page: 'login' | 'register';
}
export interface AuthSuccessParams {
  mode: 'login' | 'register';
  is_new_user: boolean;
}
export interface WardrobeViewParams {
  item_count: number;
}
export interface WardrobeImportStartParams {
  source: 'camera' | 'album' | 'outfit_split';
}
export interface WardrobeImportResultParams {
  status: 'success' | 'failed' | 'multi_selection';
  item_count: number;
  duration_ms: number;
  error_code?: string;
}
export interface OutfitGenerateClickParams {
  query_type: 'scene' | 'style' | 'item' | 'mood' | 'iterate';
  query_text?: string;
}
export interface OutfitGenerateResultParams {
  status: 'success' | 'failed' | 'timeout';
  duration_ms: number;
  item_count: number;
  error_code?: string;
}
export interface OutfitPreviewDurationParams {
  outfit_id: string;
  duration_ms: number;
  exited_by: 'back' | 'save' | 'regenerate' | 'change_item';
}
export interface OutfitActionParams {
  outfit_id: string;
  action: 'save' | 'like' | 'dislike' | 'regenerate' | 'change_item' | 'try_on';
}
export interface OutfitDetailViewParams {
  outfit_id: string;
  source: 'record' | 'collection' | 'generate';
}
export interface RecordViewParams {
  tab: 'record' | 'collection';
  item_count: number;
}
export interface FeedbackSubmitParams {
  category?: string;
  has_screenshot: boolean;
}

/**
 * 生成穿搭 filter — 用户看到"降饱和 tag"时（每次 render 中同 tag 去重曝光一次）。
 * 用于评估软引导互斥的曝光量与后续转化。
 */
export interface FilterConflictShownParams {
  tag: string;                  // tag id（英文 key）
  tag_kind: 'style' | 'occasion';
}

/**
 * 生成穿搭 filter — 用户在 confirm 弹窗中点"仍然选择"（跨过软引导）。
 */
export interface FilterConflictConfirmedParams {
  tag: string;                    // tag id
  tag_kind: 'style' | 'occasion';
  selected_others: string[];      // 已选的另一维度 tag id 列表
}

export type EventParamsMap = {
  auth_view: AuthViewParams;
  auth_success: AuthSuccessParams;
  wardrobe_view: WardrobeViewParams;
  wardrobe_import_start: WardrobeImportStartParams;
  wardrobe_import_result: WardrobeImportResultParams;
  outfit_generate_click: OutfitGenerateClickParams;
  outfit_generate_result: OutfitGenerateResultParams;
  outfit_preview_duration: OutfitPreviewDurationParams;
  outfit_action: OutfitActionParams;
  outfit_detail_view: OutfitDetailViewParams;
  record_view: RecordViewParams;
  feedback_submit: FeedbackSubmitParams;
  filter_conflict_shown: FilterConflictShownParams;
  filter_conflict_confirmed: FilterConflictConfirmedParams;
};

// ─── Session & Anonymous ID ──────────────────────────────────

const SESSION_ID = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export function getAnonymousId(): string {
  const STORAGE_KEY = 'stylee.anonymous_id';
  try {
    if (typeof localStorage !== 'undefined') {
      const existing = localStorage.getItem(STORAGE_KEY);
      if (existing) return existing;
      const id = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(STORAGE_KEY, id);
      return id;
    }
  } catch { /* ignore */ }
  return `anon_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ─── Buffer & Flush ──────────────────────────────────────────

interface EventPayload {
  event_name: string;
  user_id: string | null;
  anonymous_id: string;
  session_id: string;
  platform: string;
  app_version: string;
  params: Record<string, any>;
  ts: string;
}

const buffer: EventPayload[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const BATCH_SIZE = 10;
const FLUSH_INTERVAL_MS = 3000;

async function flush(): Promise<void> {
  if (buffer.length === 0) return;
  const batch = buffer.splice(0, buffer.length);
  try {
    const { error } = await supabase.from('analytics_events').insert(batch);
    if (error) {
      // 降级：打印到控制台
      console.info('[track] flush failed, logging batch:', error.message);
      batch.forEach(e => console.info('[track]', e.event_name, e.params));
    }
  } catch (e: any) {
    // 降级
    console.info('[track] flush exception:', e?.message);
    batch.forEach(ev => console.info('[track]', ev.event_name, ev.params));
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_INTERVAL_MS);
}

// ─── Main API ────────────────────────────────────────────────

/**
 * 主埋点入口 — fire-and-forget，绝不抛错
 */
export function track<E extends EventName>(
  event: E,
  params?: EventParamsMap[E],
): void {
  try {
    const userState = useUserStore.getState();
    const userId = userState.user?.id ?? null;
    const anonymousId = getAnonymousId();
    const platform = Platform.OS;
    const appVersion = Constants.expoConfig?.version ?? '1.0.0';

    const payload: EventPayload = {
      event_name: event,
      user_id: userId,
      anonymous_id: anonymousId,
      session_id: SESSION_ID,
      platform,
      app_version: appVersion,
      params: (params as Record<string, any>) ?? {},
      ts: new Date().toISOString(),
    };

    buffer.push(payload);
    console.info('[track]', event, params ?? {});

    if (buffer.length >= BATCH_SIZE) {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      void flush();
    } else {
      scheduleFlush();
    }
  } catch (e) {
    // 绝不因为埋点影响业务
    console.info('[track] error:', e);
  }
}

/**
 * 手动 flush（可在 app 退出前调用）
 */
export function flushTrack(): void {
  try {
    void flush();
  } catch { /* ignore */ }
}
