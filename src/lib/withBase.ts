/**
 * baseUrl 感知的静态资源路径拼接工具。
 *
 * 背景：public/ 下的静态图片（如 /inspirations/*.png、/preset-items/*.png）在源码里
 * 以「站点根绝对路径」书写。根部署（baseUrl=/）下可正常访问；但项目页子路径部署
 * （如 GitHub Project Pages 的 /stylee_mvp_v2/）下，浏览器会去站点根找图 → 404。
 *
 * 解决：构建期 Expo/babel 会把 `process.env.EXPO_BASE_URL` 内联为当前构建的 baseUrl
 * （由 app.json 的 experiments.baseUrl 或 EXPO_BASE_URL 环境变量决定，根部署时为空串）。
 * 用 withBase() 在运行时为「站点根绝对路径」补齐该前缀，即可同时适配两种部署：
 *   - 根部署：EXPO_BASE_URL='' → withBase('/inspirations/x.png') = '/inspirations/x.png'
 *   - 子路径：EXPO_BASE_URL='/stylee_mvp_v2' → '/stylee_mvp_v2/inspirations/x.png'
 *
 * 仅处理以单个 '/' 开头的本地绝对路径；http(s)://、//、data:、blob:、file:、相对路径
 * 等一律原样返回，避免破坏 DB 返回的远程图片 URL 或用户本地图片。
 */

/** 归一化后的 baseUrl，形如 '' 或 '/stylee_mvp_v2'（无尾斜杠）。 */
export const BASE_URL: string = (process.env.EXPO_BASE_URL ?? '').replace(/\/+$/, '');

export function withBase(path?: string | null): string {
  if (!path) return path ?? '';
  // 仅本地站点根绝对路径需要补前缀：以单个 '/' 开头，且不是协议相对 '//'。
  if (path[0] !== '/' || path[1] === '/') return path;
  if (!BASE_URL) return path;
  // 已带前缀则不重复拼接（幂等）。
  if (path === BASE_URL || path.startsWith(`${BASE_URL}/`)) return path;
  return `${BASE_URL}${path}`;
}
