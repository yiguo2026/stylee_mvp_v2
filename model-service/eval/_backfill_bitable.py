#!/usr/bin/env python3
"""按 record_id 逐行回填 bitable：模型搭配结果(text) + 硬校验(select)。"""
import json
import os
import subprocess
import time

BASE = "QWhcbYHn4acfpDshymJczPLtnBc"
TABLE = "tblGaSg7Xvzwqetd"

updates = json.load(open("_updates.json"))
os.makedirs("_upd", exist_ok=True)
ok, fail = 0, []
for i, u in enumerate(updates, 1):
    rid = u["record_id"]
    fields = u["fields"]
    tmp = f"_upd/{rid}.json"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(fields, f, ensure_ascii=False)
    cmd = ["lark-cli", "base", "+record-upsert",
           "--base-token", BASE, "--table-id", TABLE,
           "--record-id", rid, "--json", "@" + tmp, "--format", "json"]
    for attempt in range(3):
        p = subprocess.run(cmd, capture_output=True, text=True)
        out = p.stdout
        try:
            # strip non-json prefix lines
            start = out.index("{")
            resp = json.loads(out[start:])
        except Exception:
            resp = {"ok": False, "raw": out[-300:] + p.stderr[-300:]}
        if resp.get("ok") is True or resp.get("data", {}).get("updated") or ("record" in str(resp) and resp.get("ok") is not False):
            ok += 1
            break
        # retry on concurrency
        if "1254291" in json.dumps(resp):
            time.sleep(2 + attempt * 2)
            continue
        else:
            # some responses don't have ok key; treat presence of record as success
            if '"record"' in out or '"updated"' in out:
                ok += 1
                break
            time.sleep(1)
    else:
        fail.append((rid, resp))
    os.remove(tmp)
    if i % 10 == 0:
        print(f"progress {i}/{len(updates)} ok={ok}")
    time.sleep(0.3)

print(f"DONE ok={ok} fail={len(fail)}")
for rid, r in fail[:10]:
    print("FAIL", rid, json.dumps(r, ensure_ascii=False)[:200])
