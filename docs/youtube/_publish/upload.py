#!/usr/bin/env python3
import json, subprocess, sys, os

os.chdir(os.path.join(os.path.dirname(__file__), ".."))

VIDEOS = {
    "vid01": "video-01-grant-tracking-spreadsheet/output/grant-tracking-spreadsheet.mp4",
    "vid02": "video-02-grant-budget-template/output/grant-budget-template.mp4",
    "vid03": "video-03-single-audit/output/single-audit-explained.mp4",
    "p1":    "video-p1-getting-started/output/getting-started.mp4",
    "p2":    "video-p2-add-grant-allocate/output/add-grant-allocate.mp4",
    "p3":    "video-p3-track-restricted-funds/output/track-restricted-funds.mp4",
    "s1":    "video-s1-fund-accounting/output/fund-accounting.mp4",
    "s4":    "video-s4-uniform-guidance/output/uniform-guidance.mp4",
}
THUMBS = {
    "vid01": "video-01-grant-tracking-spreadsheet/production/thumbnail.png",
    "vid02": "video-02-grant-budget-template/production/thumbnail.png",
    "vid03": "video-03-single-audit/production/thumbnail.png",
}

# Pre-uploaded vid01 mp4 (already done interactively)
results = {
    "vid01": {"video": {"id": "db174396-b4ea-4df2-84fa-7652a459daf8",
                          "path": "https://uploads.postiz.com/n34c2zOSFX.mp4"}},
}

def upload(path):
    out = subprocess.run(["postiz", "upload", path], capture_output=True, text=True)
    raw = out.stdout
    start = raw.find("{")
    obj = json.loads(raw[start:])
    return {"id": obj["id"], "path": obj["path"]}

for key, path in VIDEOS.items():
    if key in results and "video" in results[key]:
        print(f"skip video {key} (already uploaded)")
    else:
        print(f"uploading video {key} ...")
        results.setdefault(key, {})["video"] = upload(path)
        print("   ->", results[key]["video"]["path"])

for key, path in THUMBS.items():
    print(f"uploading thumb {key} ...")
    results.setdefault(key, {})["thumb"] = upload(path)
    print("   ->", results[key]["thumb"]["path"])

with open("_publish/uploads.json", "w") as f:
    json.dump(results, f, indent=2)
print("\nWROTE _publish/uploads.json")
print(json.dumps(results, indent=2))
