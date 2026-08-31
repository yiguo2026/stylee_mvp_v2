#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "fixtures/release-smoke/outfit-quality-requests.json"
UPPER = {"base", "mid", "outer", "dress"}
ACCESSORIES = {"bag", "hat", "scarf", "accessory"}


def post_json(url: str, payload: dict) -> dict:
    request = Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=120) as response:
        return json.loads(response.read().decode("utf-8"))


def layout_key(case_id: str, entry: dict) -> tuple[str, str | int]:
    assert isinstance(entry, dict), (case_id, entry)
    source = entry.get("source")
    if source == "owned":
        assert "item_id" in entry, (case_id, entry)
        assert "recommended_index" not in entry, (case_id, entry)
        item_id = entry["item_id"]
        assert isinstance(item_id, str) and item_id, (case_id, entry)
        return ("owned", item_id)
    if source == "recommended":
        assert "recommended_index" in entry, (case_id, entry)
        assert "item_id" not in entry, (case_id, entry)
        index = entry["recommended_index"]
        assert type(index) is int and index >= 0, (case_id, entry)
        return ("recommended", index)
    raise AssertionError((case_id, entry))


def validate_outfit(case_id: str, outfit: dict) -> dict:
    owned = list(outfit.get("owned_item_ids") or [])
    recommended = list(outfit.get("recommended_items") or [])
    layout = list(outfit.get("layout_items") or [])
    assert len(layout) == len(owned) + len(recommended), (case_id, outfit)
    assert all(isinstance(item_id, str) and item_id for item_id in owned), (case_id, owned)
    expected_keys = [
        *[("owned", item_id) for item_id in owned],
        *[("recommended", index) for index in range(len(recommended))],
    ]
    actual_keys = [layout_key(case_id, entry) for entry in layout]
    assert len(expected_keys) == len(set(expected_keys)), (case_id, expected_keys)
    assert len(actual_keys) == len(set(actual_keys)), (case_id, actual_keys)
    assert set(actual_keys) == set(expected_keys), (case_id, expected_keys, actual_keys)
    roles = [entry.get("layout_role") for entry in layout]
    assert all(role in UPPER | ACCESSORIES | {"bottom", "shoes"} for role in roles)
    upper_count = sum(role in UPPER for role in roles)
    accessory_count = sum(role in ACCESSORIES for role in roles)
    assert roles.count("shoes") == 1, (case_id, roles)
    if case_id in {"daily", "ordinary_accessories"}:
        assert upper_count <= 2, (case_id, roles)
        assert accessory_count <= 2, (case_id, roles)
    if upper_count == 3:
        assert {role for role in roles if role in UPPER} == {"base", "mid", "outer"}
    owned_set = set(owned)
    assert not {"turtle", "shirt"}.issubset(owned_set), (case_id, owned)
    if case_id == "ordinary_accessories" and "hat" in roles:
        assert not {"trench", "bottom", "shoes", "hat"}.issubset(owned_set), owned
    return {
        "n": len(layout),
        "upper": upper_count,
        "accessories": accessory_count,
        "roles": roles,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    args = parser.parse_args()
    source = json.loads(FIXTURE.read_text(encoding="utf-8"))
    summaries = {}
    for case in source["queries"]:
        payload = dict(source["base"])
        payload["query"] = case["query"]
        body = post_json(args.base_url.rstrip("/") + "/recommend", payload)
        outfits = list(body.get("outfits") or [])
        assert outfits, (case["id"], body.get("trace"))
        summaries[case["id"]] = {
            "outfits": [validate_outfit(case["id"], outfit) for outfit in outfits],
            "rejected_by_rule": (body.get("trace") or {}).get("rejected_by_rule", {}),
        }
    print(json.dumps(summaries, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
