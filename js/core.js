"use strict";
/* helpers, toasts, the overlay stack and the shell menus */

const $ = s => document.querySelector(s);
const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
const sleep = ms => new Promise(r => setTimeout(r, RM ? Math.min(ms, 40) : ms));
const stagger = async (els, step, fn) => { for (const el of els) { fn(el); await sleep(step); } };
const fmt = n => "€" + n.toLocaleString("en-IE");
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

/* ——— toast ——— */
function toast(msg){
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `<svg width="15" height="15" aria-hidden="true"><use href="#i-shard"/></svg><span></span>`;
  t.lastElementChild.textContent = msg;
  $("#toasts").appendChild(t);
  setTimeout(()=>{ t.classList.add("out"); setTimeout(()=>t.remove(), 320); }, 2600);
}

/* ——— overlays: one scrim, Esc closes the top one, focus is trapped and returned ——— */
const openStack = [];
let lastInvoker = null;
function anyOpen(){ return openStack.length > 0; }
function pushOverlay(el){
  lastInvoker = document.activeElement;
  $("#scrim").classList.add("on");
  el.classList.add("on");
  openStack.push(el);
  el.querySelector("[data-close],[data-mclose]")?.focus();
}
function closeTop(){
  const el = openStack.pop();
  if (!el) return;
  el.classList.remove("on");
  if (!anyOpen()) $("#scrim").classList.remove("on");
  hideMenus();
  if (lastInvoker?.isConnected) lastInvoker.focus();
}
function trapFocus(e){
  if (e.key !== "Tab" || !openStack.length) return;
  const top = openStack[openStack.length - 1];
  const focusables = [...top.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter(el => el.offsetParent !== null || el === document.activeElement);
  if (!focusables.length) return;
  const first = focusables[0], last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
}
function closeAll(){
  while (openStack.length) closeTop();
  hideMenus();
}
$("#scrim").addEventListener("click", closeAll);
document.addEventListener("keydown", e=>{
  if (e.key === "Escape"){ anyOpen() ? closeTop() : (hideMenus(), hidePop()); }
  if (e.key === "/" && !anyOpen() && document.activeElement !== $("#cmd")){
    e.preventDefault(); $("#cmd").focus();
  }
  trapFocus(e);
});
document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click", closeTop));

/* ——— the agent's line under the shell: fills while a page builds ——— */
const Seam = (()=>{
  const el = $("#seam");
  let t = 0;
  const set = (k, v) => el.style.setProperty(k, v);
  return {
    to(p){ clearTimeout(t); set("--on", 1); set("--p", p); },
    done(){
      this.to(1);
      t = setTimeout(()=>{ set("--on", 0); t = setTimeout(()=>set("--p", 0), 520); }, 700);
    },
    breathe(b){ set("--breath", b.toFixed(3)); },
  };
})();

/* ——— menus ——— */
function placeMenu(menu, anchor){
  const r = anchor.getBoundingClientRect();
  menu.style.top = (r.bottom + 8) + "px";
  let left = r.right - menu.offsetWidth;
  left = clamp(left, 8, innerWidth - menu.offsetWidth - 12);   // the last cell reaches the window edge
  menu.style.left = left + "px";
  menu.classList.add("on");
}
function hideMenus(){
  document.querySelectorAll(".menu").forEach(m=>m.classList.remove("on"));
  document.querySelectorAll('[aria-haspopup][aria-expanded]').forEach(b=>b.setAttribute("aria-expanded","false"));
}
function menuKeys(e){
  const items = [...e.currentTarget.querySelectorAll("button")];
  if (!items.length) return;
  const i = items.indexOf(document.activeElement);
  if (e.key === "ArrowDown"){ e.preventDefault(); items[(i + 1) % items.length].focus(); }
  else if (e.key === "ArrowUp"){ e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  else if (e.key === "Home"){ e.preventDefault(); items[0].focus(); }
  else if (e.key === "End"){ e.preventDefault(); items[items.length - 1].focus(); }
}
[$("#langMenu"), $("#userMenu")].forEach(m => m.addEventListener("keydown", menuKeys));

const LANGS = [["EN","English"],["ES","Español"],["FR","Français"],["DE","Deutsch"]];
$("#langBtn").addEventListener("click", e=>{
  e.stopPropagation();
  const m = $("#langMenu"), was = m.classList.contains("on");
  hideMenus();
  if (was) return;
  const cur = $("#langLabel").textContent;
  m.innerHTML = LANGS.map(([c,n])=>`
    <button role="menuitemradio" aria-checked="${c===cur}" class="${c===cur?"sel":""}" data-lang="${c}">
      <span>${n}</span><svg class="tick" width="14" height="14"><use href="#i-check"/></svg>
    </button>`).join("");
  placeMenu(m, $("#langBtn"));
  $("#langBtn").setAttribute("aria-expanded","true");
  m.querySelectorAll("[data-lang]").forEach(b=>b.addEventListener("click", ()=>{
    $("#langLabel").textContent = b.dataset.lang;
    hideMenus();
    toast("Concept demo — only the English copy exists for now");
  }));
});
$("#userBtn").addEventListener("click", e=>{
  e.stopPropagation();
  const m = $("#userMenu"), was = m.classList.contains("on");
  hideMenus();
  if (was) return;
  m.innerHTML = `
    <div class="mhead"><b>Javier R.</b><span>${STORE.member}</span></div>
    <button role="menuitem" data-u="profile">Profile</button>
    <button role="menuitem" data-u="settings">Settings</button>
    <button role="menuitem" data-u="out">Sign out</button>`;
  placeMenu(m, $("#userBtn"));
  $("#userBtn").setAttribute("aria-expanded","true");
  m.querySelectorAll("[data-u]").forEach(b=>b.addEventListener("click", ()=>{
    hideMenus(); toast("Concept mockup — accounts aren’t wired");
  }));
});
document.addEventListener("click", e=>{
  if (!e.target.closest(".menu")) hideMenus();
  if (!e.target.closest(".pop") && !e.target.closest(".spec-name")) hidePop();
});
