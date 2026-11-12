/* The shop catalog (`shop.json` in the agent package) as React components for `@a2ui/react`, in
   the mockup's look and motion.

   IDs, never values: the model names product IDs and spec keys; prices, specs, stock and looks
   come from the products endpoint (`useProducts`), and every fixed string ("The pick",
   "In stock", "No longer available", button labels) comes from this file. */
import { createComponentImplementation, type ReactA2uiComponentProps } from "@a2ui/react";
import {
  Catalog,
  ChildListSchema,
  ComponentIdSchema,
  type ComponentApi,
  type ComponentContext,
  type ResolveA2uiProps,
  type ResolvedChildRef,
} from "@a2ui/web_core/v1_0";
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { z } from "zod";
import { cart, expectFlight, useCart } from "../lib/cart";
import type { Product, ProductMap } from "../lib/products";
import { useProducts } from "../lib/products";
import "../styles/page.css";
import { seriesColour, useRise } from "./motion";
import { probeEnabled, useMountCounts, useMountProbe } from "./probe";
import { installMaterials, renderMarkup, type Look } from "./renders";

export const SHOP_CATALOG_ID = "https://halden.example/catalogs/shop/v1/catalog.json";

/* ——— the component APIs: the same fields and limits as shop.json ——— */

const PageApi = {
  name: "Page",
  schema: z.object({
    title: z.string().max(80),
    kicker: z.string().max(40),
    meta: z.array(z.string().max(32)).max(4).optional(),
    actions: z.array(ComponentIdSchema).max(2).optional(),
    children: ChildListSchema,
  }),
} satisfies ComponentApi;

const ChartGridApi = {
  name: "ChartGrid",
  schema: z.object({ children: ChildListSchema }),
} satisfies ComponentApi;

const VerdictApi = {
  name: "Verdict",
  schema: z.object({
    lead: z.string().max(40).optional(),
    text: z.string().max(200),
    button: ComponentIdSchema.optional(),
  }),
} satisfies ComponentApi;

const ProductShelfApi = {
  name: "ProductShelf",
  schema: z.object({
    items: z
      .array(z.object({ productId: z.string(), tag: z.string().max(40) }).strict())
      .min(2)
      .max(4),
    pickId: z.string().optional(),
  }),
} satisfies ComponentApi;

const SpecTableApi = {
  name: "SpecTable",
  schema: z.object({
    productIds: z.array(z.string()).min(2).max(4),
    specKeys: z.array(z.string()).min(1).max(12),
    highlightBest: z.boolean().optional(), // default true
  }),
} satisfies ComponentApi;

const BarChartApi = {
  name: "BarChart",
  schema: z.object({
    title: z.string().max(60),
    productIds: z.array(z.string()).min(2).max(4),
    specKey: z.string(),
    note: z.string().max(160).optional(),
  }),
} satisfies ComponentApi;

const AddToCartButtonApi = {
  name: "AddToCartButton",
  schema: z.object({
    productId: z.string(),
    variant: z.enum(["primary", "ghost"]).optional(), // default "primary"
    withName: z.boolean().optional(), // default false
    withPrice: z.boolean().optional(), // default false
  }),
} satisfies ComponentApi;

type ViewProps<Api extends ComponentApi> = ReactA2uiComponentProps<
  ResolveA2uiProps<z.infer<Api["schema"]>>
>;
type BuildChild = ReactA2uiComponentProps<unknown>["buildChild"];

/* ——— fixed strings, and the spec glossary until web/src/i18n/specs.*.json exists ——— */

const DASH = "—";
const GONE = "No longer available";
const FAILED = "Couldn't load";
const FOOTER = ["concept demo", "fictional products, prices & ratings"];

interface SpecInfo {
  label: string;
  /** Which way is better, for numeric specs; the best value in a row is marked. */
  better?: "higher" | "lower";
}

const SPECS: Record<string, SpecInfo> = {
  display: { label: "Display" },
  hz: { label: "Refresh rate", better: "higher" },
  cpu: { label: "Processor" },
  gpu: { label: "Graphics" },
  ram: { label: "Memory" },
  ssd: { label: "Storage" },
  batt: { label: "Battery", better: "higher" },
  weight: { label: "Weight" },
  ports: { label: "Ports" },
  p3: { label: "Colour range", better: "higher" },
  de: { label: "Colour error", better: "lower" },
  panel: { label: "Panel" },
  refresh_rate: { label: "Refresh rate" },
  colour: { label: "Colour" },
  inputs: { label: "Inputs" },
  stand: { label: "Stand" },
  noise_cancelling: { label: "Noise cancelling" },
  battery: { label: "Battery" },
  codecs: { label: "Codecs" },
  water: { label: "Water resistance" },
  switches: { label: "Switches" },
  layout: { label: "Layout" },
  connection: { label: "Connection" },
  capacity: { label: "Capacity" },
  speed: { label: "Speed" },
  power_pass_through: { label: "Power pass-through" },
  cable: { label: "Cable" },
};

function specInfo(key: string): SpecInfo {
  return SPECS[key] ?? { label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ") };
}

const euro = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const euroCents = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });
const count = new Intl.NumberFormat("en-IE");

export function formatPrice(cents: number): string {
  return cents % 100 === 0 ? euro.format(cents / 100) : euroCents.format(cents / 100);
}

function stockText(stock: number): string {
  if (stock <= 0) return "Out of stock";
  if (stock <= 3) return `Only ${String(stock)} left`;
  return "In stock";
}

/** A numeric spec value, or undefined when the product lacks it or it is text. */
function numeric(product: Product | null | undefined, key: string): number | undefined {
  const value = product?.specs[key]?.value;
  return typeof value === "number" ? value : undefined;
}

/** For a CSS custom property in a `style` prop. */
function vars(values: Record<string, string | number>): CSSProperties {
  return values;
}

/** A product's name; the fixed string when it is gone or failed to load; blank while loading. */
function nameOf(product: Product | null | undefined, failed: boolean): string {
  if (product === null) return GONE;
  if (product) return product.name;
  return failed ? FAILED : "";
}

/** A spec as shown: a dash when the product lacks it, is gone or failed to load. */
function shownSpec(product: Product | null | undefined, key: string, failed: boolean): string {
  if (product === undefined) return failed ? DASH : "";
  return product?.specs[key]?.display ?? DASH;
}

function childRef(child: string | ResolvedChildRef, buildChild: BuildChild): ReactNode {
  return typeof child === "string" ? buildChild(child) : buildChild(child.id, child.basePath);
}

/* ——— icons, from the mockup's sprite: one 1.5–1.8px stroke grammar in currentColor ——— */

function CheckIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M5 12.5 10 17.5 19 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3.5 5h2l2.2 10.5h10.6L20.5 8H7" />
        <circle cx="9.5" cy="19.2" r="1.4" />
        <circle cx="16.5" cy="19.2" r="1.4" />
      </g>
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M12 3.2l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6-4.4-4.2 6-.8Z"
        fill="currentColor"
      />
    </svg>
  );
}

/* ——— shared commerce parts ——— */

export function ProductRender({ look }: { look: Look }) {
  useLayoutEffect(installMaterials, []);
  return (
    <svg
      className="render"
      viewBox="0 0 320 230"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: renderMarkup(look) }}
    />
  );
}

function Trust({ product }: { product: Product }) {
  if (product.rating == null) return null;
  const rating = product.rating.toFixed(1);
  const reviews = count.format(product.review_count);
  return (
    <span
      className="trust"
      role="img"
      aria-label={`Rated ${rating} out of 5 from ${reviews} reviews`}
    >
      <StarIcon />
      <b>{rating}</b>
      <span>({reviews})</span>
    </span>
  );
}

function PriceBlock({ product }: { product: Product }) {
  const was = product.was_price_cents;
  return (
    <>
      <div className="price-now">
        <b>{formatPrice(product.price_cents)}</b>
        {was != null && (
          <s>
            <span className="visually-hidden">was </span>
            {formatPrice(was)}
          </s>
        )}
      </div>
      {was != null && <div className="save">Save {formatPrice(was - product.price_cents)}</div>}
    </>
  );
}

function Stock({ stock }: { stock: number }) {
  return (
    <span className="stock">
      {stock > 0 && <CheckIcon size={13} />}
      {stockText(stock)}
    </span>
  );
}

/** Where each product stands on the page's shelf: its series colour, for the fly-to-cart dot. */
const shelfPosition = new Map<string, number>();

/** Sends `cart.add` for one product, through the surface's action handler, and notes the dot's
 *  flight: from the clicked button, in the product's series colour (steel when it is not on the
 *  shelf). The dot launches when the server has put the product in the cart. */
function addToCart(context: ComponentContext, productId: string, from: Element): void {
  expectFlight(productId, from, seriesColour(shelfPosition.get(productId) ?? 1));
  void context.dispatchAction({ event: { name: "cart.add", context: { productId } } });
}

/** "In cart · View": a product already in the cart opens the drawer instead of adding again
 *  (spec §7.6 `openCart`, a local action: nothing is sent). */
function InCartLabel() {
  return (
    <>
      <CheckIcon size={15} />
      In cart · View
    </>
  );
}

/* ——— Page ——— */

function ProbePanel() {
  const counts = useMountCounts();
  return (
    <aside className="probe" aria-label="Mount probe">
      {Object.entries(counts).map(([id, mounts]) => (
        <span key={id}>
          {id} <b>{mounts}</b>
        </span>
      ))}
    </aside>
  );
}

/** The sections the running edit adds (`data-rooms` on the workspace, set by the run), if one runs. */
function addedSections(room: HTMLElement): string[] {
  try {
    const held = room.closest<HTMLElement>('[data-motion="edit"]');
    const listed: unknown = JSON.parse(held?.dataset.rooms ?? "[]");
    return Array.isArray(listed) ? listed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/**
 * A section's room in the page (mockup/css/artifacts.css `.grow-wrap`). A section that mounts while
 * an edit holds the page and that the edit adds to `Page.children` starts shut, and the run opens it
 * (grid rows 0fr→1fr) before the dots land. A section that was on the page and mounts again (the
 * renderer creates a component anew when its kind changes) is open from the start.
 */
function Room({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const room = ref.current;
    if (!room) return;
    // the section is the first catalog part in the room: it carries the component's ID
    const section = room.querySelector<HTMLElement>("[data-part]")?.dataset.part;
    if (section !== undefined && addedSections(room).includes(section)) room.dataset.shut = "";
  }, []);
  return (
    <div ref={ref} className="room">
      <div className="room-inner">{children}</div>
    </div>
  );
}

function PageView({ props, buildChild, context }: ViewProps<typeof PageApi>) {
  const id = context.componentModel.id;
  useMountProbe(id);
  const ref = useRef<HTMLElement>(null);
  useRise(ref);
  const meta = props.meta ?? [];
  const actions = props.actions ?? [];
  return (
    <article ref={ref} className="artifact" aria-label={props.title} data-part={id}>
      <header className="art-header">
        <div className="art-head rise">
          <p className="art-kicker">{props.kicker}</p>
          <h2>{props.title}</h2>
          {meta.length > 0 && (
            <div className="art-meta">
              {meta.map((fact, i) => (
                <span key={i}>{fact}</span>
              ))}
            </div>
          )}
        </div>
        {actions.length > 0 && (
          <div className="art-actions rise">{actions.map((id) => buildChild(id))}</div>
        )}
      </header>
      {/* each section in its room, keyed as the renderer keys the section itself */}
      {props.children.map((child) => (
        <Room key={typeof child === "string" ? child : child.id}>
          {childRef(child, buildChild)}
        </Room>
      ))}
      <footer className="art-foot rise">
        {FOOTER.map((part) => (
          <span key={part}>{part}</span>
        ))}
      </footer>
      {probeEnabled() && <ProbePanel />}
    </article>
  );
}

/* ——— Verdict ——— */

function VerdictView({ props, buildChild, context }: ViewProps<typeof VerdictApi>) {
  const id = context.componentModel.id;
  useMountProbe(id);
  const ref = useRef<HTMLDivElement>(null);
  useRise(ref);
  return (
    <div ref={ref} className="verdict rise" data-section={id} data-part={id}>
      <CheckIcon size={17} />
      <p className="vt">
        {props.lead && <b>{props.lead} </b>}
        <span>{props.text}</span>
      </p>
      {props.button && buildChild(props.button)}
    </div>
  );
}

/* ——— ProductShelf ——— */

interface ShelfItemProps {
  productId: string;
  tag: string;
  index: number;
  pick: boolean;
  product: Product | null | undefined;
  failed: boolean;
  inCart: boolean;
  onAdd: (productId: string, from: Element) => void;
}

function ShelfItem({
  productId,
  tag,
  index,
  pick,
  product,
  failed,
  inCart,
  onAdd,
}: ShelfItemProps) {
  const tagLine = (
    <div className="swatch-line">
      <i style={{ background: seriesColour(index) }} />
      {tag}
    </div>
  );
  return (
    <li className="prod rise">
      <div className="prod-shot shot">
        {product && <ProductRender look={product.look} />}
        {pick && product && <span className="pill">The pick</span>}
      </div>
      {(product === null || (product === undefined && failed)) && (
        <>
          <p className="prod-gone">{nameOf(product, failed)}</p>
          {tagLine}
        </>
      )}
      {product && (
        <>
          <h3>{product.name}</h3>
          <Trust product={product} />
          <div className="buybox">
            <PriceBlock product={product} />
          </div>
          {tagLine}
          <Stock stock={product.stock} />
          <div className="prod-actions">
            <button
              type="button"
              className={inCart ? "btn btn-ghost buy is-in" : "btn btn-ghost buy"}
              aria-label={inCart ? `In cart · View ${product.name}` : `Add ${product.name} to cart`}
              disabled={!inCart && product.stock <= 0}
              onClick={(event) => {
                if (inCart) cart.open();
                else onAdd(productId, event.currentTarget);
              }}
            >
              {inCart ? (
                <InCartLabel />
              ) : (
                <>
                  <CartIcon />
                  Add to cart
                </>
              )}
            </button>
          </div>
        </>
      )}
    </li>
  );
}

function ProductShelfView({ props, context }: ViewProps<typeof ProductShelfApi>) {
  const id = context.componentModel.id;
  useMountProbe(id);
  const ref = useRef<HTMLUListElement>(null);
  useRise(ref);
  const { products, failed } = useProducts(props.items.map((item) => item.productId));
  const { lines } = useCart();
  useLayoutEffect(() => {
    props.items.forEach((item, i) => {
      shelfPosition.set(item.productId, i);
    });
  }, [props.items]);
  return (
    <ul
      ref={ref}
      className="trio"
      aria-label="Products"
      data-section={id}
      data-part={id}
      style={vars({ "--n": props.items.length })}
    >
      {props.items.map((item, i) => (
        <ShelfItem
          key={item.productId}
          productId={item.productId}
          tag={item.tag}
          index={i}
          pick={item.productId === props.pickId}
          product={products.get(item.productId)}
          failed={failed}
          inCart={lines.some((line) => line.productId === item.productId)}
          onAdd={(productId, from) => {
            addToCart(context, productId, from);
          }}
        />
      ))}
    </ul>
  );
}

/* ——— SpecTable ——— */

/** The indexes of the best value in a row, for a numeric spec with a direction. */
function bestOf(products: ProductMap, ids: readonly string[], key: string): Set<number> {
  const better = specInfo(key).better;
  const values = ids.map((pid) => numeric(products.get(pid), key));
  const known = values.filter((value): value is number => value !== undefined);
  if (!better || known.length < 2) return new Set();
  const best = better === "higher" ? Math.max(...known) : Math.min(...known);
  return new Set(values.flatMap((value, i) => (value === best ? [i] : [])));
}

function SpecTableView({ props, context }: ViewProps<typeof SpecTableApi>) {
  const id = context.componentModel.id;
  useMountProbe(id);
  const ref = useRef<HTMLDivElement>(null);
  useRise(ref);
  const { products, failed } = useProducts(props.productIds);
  const highlight = props.highlightBest ?? true;
  return (
    <div
      ref={ref}
      className="specs-wrap"
      role="table"
      aria-label="Specs"
      data-section={id}
      data-part={id}
      style={vars({ "--n": props.productIds.length })}
    >
      <div className="spec-row spec-head" role="row">
        <div className="spec-name" role="columnheader">
          <span className="visually-hidden">Spec</span>
        </div>
        {props.productIds.map((pid, i) => {
          const product = products.get(pid);
          return (
            <div key={pid} className="spec-val rise" role="columnheader">
              <i style={{ background: seriesColour(i) }} />
              {nameOf(product, failed)}
            </div>
          );
        })}
      </div>
      {props.specKeys.map((key) => {
        const best = highlight ? bestOf(products, props.productIds, key) : new Set<number>();
        return (
          <div key={key} className="spec-row" role="row">
            <div className="spec-name rise" role="rowheader">
              {specInfo(key).label}
            </div>
            {props.productIds.map((pid, i) => {
              const product = products.get(pid);
              const text = shownSpec(product, key, failed);
              const isBest = best.has(i);
              return (
                <div
                  key={pid}
                  className={isBest ? "spec-val rise best" : "spec-val rise"}
                  role="cell"
                >
                  {isBest && <span className="bdot" style={{ background: seriesColour(i) }} />}
                  {text}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/* ——— ChartGrid and BarChart ——— */

function ChartGridView({ props, buildChild, context }: ViewProps<typeof ChartGridApi>) {
  const id = context.componentModel.id;
  useMountProbe(id);
  const ref = useRef<HTMLDivElement>(null);
  useRise(ref);
  return (
    <div ref={ref} className="charts" data-section={id} data-part={id}>
      {props.children.map((child) => childRef(child, buildChild))}
    </div>
  );
}

function BarChartView({ props, context }: ViewProps<typeof BarChartApi>) {
  const id = context.componentModel.id;
  useMountProbe(id);
  const ref = useRef<HTMLDivElement>(null);
  useRise(ref);
  const { products, failed } = useProducts(props.productIds);
  const values = props.productIds.map((pid) => numeric(products.get(pid), props.specKey));
  const max = Math.max(0, ...values.filter((value): value is number => value !== undefined));
  const dim = specInfo(props.specKey).better === "lower";
  return (
    <div ref={ref} className="chart-cell" data-part={id}>
      <h3 className="rise">{props.title}</h3>
      {props.productIds.map((pid, i) => {
        const product = products.get(pid);
        const value = values[i];
        const name = nameOf(product, failed);
        const shown = shownSpec(product, props.specKey, failed);
        const width = value !== undefined && max > 0 ? (value / max) * 100 : 0;
        return (
          <div key={pid} className="bar-row rise" style={vars({ "--row": i })}>
            <div className="bar-top">
              <span className="n">{name}</span>
              <span className="v">{shown}</span>
            </div>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{
                  width: `${width.toFixed(1)}%`,
                  background: seriesColour(i),
                  opacity: dim ? 0.75 : 1,
                }}
              />
            </div>
          </div>
        );
      })}
      {props.note && <p className="note rise">{props.note}</p>}
    </div>
  );
}

/* ——— AddToCartButton ——— */

function cartLabel(product: Product | undefined, withName: boolean, withPrice: boolean): string {
  const name = withName && product ? `Add ${product.name}` : "Add to cart";
  return withPrice && product ? `${name} · ${formatPrice(product.price_cents)}` : name;
}

function AddToCartButtonView({ props, context }: ViewProps<typeof AddToCartButtonApi>) {
  const id = context.componentModel.id;
  useMountProbe(id);
  const { products, failed } = useProducts([props.productId]);
  const product = products.get(props.productId);
  const variant = props.variant ?? "primary";
  const { lines } = useCart();
  const inCart = lines.some((line) => line.productId === props.productId);
  if (inCart) {
    return (
      <button
        type="button"
        className={`btn btn-${variant} buy is-in`}
        data-part={id}
        aria-label={product ? `In cart · View ${product.name}` : undefined}
        onClick={() => {
          cart.open();
        }}
      >
        <InCartLabel />
      </button>
    );
  }
  if (product === null || (product === undefined && failed)) {
    return (
      <button type="button" className={`btn btn-${variant} buy`} data-part={id} disabled>
        {nameOf(product, failed)}
      </button>
    );
  }
  const label = cartLabel(product, props.withName ?? false, props.withPrice ?? false);
  const named = product && !(props.withName ?? false) ? `Add ${product.name} to cart` : undefined;
  return (
    <button
      type="button"
      className={`btn btn-${variant} buy`}
      data-part={id}
      aria-label={named}
      disabled={product !== undefined && product.stock <= 0}
      onClick={(event) => {
        addToCart(context, props.productId, event.currentTarget);
      }}
    >
      <CartIcon />
      {label}
    </button>
  );
}

/* ——— the catalog ——— */

export const shopCatalog = new Catalog(SHOP_CATALOG_ID, "1.0", [
  createComponentImplementation(PageApi, PageView),
  createComponentImplementation(ChartGridApi, ChartGridView),
  createComponentImplementation(VerdictApi, VerdictView),
  createComponentImplementation(ProductShelfApi, ProductShelfView),
  createComponentImplementation(SpecTableApi, SpecTableView),
  createComponentImplementation(BarChartApi, BarChartView),
  createComponentImplementation(AddToCartButtonApi, AddToCartButtonView),
]);
