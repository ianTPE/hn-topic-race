const {PAGE,OUT:S,launch,ok}=require("./helper.cjs");
(async()=>{const b=await launch();
let c=await b.newContext({reducedMotion:"reduce",viewport:{width:1400,height:900}}),p=await c.newPage();await p.goto(PAGE);await p.waitForTimeout(200);
ok("reduced motion paused at end",(await p.evaluate(()=>[playing,progress].join()))==="false,1");
await p.focus("input[name=category]:checked");await p.keyboard.press("ArrowRight");ok("arrow key switches category",/^ai /.test(await p.evaluate(()=>category.value+" "+data[0].name)));
ok("ticks: ascending, at least two",await p.evaluate(()=>[1,3.2,9,47,300,1426,9999,13979,31028].every(m=>{const t=niceTicks(m);return t.length>=2&&t.every((v,i)=>!i||v>t[i-1])})));
// overlap audit: value label right edge must stay inside the stage for every category
const o1=(await p.evaluate(()=>{const bad=[];const o=ctx.fillText;ctx.fillText=function(t,x,y){const w=ctx.measureText(t).width,l=ctx.textAlign==="right"?x-w:ctx.textAlign==="center"?x-w/2:x;if(l<0||l+w>W)bad.push(t);return o.call(ctx,t,x,y)};for(const k of Object.keys(SNAPSHOT.data)){loadSnapshot(k);pause();for(let q=0;q<=1;q+=.02)render(q,true)}ctx.fillText=o;return [...new Set(bad)].join()||"none"}));ok("no canvas text overflow",o1==="none",o1);
c=await b.newContext({viewport:{width:360,height:740},deviceScaleFactor:2,isMobile:true});p=await c.newPage();await p.goto(PAGE);await p.waitForTimeout(300);
const w=await p.evaluate(()=>[document.documentElement.scrollWidth,innerWidth,$("download").getBoundingClientRect().top===$("play").getBoundingClientRect().top].join());ok("no horizontal scroll at 360px",/^360,360/.test(w),w);
const o2=(await p.evaluate(()=>{const bad=[];const o=ctx.fillText;ctx.fillText=function(t,x,y){const w=ctx.measureText(t).width,l=ctx.textAlign==="right"?x-w:ctx.textAlign==="center"?x-w/2:x;if(l<0||l+w>W)bad.push(t);return o.call(ctx,t,x,y)};for(const k of Object.keys(SNAPSHOT.data)){loadSnapshot(k);pause();for(let q=0;q<=1;q+=.02)render(q,true)}ctx.fillText=o;return [...new Set(bad)].join()||"none"}));ok("no canvas text overflow (compact)",o2==="none",o2);
c=await b.newContext({viewport:{width:1400,height:900}});p=await c.newPage();await p.goto(PAGE);
ok("every month index shows its own label",await p.evaluate(()=>{pause();return labels.every((l,i)=>interpolated(i/(labels.length-1)).month===l)}));
ok("bars settle during hold",await p.evaluate(async()=>{duration=300;progress=.2;play();await new Promise(r=>setTimeout(r,1300));const t=[...data].sort((a,b)=>b.curVal-a.curVal);return t.every((d,i)=>Math.abs(d.curY-(TOP+i*ROW_H))<.5)}));
await b.close()})().catch(e=>{console.error(e);process.exit(1)});
