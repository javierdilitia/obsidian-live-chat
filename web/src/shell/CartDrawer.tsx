/* The cart drawer (mockup/js/shop.js `renderCart`, mockup/css/overlays.css, DESIGN.md "Overlays").
   One line per product (render, name, unit price, quantity stepper, remove ×) and the total, over
   the one cart store. A stepper or remove press asks the server (`cart.set_qty`, `cart.remove`) and
   takes its answer; a refusal ("no more in stock") goes to `onNotice`. There is no checkout in the
   demo, so the foot is the total alone.

   Esc, the scrim and the close button close it. While open, Tab stays inside it; when it closes,
   focus goes back to whatever opened it (the cart cell, or a buy button's "In cart · View"). */
import { useEffect, useRef } from "react";
import { ProductRender } from "../a2ui/catalog";
import { useI18n } from "../i18n/I18nProvider";
import type { Message } from "../i18n/i18n";
import { cart, changeCart, useCart } from "../lib/cart";
import { useProducts } from "../lib/products";
import "../styles/overlays.css";

const FOCUSABLE =
  "button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";

function GlyphIcon({ size, d, width }: { size: number; d: string; width: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}

export function CartDrawer({ onNotice }: { onNotice: (message: Message) => void }) {
  const { t, money } = useI18n();
  const { lines, open } = useCart();
  const panel = useRef<HTMLElement>(null);
  const invoker = useRef<Element | null>(null);
  /** A line went away: the keyboard moves to the next line's remove, or to the close button. */
  const refocus = useRef(false);
  const { products } = useProducts(lines.map((line) => line.productId));
  const total = lines.reduce((sum, line) => sum + line.qty * line.price_cents, 0);

  // Open: remember who opened it, and move into it. Closed: give focus back.
  useEffect(() => {
    if (!open) return;
    invoker.current = document.activeElement;
    panel.current?.querySelector<HTMLElement>("[data-close]")?.focus();
    return () => {
      if (invoker.current instanceof HTMLElement && invoker.current.isConnected) {
        invoker.current.focus();
      }
    };
  }, [open]);

  // Esc closes; Tab and Shift+Tab wrap inside the drawer.
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        cart.close();
        return;
      }
      if (event.key !== "Tab" || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (!panel.current.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    const root = panel.current;
    if (!root || root.contains(document.activeElement)) return;
    root.querySelector<HTMLElement>(".cart-line .rm, [data-close]")?.focus();
  }, [lines]);

  async function edit(productId: string, qty: number | null) {
    // A line that goes away (removed, or stepped to 0) takes its focus with it.
    if (qty === null || qty <= 0) refocus.current = true;
    const refusal =
      qty === null
        ? await changeCart("cart.remove", { productId })
        : await changeCart("cart.set_qty", { productId, qty });
    // worded where it shows, so a language switch while the step was out still applies
    if (refusal) onNotice(refusal);
  }

  return (
    <>
      <div
        className={open ? "scrim on" : "scrim"}
        onClick={() => {
          cart.close();
        }}
      />
      <aside
        ref={panel}
        id="cart-drawer"
        className={open ? "drawer on" : "drawer"}
        role="dialog"
        aria-modal="true"
        aria-label={t("drawer.label")}
        aria-hidden={open ? undefined : true}
        inert={!open}
      >
        <div className="drawer-head">
          <h2>{t("cart.label")}</h2>
          <button
            type="button"
            className="ctl close"
            data-close
            aria-label={t("drawer.close")}
            onClick={() => {
              cart.close();
            }}
          >
            <GlyphIcon size={17} width={1.8} d="M6 6l12 12M18 6 6 18" />
          </button>
        </div>
        <div className="drawer-body">
          {lines.length === 0 ? (
            <div className="cart-empty">
              {t("drawer.emptyTitle")}
              <br />
              {t("drawer.emptyHint")}
            </div>
          ) : (
            lines.map((line) => {
              const product = products.get(line.productId);
              return (
                <div key={line.productId} className="cart-line">
                  <span className="tile shot">
                    {product && <ProductRender look={product.look} />}
                  </span>
                  <span className="info">
                    <b>{line.name}</b>
                    <span>
                      {money(line.price_cents)}
                      {line.qty > 1 &&
                        ` · ${t("drawer.lineTotal", { total: money(line.price_cents * line.qty), count: line.qty })}`}
                    </span>
                  </span>
                  <span className="qty">
                    <button
                      type="button"
                      aria-label={t("drawer.fewer", { name: line.name })}
                      onClick={() => void edit(line.productId, line.qty - 1)}
                    >
                      <GlyphIcon size={13} width={1.6} d="M5 12h14" />
                    </button>
                    <b>
                      <span className="visually-hidden">{t("drawer.quantity")} </span>
                      {line.qty}
                    </b>
                    <button
                      type="button"
                      aria-label={t("drawer.more", { name: line.name })}
                      onClick={() => void edit(line.productId, line.qty + 1)}
                    >
                      <GlyphIcon size={13} width={1.6} d="M12 5v14M5 12h14" />
                    </button>
                  </span>
                  <button
                    type="button"
                    className="ctl rm"
                    aria-label={t("drawer.remove", { name: line.name })}
                    onClick={() => void edit(line.productId, null)}
                  >
                    <GlyphIcon size={14} width={1.8} d="M6 6l12 12M18 6 6 18" />
                  </button>
                </div>
              );
            })
          )}
        </div>
        {lines.length > 0 && (
          <div className="drawer-foot">
            <div className="sum">
              <div className="grand">
                <span>{t("drawer.total")}</span>
                <b>{money(total)}</b>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
