#!/usr/bin/env python3
"""锁住 occasion 打分校准(正式度匹配,非对称罚)。

    python3 test_scoring.py

回归这次修复:正装套在正式场景不再被打 0.2;运动套在休闲场景接近满分;
运动单品撑不起正式场景;过于正式只轻罚。
"""
from __future__ import annotations

from stylee.contracts import Formality, SceneSpec
from stylee.sampledata import sample_wardrobe
from stylee.scoring import (
    _formality_fit,
    _item_formality_ceiling,
    score_occasion,
)

WR = {it.id: it for it in sample_wardrobe()}


def _check(cond: bool, msg: str) -> None:
    assert cond, f"FAIL: {msg}"
    print(f"  ✓ {msg}")


def main() -> None:
    print("[1] 单品正式度上限")
    _check(_item_formality_ceiling(WR["o1"]) == 2, "西装外套 → 2(正式)")
    _check(_item_formality_ceiling(WR["b2"]) == 2, "西装裤 → 2(正式)")
    _check(_item_formality_ceiling(WR["t2"]) == 1, "白衬衫 → 1(半正式)")
    _check(_item_formality_ceiling(WR["s2"]) == 1, "乐福鞋 → 1(半正式)")
    _check(_item_formality_ceiling(WR["b4"]) == 0, "运动裤 → 0(休闲)")
    _check(_item_formality_ceiling(WR["t1"]) == 0, "运动休闲T恤 → 0(休闲)")

    print("\n[2] 非对称罚:撑不起重罚、过正式轻罚")
    _check(_formality_fit(0, 2) == 0.2, "休闲单品配正式场景 → 0.2(重罚)")
    _check(_formality_fit(1, 2) == 0.55, "半正式撑正式 → 0.55")
    _check(_formality_fit(2, 0) == 0.75, "正式单品配休闲场景 → 0.75(轻罚)")
    _check(_formality_fit(1, 1) == 1.0, "正好匹配 → 1.0")

    print("\n[3] 整套 occasion 分(修复前 D 这类正装被打 0.20)")
    formal = SceneSpec(occasions=["面试"], formality=Formality.FORMAL)
    casual = SceneSpec(occasions=["运动"], formality=Formality.CASUAL)
    smart = SceneSpec(occasions=["通勤"], formality=Formality.SMART_CASUAL)

    suit = [WR["o1"], WR["b2"], WR["t2"], WR["s2"]]   # 西装外套+西装裤+衬衫+乐福鞋
    sport = [WR["t1"], WR["b4"], WR["s1"]]            # T恤+运动裤+小白鞋
    commute = [WR["t3"], WR["b2"], WR["s2"]]          # 针织衫+西装裤+乐福鞋

    s_suit = score_occasion(suit, formal)
    s_sport = score_occasion(sport, casual)
    s_commute = score_occasion(commute, smart)
    s_sport_in_formal = score_occasion(sport, formal)

    print(f"    正装@面试={s_suit}  运动@运动={s_sport}  "
          f"通勤@通勤={s_commute}  运动@面试={s_sport_in_formal}")
    _check(s_suit >= 0.6, f"正装套在正式场景 ≥0.6(实 {s_suit},修复前 0.20)")
    _check(s_sport >= 0.9, f"运动套在休闲场景 ≥0.9(实 {s_sport})")
    _check(s_commute >= 0.8, f"通勤套在半正式场景 ≥0.8(实 {s_commute})")
    _check(s_sport_in_formal <= 0.4, f"运动套硬塞正式场景被压低 ≤0.4(实 {s_sport_in_formal})")
    _check(s_suit > s_sport_in_formal, "同正式场景下,正装套显著优于运动套")

    print("\n全部通过 ✅")


if __name__ == "__main__":
    main()
