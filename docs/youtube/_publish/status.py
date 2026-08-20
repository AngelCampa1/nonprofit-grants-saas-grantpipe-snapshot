import sys, json, subprocess
out = subprocess.run(["postiz","posts:list"], capture_output=True, text=True).stdout
s = out.find("[")
data, _ = json.JSONDecoder().raw_decode(out[s:])
order = [("p1","cmpy6qcsx07z0pe0ywn9qxok2"),("p2","cmpy6qdd7031ql70ylyrfjmt3"),
         ("p3","cmpy6qdxm031rl70y0k892u3b"),("vid01","cmpy6qel207z1pe0yxfih8v3s"),
         ("vid02","cmpy6qf4j031sl70y2eijoi8m"),("vid03","cmpy6qfpy031tl70yq5nujnui"),
         ("s1","cmpy6qga507z2pe0ya4u76ly0"),("s4","cmpy6qgw8031ul70yh35jl5dd")]
by = {p.get("id"): p for p in data if isinstance(p, dict)}
pub = 0
for k, i in order:
    p = by.get(i) or {}
    st = str(p.get("state"))
    if st == "PUBLISHED":
        pub += 1
    url = p.get("releaseURL") or "-"
    print(f"{k:6} {st:10} {url}")
print(f"\nPUBLISHED {pub}/8")
