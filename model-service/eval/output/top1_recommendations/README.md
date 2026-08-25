# Stylee 搭配评测 · Top1（模型第一推荐）重跑产物

本目录是「用户更新衣橱单品」后，复用既有离线搭配评测流水线重跑、**仅保留模型第一推荐(Top1)** 的产物。

## 本次与既有流程的关系
- 既有流程：`catalog.json`(单品池) + `queries.json`(96 题) → 逐题跑 `adapter + pipeline.recommend`（真实线上用 deepseek）→ `outfits.jsonl`(每题多套 rank1..k) + 评审表(`review_sheet.*`) → `make_collage_best.py` 生成每题 rank1 的「最优搭配」拼图。
- 本次变化：
  1. 用**更新后的衣橱** `catalog_v2.json`（3380 件，来自飞书新单品文件夹，见 `build_catalog_v2.py`）替换单品池；
  2. 新增 `run_eval_top1.py`：复用同一条 in-process 链路，但**每题只产出/保留 Top1** 搭配（`outfits_top1.jsonl`），并写 `top1_summary.csv`；
  3. 新增 `make_collage_top1.py`：为每题生成一张 Top1 拼图（本目录 `*.png`）。

## 产物
- `q*.png`（96 张）：每题的 Top1 搭配拼图，右上角「★ 模型最优推荐 Top1」角标含加权分。
- `../../results_v2_top1/outfits_top1.jsonl`：每行一题，仅含 Top1 的 slot→item_id、四维分、加权分、理由、trace。
- `../../results_v2_top1/top1_summary.csv`：Top1 简明清单（编号/题目/场景/风格/季节/温度/所选单品/补买/加权分）。

## ⚠️ 重要说明（打分口径）
- **真实模型服务本次不可用**：线上 Render `/recommend` 需 Supabase 用户 JWT，而 Supabase legacy anon key 已于 2026-08-20 被禁用，无法签发 token；本地直连 DeepSeek / Qwen(DashScope) 的 API key 均返回 401（key 失效）。
- 因此本次按任务约定使用**本地兜底打分逻辑**（`--provider mock`）跑通全链路：
  - Top1 = 管线 B4 四维硬打分 + B5 加权排序后得分最高的一套（`加权 = 0.30 体型 + 0.25 场景 + 0.25 风格 + 0.20 色彩`）。
  - mock 只做「结构合法」的槽位拼装，**不做审美/个性化**，且不会主动选配饰(包/帽/围巾)；故 Top1 多为「上装+下装(+外套)+鞋」或「连衣裙+鞋」，且组合可能不合审美（如通勤题选到泳衣/凉拖）。
- 新衣橱单品元数据稀疏（多数文件名是飞书 token，无颜色/风格/材质），也进一步限制了打分区分度。
- **要拿到真实审美 Top1**：提供任一有效的 DeepSeek 或 Qwen API key（或可用的线上服务鉴权），把 `run_eval_top1.py --provider deepseek` 重跑即可，代码零改动。

## 复现
```bash
cd model-service/eval
python3 build_catalog_v2.py                 # 生成 catalog_v2.json（需 /tmp/new_wardrobe_full.json 文件清单）
python3 run_eval_top1.py --provider mock --cap 10 --out results_v2_top1/
python3 make_collage_top1.py                # 需先下载 Top1 命中单品图到 items_v2/
```
> `--cap`：因 3380 件单品经 B1 季节/温度过滤后每槽仍有数百件，任何 provider 都无法直接消费（mock 会对 4 槽做笛卡尔积而爆炸），故每题从更新衣橱中按类目稳定抽样(每槽≤cap)构成候选池，seed=query 文本，可复现。
