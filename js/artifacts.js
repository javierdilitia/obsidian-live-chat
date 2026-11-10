"use strict";
/* The pages the agent builds. Each page is rendered from a tab's state, so a follow-up can render
   the old and new state side by side and change only the parts that differ.
   Rule: every .rise element carries a unique data-k key, and data-k elements never nest.           */

/* ——— spec explainer popovers ——— */
let popEl = null;
function hidePop(){ if (popEl){ popEl.remove(); popEl = null; } }
function showPop(btn){
  hidePop();
  const spec = SPECS.find(s=>s.label === btn.dataset.spec);
  popEl = document.createElement("div");
  popEl.className = "pop";
  popEl.dataset.for = btn.dataset.spec;
  popEl.innerHTML = `<h4></h4><p></p>`;
  popEl.querySelector("h4").textContent = spec.label + ", in plain words";
  popEl.querySelector("p").textContent = spec.expl;
  const r = btn.getBoundingClientRect();
  const pw = Math.min(340, innerWidth * .78);
  popEl.style.left = Math.min(Math.max(10, r.left), innerWidth - pw - 10) + "px";
  popEl.style.top = "0px";
  document.body.appendChild(popEl);
  const ph = popEl.offsetHeight;
  popEl.style.top = (innerHeight - r.bottom > ph + 16 ? r.bottom + 10 : r.top - ph - 10) + "px";
  requestAnimationFrame(()=>popEl?.classList.add("on"));
}
document.addEventListener("click", e=>{
  const btn = e.target.closest(".spec-name button");
  if (!btn) return;
  e.stopPropagation();
  popEl && popEl.dataset.for === btn.dataset.spec ? hidePop() : showPop(btn);
});

/* ——— charts ——— */
function radarSVG(items){
  const cx=170, cy=140, R=102, N=6;
  const axes = ["Render","Display","Battery","Portability","Thermals","Value"];
  const pt = (i,v)=>{ const a = -Math.PI/2 + i*2*Math.PI/N; return [cx+Math.cos(a)*R*v/10, cy+Math.sin(a)*R*v/10]; };
  let s = `<svg viewBox="0 0 340 290" width="100%" role="img" aria-label="Radar comparison on six dimensions">`;
  [2.5,5,7.5,10].forEach(v=>{
    s += `<polygon points="${axes.map((_,i)=>pt(i,v).join(",")).join(" ")}" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="1"/>`;
  });
  axes.forEach((ax,i)=>{
    const [x,y] = pt(i,10);
    s += `<line x1="${x}" y1="${y}" x2="${cx}" y2="${cy}" stroke="rgba(255,255,255,.07)"/>`;
    const [lx,ly] = pt(i,12.1);
    s += `<text x="${lx}" y="${ly+3.5}" text-anchor="middle" fill="rgba(237,241,246,.55)" font-size="11" font-family="Supreme,sans-serif">${ax}</text>`;
  });
  items.forEach((p,pi)=>{
    const pts = p.radar.map((v,i)=>pt(i,v));
    s += `<polygon class="rpoly" data-i="${pi}" points="${pts.map(p=>p.join(",")).join(" ")}"
      fill="${p.hex}" fill-opacity="0" stroke="${p.hex}" stroke-width="1.6" stroke-linejoin="round"/>`;
    pts.forEach(([x,y])=>{ s += `<circle class="rdot" data-i="${pi}" cx="${x}" cy="${y}" r="3" fill="${p.hex}" opacity="0"/>`; });
  });
  return s + `</svg>`;
}
/* draws each series; `only` (a Set of series indexes) draws just those and sets the rest at rest */
function drawRadar(svg, only = null){
  if (RM){ settleRadar(svg); return; }
  let n = 0;
  svg.querySelectorAll(".rpoly").forEach((poly,i)=>{
    const dots = svg.querySelectorAll(`.rdot[data-i="${i}"]`);
    if (only && !only.has(i)){
      poly.setAttribute("fill-opacity", .09);
      dots.forEach(d=>d.setAttribute("opacity", 1));
      return;
    }
    const delay = n++ * 220;
    const len = poly.getTotalLength();
    poly.style.strokeDasharray = len;
    poly.style.strokeDashoffset = len;
    poly.animate(
      [{ strokeDashoffset:len, fillOpacity:0 }, { strokeDashoffset:0, fillOpacity:0 }, { strokeDashoffset:0, fillOpacity:.09 }],
      { duration:900, delay, easing:"cubic-bezier(.16,1,.3,1)", fill:"forwards" }
    );
    dots.forEach(d=>d.animate(
      [{ opacity:0, transform:"scale(0)" }, { opacity:1, transform:"scale(1)", offset:.7 }, { opacity:1, transform:"scale(1)" }],
      { duration:600, delay:500 + delay, easing:"cubic-bezier(.24,1.1,.24,1)", fill:"forwards" }
    ));
  });
  setTimeout(()=>settleRadar(svg), 1700);
}
/* commit the drawn state so a tab can be detached and reattached without replaying */
function settleRadar(svg){
  svg.querySelectorAll(".rpoly").forEach(p=>{ p.setAttribute("fill-opacity", .09); p.style.strokeDasharray = ""; p.style.strokeDashoffset = ""; });
  svg.querySelectorAll(".rdot").forEach(d=>d.setAttribute("opacity", 1));
  svg.querySelectorAll(".rpoly,.rdot").forEach(n=>n.getAnimations().forEach(a=>a.cancel()));
}
const barRow = (k, name, value, w, hex, dim) => `
  <div class="bar-row rise" data-k="${k}">
    <div class="bar-top"><span class="n">${name}</span><span class="v">${value}</span></div>
    <div class="bar-track"><div class="bar-fill" data-w="${w}" style="background:${hex}${dim ? ";opacity:.75" : ""}"></div></div>
  </div>`;

/* ——— the comparison ——— */
function comparisonHTML(state, qs){
  const S = SETS[state.set], L = S.items, colour = state.color;
  const dot = (k,i) => S.best[k]?.includes(i) ? `<span class="bdot" style="background:${L[i].hex}"></span>` : "";
  const pick = L[S.pick];
  const then = qs.length > 1 ? `<span>then “${esc(qs[qs.length - 1])}”</span>` : "";
  return `
  <article class="artifact">
    <header class="art-header">
      <div class="rise" data-k="head">
        <h2>${colour ? S.titleColour : S.title}</h2>
        <div class="art-meta"><em>${S.lead}</em><span>${colour ? 11 : 9} specs weighed</span><span>today’s prices</span><span>built from “${esc(qs[0])}”</span>${then}</div>
      </div>
    </header>
    <div class="verdict rise" data-k="verdict">
      <svg width="17" height="17"><use href="#i-check"/></svg>
      <span class="vt">${colour ? S.verdictColour : S.verdict}</span>
      ${buyBtn(pick, `Add ${pick.name} · ${fmt(pick.price)}`, true)}
    </div>
    <div class="trio">
      ${L.map((p,i)=>`
      <div class="prod rise" data-k="prod-${i}">
        <div class="prod-shot shot" data-prod="${i}">
          ${renderOf(p)}
          ${i === S.pick ? `<span class="pill">The pick</span>` : ""}
        </div>
        <h3><button data-prod="${i}" aria-label="Details: ${esc(p.name)}">${esc(p.name)}</button></h3>
        ${stars(p)}
        <div class="buybox">${priceHTML(p)}</div>
        <div class="swatch-line"><i style="background:${p.hex}"></i>${S.tags[i]}</div>
        ${stockHTML(p)}
        <div class="prod-actions">${buyBtn(p)}</div>
      </div>`).join("")}
    </div>
    ${colour ? colourHTML(L) : ""}
    <div class="specs-wrap">
      <div class="specs-scroll">
        <div class="spec-row spec-head" aria-hidden="true">
          <div class="spec-name"></div>
          ${L.map((p,i)=>`<div class="spec-val rise" data-k="sh-${i}"><i style="background:${p.hex}"></i>${esc(p.name)}</div>`).join("")}
        </div>
      ${SPECS.map(sp=>`
        <div class="spec-row">
          <div class="spec-name rise" data-k="sn-${sp.k}">
            <button data-spec="${sp.label}" aria-label="Explain ${sp.label}, in plain words">
              <svg width="13" height="13"><use href="#i-info"/></svg>${sp.label}
            </button>
          </div>
          ${L.map((p,i)=>`<div class="spec-val rise ${S.best[sp.k]?.includes(i)?"best":""}" data-k="sv-${sp.k}-${i}"><span class="visually-hidden">${esc(p.name)}: </span>${dot(sp.k,i)}${sp.k==="batt"?p.batt+" h":p[sp.k]}</div>`).join("")}
        </div>`).join("")}
      </div>
    </div>
    <div class="charts">
      <div class="chart-cell">
        <h3 class="rise" data-k="rh">Six dimensions, side by side</h3>
        <div class="rise" data-k="radar">${radarSVG(L)}</div>
        <div class="radar-legend rise" data-k="legend">
          ${L.map(p=>`<span><i style="background:${p.hex}"></i>${p.name}</span>`).join("")}
        </div>
      </div>
      <div class="chart-cell">
        <h3 class="rise" data-k="bh">Battery — hours of video playback</h3>
        ${L.map((p,i)=>barRow(`bb-${i}`, p.name, p.batt + " h", p.batt/18*100, p.hex)).join("")}
        <h3 class="rise" data-k="wh" style="margin-top:26px">Weight — what you’ll carry</h3>
        ${L.map((p,i)=>barRow(`bw-${i}`, p.name, p.weight, parseFloat(p.weight)/2.2*100, p.hex, true)).join("")}
      </div>
    </div>
    <footer class="art-foot rise" data-k="foot">
      <span>concept demo</span><span>fictional products, prices &amp; ratings</span>
    </footer>
  </article>`;
}
/* added by "Add colour accuracy for grading" — sits right under the products, where it is seen landing */
function colourHTML(L){
  return `
    <div class="grow-wrap"><div class="grow-inner">
      <div class="charts colour">
        <div class="chart-cell">
          <h3 class="rise" data-k="ch1">Colour range — share of the DCI-P3 cinema gamut</h3>
          ${L.map((p,i)=>barRow(`cp-${i}`, p.name, p.p3 + "%", p.p3, p.hex)).join("")}
        </div>
        <div class="chart-cell">
          <h3 class="rise" data-k="ch2">Colour error — ΔE, shorter is truer</h3>
          ${L.map((p,i)=>barRow(`ce-${i}`, p.name, "ΔE " + p.de.toFixed(1), p.de/3*100, p.hex, true)).join("")}
          <p class="note rise" data-k="cnote">Under ΔE 2 the eye can’t see the error — what you grade is what your viewers get.</p>
        </div>
      </div>
    </div></div>`;
}

/* ——— the explainer ——— */
function explainerHTML(q){
  return `
  <article class="artifact">
    <header class="art-header">
      <div class="rise" data-k="head">
        <h2>OLED burn-in, in plain words</h2>
        <div class="art-meta"><em>display guide</em><span>1 diagram</span><span>readable in 40 seconds</span><span>built from “${esc(q)}”</span></div>
      </div>
    </header>
    <div class="explain-body">
      <div>
        <p class="lede rise" data-k="lede1">An OLED screen lights <b>each pixel itself</b> — there is no backlight. Pixels that glow, age. If the same bright thing stays on screen for a very long time — a logo, a taskbar, a pause menu — those pixels age slightly faster than their neighbours and leave a <b>faint permanent ghost</b> behind.</p>
        <p class="lede rise" data-k="lede2" style="margin-top:16px;font-size:14px;color:var(--tx-2)">It takes hundreds of hours of the <em>same</em> static image, at high brightness, to notice. Modern panels shift pixels subtly and dim static areas to prevent it — burn-in is now rare, not gone.</p>
      </div>
      <div class="side">
        <h3 class="rise" data-k="sh">What it means for you</h3>
        <p class="rise" data-k="sp">Buying a laptop you’ll keep for years? Prefer OLED for colour and blacks, but avoid max brightness with static toolbars for hours — or choose mini-LED, which can’t burn in.</p>
        <div class="rise" data-k="diagram" style="margin-top:18px">
          <svg viewBox="0 0 340 120" width="100%" role="img" aria-label="Two pixel grids — one fresh, one with a ghosted static logo">
            <text x="8" y="14" fill="rgba(237,241,246,.5)" font-size="11" font-family="Spline Sans Mono,monospace">fresh</text>
            <text x="182" y="14" fill="rgba(237,241,246,.5)" font-size="11" font-family="Spline Sans Mono,monospace">after 900 h of the same logo</text>
            ${Array.from({length:24},(_,i)=>{const x=8+(i%6)*16,y=26+Math.floor(i/6)*16;return `<rect x="${x}" y="${y}" width="10" height="10" rx="2.5" fill="rgba(214,230,245,.5)"/>`;}).join("")}
            ${Array.from({length:24},(_,i)=>{
              const x=182+(i%6)*16,y=26+Math.floor(i/6)*16;
              const col=i%6, row=Math.floor(i/6);
              const ghost=(col===1||col===2)&&(row===1||row===2);
              return `<rect x="${x}" y="${y}" width="10" height="10" rx="2.5" fill="${ghost?"rgba(156,190,224,.85)":"rgba(214,230,245,.32)"}"/>`;
            }).join("")}
          </svg>
        </div>
      </div>
    </div>
    <footer class="art-foot rise" data-k="foot">
      <span>concept demo</span><span>synthetic content</span>
    </footer>
  </article>`;
}

/* ——— the order tracking page ——— */
function orderHTML(q){
  const o = ORDERS.find(x=>x.id === "OB-89027");
  const steps = [["Ordered","07 Nov","done"],["Packed","08 Nov","done"],["Shipped","09 Nov","done"],["Out for delivery","Thu 12 Nov","now"],["Delivered","by 14:00","" ]];
  return `
  <article class="artifact">
    <header class="art-header">
      <div class="rise" data-k="head">
        <h2>Your Kore Dock is on its way</h2>
        <div class="art-meta"><em>order #${o.id}</em><span>placed ${o.date}</span><span>arrives Thu 12 Nov</span><span>built from “${esc(q)}”</span></div>
      </div>
      <div class="art-actions rise" data-k="actions">
        <button class="btn btn-ghost" data-allorders><svg width="15" height="15"><use href="#i-box"/></svg>All orders</button>
      </div>
    </header>
    <div class="track">
      <div class="steps" role="list" aria-label="Delivery progress">
        <span class="fill" data-w="50" aria-hidden="true"></span>
        ${steps.map(([n,d,s],i)=>`<div class="step rise ${s}" data-k="step-${i}" role="listitem"><i aria-hidden="true"></i><b>${n}</b><span>${d}</span></div>`).join("")}
      </div>
    </div>
    <div class="ord-body">
      <div class="ord-cell">
        <h3 class="rise" data-k="ph">In this parcel</h3>
        <div class="ord-item rise" data-k="item">
          <span class="tile shot">${renderOf(o.items[0][3])}</span>
          <span><b>${o.items[0][0]}</b><span>${fmt(o.items[0][2])} · qty ${o.items[0][1]}</span></span>
        </div>
      </div>
      <div class="ord-cell">
        <h3 class="rise" data-k="dh">Delivery</h3>
        <div class="ord-facts rise" data-k="facts">
          <div><span>Carrier</span><span>ParcelLine</span></div>
          <div><span>Tracking</span><span>PL 4471 2290 18</span></div>
          <div><span>Delivers to</span><span>Home · saved address</span></div>
        </div>
      </div>
    </div>
    <footer class="art-foot rise" data-k="foot">
      <span>concept demo</span><span>fictional order</span>
    </footer>
  </article>`;
}

/* ——— the order confirmation — filed as its own tab when the cart is checked out ——— */
function confirmHTML(state, q){
  const o = state.order;
  const steps = [["Ordered","just now","now"],["Packed","today",""],["Shipped","Wed 11 Nov",""],["Delivered",o.eta,""]];
  const n = o.items.reduce((s,[,q])=>s+q,0);
  return `
  <article class="artifact">
    <header class="art-header">
      <div class="rise" data-k="head">
        <h2>Order placed — arriving ${o.eta}</h2>
        <div class="art-meta"><em>order #${o.id}</em><span>${n} item${n > 1 ? "s" : ""}</span><span>built from “${esc(q)}”</span></div>
      </div>
      <div class="art-actions rise" data-k="actions">
        <button class="btn btn-ghost" data-allorders><svg width="15" height="15"><use href="#i-box"/></svg>All orders</button>
      </div>
    </header>
    <div class="verdict rise" data-k="verdict">
      <svg width="17" height="17"><use href="#i-check"/></svg>
      <span class="vt"><b>Thank you, Javier.</b> <span>The receipt is in your inbox — we’ll tell you the moment it ships.</span></span>
    </div>
    <div class="track">
      <div class="steps" role="list" aria-label="Delivery progress" style="--n:${steps.length}">
        <span class="fill" data-w="0" aria-hidden="true"></span>
        ${steps.map(([s,d,c],i)=>`<div class="step rise ${c}" data-k="step-${i}" role="listitem"><i aria-hidden="true"></i><b>${s}</b><span>${d}</span></div>`).join("")}
      </div>
    </div>
    <div class="ord-body">
      <div class="ord-cell">
        <h3 class="rise" data-k="ph">In this order</h3>
        ${o.items.map(([name,qty,price,look],i)=>`
        <div class="ord-item rise" data-k="item-${i}">
          <span class="tile shot">${renderOf(look)}</span>
          <span><b>${esc(name)}</b><span>${fmt(price)} · qty ${qty}</span></span>
        </div>`).join("")}
      </div>
      <div class="ord-cell">
        <h3 class="rise" data-k="dh">Delivery</h3>
        <div class="ord-facts rise" data-k="facts">
          <div><span>Delivers to</span><span>Home · saved address</span></div>
          <div><span>Delivery</span><span>Free · ParcelLine</span></div>
          <div><span>Returns</span><span>free until 12 Dec</span></div>
          <div class="money"><span>Total paid</span><span>${fmt(o.total)}</span></div>
        </div>
      </div>
    </div>
    <footer class="art-foot rise" data-k="foot">
      <span>concept demo</span><span>no payment taken</span>
    </footer>
  </article>`;
}

/* ——— state → page ——— */
/* state is { page:"compare", set, color } or { page:"oled" } or { page:"order" }; qs = the questions that shaped it */
function makePage(state, qs){
  const wrap = document.createElement("div");
  wrap.innerHTML = state.page === "oled" ? explainerHTML(qs[0])
                 : state.page === "order" ? orderHTML(qs[0])
                 : state.page === "confirm" ? confirmHTML(state, qs[0])
                 : comparisonHTML(state, qs);
  return wrap.firstElementChild;
}
const PAGE_LOOK = { oled:{ title:"OLED burn-in", icon:"i-book" }, order:{ title:"Order OB-89027", icon:"i-box" } };
function lookOf(state){
  if (state.page === "confirm") return { title:"Order " + state.order.id, icon:"i-check" };
  return state.page === "compare" ? { title:SETS[state.set].tab, icon:"i-compare" } : PAGE_LOOK[state.page];
}
function wireArtifact(el, state){
  const set = state.page === "compare" ? SETS[state.set].items : [];
  el.querySelectorAll("[data-prod]").forEach(b=>{
    const i = +b.dataset.prod;
    b.addEventListener("click", ()=>openModal(set[i], { tag:`In this comparison · ${i + 1} of ${set.length}`, back:"Back to comparison" }));
  });
  el.querySelector("[data-allorders]")?.addEventListener("click", openOrders);
}
