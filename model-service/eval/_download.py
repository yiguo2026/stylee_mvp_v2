import json, subprocess, os, sys

DEST = "items"
os.makedirs(DEST, exist_ok=True)
f1 = json.load(open("_f1.json"))
f2 = json.load(open("_f2.json"))

names1 = {x["name"] for x in f1 if x["type"] == "file" and x["name"].lower().endswith(".png")}

plan = []  # (token, local_name)
for x in f1:
    if x["type"] == "file" and x["name"].lower().endswith(".png"):
        plan.append((x["token"], x["name"]))
for x in f2:
    if x["type"] == "file" and x["name"].lower().endswith(".png"):
        local = ("f2_" + x["name"]) if x["name"] in names1 else x["name"]
        plan.append((x["token"], local))

print("plan size:", len(plan))
ok, fail = [], []
for i, (token, name) in enumerate(plan, 1):
    out = os.path.join(DEST, name)
    if os.path.exists(out) and os.path.getsize(out) > 0:
        ok.append(name); continue
    p = subprocess.run(
        ["lark-cli", "drive", "+download", "--file-token", token,
         "--output", out, "--as", "user"],
        capture_output=True, text=True)
    if p.returncode == 0 and os.path.exists(out) and os.path.getsize(out) > 0:
        ok.append(name)
    else:
        fail.append((name, token, p.returncode, (p.stderr or "")[-200:]))
    if i % 100 == 0:
        print(f"progress {i}/{len(plan)} ok={len(ok)} fail={len(fail)}")

print("DONE ok=", len(ok), "fail=", len(fail))
json.dump(fail, open("_fail.json", "w"), ensure_ascii=False, indent=2)
for f in fail[:20]:
    print("FAIL", f)
