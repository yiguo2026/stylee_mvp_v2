import AsyncStorage from '@react-native-async-storage/async-storage';

export type QuotaType = 'recommend' | 'tryon';

export const DAILY_LIMIT: Record<QuotaType, number> = {
  recommend: 5,
  tryon: 3,
};

type QuotaState = {
  date: string;
  recommend_used: number;
  tryon_used: number;
};

const todayKey = (): string => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const storageKey = (userId: string) => `stylee_quota_v1:${userId}`;

const emptyState = (): QuotaState => ({
  date: todayKey(),
  recommend_used: 0,
  tryon_used: 0,
});

const loadState = async (userId: string): Promise<QuotaState> => {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    const parsed = raw ? (JSON.parse(raw) as Partial<QuotaState>) : null;
    const base = emptyState();
    const merged: QuotaState = {
      ...base,
      ...parsed,
      date: parsed?.date ?? base.date,
    };
    if (merged.date !== base.date) return base;
    return merged;
  } catch {
    return emptyState();
  }
};

const saveState = async (userId: string, state: QuotaState) => {
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(state));
};

const fieldOf = (type: QuotaType) => (type === 'recommend' ? 'recommend_used' : 'tryon_used');

export const getQuota = async (userId: string, type: QuotaType) => {
  const state = await loadState(userId);
  const used = state[fieldOf(type)];
  const limit = DAILY_LIMIT[type];
  const remaining = Math.max(0, limit - used);
  return { used, limit, remaining, date: state.date };
};

export const consumeQuota = async (userId: string, type: QuotaType) => {
  const state = await loadState(userId);
  const field = fieldOf(type);
  const limit = DAILY_LIMIT[type];
  const used = state[field];
  if (used >= limit) {
    return { ok: false, used, limit, remaining: 0, date: state.date };
  }
  const next: QuotaState = { ...state, [field]: used + 1 } as QuotaState;
  await saveState(userId, next);
  return { ok: true, used: next[field], limit, remaining: Math.max(0, limit - next[field]), date: next.date };
};
