"use strict";
/* Synthetic catalog — every product, price, rating, spec and order here is fictional demo data.
   Laptops carry their colour measurements (p3 = % of DCI-P3, de = ΔE colour error) for the grading follow-up.
   finish + screen pick how js/renders.js draws each product; hex is its series colour in the charts. */

/* the store this assistant runs in — swap the name per client pitch */
const STORE = { name:"Halden", member:"Halden member since 2023" };
const DELIVERY = { day:"Thu 12 Nov", returns:"30-day returns", warranty:"2-year warranty" };

const LAPTOPS = [
  { name:"Aeris Studio 16", price:1899, was:2199, hex:"#D6E6F5", finish:"silver", screen:"dusk", rating:4.8, reviews:1326,
    display:"16.2″ mini-LED", hz:"165 Hz", cpu:"12-core · 3.9 GHz", gpu:"16-core iGPU",
    ram:"32 GB LPDDR5", ssd:"1 TB NVMe", batt:18, weight:"1.74 kg", ports:"6 (3× TB5, HDMI, SD)",
    p3:100, de:0.8, radar:[9,9.5,9,6.5,7.5,7] },
  { name:"Kore Zephyr 14", price:1749, hex:"#9CBEE0", finish:"graphite", screen:"sea", rating:4.6, reviews:2184,
    display:"14.5″ OLED", hz:"120 Hz", cpu:"10-core · 4.2 GHz", gpu:"8-core iGPU",
    ram:"16 GB LPDDR5", ssd:"512 GB NVMe", batt:12, weight:"1.24 kg", ports:"2 (2× TB5)",
    p3:100, de:1.1, radar:[6.5,8.5,6,9.5,8.5,8.5] },
  { name:"Vela Prism 15", price:1649, hex:"#6E9BD1", finish:"midnight", screen:"night", rating:4.4, reviews:897,
    display:"15.3″ IPS", hz:"144 Hz", cpu:"8-core · 4.0 GHz", gpu:"8 GB dGPU",
    ram:"16 GB DDR5", ssd:"1 TB NVMe", batt:9, weight:"1.90 kg", ports:"5 (USB-A×2, HDMI, SD)",
    p3:78, de:2.6, radar:[8.5,6.5,4.5,6,6,9.5] },
];
const OLED_LAPTOPS = [
  { name:"Aeris Studio 14 OLED", price:1949, hex:"#D6E6F5", finish:"starlight", screen:"dawn", rating:4.7, reviews:612,
    display:"14.2″ OLED", hz:"120 Hz", cpu:"12-core · 3.9 GHz", gpu:"16-core iGPU",
    ram:"32 GB LPDDR5", ssd:"1 TB NVMe", batt:15, weight:"1.52 kg", ports:"4 (3× TB5, SD)",
    p3:100, de:0.9, radar:[8.5,9.5,8,8,7.5,6.5] },
  { ...LAPTOPS[1] },
  { name:"Lumen Slate 16", price:1799, was:1999, hex:"#6E9BD1", finish:"sage", screen:"night", rating:4.5, reviews:431, stock:3,
    display:"16″ OLED", hz:"240 Hz", cpu:"8-core · 4.4 GHz", gpu:"8 GB dGPU",
    ram:"32 GB DDR5", ssd:"1 TB NVMe", batt:8, weight:"2.05 kg", ports:"5 (TB4, USB-A×2, HDMI, SD)",
    p3:98, de:1.4, radar:[9.5,9,4,5,6,8] },
];

const SPECS = [
  { k:"display", label:"Display",  expl:"The panel technology. Mini-LED and OLED give true blacks and vivid colour; OLED risks burn-in with static images, mini-LED doesn't." },
  { k:"hz",      label:"Refresh rate", expl:"How many times per second the screen redraws. 60 Hz is standard; 120 Hz+ makes scrolling and cursor motion visibly smoother." },
  { k:"cpu",     label:"Processor", expl:"The general-purpose brain. More cores finish video exports and big spreadsheets faster; GHz matters less than the core count." },
  { k:"gpu",     label:"Graphics", expl:"Draws every pixel — and does the heavy lifting in video editing. A discrete GPU (dGPU) has its own memory and exports 4K noticeably faster." },
  { k:"ram",     label:"Memory", expl:"Short-term working space. 16 GB is comfortable; 32 GB keeps 4K timelines and dozens of browser tabs smooth at once." },
  { k:"ssd",     label:"Storage", expl:"Where files and projects live. 1 TB holds roughly 20 hours of 4K footage before you need an external drive." },
  { k:"batt",    label:"Battery", expl:"Hours of video playback at typical brightness — the fairest cross-machine comparison. Real editing drains it about twice as fast." },
  { k:"weight",  label:"Weight", expl:"What you'll actually carry. Under ~1.5 kg you stop noticing it in a backpack; 2 kg you do." },
  { k:"ports",   label:"Ports", expl:"Physical connections. Thunderbolt (TB) ports dock to monitors and drives with one cable; an SD slot saves the card reader dance." },
];

/* the comparison sets — each has a plain title and one for after the colour section is added;
   pick is the laptop the verdict recommends */
const SETS = {
  laptops:{
    items:LAPTOPS, tab:"Laptops under €2k", lead:"3 laptops", pick:0,
    title:"Video editing under €2,000",
    titleColour:"Video editing and grading under €2,000",
    best:{ hz:[0], cpu:[0], gpu:[2], ram:[0], ssd:[0,2], batt:[0], weight:[1], ports:[0] },
    verdict:`<b>Aeris Studio 16</b> is the balanced pick for video editing — <span>Kore Zephyr 14 if it travels with you daily.</span>`,
    verdictColour:`<b>Aeris Studio 16</b> is the pick for editing and grading — <span>its mini-LED is the most accurate screen here.</span>`,
    tags:["fastest exports","lightest","best value"],
  },
  laptopsOled:{
    items:OLED_LAPTOPS, tab:"OLED laptops under €2k", lead:"3 OLED laptops", pick:0,
    title:"OLED laptops for video editing under €2,000",
    titleColour:"OLED laptops for editing and grading under €2,000",
    best:{ hz:[2], cpu:[0], gpu:[2], ram:[0,2], ssd:[0,2], batt:[0], weight:[1], ports:[2] },
    verdict:`<b>Aeris Studio 14 OLED</b> is the balanced OLED pick — <span>Lumen Slate 16 if export speed matters more than battery.</span>`,
    verdictColour:`<b>Aeris Studio 14 OLED</b> is the OLED pick for editing and grading — <span>the truest colour of the three.</span>`,
    tags:["most balanced","lightest","fastest exports"],
  },
};

/* items: [name, qty, price, look] — look tells js/renders.js how to draw it */
const ORDERS = [
  { id:"OB-89027", date:"07 Nov 2026", items:[["Kore Dock 8-in-1",1,189,{ glyph:"i-dock", finish:"graphite" }]], status:"In transit", eta:"Thu 12 Nov" },
  { id:"OB-88412", date:"02 Mar 2026", items:[["Kore Buds Pro",1,129,{ glyph:"i-buds", finish:"white" }]], status:"Delivered" },
  { id:"OB-87190", date:"11 Feb 2026", items:[["Vela Monitor 27\"",1,449,{ glyph:"i-monitor", finish:"silver", screen:"dawn" }]], status:"Delivered" },
];

/* ——— the home page ——— */
const TODAY = "Tue 10 Nov";
const OFFER = {
  title:"Up to €300 off laptops built for video editing",
  body:"Twelve creator laptops are reduced until Sunday. Ask for a comparison and the assistant builds it with the sale prices already in.",
  meta:["ends Sun 15 Nov", "12 laptops", "free delivery"],
  cta:"Compare them for video editing", ask:"laptops", cut:"−€300", look:LAPTOPS[0],
};
/* picked from the orders above */
const PICKS = [
  { ...LAPTOPS[1], why:"Docks to your Kore Dock with one cable" },
  { name:"Vela Monitor 32 Pro", price:699, hex:"#D6E6F5", glyph:"i-monitor", finish:"silver", screen:"sea", rating:4.7, reviews:508,
    why:"A 4K partner for your Vela 27″",
    specs:[["Panel","32″ IPS · 4K"],["Refresh rate","144 Hz"],["Colour","98% DCI-P3"],["Inputs","TB4 · HDMI 2.1 · DP"],["Stand","height + tilt"]] },
  { name:"Kore Buds Pro 2", price:149, hex:"#9CBEE0", glyph:"i-buds", finish:"white", rating:4.6, reviews:3902,
    why:"The upgrade from your Buds Pro",
    specs:[["Noise cancelling","adaptive"],["Battery","8 h · 30 h with case"],["Codecs","LC3 · AAC"],["Water","IP54"]] },
  { name:"Kore Keys Low", price:119, hex:"#6E9BD1", glyph:"i-keys", finish:"midnight", rating:4.5, reviews:744,
    why:"Quiet keys for long edits",
    specs:[["Switches","low-profile · quiet"],["Layout","75%"],["Connection","Bluetooth · USB-C"],["Battery","3 months"]] },
];
const SALES = [
  { ...LAPTOPS[0], why:"mini-LED · 18 h battery" },
  { ...OLED_LAPTOPS[2], why:"240 Hz OLED · 8 GB dGPU" },
  { name:"Kore SSD 2 TB", price:169, was:219, hex:"#9CBEE0", glyph:"i-ssd", finish:"graphite", rating:4.8, reviews:5117,
    why:"About 40 h of 4K footage",
    specs:[["Capacity","2 TB"],["Speed","2,000 MB/s"],["Connection","USB-C 3.2"],["Weight","58 g"]] },
  { name:"Kore Hub 6-in-1", price:59, was:79, hex:"#6E9BD1", glyph:"i-dock", finish:"silver", rating:4.4, reviews:1288,
    why:"HDMI, SD and three USB-A",
    specs:[["Ports","HDMI 4K60 · SD · 3× USB-A · USB-C"],["Power pass-through","100 W"],["Cable","15 cm braided"]] },
];

/* the category shelf — Laptops asks the assistant; the rest open their featured product */
const CATEGORIES = [
  { name:"Laptops",   count:"48 models", look:LAPTOPS[1], ask:"laptops" },
  { name:"Monitors",  count:"21 models", look:PICKS[1] },
  { name:"Audio",     count:"34 models", look:PICKS[2] },
  { name:"Keyboards", count:"17 models", look:PICKS[3] },
  { name:"Storage",   count:"26 models", look:SALES[2] },
  { name:"Docks",     count:"12 models", look:SALES[3] },
];
