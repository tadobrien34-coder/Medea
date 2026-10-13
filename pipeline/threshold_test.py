import json, glob, math, sys
import numpy as np
recs=[]
for f in glob.glob('raw/games_*.jsonl'):
    for line in open(f,encoding='utf8'):
        d=json.loads(line)
        if d.get('x'): continue
        recs.append(d)
print(len(recs),"games")
TS=[0.5,1.0,1.5,2.0,2.5,3.0,3.5,4.0,5.0,6.0]
def run(sel,label):
    rows=[]
    for T in TS:
        n=win=draw=keep1=keep0=keepT2=0
        for d in sel:
            ev=np.array(d['ev'],dtype=float)/100.0
            r=d['r']
            for side in (0,1):
                e=ev if side==0 else -ev   # white=0
                idx=np.argmax(e>=T) if (e>=T).any() else -1
                if idx<0: continue
                n+=1
                res = 1.0 if (r=='1-0')==(side==0) and r!='1/2-1/2' else (0.5 if r=='1/2-1/2' else 0.0)
                if res==1: win+=1
                elif res==0.5: draw+=1
                tail=e[idx:]
                if tail.min()>=1.0: keep1+=1
                if tail.min()>=0.0: keep0+=1
                if tail.min()>=T/2: keepT2+=1
        if n: rows.append((T,n,win/n,draw/n,keep1/n,keep0/n,keepT2/n))
    print(f"\n== {label}")
    print("  T    n      win%   draw%  never<+1  never<0  never<T/2")
    for T,n,w,dr,k1,k0,kt in rows:
        print(f" {T:3.1f} {n:7d}  {w*100:5.1f}  {dr*100:5.1f}   {k1*100:5.1f}    {k0*100:5.1f}    {kt*100:5.1f}")
run(recs,"ALL")
for tc in ['Bullet','Blitz','Rapid','Classical']:
    run([d for d in recs if d['tc']==tc],tc)
for lo,hi in [(400,1000),(1000,1400),(1400,1800),(1800,2200),(2200,3000)]:
    run([d for d in recs if lo<=(d['w']+d['b'])//2<hi],f"rating {lo}-{hi}")
