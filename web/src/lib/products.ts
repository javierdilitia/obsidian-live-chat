/* Products for the catalog components. The model writes product IDs only; prices, specs, stock
   and looks come from `GET /api/catalog/products?ids=a,b`.

   One cache for the page: an entry lives 60 s, and the IDs asked for in the same tick go out as
   one request, so a page whose sections all name the same laptops asks once. */
import { useEffect, useState } from "react";
import { z } from "zod";

const TTL_MS = 60_000;

const SpecValueSchema = z.object({
  value: z.union([z.string(), z.number()]),
  unit: z.string().nullish(),
  display: z.string(),
});

const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  category_id: z.string(),
  price_cents: z.number(),
  was_price_cents: z.number().nullish(),
  currency: z.literal("EUR"),
  rating: z.number().nullish(),
  review_count: z.number(),
  stock: z.number(),
  look: z.object({
    glyph: z.string(),
    finish: z.string(),
    screen: z.string().nullish(),
  }),
  specs: z.record(z.string(), SpecValueSchema),
});

const ProductsResponseSchema = z.object({
  products: z.array(ProductSchema),
  missing: z.array(z.string()),
});

export type SpecValue = z.infer<typeof SpecValueSchema>;
export type Product = z.infer<typeof ProductSchema>;

/** By product ID: the product, `null` when the catalog no longer has it, absent while loading. */
export type ProductMap = ReadonlyMap<string, Product | null>;

interface Entry {
  at: number;
  promise: Promise<Product | null>;
  /** Set once the promise settles with a value. */
  value?: Product | null;
}

interface Waiter {
  resolve: (product: Product | null) => void;
  reject: (error: unknown) => void;
}

const cache = new Map<string, Entry>();
let batch: Map<string, Waiter> | null = null;

function fresh(entry: Entry | undefined, now: number): entry is Entry {
  return entry !== undefined && now - entry.at < TTL_MS;
}

/** Queues one ID for the next request; every ID asked for in this tick shares it. */
function request(id: string, now: number): Entry {
  if (!batch) {
    batch = new Map();
    queueMicrotask(() => void flush());
  }
  const waiter: Waiter = { resolve: () => undefined, reject: () => undefined };
  const promise = new Promise<Product | null>((resolve, reject) => {
    waiter.resolve = resolve;
    waiter.reject = reject;
  });
  batch.set(id, waiter);
  const entry: Entry = { at: now, promise };
  promise.then(
    (value) => {
      entry.value = value;
    },
    () => {
      // A failed request is not cached: the next caller asks again.
      if (cache.get(id) === entry) cache.delete(id);
    },
  );
  return entry;
}

async function flush(): Promise<void> {
  const wanted = batch;
  batch = null;
  if (!wanted) return;
  try {
    const ids = [...wanted.keys()].map(encodeURIComponent).join(",");
    const response = await fetch(`/api/catalog/products?ids=${ids}`);
    if (!response.ok) throw new Error(`GET /api/catalog/products: HTTP ${String(response.status)}`);
    const body = ProductsResponseSchema.parse(await response.json());
    const byId = new Map(body.products.map((product) => [product.id, product]));
    for (const [id, waiter] of wanted) waiter.resolve(byId.get(id) ?? null);
  } catch (error) {
    for (const waiter of wanted.values()) waiter.reject(error);
  }
}

/** The products for `ids`, from the cache when fresh; one request for everything else. */
export function fetchProducts(ids: readonly string[]): Promise<ProductMap> {
  const now = Date.now();
  const pending: Promise<readonly [string, Product | null]>[] = [];
  for (const id of new Set(ids)) {
    let entry = cache.get(id);
    if (!fresh(entry, now)) {
      entry = request(id, now);
      cache.set(id, entry);
    }
    pending.push(entry.promise.then((product) => [id, product] as const));
  }
  return Promise.all(pending).then((pairs) => new Map(pairs));
}

/** What the cache already holds for `ids`, without asking the server. */
export function peekProducts(ids: readonly string[]): ProductMap {
  const found = new Map<string, Product | null>();
  for (const id of ids) {
    const value = cache.get(id)?.value;
    if (value !== undefined) found.set(id, value);
  }
  return found;
}

function allFresh(ids: readonly string[]): boolean {
  const now = Date.now();
  return ids.every((id) => {
    const entry = cache.get(id);
    return fresh(entry, now) && entry.value !== undefined;
  });
}

/** The products for `ids`. Renders from the cache at once; fetches what is missing or stale. */
export function useProducts(ids: readonly string[]): ProductMap {
  const key = ids.join("\n");
  const [loaded, setLoaded] = useState<{ key: string; products: ProductMap } | null>(null);
  useEffect(() => {
    const wanted = key ? key.split("\n") : [];
    if (allFresh(wanted)) return;
    let live = true;
    fetchProducts(wanted).then(
      (products) => {
        if (live) setLoaded({ key, products });
      },
      () => {
        // Left loading; the next mount or ID change asks again.
      },
    );
    return () => {
      live = false;
    };
  }, [key]);
  return loaded?.key === key ? loaded.products : peekProducts(ids);
}

/** Forgets every cached product (tests, and a future "refresh prices"). */
export function resetProductCache(): void {
  cache.clear();
  batch = null;
}
