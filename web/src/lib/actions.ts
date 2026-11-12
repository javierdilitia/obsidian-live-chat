/* Direct actions: a button names what it does, the server does it and answers with the cart.
   The model never writes an action; each button builds its own (spec §7.6). */
import { z } from "zod";

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

const ActionResultSchema = z.object({
  ok: z.boolean(),
  cart: z.array(CartLineSchema),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
});

export type CartLine = z.infer<typeof CartLineSchema>;
export type ActionResult = z.infer<typeof ActionResultSchema>;

/**
 * Posts an action to `/api/actions`. Takes an A2UI `ActionPayload` as it is (its other fields,
 * such as the timestamp, are not sent). Throws when the server can't be reached or answers
 * with something other than an action result.
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
    body: JSON.stringify({ name, surfaceId, sourceComponentId, context }),
  });
  if (!response.ok) throw new Error(`POST /api/actions: HTTP ${String(response.status)}`);
  return ActionResultSchema.parse(await response.json());
}
