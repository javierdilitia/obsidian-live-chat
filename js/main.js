"use strict";
/* start-up, and the presenter hooks */

$("#storeName").textContent = STORE.name;
renderHome();
renderChips();
updateSend();
renderCart();
updateCartCell(false);
updateOrdersCell();
Hero.start();

/* Presenter hooks — add to the URL:
     #demo                   the tour: build a comparison → add a colour section → swap to OLED laptops
                             → ask about burn-in, which the agent files in a new tab
     #demo-laptops | #demo-oled | #demo-order       one build
   Append a state to any single build to freeze a moment:
     +follow    two follow-ups on the same page (adds a section, then swaps products)
     +newtab    a related question the agent opens in a new tab
     +tabs      three tabs        +oledonly   swap to OLED laptops in place
     +modal  +orders  +cart  +checkout (adds the pick, then checks out)                                                                 */
if (location.hash.startsWith("#demo")){
  const [key, tail] = (location.hash.slice(1).split("-")[1] || "tour").split("+");
  const play = async k => { await ask(k, SC[k].q, true); };
  addEventListener("load", ()=>setTimeout(async ()=>{
    if (key === "tour"){
      for (const [i, k] of TOUR.entries()){ if (i) await sleep(2600); await play(k); }
      return;
    }
    await play(SC[key] ? key : "laptops");
    await sleep(800);
    if (tail === "modal") openModal(SETS.laptops.items[0], { tag:"In this comparison · 1 of 3", back:"Back to comparison" });
    if (tail === "orders") openOrders();
    if (tail === "cart"){ addToCart(LAPTOPS[0].name, LAPTOPS[0].price, 1, drawLook(LAPTOPS[0])); openCart(); }
    if (tail === "checkout"){ addToCart(LAPTOPS[0].name, LAPTOPS[0].price, 1, drawLook(LAPTOPS[0])); await sleep(600); await play("checkout"); }
    if (tail === "follow"){ await play("color"); await sleep(2200); await play("laptopsOled"); }
    if (tail === "newtab") await play("oled");
    if (tail === "tabs"){ await play("oled"); await sleep(400); await play("order"); }
    if (tail === "oledonly") await play("laptopsOled");
  }, 400));
}
