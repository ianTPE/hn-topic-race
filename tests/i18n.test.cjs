const {PAGE,OUT:S,launch,ok}=require("./helper.cjs");
const CJK=/[㐀-鿿]/;
(async()=>{
 const b=await launch();
 const c=await b.newContext({viewport:{width:1400,height:1250},locale:"de-DE",acceptDownloads:true}); const p=await c.newPage();
 const errs=[]; p.on("pageerror",e=>errs.push(e.message)); p.on("console",m=>m.type()==="error"&&errs.push(m.text()));
 let reqs=0, mode="ok", net=0; p.on("request",r=>/^https?:/.test(r.url())&&net++);
 await p.route("https://hn.algolia.com/**",r=>{reqs++; if(mode==="fail"&&/duckdb/.test(r.request().url())) return r.fulfill({status:404,body:"x"});
   r.fulfill({json:{nbHits:1234,exhaustiveNbHits:true,hits:[{objectID:"1",title:"hello postgres",_highlightResult:{title:{value:"hello <mark>postgres</mark>"}}}]},headers:{"access-control-allow-origin":"*"}})});
 const vis=()=>p.evaluate(()=>{const c=document.body.cloneNode(true);return document.body.innerText});
 const st=()=>p.textContent("#status"), drawn=()=>p.evaluate(()=>{render(progress);return [...canvas.querySelectorAll("h2,p,time,.name,.val,.tick,.years span")].map(e=>e.textContent).concat([...canvas.querySelectorAll("[title]")].map(e=>e.title)).filter(Boolean)});
 
 const attrs=()=>p.evaluate(()=>[...document.querySelectorAll("*")].flatMap(e=>["title","placeholder","aria-label"].map(a=>e.getAttribute(a))).filter(Boolean).join("|"));
 await p.goto(PAGE); await p.waitForTimeout(2500);
 ok("default lang en",await p.evaluate(()=>document.documentElement.lang)==="en",await p.title());
 const left=(await vis()).split("\n").filter(l=>CJK.test(l)); ok("no CJK visible in EN except toggle",left.join()==="中文",left);
 ok("no CJK attrs EN",!CJK.test(await attrs()));
 const d=await drawn(); ok("canvas EN",!CJK.test(d.join())); console.log(d.slice(0,2),d.slice(-3));
 ok("subtitle fits",await p.evaluate(()=>{const e=$("cTitle").children[1];return e.scrollWidth<=e.clientWidth}));
 ok("0 requests (browser-level)",net===0); console.log(await st());
 await p.screenshot({path:S+"/en.png"});
 await p.click("[data-set-lang=zh]"); 
 ok("zh html lang/title",await p.evaluate(()=>document.documentElement.lang)==="zh-Hant",await p.title());
 const d2=await drawn(); console.log(d2.slice(0,2)); console.log(await st(), await p.textContent("#play"));
 ok("zh attrs",CJK.test(await attrs())); await p.screenshot({path:S+"/zh.png"});
 await p.reload(); await p.waitForTimeout(300); ok("zh persists",await p.evaluate(()=>document.documentElement.lang)==="zh-Hant");
 await p.click("#clearCache"); ok("clear cache keeps lang",await p.evaluate(()=>localStorage.getItem("hn-race:lang"))==="zh"); console.log(await st());
 await p.click("#play"); ok("paused zh",(await p.innerText("#play")).trim()==="播放"); await p.click("[data-set-lang=en]"); ok("paused en",(await p.innerText("#play")).trim()==="Play");
 ok("toggling keeps progress/terms",await p.evaluate(()=>progress>0)&&/claude/.test(await p.inputValue("#terms")));
 console.log(await st());
 // demo-sized fetch
 reqs=0; await p.click("#load"); await p.waitForTimeout(800); console.log(await st()); await p.click("[data-set-lang=zh]"); await p.waitForTimeout(300); console.log(await st()); await p.click("[data-set-lang=en]");
 await p.waitForFunction(()=>!document.getElementById("load").disabled,null,{timeout:180000}); ok("default fetch = 930 requests, all mocked",reqs===930&&net===930,`${reqs} ${net} ${await st()}`);
 reqs=0; await p.click("#load"); await p.waitForFunction(()=>!document.getElementById("load").disabled,null,{timeout:60000}); await p.waitForTimeout(100); console.log("2nd",reqs,await st());
 // failures
 await p.fill("#terms","duckdb, sqlite"); await p.selectOption("#months","12"); await p.uncheck("#exact"); mode="fail";
 await p.click("#load"); await p.waitForFunction(()=>!document.getElementById("load").disabled,null,{timeout:180000}); await p.waitForTimeout(100);
 console.log(await st()); await p.click("[data-set-lang=zh]"); console.log(await st()); await p.click("[data-set-lang=en]");
 await p.click("#spotBtn"); await p.waitForFunction(()=>document.querySelector("#spot details"),null,{timeout:60000}); await p.click("#spot details:nth-of-type(2) summary");
 console.log(await p.innerText("#spot")); await p.click("[data-set-lang=zh]"); console.log(await p.innerText("#spot"), "open:",await p.$$eval("#spot details[open]",x=>x.length)); await p.click("[data-set-lang=en]");
 // record
 await p.click("#demoBtn"); await p.evaluate(()=>{duration=2000});
 const dl=p.waitForEvent("download",{timeout:30000}); await p.click("#download"); await p.waitForTimeout(400);
 ok("lang locked while recording",await p.isDisabled("[data-set-lang=zh]")); console.log(await st());
 const f=await dl; await p.waitForTimeout(200); ok("unlocked",!(await p.isDisabled("[data-set-lang=zh]")),f.suggestedFilename()); console.log(await st());
 await p.fill("#terms",""); await p.click("#load"); console.log(await st());
 ok("MSG keys match",await p.evaluate(()=>Object.keys(MSG.en).join()===Object.keys(MSG.zh).join()));
 await p.setViewportSize({width:420,height:900}); await p.evaluate(()=>scrollTo(0,0)); await p.screenshot({path:S+"/narrow.png"});
 const bad=errs.filter(e=>!/404/.test(e));ok("no page errors",bad.length===0,bad);
 await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
