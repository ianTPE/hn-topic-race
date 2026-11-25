const {PAGE,OUT:S,launch,ok}=require("./helper.cjs");
(async()=>{const b=await launch();const p=await b.newPage();const errs=[];p.on("pageerror",e=>errs.push(e.message));

// page itself cannot boot until SNAPSHOT is refreshed with the new names, so drop it from lang
let N={'"php"':100,'".php"':30,'"javascript"':80,'"js"':60,'"javascript" ".js"':5,'".js"':20,'"javascript" "js"':10,'"c#"':40,'"csharp"':4,'"c#" "csharp"':1,'"zz"':9};
let un=[],noRestrict=0,denomRestrict=0;
await p.route(/hn\.algolia/,r=>{const u=new URL(r.request().url()).searchParams;const q=u.get("query"),ra=u.get("restrictSearchableAttributes");if(q===""){if(ra)denomRestrict++}else if(ra!=="title,story_text,comment_text")noRestrict++;
 if(q&&!(q in N))un.push(q);const n=q===""?1000:N[q]??0;
 const hits=q==='"php"'?[["1","php.php url"],["2","real php"]]:q==='".php"'?[["1","x"]]:q==='"javascript"'?[["10","javascript"]]:q==='"js"'?[["11","node.js"],["12","plain js"]]:q==='".js"'?[["11","node.js"]]:[];
 r.fulfill({json:{nbHits:n,exhaustiveNbHits:true,hits:hits.map(([objectID,title])=>({objectID,title}))},headers:{"access-control-allow-origin":"*"}})});
await p.goto(PAGE);await p.waitForTimeout(200);
await p.check(`input[name=category][value=${"custom"}]`,{force:true});await p.selectOption("#months","12");
await p.fill("#terms",'php, "javascript / js", "c# / csharp", zz');await p.click("#load");await p.waitForFunction(()=>!$("load").disabled,null,{timeout:60000});await p.waitForTimeout(80);
const v=await p.evaluate(()=>data.map(d=>[d.name,Math.round(d.values[0])]));
ok("counts",JSON.stringify(v)===JSON.stringify([["php",70000],["javascript / js",115000],["c# / csharp",43000],["zz",9000]]),JSON.stringify(v));
ok("all term queries text-only",noRestrict===0);ok("denominator unrestricted",denomRestrict===0);ok("no unexpected queries",un.length===0,un);
await p.click("#spotBtn");await p.waitForSelector("#spot details");const t=await p.textContent("#spot");ok("spot drops .php/.js only hits",!/php\.php url|node\.js/.test(t)&&/real php/.test(t)&&/plain js/.test(t));ok("spot count",/php — 70 /.test(t)&&/javascript \/ js — 115 /.test(t),t.slice(0,120));
ok("v2 cache",await p.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith("hn-race:")&&k!=="hn-race:lang").every(k=>k.startsWith("hn-race:v2:"))));
ok("no page errors",errs.length===0,errs);await b.close()})().catch(e=>{console.error(e);process.exit(1)})
