#!/usr/bin/env python3
import json, subprocess, os, sys
from datetime import datetime, timezone, timedelta

os.chdir(os.path.join(os.path.dirname(__file__), ".."))

INTEGRATION = "cmpeaodzf01dcny0ybu7c83fj"  # GrantPipe @grantpipe YouTube

TITLES = {
    "vid01": "The Missing Column in Your Grant Tracking Spreadsheet (Free Template)",
    "vid02": "Grant Budget Template: Build It Step by Step (Free Template)",
    "vid03": "The Single Audit Explained: Who Needs One & Why (2024 Rules)",
    "p1":    "Getting Started with GrantPipe: Set Up Your Org & Import Your Donors",
    "p2":    "Add a Grant in GrantPipe and Split It Across Your Funds",
    "p3":    "How to Track Restricted Funds Correctly",
    "s1":    "What Is Fund Accounting? A Plain-English Guide for Nonprofits",
    "s4":    "Uniform Guidance (2 CFR 200) Explained in Plain English",
}

TAGS = {
    "vid01": ["grant tracking spreadsheet","grant tracking template","grant management spreadsheet","how to track grants","nonprofit grant tracking","restricted funds","fund accounting","grant compliance","budget vs actual","nonprofit finance","grant reporting","period of performance","single audit","grants management"],
    "vid02": ["grant budget template","grant budget","how to write a grant budget","grant proposal budget","nonprofit grant budget","budget narrative","indirect cost rate","de minimis rate","modified total direct costs","cost share","in-kind match","allowable costs","uniform guidance","2 CFR 200","grant writing"],
    "vid03": ["single audit","single audit explained","what is a single audit","single audit threshold","single audit requirements","uniform guidance","2 CFR 200","nonprofit audit","federal grant audit","SEFA","federal audit clearinghouse","single audit act","questioned costs","nonprofit compliance"],
    "p1":    ["grantpipe","nonprofit software","donor management","grant management","csv import","import donors","nonprofit crm setup","fund accounting software","getting started","nonprofit data import","donor spreadsheet","grant compliance"],
    "p2":    ["grantpipe","nonprofit software","grant management","grant allocation","restricted funds","fund accounting software","nonprofit grant compliance","grant tracking","restricted grant","fund accounting","nonprofit finance","grant budgeting"],
    "p3":    ["grantpipe","restricted funds","restricted fund accounting","nonprofit fund accounting","fund accounting software","nonprofit grant compliance","net assets with donor restrictions","FASB ASC 958","grant tracking","restricted vs unrestricted funds","nonprofit finance","grant management software"],
    "s1":    ["fund accounting","nonprofit accounting","restricted funds","unrestricted funds","net assets","nonprofit finance","fund accounting explained","nonprofit bookkeeping","statement of activities","grant compliance","nonprofit basics","restricted vs unrestricted","donor restrictions","grantpipe"],
    "s4":    ["uniform guidance","2 CFR 200","federal grants","nonprofit compliance","grant compliance","single audit","single audit threshold","de minimis indirect rate","indirect cost rate","MTDC","equipment threshold","subaward","2024 uniform guidance changes","grants management","grantpipe"],
}

ORDER = ["p1","p2","p3","vid01","vid02","vid03","s1","s4"]

uploads = json.load(open("_publish/uploads.json"))

# YouTube total tag length cap ~500 chars; trim trailing tags to stay <= 460
def cap_tags(tags):
    out, total = [], 0
    for t in tags:
        add = len(t) + (1 if out else 0)
        if total + add > 460:
            break
        out.append(t); total += add
    return out

# Publish now: first slot +2 min, 2 min apart, UTC (soonest the queue worker fires)
base = datetime.now(timezone.utc) + timedelta(minutes=2)
base = base.replace(second=0, microsecond=0)
SPACING = 2

dry = "--dry-run" in sys.argv
created = []
for idx, key in enumerate(ORDER):
    slot = base + timedelta(minutes=SPACING * idx)
    iso = slot.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    desc = open(f"_publish/{key}.txt").read()
    title = TITLES[key]
    assert len(title) <= 100, f"{key} title too long: {len(title)}"
    assert len(desc) <= 5000, f"{key} desc too long: {len(desc)}"
    tags = [{"value": t, "label": t} for t in cap_tags(TAGS[key])]
    settings = {
        "title": title,
        "type": "public",
        "selfDeclaredMadeForKids": "no",
        "tags": tags,
    }
    if "thumb" in uploads[key]:
        settings["thumbnail"] = {"id": uploads[key]["thumb"]["id"],
                                  "path": uploads[key]["thumb"]["path"]}
    video_url = uploads[key]["video"]["path"]
    cmd = ["postiz","posts:create",
           "-c", desc,
           "-m", video_url,
           "-i", INTEGRATION,
           "-s", iso,
           "-t", "schedule",
           "--shortLink", "false",
           "--settings", json.dumps(settings)]
    print(f"\n=== {key} | {iso} | title({len(title)}) | tags={len(tags)} | thumb={'yes' if 'thumb' in uploads[key] else 'no'} ===")
    if dry:
        print("DRY:", " ".join(c if len(c) < 60 else c[:57]+"..." for c in cmd))
        continue
    out = subprocess.run(cmd, capture_output=True, text=True)
    print(out.stdout[-600:])
    if out.returncode != 0:
        print("STDERR:", out.stderr[-600:])
    created.append({"key": key, "iso": iso, "stdout": out.stdout[-300:]})

if not dry:
    json.dump(created, open("_publish/created.json","w"), indent=2)
    print("\nWROTE _publish/created.json")
