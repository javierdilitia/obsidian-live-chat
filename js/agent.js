"use strict";
/* Tabs, and the agent that decides where each answer goes.
   A tab holds { state, qs (the questions that shaped it), el (its built page) }.
   - build(): a whole page — the globe thinks, its dots land on the page's outline, the page fills in.
   - patch(): a follow-up on the open comparison — only the parts that differ step back, rebuild and glow. */

const workspace = $("#workspace"), homeEl = $("#home"), input = $("#cmd"), chipsEl = $("#chips");
const tabs = [];
let active = null, seq = 0, busy = false;

/* ——— tabs ——— */
function addTab(){
  const id = "tab-" + (++seq);
  const node = document.createElement("div");
  node.className = "tab"; node.setAttribute("role","presentation");
  node.innerHTML = `
    <button class="tab-main" role="tab" id="${id}" aria-controls="workspace" aria-selected="false" tabindex="-1">
      <span class="tab-ico"><svg width="14" height="14"><use href="#i-spark"/></svg></span><span class="tab-t">New page</span>
    </button>
    <button class="tab-x" aria-label="Close tab: New page" tabindex="-1"><svg width="11" height="11"><use href="#i-x"/></svg></button>`;
  const tab = { id, node, btn:node.querySelector(".tab-main"), state:null, qs:[], q:"", el:null, scroll:0 };
  tab.btn.addEventListener("click", ()=>{ if (!busy) activate(tab); });
  node.querySelector(".tab-x").addEventListener("click", e=>{ e.stopPropagation(); closeTab(tab); });
  node.addEventListener("auxclick", e=>{ if (e.button === 1){ e.preventDefault(); closeTab(tab); } });
  $("#tabs").appendChild(node);
  tabs.push(tab);
  document.body.classList.add("tabs-on");
  $("#tabsCollapse").classList.remove("closed");
  return tab;
}
function setTabLook(tab, { title, icon, loading }){
  if (title){
    tab.node.querySelector(".tab-t").textContent = title;
    tab.node.querySelector(".tab-x").setAttribute("aria-label", "Close tab: " + title);
    tab.node.title = tab.q || title;
  }
  tab.node.querySelector(".tab-ico").innerHTML = loading
    ? `<span class="tload" role="img" aria-label="Building"></span>`
    : `<svg width="14" height="14"><use href="#${icon || "i-spark"}"/></svg>`;
}
function showHome(){
  homeEl.classList.remove("gone");
  workspace.replaceChildren(homeEl);
}
/* keep: leave the workspace as it is (the first question fades the home page itself)
   blank: clear it (a new tab opened by the agent fills straight away) */
function activate(tab, { keep = false, blank = false } = {}){
  if (active && active !== tab) active.scroll = scrollY;
  active = tab;
  tabs.forEach(t=>{
    const on = t === tab;
    t.node.classList.toggle("active", on);
    t.btn.setAttribute("aria-selected", on);
    t.btn.tabIndex = on ? 0 : -1;
    t.node.querySelector(".tab-x").tabIndex = on ? 0 : -1;
  });
  workspace.setAttribute("role", "tabpanel");
  workspace.setAttribute("aria-labelledby", tab.id);
  if (tab.el){ workspace.replaceChildren(tab.el); syncBuy(tab.el); }
  else if (blank) workspace.replaceChildren();
  else if (!keep) showHome();
  input.value = tab.q; updateSend();
  renderChips();
  window.scrollTo({ top:tab.scroll || 0, behavior:"instant" });
  tab.node.scrollIntoView({ block:"nearest", inline:"nearest" });
}
function closeTab(tab){
  if (busy) return;
  const i = tabs.indexOf(tab);
  if (i < 0) return;
  tabs.splice(i, 1);
  tab.node.classList.add("closing");
  setTimeout(()=>tab.node.remove(), 280);
  if (!tabs.length){ toLanding(); return; }
  if (active === tab){ active = null; activate(tabs[Math.min(i, tabs.length - 1)]); active.btn.focus(); }
  else renderChips();
}
/* the last tab closed: back to the landing — home page, empty command bar, starter chips */
function toLanding(){
  active = null;
  document.body.classList.remove("tabs-on");
  $("#tabsCollapse").classList.add("closed");
  workspace.removeAttribute("aria-labelledby");
  workspace.removeAttribute("role");
  hidePop();
  showHome();
  input.value = ""; updateSend();
  capState("");
  renderChips();
  window.scrollTo({ top:0, behavior:"instant" });
  input.focus({ preventScroll:true });
}
$("#newTab").addEventListener("click", ()=>{
  if (busy) return;
  const t = addTab(); activate(t); input.focus();
});
$("#tabs").addEventListener("keydown", e=>{
  if (!active || busy) return;
  const i = tabs.indexOf(active);
  let to = null;
  if (e.key === "ArrowRight") to = tabs[(i + 1) % tabs.length];
  else if (e.key === "ArrowLeft") to = tabs[(i - 1 + tabs.length) % tabs.length];
  else if (e.key === "Home") to = tabs[0];
  else if (e.key === "End") to = tabs[tabs.length - 1];
  else if (e.key === "Delete" && e.target.classList.contains("tab-main")){ e.preventDefault(); closeTab(active); return; }
  if (to){ e.preventDefault(); activate(to); to.btn.focus(); }
});

/* ——— page state ——— */
const familyOf = state => state.page;
const sameState = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/* what a page looks like after this question — a comparison carries over its set and sections */
let pendingOrder = null;   // the cart, as it is checked out
function nextState(prev, key){
  if (key === "checkout") return { page:"confirm", order:pendingOrder };
  if (SC[key].family !== "compare") return { page:key };
  const s = (key === "laptops" || prev?.page !== "compare")
    ? { page:"compare", set:"laptops", color:false }
    : { ...prev };
  if (key === "color") s.color = true;
  if (key === "laptopsOled") s.set = "laptopsOled";
  if (key === "laptopsAll") s.set = "laptops";
  return s;
}

/* ——— the agent decides where an answer goes ——— */
function decide(key){
  if (!active) return { how:"new" };
  if (!active.state) return { how:"here", op:"page" };                      // an empty + tab takes it
  if (key === "checkout") return { how:"new" };                             // every order gets its own page
  const fam = SC[key].family;
  if (fam === familyOf(active.state)){                                      // same kind of page: change this one
    if (sameState(nextState(active.state, key), active.state)) return { how:"stay" };
    return { how:"here", op:SC[key].op };
  }
  const open = tabs.find(t => t.state && familyOf(t.state) === fam && sameState(nextState(t.state, key), t.state));
  if (open) return { how:"switch", tab:open };                              // already built — go there
  return { how:"new" };                                                     // a different kind of page: its own tab
}
const HOW = {
  update:  { icon:"i-refine", hint:"updates this page" },
  rebuild: { icon:"i-refine", hint:"rebuilds this page" },
  new:     { icon:"i-newtab", hint:"opens a new tab" },
  switch:  { icon:"i-switch", hint:"switches to its tab" },
  stay:    { icon:"i-switch", hint:"already on this page" },
};
const howOf = d => d.how === "here" ? (d.op === "page" ? HOW.rebuild : HOW.update) : HOW[d.how];
/* the agent says what it decided, and why, in the command bar */
function reason(d, from){
  const kind = KINDS[familyOf(from)];
  if (d.how === "new") return `<b>New tab</b> · keeping the ${kind} as it is`;
  if (d.op === "page") return `<b>This tab</b> · rebuilding the ${kind}`;
  return `<b>This page</b> · updating the ${kind}`;
}

function renderChips(){
  const st = active?.state;
  const list = st ? followUps(st) : STARTERS;
  chipsEl.innerHTML = list.map(([k, label])=>{
    if (!st) return `<button class="chip" data-k="${k}"><span class="dot"></span>${esc(label)}</button>`;
    const h = howOf(decide(k));
    return `<button class="chip" data-k="${k}" title="${h.hint[0].toUpperCase() + h.hint.slice(1)}" aria-label="${esc(label)} — ${h.hint}"><svg width="13" height="13" aria-hidden="true"><use href="#${h.icon}"/></svg>${esc(label)}</button>`;
  }).join("");
  chipsEl.querySelectorAll(".chip").forEach(c=>c.addEventListener("click", ()=>ask(c.dataset.k, c.textContent.trim(), true)));
  chipsEl.classList.remove("gone", "fresh"); void chipsEl.offsetWidth; chipsEl.classList.add("fresh");
}
let stateTimer = 0;
function capState(html, ms = 0){
  clearTimeout(stateTimer);
  const s = $("#capState");
  if (!html){ s.classList.remove("on"); return; }
  s.innerHTML = html; s.classList.add("on");
  if (ms) stateTimer = setTimeout(()=>s.classList.remove("on"), ms);
}

/* ——— ask ——— */
async function ask(key, q, typed){
  if (busy || !SC[key]) return;
  if (key === "checkout"){ if (!cart.length) return; pendingOrder = makeOrder(); }
  const d = decide(key);
  if (d.how === "switch"){ activate(d.tab); capState(`<b>Already built</b> · switched tabs`, 2200); return; }
  if (d.how === "stay"){ capState(`<b>Already on this page</b>`, 2200); return; }
  busy = true;
  hidePop(); hideMenus();
  const first = !active;
  if (first && scrollY > 0){ window.scrollTo({ top:0, behavior:RM ? "instant" : "smooth" }); await sleep(450); }
  if (typed){
    input.value = "";
    if (!RM) for (const ch of q){ input.value += ch; updateSend(); await sleep(14); }
    else { input.value = q; updateSend(); }
    await sleep(300);
  }
  // say where the answer goes before building it — this is the agent's call, made visible
  if (active?.state){ capState(reason(d, active.state)); await sleep(1200); }

  const tab = d.how === "new" ? addTab() : active;
  if (d.how === "new") activate(tab, first ? { keep:true } : { blank:true });
  const state = nextState(tab.state, key);
  try {
    if (d.how === "here" && d.op !== "page" && tab.state?.page === "compare") await patch(tab, state, q, SC[key]);
    else await build(tab, state, q, SC[key]);
    if (key === "checkout") placeOrder(state.order);
  } finally {
    busy = false;
  }
}

/* a whole page: the old one steps back, the globe thinks, its dots land as the new page's outline */
async function build(tab, state, q, sc){
  tab.state = state; tab.qs = [q]; tab.q = q;
  input.value = q; updateSend(); input.blur();
  const look = lookOf(state);
  setTabLook(tab, { title:look.title, loading:true });
  chipsEl.classList.add("gone");
  capState(`<b>Thinking</b>`);
  Seam.to(.18);

  const old = workspace.firstElementChild;
  if (old === homeEl){ homeEl.classList.add("gone"); await sleep(520); }
  else if (old){ old.classList.add("leaving"); await sleep(300); }
  else await sleep(120);
  workspace.replaceChildren();
  if (scrollY > 0) window.scrollTo({ top:0, behavior:"instant" });

  const c = orbCenter();
  Orb.think(c.x, c.y, c.r);
  await sleep(1700);

  capState(`<b>${sc.status}</b>`);
  Seam.to(.55);
  const el = makePage(state, tab.qs);
  el.style.opacity = "0";
  workspace.replaceChildren(el);
  await Orb.land(outlinePoints([el, ...el.querySelectorAll(OUTLINE)], 300));
  Seam.to(.85);
  const enter = el.animate([{ opacity:0 }, { opacity:1 }], { duration:RM ? 1 : 420, easing:"ease-out", fill:"forwards" });
  enter.onfinish = ()=>{ el.style.opacity = ""; enter.cancel(); };
  Orb.fade();

  await stagger([...el.querySelectorAll(".rise")], RM ? 10 : 45, n=>n.classList.add("in"));
  const radar = el.querySelector(".rpoly")?.ownerSVGElement;
  if (radar) drawRadar(radar);
  el.querySelectorAll(".bar-fill, .steps .fill").forEach((b,i)=>setTimeout(()=>{ b.style.width = b.dataset.w + "%"; }, RM ? 0 : i*120));
  const peeks = el.querySelectorAll(".spec-name");
  peeks.forEach(n=>n.classList.add("peek"));
  setTimeout(()=>peeks.forEach(n=>n.classList.remove("peek")), 1800);

  wireArtifact(el, state);
  tab.el = el;
  setTabLook(tab, { title:look.title, icon:look.icon });
  capState(`<b>Built</b> · just now`, 2400);
  Seam.done();
  renderChips();
}

/* a follow-up on the open comparison: render old and new, change only what differs */
async function patch(tab, state, q, sc){
  const qs = [...tab.qs, q];
  const before = makePage(tab.state, tab.qs), el = makePage(state, qs);
  const changed = new Set();
  el.querySelectorAll("[data-k]").forEach(n=>{
    const o = before.querySelector(`[data-k="${n.dataset.k}"]`);
    if (!o || o.innerHTML !== n.innerHTML) changed.add(n.dataset.k);
  });
  const existed = k => !!before.querySelector(`[data-k="${k}"]`);
  const keyOf = n => n.closest("[data-k]")?.dataset.k;
  const swapped = SETS[state.set].items.filter((_, i)=>changed.has(`prod-${i}`)).length;
  const grow = el.querySelector(".grow-wrap");
  const grows = !!grow && !before.querySelector(".grow-wrap");

  tab.state = state; tab.qs = qs; tab.q = q;
  input.value = q; updateSend(); input.blur();
  const look = lookOf(state);
  setTabLook(tab, { title:look.title, loading:true });
  chipsEl.classList.add("gone");
  if (scrollY > 0){ window.scrollTo({ top:0, behavior:RM ? "instant" : "smooth" }); await sleep(500); }

  // the parts about to change step back; everything else stays exactly where it is
  capState(`<b>Thinking</b>`);
  Seam.to(.18);
  tab.el.querySelectorAll("[data-k]").forEach(n=>{ if (changed.has(n.dataset.k)) n.classList.add("out"); });
  await sleep(380);

  // put the new page in place: unchanged parts already at rest, changed parts waiting to land
  el.querySelectorAll(".rise").forEach(n=>{ if (!changed.has(n.dataset.k)) n.classList.add("in"); });
  el.querySelectorAll(".bar-fill").forEach(b=>{
    if (!changed.has(keyOf(b))){ b.style.transition = "none"; b.style.width = b.dataset.w + "%"; }
  });
  const radar = el.querySelector(".rpoly")?.ownerSVGElement;
  if (radar && !changed.has("radar")) settleRadar(radar);
  if (grows) grow.classList.add("shut");
  wireArtifact(el, state);
  tab.el.replaceWith(el);
  tab.el = el;
  requestAnimationFrame(()=>el.querySelectorAll(".bar-fill").forEach(b=>{ b.style.transition = ""; }));

  // think over the page, open room for a new section, then land the dots on what changed
  const c = orbCenter();
  Orb.think(c.x, c.y, c.r * .72);
  await sleep(1300);
  capState(`<b>${sc.status}</b>`);
  Seam.to(.55);
  if (grows){ grow.classList.remove("shut"); await sleep(620); }
  const targets = [...el.querySelectorAll("[data-k]")].filter(n=>changed.has(n.dataset.k));
  await Orb.land(outlinePoints(targets, 300));
  Seam.to(.85);
  Orb.fade();

  await stagger(targets, RM ? 10 : 40, n=>{
    n.classList.add("in");
    if (existed(n.dataset.k)) n.classList.add("morph");
  });
  if (radar && changed.has("radar")){
    const only = new Set(SETS[state.set].items.map((_, i)=>i).filter(i=>changed.has(`prod-${i}`)));
    drawRadar(radar, only.size ? only : null);
  }
  let j = 0;
  el.querySelectorAll(".bar-fill").forEach(b=>{
    if (!changed.has(keyOf(b))) return;
    const delay = RM ? 0 : (j++) * 90;
    setTimeout(()=>{ b.style.width = b.dataset.w + "%"; }, delay);
  });
  setTimeout(()=>el.querySelectorAll(".morph").forEach(n=>n.classList.remove("morph")), 2000);

  setTabLook(tab, { title:look.title, icon:look.icon });
  const what = grows ? "1 section added" : swapped ? `${swapped} laptop${swapped > 1 ? "s" : ""} swapped` : "page updated";
  capState(`<b>Updated</b> · ${what}`, 2800);
  Seam.done();
  renderChips();
}

/* ——— command bar ——— */
function updateSend(){
  const v = input.value.trim();
  $("#sendBtn").classList.toggle("ready", v.length > 0 && v !== active?.q);
}
function submit(){
  const raw = input.value.trim();
  if (!raw || busy) return;
  if (raw === active?.q) return;
  const k = ALIASES[raw.toLowerCase()];
  if (k) ask(k, raw, false);
  else suggest(raw);
}
/* typed text the script doesn't know: offer the closest questions it can build, right under the bar */
const HINTS = [
  ["checkout", /check ?out|\bpay|basket|cart|\bbuy/],
  ["oled",    /burn|oled|ghost|screen damage/],
  ["order",   /order|track|parcel|deliver|dock|ship|arriv/],
  ["color",   /colou?r|grad|accura|calibrat/],
  ["laptops", /laptop|notebook|computer|\bpc\b|edit|video|school|stud|work|cheap|budget|under|€|\d/],
];
function suggest(raw){
  const t = raw.toLowerCase(), onCompare = active?.state?.page === "compare";
  let keys = HINTS.filter(([, re])=>re.test(t)).map(([k])=>k)
    .filter(k => k !== "checkout" || cart.length)
    .map(k => k === "color" && !onCompare ? "laptops" : k);
  keys = [...new Set(keys)];
  if (!keys.length) keys = STARTERS.map(([k])=>k).slice(0, 2);
  const list = keys.slice(0, 2).map(k=>[k, SC[k].q]);
  chipsEl.innerHTML = `<span class="chip-note">This demo is scripted — the closest I can build:</span>`
    + list.map(([k, label])=>`<button class="chip" data-k="${k}"><svg width="13" height="13" aria-hidden="true"><use href="#i-spark"/></svg>${esc(label)}</button>`).join("");
  chipsEl.querySelectorAll(".chip").forEach(c=>c.addEventListener("click", ()=>ask(c.dataset.k, c.textContent.trim(), true)));
  chipsEl.classList.remove("gone", "fresh"); void chipsEl.offsetWidth; chipsEl.classList.add("fresh");
  capState(`<b>Not in the script</b> · closest below`, 2600);
}
input.addEventListener("input", updateSend);
input.addEventListener("focus", ()=>{ if (active?.q && input.value === active.q) input.select(); });
input.addEventListener("keydown", e=>{ if (e.key === "Enter") submit(); });
$("#sendBtn").addEventListener("click", submit);
