import json, glob
import numpy as np
recs=[]
for f in glob.glob('raw/games_*.jsonl'):
    for line in open(f,encoding='utf8'):
        d=json.loads(line)
        if not d.get('x'): recs.append(d)
print(len(recs),"games")
TS=[2.0,3.0,4.0,5.0,6.0,7.0,8.0,10.0]
def run(sel,label,sus=3):
    out=[]
    for T in TS:
        n=win=k1=k2=ret=0
        for d in sel:
            ev=np.array(d['ev'],dtype=float)/100.0
            r=d['r']
            for side in (0,1):
                e=ev if side==0 else -ev
                ok=e>=T
                if len(e)<sus: continue
                s=np.convolve(ok.astype(int),np.ones(sus,dtype=int),'valid')==sus
                if not s.any(): continue
                idx=int(np.argmax(s))
                n+=1
                w=(r=='1-0' and side==0) or (r=='0-1' and side==1)
                win+=w
                tail=e[idx:]
                k1+= tail.min()>=1.0
                k2+= tail.min()>=2.0
                ret+= (tail>=1.0).mean()
        out.append((T,n,win/n*100,k1/n*100,k2/n*100,ret/n*100))
    print(f"\n== {label} (sustained {sus} plies)")
    print("  T      n    win%  keep>=+1  keep>=+2  time>=+1")
    for T,n,w,a,b,c in out: print(f" {T:4.1f} {n:7d} {w:5.1f}   {a:5.1f}    {b:5.1f}    {c:5.1f}")
run(recs,"ALL",1)
run(recs,"ALL",3)
for tc in ['Bullet','Blitz','Rapid','Classical']:
    run([d for d in recs if d['tc']==tc],tc)
for lo,hi in [(400,1000),(1000,1400),(1400,1800),(1800,2200),(2200,3000)]:
    run([d for d in recs if lo<=(d['w']+d['b'])//2<hi],f"rating {lo}-{hi}")
