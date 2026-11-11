"use strict";
/* The home page — the landing before the first question, and what every new + tab opens on:
   this week's offer, recent searches, the category shelf, picks from past orders, and the sale. */

function renderHome(){
  const home = $("#home");
  const off = p => Math.round((p.was - p.price) / p.was * 100);
  const O = OFFER.look;

  home.innerHTML = `
  <div class="home-panel">
    <header class="home-head">
      <h2>For you</h2>
      <div class="art-meta"><em>${TODAY}</em><span>from your orders and searches</span></div>
    </header>

    <div class="home-top">
      <div class="offer">
        <div class="offer-copy">
          <h3>${OFFER.title}</h3>
          <p>${OFFER.body}</p>
          <div class="offer-price">
            <span class="from">From</span>${priceHTML(O, { mo:false })}
          </div>
          <div class="art-meta">${OFFER.meta.map(m=>`<span>${m}</span>`).join("")}</div>
          <button class="btn btn-primary" data-ask="${OFFER.ask}" data-q="${esc(SC[OFFER.ask].q)}">
            <svg width="15" height="15" aria-hidden="true"><use href="#i-spark"/></svg>${OFFER.cta}
          </button>
        </div>
        <button class="offer-visual shot" data-offer aria-label="Details: ${esc(O.name)}">
          ${renderOf(O)}
          <span class="cut">${OFFER.cut}</span>
        </button>
      </div>

      <div class="recents">
        <h3 class="sec">Pick up where you left off</h3>
        <ul>
          ${RECENTS.map(r=>`
          <li><button class="recent" data-ask="${r.key}" data-q="${esc(r.q)}" aria-label="Ask again: ${esc(r.q)}">
            <svg class="ico" width="17" height="17" aria-hidden="true"><use href="#i-clock"/></svg>
            <span class="rt"><b>${esc(r.q)}</b><span>${r.when} · ${KINDS[SC[r.key].family]}</span></span>
            <svg class="go" width="15" height="15" aria-hidden="true"><use href="#i-switch"/></svg>
          </button></li>`).join("")}
        </ul>
        <p class="note">Asking again rebuilds the page with today’s prices.</p>
      </div>
    </div>

    <section class="home-sec" aria-labelledby="catH">
      <div class="sec-head"><h3 class="sec" id="catH">Shop the store</h3></div>
      <div class="cats">
        ${CATEGORIES.map((c,i)=>`
        <button class="cat" data-cat="${i}" aria-label="${c.name}, ${c.count}">
          <span class="thumb shot">${renderOf(c.look)}</span>
          <b>${c.name}</b><span>${c.count}</span>
        </button>`).join("")}
      </div>
    </section>

    <section class="home-sec" aria-labelledby="picksH">
      <div class="sec-head">
        <h3 class="sec" id="picksH">Picked for you</h3>
        <div class="art-meta"><span>from your last 3 orders</span></div>
      </div>
      <div class="picks">
        ${PICKS.map((p,i)=>`
        <button class="pick" data-pick="${i}" aria-label="Details: ${esc(p.name)}, ${fmt(p.price)}">
          <span class="thumb shot">${renderOf(p)}</span>
          <span class="pn">${esc(p.name)}</span>
          ${stars(p)}
          <span class="pp">${fmt(p.price)}</span>
          <span class="why">${esc(p.why)}</span>
        </button>`).join("")}
      </div>
    </section>

    <section class="home-sec" aria-labelledby="saleH">
      <div class="sec-head">
        <h3 class="sec" id="saleH">On sale this week</h3>
        <div class="art-meta"><span>ends Sun 15 Nov</span></div>
      </div>
      <div class="sales">
        ${SALES.map((p,i)=>`
        <button class="sale" data-sale="${i}" aria-label="Details: ${esc(p.name)}, ${fmt(p.price)}, was ${fmt(p.was)}">
          <span class="tile shot">${renderOf(p)}</span>
          <span class="si"><b>${esc(p.name)}</b><span>${esc(p.why)}</span></span>
          <span class="sp"><b>${fmt(p.price)}</b><s>${fmt(p.was)}</s></span>
          <span class="pill deal">−${off(p)}%</span>
        </button>`).join("")}
      </div>
    </section>
  </div>`;

  home.querySelectorAll("[data-ask]").forEach(b=>b.addEventListener("click", ()=>ask(b.dataset.ask, b.dataset.q, true)));
  home.querySelector("[data-offer]").addEventListener("click", ()=>openModal(O, { tag:`This week’s offer · −${off(O)}%` }));
  home.querySelectorAll("[data-cat]").forEach(b=>b.addEventListener("click", ()=>{
    const c = CATEGORIES[+b.dataset.cat];
    if (c.ask) ask(c.ask, SC[c.ask].q, true);
    else openModal(c.look, { tag:`Featured in ${c.name}` });
  }));
  home.querySelectorAll("[data-pick]").forEach(b=>b.addEventListener("click", ()=>
    openModal(PICKS[+b.dataset.pick], { tag:"Picked for you" })));
  home.querySelectorAll("[data-sale]").forEach(b=>b.addEventListener("click", ()=>{
    const p = SALES[+b.dataset.sale];
    openModal(p, { tag:`On sale · −${off(p)}%` });
  }));
}
