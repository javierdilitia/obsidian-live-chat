/* The one cart. The shell's cart cell, the drawer and every buy button read this store (spec §2.2);
   nothing else holds cart lines. The server owns the cart: the store takes its answer after each
   action, and the page's seed from `/api/workspace` goes through `setLines` too.

   The store also holds whether the drawer is open, so a buy button inside the A2UI surface can open
   it (`cart.open()`, spec §7.6's local `openCart`) without props. */
import { useSyncExternalStore } from "react";
import { prefersReducedMotion } from "../a2ui/motion";
import { dispatchAction, type CartLine } from "./actions";

export interface CartState {
  lines: readonly CartLine[];
  open: boolean;
}

const EMPTY: CartState = { lines: [], open: false };
let state: CartState = EMPTY;
const listeners = new Set<() => void>();

function update(next: Partial<CartState>): void {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const cart = {
  get: (): CartState => state,
  /** The server's cart, as it answered. */
  setLines: (lines: readonly CartLine[]): void => {
    update({ lines });
  },
  open: (): void => {
    if (!state.open) update({ open: true });
  },
  close: (): void => {
    if (state.open) update({ open: false });
  },
  has: (productId: string): boolean => state.lines.some((line) => line.productId === productId),
};

/** The cart and whether its drawer is open; re-renders when either changes. */
export function useCart(): CartState {
  return useSyncExternalStore(subscribe, cart.get, cart.get);
}

/** Empties the store (tests). */
export function resetCart(): void {
  pending.clear();
  update(EMPTY);
}

/** Where the drawer's own actions come from, for the server's log: not a page's surface. */
const SHELL = { surfaceId: "shell", sourceComponentId: "cart-drawer" };
const FAILED = "Couldn't change your cart. Try again.";

/**
 * `cart.set_qty{productId, qty}` (0 removes) or `cart.remove{productId}`: takes the server's cart
 * as the new one. Resolves to the reason it was refused, or null when it worked.
 */
export async function changeCart(
  name: "cart.set_qty" | "cart.remove",
  context: { productId: string; qty?: number },
): Promise<string | null> {
  try {
    const result = await dispatchAction({ name, ...SHELL, context });
    update({ lines: result.cart });
    return result.error?.message ?? null;
  } catch {
    return FAILED;
  }
}

/* ——— fly-to-cart (mockup/js/shop.js `flyToCart`) ——— */

/** A buy button's place and colour at the click, until the server's answer says the add worked. */
const pending = new Map<string, { rect: DOMRect; colour: string }>();

/** Notes where a flight to the cart starts; `landFlight` launches it once the item is in. */
export function expectFlight(productId: string, from: Element, colour: string): void {
  pending.set(productId, { rect: from.getBoundingClientRect(), colour });
}

/** Launches the 14 px dot noted for `productId`, if any: from the button to the cart value. When
 *  the add was refused (`added` false) the dot is dropped instead. */
export function landFlight(productId: string, added: boolean): void {
  const flight = pending.get(productId);
  pending.delete(productId);
  if (!flight || !added || prefersReducedMotion()) return;
  const fact = document.querySelector<HTMLElement>("[data-cart-fact]");
  const cell = document.querySelector<HTMLElement>("[data-cart-cell]");
  const target = fact?.offsetParent ? fact : (cell ?? fact);
  if (!target) return;
  const { rect: r, colour } = flight;
  const c = target.getBoundingClientRect();
  const dot = document.createElement("div");
  dot.className = "fly-dot";
  dot.style.background = colour;
  dot.style.left = `${String(r.left + r.width / 2 - 7)}px`;
  dot.style.top = `${String(r.top + r.height / 2 - 7)}px`;
  document.body.appendChild(dot);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const dx = c.left + c.width / 2 - (r.left + r.width / 2);
      const dy = c.top + c.height / 2 - (r.top + r.height / 2);
      dot.style.transform = `translate(${String(dx)}px,${String(dy)}px) scale(.35)`;
      dot.style.opacity = "0";
    });
  });
  setTimeout(() => {
    dot.remove();
  }, 700);
}
