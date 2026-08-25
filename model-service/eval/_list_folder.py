import json, subprocess, sys

folder = sys.argv[1]
out_path = sys.argv[2]
files = []
page_token = ""
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
    data = json.loads(s[idx:])
    d = data.get("data", {})
    for f in d.get("files", []):
        files.append({"name": f["name"], "token": f["token"], "type": f["type"]})
    if d.get("has_more") and d.get("next_page_token"):
        page_token = d["next_page_token"]
    else:
        break
with open(out_path, "w") as fh:
    json.dump(files, fh, ensure_ascii=False, indent=2)
print(f"{folder}: {len(files)} files")
