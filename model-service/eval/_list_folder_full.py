import json, subprocess, sys, time

folder = sys.argv[1]
out_path = sys.argv[2]
files = []
page_token = ""
pages = 0
while True:
    params = {"folder_token": folder, "page_size": 200}
    if page_token:
        params["page_token"] = page_token
    p = subprocess.run(
        ["lark-cli", "drive", "files", "list", "--params", json.dumps(params),
         "--format", "json", "--as", "user"],
        capture_output=True, text=True)
    s = p.stdout
    idx = s.find("{")
    if idx < 0:
        print("NO JSON on page", pages, "stderr:", p.stderr[:500], file=sys.stderr)
        break
    data = json.loads(s[idx:])
    d = data.get("data", {})
    for f in d.get("files", []):
        files.append({"name": f["name"], "token": f["token"], "type": f["type"]})
    pages += 1
    if d.get("has_more"):
        nt = d.get("next_page_token")
        if not nt:
            print("has_more but no token, page", pages, file=sys.stderr)
            break
        page_token = nt
    else:
        break

png = [f for f in files if f["name"].lower().endswith(".png")]
stem2token = {}
for f in png:
    stem = f["name"][:-4]
    stem2token[stem] = f["token"]
with open(out_path, "w") as fh:
    json.dump(stem2token, fh, ensure_ascii=False, indent=2)
print(f"pages={pages} total_files={len(files)} png={len(png)} unique_stems={len(stem2token)}")
