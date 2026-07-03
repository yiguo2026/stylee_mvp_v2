from stylee.embeddings import (
    build_embeddings_payload, parse_embeddings_response, build_embedder,
    HashingEmbedder as _HE,
)
from stylee.embeddings import HashingEmbedder, l2_normalize
import math
import os


def test_l2_normalize_unit_length():
    v = l2_normalize([3.0, 4.0])
    assert abs(math.sqrt(sum(x * x for x in v)) - 1.0) < 1e-9
    assert abs(v[0] - 0.6) < 1e-9 and abs(v[1] - 0.8) < 1e-9


def test_l2_normalize_zero_safe():
    assert l2_normalize([0.0, 0.0]) == [0.0, 0.0]


def test_hashing_deterministic_and_shape():
    e = HashingEmbedder(dim=256)
    a = e.embed(["法式 约会 针织"])[0]
    b = e.embed(["法式 约会 针织"])[0]
    assert a == b                      # 确定性
    assert len(a) == 256               # 维度
    assert abs(math.sqrt(sum(x * x for x in a)) - 1.0) < 1e-6   # 已归一化


def test_hashing_signature():
    assert HashingEmbedder(dim=256).signature() == "hashing:256"


def test_build_payload():
    p = build_embeddings_payload(["a", "b"], "text-embedding-v4", 1024)
    assert p == {"model": "text-embedding-v4", "input": ["a", "b"],
                 "dimensions": 1024, "encoding_format": "float"}


def test_parse_response_normalizes():
    body = {"data": [{"embedding": [3.0, 4.0]}, {"embedding": [0.0, 2.0]}]}
    vecs = parse_embeddings_response(body)
    assert abs(vecs[0][0] - 0.6) < 1e-9 and abs(vecs[0][1] - 0.8) < 1e-9
    assert vecs[1] == [0.0, 1.0]


def test_parse_response_bad_shape_raises():
    try:
        parse_embeddings_response({"oops": 1})
        assert False, "应抛 EmbeddingError"
    except Exception as e:
        assert type(e).__name__ == "EmbeddingError"


def test_build_embedder_no_key_falls_back(monkeypatch_env=None):
    saved = {k: os.environ.pop(k, None) for k in
             ("DASHSCOPE_API_KEY", "EMBED_API_KEY")}
    try:
        e = build_embedder()
        assert isinstance(e, _HE)               # 无 key → Hashing
        assert e.signature().startswith("hashing:")
    finally:
        for k, v in saved.items():
            if v is not None:
                os.environ[k] = v


def main():
    test_l2_normalize_unit_length()
    test_l2_normalize_zero_safe()
    test_hashing_deterministic_and_shape()
    test_hashing_signature()
    test_build_payload()
    test_parse_response_normalizes()
    test_parse_response_bad_shape_raises()
    test_build_embedder_no_key_falls_back()
    print("ok")


if __name__ == "__main__":
    main()
