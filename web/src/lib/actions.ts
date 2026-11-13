/* Direct actions: a button names what it does, the server does it and answers with the cart.
   The model never writes an action; each button builds its own (spec §7.6). Every click sends its
   own `requestId`, so a repeated request gets the server's first answer (spec §8.1). The kinds
   live in the agent's `catalog/actions.json`, which the server checks against. */
import { z } from "zod";

/** The direct actions the web sends; `actions.test.ts` checks each one is `direct` in the
 *  registry. */
export const DISPATCHED_ACTIONS = [
  "cart.add",
  "cart.set_qty",
  "cart.remove",
  "session.switch_user",
  "prefs.set_language",
] as const;

export interface ActionRequest {
  name: string;
  surfaceId: string;
  sourceComponentId: string;
  context: Record<string, unknown>;
}

export const CartLineSchema = z.object({
  productId: z.string(),
  name: z.string(),
  qty: z.number(),
  price_cents: z.number(),
});

export const UserSchema = z.object({ id: z.string(), name: z.string(), language: z.string() });

const ActionResultSchema = z.object({
  ok: z.boolean(),
  cart: z.array(CartLineSchema),
  /** `message` is the server's English, for the console; the shopper reads the bundle's words
   *  for `code` (and `params`, which say what the server knew). */
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
    })
    .optional(),
  /** `session.switch_user`: the shopper the session now names; `prefs.set_language`: the
   *  shopper with their new language. */
  user: UserSchema.optional(),
});

export type CartLine = z.infer<typeof CartLineSchema>;
export type User = z.infer<typeof UserSchema>;
export type ActionResult = z.infer<typeof ActionResultSchema>;
export type ActionError = NonNullable<ActionResult["error"]>;

/**
 * Posts an action to `/api/actions`, with a new `requestId` in its context. Takes an A2UI
 * `ActionPayload` as it is (its other fields, such as the timestamp, are not sent). Throws when
 * the server can't be reached or answers with something other than an action result.
 */
export async function dispatchAction({
  name,
  surfaceId,
  sourceComponentId,
  context,
}: ActionRequest): Promise<ActionResult> {
  const response = await fetch("/api/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      surfaceId,
      sourceComponentId,
      context: { ...context, requestId: crypto.randomUUID() },
    }),
  });
  if (!response.ok) throw new Error(`POST /api/actions: HTTP ${String(response.status)}`);
  return ActionResultSchema.parse(await response.json());
}
