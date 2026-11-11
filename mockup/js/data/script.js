"use strict";
/* The scripted conversation: every question the mockup understands, and what it does.

   family  which kind of page answers it — a question in the same family as the open tab can change that tab
   op      "page"   builds a whole page
           "append" adds a section to the comparison already open
           "swap"   changes parts of the comparison already open (e.g. swaps products)
   The agent's choice of tab lives in js/agent.js → decide().                                          */

const SC = {
  laptops:     { q:"Compare 3 laptops for video editing under €2,000", family:"compare", op:"page",   status:"Building comparison" },
  color:       { q:"Add colour accuracy for grading",                  family:"compare", op:"append", status:"Adding colour accuracy" },
  laptopsOled: { q:"Only OLED screens",                                family:"compare", op:"swap",   status:"Swapping in OLED laptops" },
  laptopsAll:  { q:"Show every panel type",                            family:"compare", op:"swap",   status:"Bringing back every panel" },
  oled:        { q:"What is OLED burn-in?",                            family:"oled",    op:"page",   status:"Writing it up" },
  order:       { q:"Track my last order",                              family:"order",   op:"page",   status:"Fetching tracking" },
  checkout:    { q:"Check out my cart",                                family:"confirm", op:"page",   status:"Placing your order" },
};
const KINDS = { compare:"comparison", oled:"guide", order:"tracking page", confirm:"order" };

/* before the first question, and on an empty + tab */
const STARTERS = [["laptops", SC.laptops.q], ["oled", SC.oled.q], ["order", SC.order.q]];

/* the home page's "Pick up where you left off" — asking again rebuilds the page */
const RECENTS = [
  { key:"order",       q:"Where is my Kore Dock?",         when:"yesterday" },
  { key:"laptopsOled", q:"OLED laptops under €2,000",      when:"2 days ago" },
  { key:"oled",        q:"Does OLED burn in on laptops?",  when:"last week" },
];

/* follow-ups offered under a built page — the agent shows on each chip what it will do */
function followUps(state){
  if (state.page === "compare"){
    const list = [];
    if (!state.color) list.push(["color", SC.color.q]);
    list.push(state.set === "laptopsOled" ? ["laptopsAll", SC.laptopsAll.q] : ["laptopsOled", SC.laptopsOled.q]);
    list.push(["oled", SC.oled.q]);
    if (state.color) list.push(["order", SC.order.q]);
    return list;
  }
  if (state.page === "confirm") return [["oled", SC.oled.q], ["order", "Where is my Kore Dock?"]];
  if (state.page === "oled") return [["laptopsOled", "Compare OLED laptops under €2,000"], ["laptops", SC.laptops.q], ["order", SC.order.q]];
  return [["laptops", SC.laptops.q], ["oled", SC.oled.q]];
}

/* typed text → question (every scripted phrasing works from the command bar) */
const PHRASES = [
  ...Object.entries(SC).filter(([k]) => k !== "checkout").map(([k, s]) => [k, s.q]),
  ["laptopsOled", "Compare OLED laptops under €2,000"],
  ...RECENTS.map(r => [r.key, r.q]),
];
const ALIASES = Object.fromEntries(PHRASES.map(([k, q]) => [q.toLowerCase(), k]));

/* the presenter tour (#demo): build → add a section → swap products → a new kind of page gets its own tab */
const TOUR = ["laptops", "color", "laptopsOled", "oled"];
