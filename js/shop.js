"use strict";
/* the shop: prices, the trust line, add-to-cart, orders drawer, cart, fly-to-cart, the product modal, checkout */

const ALL_PRODUCTS = [...LAPTOPS, ...OLED_LAPTOPS, ...PICKS, ...SALES];
const productNamed = name => ALL_PRODUCTS.find(p=>p.name === name);

/* ——— commerce snippets every surface shares ——— */
const monthly = n => fmt(Math.ceil(n / 24));
function stars(p){
  if (!p.rating) return "";
  const n = p.reviews.toLocaleString("en-IE");
  return `<span class="trust" role="img" aria-label="Rated ${p.rating.toFixed(1)} out of 5 from ${n} reviews">
    <svg width="12" height="12" aria-hidden="true"><use href="#i-star"/></svg><b>${p.rating.toFixed(1)}</b><span>(${n})</span></span>`;
}
function priceHTML(p, { mo = true } = {}){
  return `<div class="price-now"><b>${fmt(p.price)}</b>${p.was ? `<s><span class="visually-hidden">was </span>${fmt(p.was)}</s>` : ""}</div>`
    + (p.was ? `<div class="save">Save ${fmt(p.was - p.price)}</div>` : "")
    + (mo ? `<div class="mo">or ${monthly(p.price)}/mo · 24 months</div>` : "");
}
const stockText = p => p.stock ? `Only ${p.stock} left` : "In stock";
function stockHTML(p){
  return `<span class="stock"><svg width="13" height="13" aria-hidden="true"><use href="#i-check"/></svg>${stockText(p)} · delivered ${DELIVERY.day}</span>`;
}

/* ——— add-to-cart buttons: every one names its product, and says when it's already in the cart ——— */
let cart = [];
const inCart = name => cart.some(i=>i.name === name);
const buyInner = (name, label) => inCart(name)
  ? `<svg width="15" height="15" aria-hidden="true"><use href="#i-check"/></svg>In cart · View`
  : `<svg width="15" height="15" aria-hidden="true"><use href="#i-cart"/></svg>${esc(label)}`;
function buyBtn(p, label = "Add to cart", primary = false){
  const on = inCart(p.name);
  return `<button class="btn ${primary ? "btn-primary" : "btn-ghost"} buy${on ? " is-in" : ""}" data-buy="${esc(p.name)}" data-label="${esc(label)}">${buyInner(p.name, label)}</button>`;
}
function syncBuy(root = document){
  root.querySelectorAll("[data-buy]").forEach(b=>{
    b.classList.toggle("is-in", inCart(b.dataset.buy));
    b.innerHTML = buyInner(b.dataset.buy, b.dataset.label);
  });
}
document.addEventListener("click", e=>{
  const b = e.target.closest("[data-buy]");
  if (!b) return;
  e.stopPropagation();
  const p = productNamed(b.dataset.buy);
  if (!p) return;
  if (inCart(p.name)){ openCart(); return; }
  addToCart(p.name, p.price, 1, drawLook(p));
  flyToCart(b, p.hex);
});

/* ——— orders ——— */
function renderOrders(){
  $("#ordersBody").innerHTML = ORDERS.map((o,i)=>`
    <div class="order">
      <div class="order-top"><span class="id">#${o.id}</span><span class="date">${o.date}</span></div>
      <div class="order-items">${o.items.map(([n,q,p,look])=>`
        <div><span class="tile shot">${renderOf(look)}</span><span class="oi">${esc(n)} <em>×${q}</em></span><span class="op">${fmt(p)}</span></div>`).join("")}</div>
      <div class="order-foot">
        <span class="total">${fmt(o.items.reduce((s,[,q,p])=>s+q*p,0))}</span>
        <span class="pill">${o.status}</span>
        <button class="btn btn-ghost" style="height:32px;padding:0 12px;font-size:12.5px" data-reorder="${i}">Buy again</button>
      </div>
    </div>`).join("");
  $("#ordersBody").querySelectorAll("[data-reorder]").forEach(b=>b.addEventListener("click", ()=>{
    ORDERS[+b.dataset.reorder].items.forEach(([n,q,p,look])=>addToCart(n,p,q,look));
    toast("Added to cart");
  }));
}
function openOrders(){ renderOrders(); closeAll(); pushOverlay($("#ordersDrawer")); }
$("#ordersBtn").addEventListener("click", openOrders);

/* ——— cart ——— */
function cartCount(){ return cart.reduce((s,i)=>s+i.qty,0); }
const cartTotal = () => cart.reduce((s,i)=>s+i.qty*i.price,0);
function renderCart(){
  const body = $("#cartBody"), foot = $("#cartFoot");
  if (!cart.length){
    body.innerHTML = `<div class="cart-empty">Your cart is empty.<br>Ask for a comparison, then add the one you want.</div>`;
    foot.hidden = true; return;
  }
  body.innerHTML = cart.map((it,i)=>`
    <div class="cart-line">
      <span class="tile shot">${renderOf(it.look)}</span>
      <span class="info"><b>${esc(it.name)}</b><span>${fmt(it.price)}${it.qty > 1 ? ` · ${fmt(it.price * it.qty)} for ${it.qty}` : ""}</span></span>
      <span class="qty">
        <button data-q="-1" data-i="${i}" aria-label="One fewer ${esc(it.name)}"><svg width="13" height="13" aria-hidden="true"><use href="#i-minus"/></svg></button><b><span class="visually-hidden">Quantity </span>${it.qty}</b><button data-q="1" data-i="${i}" aria-label="One more ${esc(it.name)}"><svg width="13" height="13" aria-hidden="true"><use href="#i-plus"/></svg></button>
      </span>
      <button class="ctl rm" data-rm="${i}" aria-label="Remove ${esc(it.name)}"><svg width="14" height="14" aria-hidden="true"><use href="#i-x"/></svg></button>
    </div>`).join("");
  body.querySelectorAll("[data-q]").forEach(b=>b.addEventListener("click", ()=>{
    const i = +b.dataset.i, q = b.dataset.q, it = cart[i];
    it.qty += +q;
    const gone = it.qty <= 0;
    if (gone) cart.splice(i, 1);
    renderCart(); updateCartCell();
    // keep the keyboard where it was: the same step, or the next line's remove, or the close button
    (gone ? null : $(`#cartBody [data-q="${q}"][data-i="${i}"]`))?.focus()
      || (cart.length ? $("#cartBody .rm") : $("#cartDrawer [data-close]"))?.focus();
  }));
  body.querySelectorAll("[data-rm]").forEach(b=>b.addEventListener("click", ()=>{
    cart.splice(+b.dataset.rm, 1);
    renderCart(); updateCartCell();
    (cart.length ? $("#cartBody .rm") : $("#cartDrawer [data-close]"))?.focus();
  }));
  foot.hidden = false;
  const t = fmt(cartTotal());
  $("#cartSum").innerHTML = `
    <div><span>Subtotal</span><span>${t}</span></div>
    <div><span>Delivery</span><span>Free · ${DELIVERY.day}</span></div>
    <div class="grand"><span>Total</span><b>${t}</b></div>`;
  $("#checkoutBtn").textContent = `Check out · ${t}`;
}
function openCart(){ renderCart(); closeAll(); pushOverlay($("#cartDrawer")); }
/* the ledger's cart cell: "2 · €1,948", or "empty" — the value rolls when it changes */
let cartShown = null;
function updateCartCell(roll = true){
  syncBuy();
  const n = cartCount(), total = cartTotal();
  const html = n ? `<b>${n}</b><span class="wide">· ${fmt(total)}</span>` : "empty";
  $("#cartBtn").setAttribute("aria-label", n ? `Cart, ${n} item${n > 1 ? "s" : ""}, ${fmt(total)}` : "Cart, empty");
  if (html === cartShown) return;
  const cell = $("#cartFact"), next = document.createElement("span");
  next.innerHTML = html;
  cell.querySelectorAll(".out").forEach(o=>o.remove());
  const old = cell.firstElementChild;
  if (roll && old && !RM){
    old.className = "out";
    next.className = "in";
    setTimeout(()=>old.remove(), 360);
  } else cell.replaceChildren();
  cell.appendChild(next);
  cartShown = html;
}
/* the ledger's orders cell: what is on its way, from the order data */
function updateOrdersCell(){
  const moving = ORDERS.filter(o=>o.eta);
  const f = $("#ordersFact");
  if (!moving.length){ f.textContent = `${ORDERS.length} past`; $("#ordersBtn").setAttribute("aria-label", "Previous orders"); return; }
  const day = moving[0].eta.split(" ")[0];
  f.innerHTML = `<i class="live"></i><span><span class="wide">${moving.length} arriving </span>${day}</span>`;
  $("#ordersBtn").setAttribute("aria-label", `Orders, ${moving.length} arriving ${moving[0].eta}`);
}
function addToCart(name, price, qty = 1, look = { glyph:"i-laptop" }){
  const found = cart.find(i=>i.name===name);
  found ? found.qty += qty : cart.push({ name, price, qty, look });
  updateCartCell();
  if ($("#cartDrawer").classList.contains("on")) renderCart();
}
$("#cartBtn").addEventListener("click", openCart);

/* ——— checkout: the agent files the confirmation as its own tab ——— */
let orderSeq = 89101;
function makeOrder(){
  return {
    id:`OB-${orderSeq}`, date:"10 Nov 2026", status:"Confirmed", eta:DELIVERY.day,
    items:cart.map(i=>[i.name, i.qty, i.price, i.look]), total:cartTotal(),
  };
}
function placeOrder(order){
  orderSeq++;
  ORDERS.unshift({ id:order.id, date:order.date, items:order.items, status:order.status, eta:order.eta });
  cart = [];
  renderCart(); updateCartCell(); updateOrdersCell();
}
$("#checkoutBtn").addEventListener("click", ()=>{
  if (!cart.length || busy) return;
  closeAll();
  ask("checkout", SC.checkout.q, true);
});

function flyToCart(fromEl, hex){
  if (RM) return;
  const d = document.createElement("div");
  d.className = "fly-dot"; d.style.background = hex;
  const r = fromEl.getBoundingClientRect(), c = ($("#cartFact").offsetParent ? $("#cartFact") : $("#cartBtn")).getBoundingClientRect();
  d.style.left = (r.left + r.width/2 - 7) + "px";
  d.style.top = (r.top + r.height/2 - 7) + "px";
  document.body.appendChild(d);
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const dx = (c.left + c.width/2) - (r.left + r.width/2);
    const dy = (c.top + c.height/2) - (r.top + r.height/2);
    d.style.transform = `translate(${dx}px,${dy}px) scale(.35)`;
    d.style.opacity = "0";
  }));
  setTimeout(()=>d.remove(), 700);
}

/* ——— product modal — the buy box first, then the spec sheet ——— */
function productSpecs(p){
  return p.specs || [
    ["Display", `${p.display} · ${p.hz}`], ["Processor", p.cpu], ["Graphics", p.gpu], ["Memory", p.ram],
    ["Storage", p.ssd], ["Battery", `${p.batt} h video`], ["Weight", p.weight],
  ];
}
function openModal(p, { tag = "Product", back = "Back" } = {}){
  const F = FINISH[p.finish];
  $("#modalPanel").innerHTML = `
    <div class="modal-head">
      <span class="tag">${esc(tag)}</span>
      <button class="ctl close" data-mclose aria-label="Close"><svg width="17" height="17"><use href="#i-x"/></svg></button>
    </div>
    <div class="modal-hero">
      <div class="modal-visual shot">
        ${renderOf(p)}
        ${F ? `<span class="finish"><i style="background:${F.mid}"></i>${F.name}</span>` : ""}
      </div>
      <div class="modal-info">
        <h3 id="modalTitle">${esc(p.name)}</h3>
        ${stars(p)}
        <div class="buybox">${priceHTML(p)}</div>
        <ul class="promises">
          <li><svg width="16" height="16" aria-hidden="true"><use href="#i-truck"/></svg>${stockText(p)} · free delivery ${DELIVERY.day}</li>
          <li><svg width="16" height="16" aria-hidden="true"><use href="#i-return"/></svg>${DELIVERY.returns}</li>
          <li><svg width="16" height="16" aria-hidden="true"><use href="#i-shield"/></svg>${DELIVERY.warranty}</li>
        </ul>
        <div class="modal-actions">
          ${buyBtn(p, "Add to cart", true)}
          <button class="btn btn-ghost" data-mclose>${esc(back)}</button>
        </div>
        <div class="modal-specs">
          ${productSpecs(p).map(([k,v])=>`<div><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join("")}
        </div>
      </div>
    </div>`;
  pushOverlay($("#modal"));
  $("#modal").querySelectorAll("[data-mclose]").forEach(b=>b.addEventListener("click", closeTop));
}
