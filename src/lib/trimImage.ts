import { Platform } from 'react-native';

export interface TrimResult {
  /** 裁剪后图片的 dataURL（已去除四周近白边） */
  uri: string;
  /** 裁剪后内容区域的宽高比（w/h），用于重设展示比例 */
  ratio: number;
}

/**
 * 自动裁掉图片四周的"近白"留白，只保留真正的内容区域。
 * 许多 AI 生成的试穿图会在人物周围（尤其上下）留大片白底，
 * 用 contain/cover 都无法去掉这种"图片自带"的留白 —— 只能真正裁掉像素。
 *
 * 仅在 Web 端可用（依赖 canvas）。跨域图片若污染画布无法读取像素时，
 * 会优雅降级返回 null，调用方保持原图展示。
 */
export async function trimWhitespace(
  uri: string,
  opts: { threshold?: number; minTrimFrac?: number } = {},
): Promise<TrimResult | null> {
  const threshold = opts.threshold ?? 242; // RGB 均 >= 该值视为"近白"
  const minTrimFrac = opts.minTrimFrac ?? 0.015; // 至少裁掉 1.5% 才认为值得处理

  if (Platform.OS !== 'web' || typeof document === 'undefined') return null;
  if (!uri) return null;

  return new Promise<TrimResult | null>((resolve) => {
    const DomImage = (window as any).Image as { new (): HTMLImageElement };
    const img = new DomImage();
    // 尽量以匿名跨域方式加载，便于 canvas 读取像素
    img.crossOrigin = 'anonymous';

    const done = (v: TrimResult | null) => resolve(v);

    img.onload = () => {
      try {
        const W = img.naturalWidth;
        const H = img.naturalHeight;
        if (!W || !H) return done(null);

        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');
        if (!ctx) return done(null);
        ctx.drawImage(img, 0, 0);

        let data: Uint8ClampedArray;
        try {
          data = ctx.getImageData(0, 0, W, H).data;
        } catch {
          // 跨域污染，无法读取像素 → 降级
          return done(null);
        }

        const stepX = Math.max(1, Math.floor(W / 80));
        const stepY = Math.max(1, Math.floor(H / 80));

        const rowIsWhite = (y: number) => {
          let white = 0;
          let total = 0;
          for (let x = 0; x < W; x += stepX) {
            const i = (y * W + x) * 4;
            total++;
            if (data[i] >= threshold && data[i + 1] >= threshold && data[i + 2] >= threshold) white++;
          }
          return total > 0 && white / total >= 0.97;
        };
        const colIsWhite = (x: number) => {
          let white = 0;
          let total = 0;
          for (let y = 0; y < H; y += stepY) {
            const i = (y * W + x) * 4;
            total++;
            if (data[i] >= threshold && data[i + 1] >= threshold && data[i + 2] >= threshold) white++;
          }
          return total > 0 && white / total >= 0.97;
        };

        let top = 0;
        while (top < H - 1 && rowIsWhite(top)) top++;
        let bottom = H - 1;
        while (bottom > top && rowIsWhite(bottom)) bottom--;
        let left = 0;
        while (left < W - 1 && colIsWhite(left)) left++;
        let right = W - 1;
        while (right > left && colIsWhite(right)) right--;

        const cw = right - left + 1;
        const ch = bottom - top + 1;
        if (cw <= 8 || ch <= 8) return done(null);

        const trimmedFrac = 1 - (cw * ch) / (W * H);
        if (trimmedFrac < minTrimFrac) return done(null); // 几乎没有留白，保持原图

        const out = document.createElement('canvas');
        out.width = cw;
        out.height = ch;
        const octx = out.getContext('2d');
        if (!octx) return done(null);
        octx.drawImage(canvas, left, top, cw, ch, 0, 0, cw, ch);

        done({ uri: out.toDataURL('image/png'), ratio: cw / ch });
      } catch {
        done(null);
      }
    };
    img.onerror = () => done(null);
    img.src = uri;
  });
}
