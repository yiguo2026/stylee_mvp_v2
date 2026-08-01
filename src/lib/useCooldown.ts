import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 通用倒计时冷却 hook。用于限流退避：触发 Supabase rate-limit 后禁用按钮 N 秒，
 * 期间展示「请 X 秒后重试」，避免用户狂点越点越慢（连续失败会加重服务端限流）。
 */
export function useCooldown() {
  const [remaining, setRemaining] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback((seconds: number) => {
    clear();
    setRemaining(Math.max(0, Math.floor(seconds)));
    timerRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clear();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
  }, [clear]);

  useEffect(() => clear, [clear]);

  return { remaining, active: remaining > 0, start };
}
