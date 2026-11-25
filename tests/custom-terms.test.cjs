const {PAGE,OUT:S,launch,ok}=require("./helper.cjs");
(async()=>{const b=await launch();
const errs=[];
async function mk(opt){const c=await b.newContext(opt);const p=await c.newPage();p.on("pageerror",e=>errs.push(e.message));p.net=0;p.delay=0;p.hits=0;
 await p.route(/^https?:/,async r=>{p.hits++;if(p.delay)await new Promise(z=>setTimeout(z,p.delay));r.fulfill({json:{nbHits:1234,exhaustiveNbHits:true,facets:{_tags:{story:100000,comment:300000}},hits:[]},headers:{"access-control-allow-origin":"*"}}).catch(()=>{})});
 await p.goto(PAGE);await p.waitForTimeout(500);return p}
const cat=p=>p.evaluate(()=>category.value), st=p=>p.textContent("#status"), foc=p=>p.evaluate(()=>document.activeElement.id||document.activeElement.value), val=p=>p.inputValue("#terms");
const idle=p=>p.waitForFunction(()=>!document.getElementById("load").disabled,null,{timeout:60000});
const p=await mk({viewport:{width:1400,height:900}});
const chip=c=>`.cats label:has([value=${c}])`;
await p.click(chip("db"));await p.click(chip("custom"));await p.waitForTimeout(900);
ok("custom focus+empty",await foc(p)==="terms"&&await val(p)===""&&await cat(p)==="custom");ok("hint",/press Enter/.test(await st(p)),await st(p));
ok("chart kept",await p.evaluate(()=>chartCat==="db"&&data.length>1&&playing));
const geo=()=>p.evaluate(()=>{const r=e=>$(e).getBoundingClientRect();return{status:Math.round(r("status").top),form:[Math.round(r("customForm").top),Math.round(r("customForm").bottom)],canvas:Math.round(r("canvas").top),ih:innerHeight}});
const g=await geo();ok("panel visible",g.form[0]>=0&&g.form[1]<=g.ih&&g.status>=0,JSON.stringify(g));await p.screenshot({path:S+"/cu.png"});
await p.keyboard.press("Enter");ok("empty Enter -> needTerm",/at least one/.test(await st(p))&&await foc(p)==="terms"&&p.hits===0);
await p.keyboard.type("rust, zig");await p.click(chip("lang"));ok("to lang",await cat(p)==="lang"&&/python|rust/.test(await val(p)));
await p.click(chip("custom"));ok("draft restored",await val(p)==="rust, zig"&&await p.evaluate(()=>{const t=$("terms");return t.selectionStart===0&&t.selectionEnd===9}));
await p.click("#demoBtn");ok("offline -> last preset",await cat(p)==="lang");
// edit in preset
await p.click(chip("editor"));await p.focus("#terms");await p.keyboard.press("End");await p.keyboard.type(", nano");ok("edit flips",await cat(p)==="custom");
for(let i=0;i<6;i++)await p.keyboard.press("Backspace");ok("undo flips back",await cat(p)==="editor");
// Enter fetch once
await p.selectOption("#months","12");await p.fill("#terms","rust, zig");p.hits=0;p.delay=30;await p.focus("#terms");await p.keyboard.press("Enter");await p.keyboard.press("Enter");await p.waitForTimeout(150);
ok("busy",await p.isDisabled("#load"));await idle(p);await p.waitForTimeout(900);ok("fetched",/Ready/.test(await st(p))&&await cat(p)==="custom"&&await p.evaluate(()=>chartCat===null&&data.map(d=>d.name).join()==="rust,zig"),p.hits+" "+await st(p));
ok("scrolled back",(await geo()).canvas>=0,JSON.stringify(await geo()));
ok("expected hits = 14 months*3",p.hits===42,p.hits);
// composition Enter must not submit
p.hits=0;const cdp=await p.context().newCDPSession(p);await p.fill("#terms","");await p.focus("#terms");await cdp.send("Input.imeSetComposition",{text:"ㄋㄧ",selectionStart:2,selectionEnd:2});
await cdp.send("Input.dispatchKeyEvent",{type:"rawKeyDown",windowsVirtualKeyCode:229,key:"Process",code:"Enter"});await cdp.send("Input.insertText",{text:"你"});await p.waitForTimeout(100);ok("IME no submit",p.hits===0&&await val(p)==="你",await val(p));
// fetch exact preset typed from custom -> chip becomes preset
await p.click(chip("custom"));const t=await p.evaluate(()=>termsToInput(CATEGORIES.cloud));await p.fill("#terms",t);await p.focus("#terms");p.delay=0;await p.keyboard.press("Enter");await p.waitForTimeout(100);await idle(p);ok("preset typed -> chip",await cat(p)==="cloud");
// failure / typing while fetching
await p.fill("#terms","go");await p.click("#load");await p.fill("#terms","elixir");await idle(p);ok("typed during fetch",await cat(p)==="custom"&&await val(p)==="elixir");
// keyboard arrows
await p.click(chip("infra"));await p.keyboard.press("ArrowRight");ok("arrow to custom keeps focus",await cat(p)==="custom"&&await foc(p)==="custom",await foc(p));
await p.keyboard.press("ArrowRight");ok("arrow on -> model",await cat(p)==="model");await p.keyboard.press("ArrowLeft");await p.keyboard.press("Space");ok("space focuses",await foc(p)==="terms");
await p.focus(".cats [value=custom]");await p.keyboard.press("Enter");ok("enter focuses",await foc(p)==="terms");
await p.click("[data-set-lang=zh]");await p.click(chip("model"));await p.click(chip("custom"));ok("zh hint",/按 Enter/.test(await st(p)),await st(p));await p.click("[data-set-lang=en]");ok("re-render hint",/press Enter/.test(await st(p)));
await p.fill("#terms","a, b");await p.evaluate(()=>scrollTo(0,0));await p.click(chip("custom"));ok("re-click keeps text+focus",await val(p)==="a, b"&&await foc(p)==="terms");
await p.focus("#exact");ok("buttons no submit",await p.evaluate(()=>["spotBtn","demoBtn","clearCache"].every(i=>$(i).type==="button")));
ok("MSG keys",await p.evaluate(()=>Object.keys(MSG.en).join()===Object.keys(MSG.zh).join()));
const m=await mk({viewport:{width:390,height:844},hasTouch:true,isMobile:true});await m.locator(chip("custom")).scrollIntoViewIfNeeded();await m.tap(chip("custom"));await m.waitForTimeout(1000);
ok("mobile focus",await foc(m)==="terms",JSON.stringify(await m.evaluate(()=>({s:Math.round($("status").getBoundingClientRect().top),t:Math.round($("terms").getBoundingClientRect().top),sw:document.documentElement.scrollWidth}))));await m.screenshot({path:S+"/cum.png"});
await m.selectOption("#months","12");await m.fill("#terms","rust, zig");await m.focus("#terms");await m.keyboard.press("Enter");await m.waitForTimeout(200);await idle(m);await m.waitForTimeout(1500);ok("mobile back to chart",await m.evaluate(()=>canvas.getBoundingClientRect().top>=0&&canvas.getBoundingClientRect().top<200&&document.activeElement.id!=="terms"),await m.evaluate(()=>canvas.getBoundingClientRect().top));
ok("no page errors",errs.length===0,errs);await b.close()})().catch(e=>{console.error(e);process.exit(1)});
