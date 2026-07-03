import array
import json
import os
import tempfile
from dataclasses import dataclass, field

from stylee.vectorstore import VectorIndex, load_index
from stylee.embeddings import HashingEmbedder
from scripts.build_exemplars import normalize_record, bucket_key, curate, trim_diverse
from scripts.build_index import write_index
from stylee.rag import (KeywordExemplarRetriever, Garments2LookRetriever,
                        default_retriever, ExemplarRetriever)
from stylee import recommend
from stylee.providers import MockProvider
from stylee.sampledata import scenarios


def test_search_topk_order():
    idx = VectorIndex(
        vectors=[[1.0, 0.0], [0.0, 1.0], [0.7, 0.7]],
        metas=[{"id": "a"}, {"id": "b"}, {"id": "c"}],
        signature="hashing:2", dim=2)
    res = idx.search([1.0, 0.0], k=2)
    assert [m["id"] for _, m in res] == ["a", "c"]    # a 最近,c 次之
    assert res[0][0] >= res[1][0]                      # 降序


def test_load_index_roundtrip():
    with tempfile.TemporaryDirectory() as d:
        metas = [{"id": "x", "text": "t1"}, {"id": "y", "text": "t2"}]
        with open(os.path.join(d, "exemplars.jsonl"), "w", encoding="utf-8") as f:
            for m in metas:
                f.write(json.dumps(m, ensure_ascii=False) + "\n")
        buf = array.array("f", [1.0, 0.0, 0.0, 1.0])   # 2 行 × dim2
        with open(os.path.join(d, "exemplars.vecs"), "wb") as f:
            f.write(buf.tobytes())
        with open(os.path.join(d, "index.meta.json"), "w", encoding="utf-8") as f:
            json.dump({"signature": "hashing:2", "dim": 2, "count": 2}, f)
        idx = load_index(d)
        assert idx.signature == "hashing:2" and idx.dim == 2
        assert idx.vectors[1] == [0.0, 1.0]
        assert idx.metas[0]["id"] == "x"


def test_load_index_count_mismatch_raises():
    with tempfile.TemporaryDirectory() as d:
        with open(os.path.join(d, "exemplars.jsonl"), "w", encoding="utf-8") as f:
            f.write(json.dumps({"id": "x"}) + "\n")
        with open(os.path.join(d, "exemplars.vecs"), "wb") as f:
            f.write(array.array("f", [1.0, 0.0]).tobytes())
        with open(os.path.join(d, "index.meta.json"), "w", encoding="utf-8") as f:
            json.dump({"signature": "s", "dim": 2, "count": 5}, f)   # count 不符
        try:
            load_index(d)
            assert False, "应抛 ValueError"
        except ValueError:
            pass


def test_normalize_basic():
    # 使用真实 Garments2Look schema: 单品在顶层 outfit 字典,描述字段为 outfit_description
    rec = {"id": "42",
           "outfit_info": {
               "style": ["french", "通勤"], "season": ["spring"],
               "occasion": ["date"],
               "outfit_description": "上紧下松显腿长"},
           "outfit": {"1": "针织上衣", "2": "A字半裙", "3": "玛丽珍鞋"}}
    ex = normalize_record(rec, "polyvore")
    assert ex["id"] == "polyvore_42"
    assert ex["style_keywords"] == ["法式", "通勤"]   # 映射 french→法式,通勤 passthrough
    assert ex["seasons"] == ["春"] and ex["occasions"] == ["约会"]
    assert ex["recipe"] == "针织上衣 + A字半裙 + 玛丽珍鞋"
    assert "风格:法式,通勤" in ex["text"] and "约会" in ex["text"]


def test_normalize_no_items_returns_none():
    # 无 outfit 字典 → 无单品 → normalize 返回 None
    assert normalize_record({"id": "1", "outfit_info": {}}, "polyvore") is None


def test_curate_dedup_and_cap():
    raw = []
    for i in range(5):     # 同桶 5 条,recipe 全同 → 去重剩 1
        raw.append({"id": str(i),
                    "outfit_info": {
                        "style": ["french"], "season": ["spring"], "occasion": ["date"]},
                    "outfit": {"1": "针织上衣", "2": "A字半裙", "3": "玛丽珍鞋"}})
    out = curate(raw, "polyvore", limit_per_bucket=3)
    assert len(out) == 1
    assert bucket_key(out[0]) == (("法式",), ("春",), ("约会",))


def test_trim_diverse_caps_and_spreads():
    exs = []
    for s in ("法式", "都市", "甜美"):       # 3 桶各 4 条
        for i in range(4):
            exs.append({"style_keywords": [s], "seasons": ["春"],
                        "occasions": ["约会"], "recipe": f"{s}{i}"})
    out = trim_diverse(exs, 3)                       # 全局上限 3 → 轮转每桶取 1
    assert len(out) == 3
    assert len({bucket_key(e) for e in out}) == 3   # 覆盖 3 个不同桶
    assert len(trim_diverse(exs, 0)) == 12          # max_total=0 不限
    assert len(trim_diverse(exs, 100)) == 12        # 未超上限原样返回


def test_write_then_load_roundtrip():
    with tempfile.TemporaryDirectory() as d:
        exemplars = [
            {"id": "a", "text": "法式 约会", "recipe": "针织+半裙"},
            {"id": "b", "text": "运动 出汗", "recipe": "卫衣+运动裤"},
        ]
        with open(os.path.join(d, "exemplars.jsonl"), "w", encoding="utf-8") as f:
            for e in exemplars:
                f.write(json.dumps(e, ensure_ascii=False) + "\n")
        emb = HashingEmbedder(dim=64)
        meta = write_index(d, exemplars, emb)
        assert meta["count"] == 2 and meta["dim"] == 64
        assert meta["signature"] == "hashing:64"
        idx = load_index(d)               # Task 3 能读回
        assert idx.signature == "hashing:64" and len(idx.vectors) == 2
        # query "法式 约会" 应最近 a
        q = emb.embed(["法式 约会"])[0]
        assert idx.search(q, 1)[0][1]["id"] == "a"


@dataclass
class _Scene:        # 仿 SceneSpec 的鸭子类型(只用到这几个字段)
    occasions: list = field(default_factory=list)
    style_keywords: list = field(default_factory=list)
    vibe: str = ""


def _build_fixture_index(d):
    exemplars = [
        {"id": "a", "text": "风格:法式 场合:约会", "recipe": "针织+半裙",
         "style_keywords": ["法式"], "occasions": ["约会"]},
        {"id": "b", "text": "风格:运动休闲 场合:运动", "recipe": "卫衣+运动裤",
         "style_keywords": ["运动休闲"], "occasions": ["运动"]},
    ]
    with open(os.path.join(d, "exemplars.jsonl"), "w", encoding="utf-8") as f:
        for e in exemplars:
            f.write(json.dumps(e, ensure_ascii=False) + "\n")
    write_index(d, exemplars, HashingEmbedder(dim=64))


def test_keyword_retriever_accepts_season():
    r = KeywordExemplarRetriever()
    out = r.retrieve(_Scene(occasions=["约会"], style_keywords=["法式"]),
                     k=2, season="春")        # season 被忽略,不报错
    assert isinstance(out, list) and len(out) >= 1
    assert ExemplarRetriever is KeywordExemplarRetriever


def test_g2l_vector_mode_hits():
    with tempfile.TemporaryDirectory() as d:
        _build_fixture_index(d)
        r = Garments2LookRetriever(index_dir=d, embedder=HashingEmbedder(dim=64))
        assert r.mode == "vector"
        out = r.retrieve(_Scene(occasions=["约会"], style_keywords=["法式"]),
                         k=1, season="春")
        assert out[0]["id"] == "a"


def test_g2l_missing_index_falls_back():
    with tempfile.TemporaryDirectory() as d:
        r = Garments2LookRetriever(index_dir=d, embedder=HashingEmbedder(dim=64))
        assert r.mode == "fallback"
        out = r.retrieve(_Scene(style_keywords=["法式"]), k=2)
        assert isinstance(out, list)          # 走 stub,仍有结果


def test_g2l_signature_mismatch_falls_back():
    with tempfile.TemporaryDirectory() as d:
        _build_fixture_index(d)               # 用 hashing:64 建
        r = Garments2LookRetriever(index_dir=d, embedder=HashingEmbedder(dim=128))
        assert r.mode == "fallback"           # 查询 embedder hashing:128,签名不符


def test_pipeline_has_rag_mode_and_runs():
    name, ctx = scenarios()[0]
    res = recommend(ctx, MockProvider())          # 无显式 retriever → default_retriever
    assert res.trace.get("rag_mode") in ("fallback", "vector")   # 取决于本地有无索引
    assert len(res.outfits) >= 1


def test_pipeline_vector_mode_with_fixture(tmp_dir=None):
    with tempfile.TemporaryDirectory() as d:
        _build_fixture_index(d)
        r = Garments2LookRetriever(index_dir=d, embedder=HashingEmbedder(dim=64))
        name, ctx = scenarios()[0]
        res = recommend(ctx, MockProvider(), retriever=r)
        assert res.trace["rag_mode"] == "vector"


def main():
    test_search_topk_order()
    test_load_index_roundtrip()
    test_load_index_count_mismatch_raises()
    test_normalize_basic()
    test_normalize_no_items_returns_none()
    test_curate_dedup_and_cap()
    test_trim_diverse_caps_and_spreads()
    test_write_then_load_roundtrip()
    test_keyword_retriever_accepts_season()
    test_g2l_vector_mode_hits()
    test_g2l_missing_index_falls_back()
    test_g2l_signature_mismatch_falls_back()
    test_pipeline_has_rag_mode_and_runs()
    test_pipeline_vector_mode_with_fixture()
    print("ok")


if __name__ == "__main__":
    main()
