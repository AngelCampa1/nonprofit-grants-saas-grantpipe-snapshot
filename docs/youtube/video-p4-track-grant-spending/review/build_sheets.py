# NOTE: `review/frames` (raw extracted frames) and `review/sheets` (the contact
# sheets this script builds) were both deleted during the docs/ 19 MB portfolio
# prune — they were bulky QA capture artifacts, not source. This script is kept
# as a record of how the per-chapter review sheets were produced, not as
# something meant to run again against this snapshot. It now fails loudly
# instead of silently exiting 0 if the input frames are missing.
import os, glob, sys
from PIL import Image, ImageDraw, ImageFont
FR="review/frames"; OUT="review/sheets"
STEP=1.6
# chapter boundaries in final crossfaded timeline (start times, seconds)
chaps=[("00",0.0,39.25,"Hook: bank balance can't answer"),
       ("01",39.25,82.62,"What tracking means: Award-Spent=Left + 2 risks"),
       ("02",82.62,113.63,"What it takes: 3 chips + receipts-drawer fail"),
       ("03",113.63,149.84,"DEMO screen01: four cards, hold Remaining"),
       ("04",149.84,187.01,"DEMO ledger->add-expense dialog->back"),
       ("05",187.01,218.06,"DEMO burn-rate line -> Spend-Down"),
       ("06",218.06,265.2,"Outro: recap 3 chips + wordmark + lead magnet")]
frames=sorted(glob.glob(FR+"/f*.jpg"))
if not frames:
    sys.exit(f"No frames found under {FR}/ — that directory was removed from this snapshot "
              f"during portfolio curation, so this script has nothing to build sheets from.")
def ts(n): return (n-1)*STEP
try: font=ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf",26)
except: font=ImageFont.load_default()
try: fsm=ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf",20)
except: fsm=ImageFont.load_default()
COLS=5
for cid,start,end,desc in chaps:
    sel=[]
    for i,fp in enumerate(frames, start=1):
        t=ts(i)
        if start-0.01<=t<end:
            sel.append((t,fp))
    if not sel: continue
    thumbs=[]
    for t,fp in sel:
        im=Image.open(fp).convert("RGB")
        d=ImageDraw.Draw(im)
        lbl=f"{t:6.1f}s"
        d.rectangle([0,0,150,34],fill=(0,0,0))
        d.text((6,4),lbl,fill=(255,235,0),font=font)
        thumbs.append(im)
    w,h=thumbs[0].size
    rows=(len(thumbs)+COLS-1)//COLS
    pad=6; hdr=40
    sheet=Image.new("RGB",(COLS*w+pad*(COLS+1), hdr+rows*h+pad*(rows+1)),(30,30,30))
    sd=ImageDraw.Draw(sheet)
    sd.text((8,8),f"CHAPTER {cid}  [{start:.1f}-{end:.1f}s]  {desc}",fill=(255,255,255),font=font)
    for idx,im in enumerate(thumbs):
        r,c=divmod(idx,COLS)
        x=pad+c*(w+pad); y=hdr+pad+r*(h+pad)
        sheet.paste(im,(x,y))
    op=f"{OUT}/chapter-{cid}.jpg"
    sheet.save(op,quality=88)
    print("wrote",op,f"({len(thumbs)} frames)")
