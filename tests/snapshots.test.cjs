const {PAGE,OUT:S,launch,ok}=require("./helper.cjs");
(async()=>{const b=await launch();
const p=await b.newPage({viewport:{width:1400,height:950}});const errs=[];p.on("pageerror",e=>errs.push(e.message));
let reqs=0,delay=0;const seen=[];p.on("request",r=>{if(!/^(file|blob|data):/.test(r.url())){reqs++;seen.push(r.url())}});await p.route(/hn\.algolia\.com/,async r=>{if(delay)await new Promise(x=>setTimeout(x,delay));r.fulfill({json:{nbHits:100,exhaustiveNbHits:true,hits:[]},headers:{"access-control-allow-origin":"*"}}).catch(()=>{})});
const st=()=>p.textContent("#status");
await p.goto(PAGE);await p.waitForTimeout(300);
ok("start=model",await p.evaluate(()=>category.value)==="model");
ok("note dates",await p.$$eval("[data-snap]",e=>e.length===4&&e.every(x=>x.textContent===(x.dataset.snap==="date"?SNAPSHOT.generatedAt.slice(0,10):SNAPSHOT.labels[0]))));
for(const c of ["db","ai","model","lang","cloud","editor","frontend","infra"]){
 await p.selectOption("#months","12");await p.uncheck("#exact");await p.check(`input[name=category][value=${c}]`,{force:true});
 const r=await p.evaluate(c=>({n:data.length,d:SNAPSHOT.generatedAt,m:labels.length,match:data.every((d,i)=>d.name===CATEGORIES[c][i]&&d.values.every((v,j)=>v===SNAPSHOT.data[c][d.name][j])),playing,mo:$("months").value,ex:$("exact").checked,t:parseTerms().join()===CATEGORIES[c].join(),colors:new Set(data.map(d=>d.color)).size}),c);
 ok(c,r.match&&r.playing&&r.m===60&&r.mo==="60"&&r.ex&&r.t&&r.colors===r.n,JSON.stringify(r));}
ok("0 requests after all switches",reqs===0);
await p.check(`input[name=category][value=${"lang"}]`,{force:true});await p.evaluate(()=>{pause();progress=.999;render(1,true)});await p.screenshot({path:S+"/lang.png"});
await p.check(`input[name=category][value=${"custom"}]`,{force:true});ok("custom clears terms, keeps chart",await p.inputValue("#terms")===""&&await p.evaluate(()=>category.value==="custom"&&chartCat==="lang"&&data.map(d=>d.name).join()===CATEGORIES.lang.join()));
await p.fill("#terms","foo");await p.click("#demoBtn");ok("custom->offline = last preset",await p.evaluate(()=>category.value==="lang"&&chartCat==="lang"&&parseTerms().join()===CATEGORIES.lang.join()));
delay=30;await p.check(`input[name=category][value=${"custom"}]`,{force:true});await p.fill("#terms","foo");await p.selectOption("#months","12");await p.click("#load");
ok("locked during fetch",await p.evaluate(()=>$("category").disabled)&&await p.isDisabled("#demoBtn")&&await p.isDisabled("#load")&&await p.isDisabled("#download"));
await p.waitForFunction(()=>!$("load").disabled,null,{timeout:30000});await p.waitForTimeout(50);
ok("unlocked after",!(await p.evaluate(()=>$("category").disabled)));ok("custom result",await p.evaluate(()=>data.length===1&&data[0].name==="foo"),await st());
await p.click("#demoBtn");await p.evaluate(()=>{duration=1000});const dl=p.waitForEvent("download");await p.click("#download");await p.waitForTimeout(200);
ok("locked during rec",await p.evaluate(()=>$("category").disabled)&&await p.isDisabled("#load"));await (await dl).saveAs(S+"/rec.mp4");await p.waitForTimeout(200);ok("unlocked after rec",!(await p.evaluate(()=>$("category").disabled))&&!(await p.isDisabled("#download")));
await p.click("[data-set-lang=zh]");await p.check(`input[name=category][value=${"db"}]`,{force:true});console.log(await st());await p.reload();await p.waitForTimeout(300);await p.click("[data-set-lang=en]");await p.check(`input[name=category][value=${"editor"}]`,{force:true});console.log(await st());
ok("no page errors",errs.length===0,errs);await b.close()})().catch(e=>{console.error(e);process.exit(1)})
