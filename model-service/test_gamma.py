from stylee.service.gamma import (
    build_outfit_messages, build_tryon_prompt, import_garment, normalize_import_item,
    normalize_tryon_items, outfit, tryon, tryon_reference_images,
)


def test_normalize_import_item():
    item = normalize_import_item({
        "name": "白色T恤", "category": "上装", "color": "白色", "photo_type": "flat",
    })
    assert item["name"] == "白色T恤" and item["photo_type"] == "flatlay"


def test_import_is_one_direct_recognize_plus_edit():
    calls = []

    def recognize(image):
        calls.append(("recognize", image))
        return {"name": "黑色半身裙", "category": "下装", "color": "黑色", "photo_type": "on_body"}

    def edit(image, item):
        calls.append(("edit", item["name"]))
        return "https://oss.example/std.png"

    result = import_garment({"image_url": "https://example/orig.png"}, recognize, edit)
    assert result["standardized"] is True and result["item"]["category"] == "下装"
    assert calls == [("recognize", "https://example/orig.png"), ("edit", "黑色半身裙")]


def test_outfit_prefers_known_ids_and_generates_gap_image():
    payload = {
        "query": "海岛度假", "wardrobe": [
            {"item_id": "t1", "name": "白T恤", "category": "上装", "color": "白色", "image_url": "https://x/t1.png"},
        ],
    }

    def complete(_payload):
        return {"outfit": {"name": "海岛", "comment": "清爽", "items": [
            {"source": "owned", "item_id": "t1"},
            {"source": "recommended", "name": "浅蓝短裤", "category": "下装", "color": "浅蓝", "image_prompt": "浅蓝短裤白底图"},
        ]}}

    result = outfit(payload, complete, lambda prompt: "https://oss.example/new.png")
    items = result["outfit"]["items"]
    assert items[0]["item_id"] == "t1" and items[0]["image_url"] == "https://x/t1.png"
    assert items[1]["source"] == "recommended" and items[1]["image_url"].endswith("new.png")


def test_replace_prompt_is_explicit():
    messages = build_outfit_messages({
        "action": "replace_item", "instruction": "换成红色", "target_item_key": "owned:t1",
    })
    joined = " ".join(str(x["content"]) for x in messages)
    assert "只替换target_item_key" in joined and "换成红色" in joined


def test_outfit_drops_duplicate_core_slot():
    result = outfit({"wardrobe": []}, lambda _payload: {"outfit": {"items": [
        {"source": "recommended", "name": "牛仔短裤", "category": "下装"},
        {"source": "recommended", "name": "亚麻短裤", "category": "下装"},
        {"source": "recommended", "name": "白T恤", "category": "上装"},
    ]}}, lambda _prompt: "")
    assert [x["category"] for x in result["outfit"]["items"]] == ["下装", "上装"]


def test_tryon_is_one_direct_edit_with_bounded_references():
    calls = []
    payload = {
        "image_url": "data:image/jpeg;base64,PERSON",
        "scene": "cafe",
        "items": [
            {"name": "白衬衫", "category": "上装", "color": "白色", "image_url": "https://x/top.png"},
            {"name": "黑长裤", "category": "下装", "color": "黑色", "image_url": "https://x/bottom.png"},
            {"name": "乐福鞋", "category": "鞋履", "color": "棕色", "image_url": "https://x/shoes.png"},
        ],
    }

    def generate(person, items, scene, body_shape, references):
        calls.append((person, items, scene, body_shape, references))
        return "https://oss.example/tryon.png"

    result = tryon(payload, generate)
    assert result["image_url"].endswith("tryon.png")
    assert result["trace"]["engine"] == "gamma" and result["trace"]["input_image_count"] == 3
    assert len(calls) == 1 and calls[0][4] == ["https://x/top.png", "https://x/bottom.png"]


def test_tryon_prompt_and_normalization():
    items = normalize_tryon_items([
        {"name": "吊带裙", "category": "连体装", "color": "蓝色", "image_url": "https://x/dress.png"},
        {"name": "草编包", "category": "包袋", "color": "米色", "image_url": "https://x/bag.png"},
        {"name": "坏数据", "category": "unknown"},
    ])
    assert items[2]["category"] == "配饰"
    assert tryon_reference_images(items) == ["https://x/dress.png", "https://x/bag.png"]
    prompt = build_tryon_prompt(items, "park", "梨形", 2)
    assert "唯一人物主体" in prompt and "吊带裙" in prompt and "城市公园" in prompt


def main():
    test_normalize_import_item()
    test_import_is_one_direct_recognize_plus_edit()
    test_outfit_prefers_known_ids_and_generates_gap_image()
    test_replace_prompt_is_explicit()
    test_outfit_drops_duplicate_core_slot()
    test_tryon_is_one_direct_edit_with_bounded_references()
    test_tryon_prompt_and_normalization()
    print("ok")


if __name__ == "__main__":
    main()
