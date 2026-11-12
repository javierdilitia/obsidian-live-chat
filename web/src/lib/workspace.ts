/* The reload: `GET /api/workspace` answers with what the server holds, the tab (with its page as
   one `createSurface` message, or no page yet when the first build failed) and the cart (spec §5).
   The app restores from it on mount, and re-syncs from it when a streamed message is rejected. */
import { z } from "zod";
import { CartLineSchema } from "./actions";

const WorkspaceSchema = z.object({
  tab: z
    .object({
      surface_id: z.string(),
      title: z.string(),
      snapshot: z.record(z.string(), z.unknown()).nullable(),
    })
    .nullable(),
  cart: z.array(CartLineSchema),
});

export type Workspace = z.infer<typeof WorkspaceSchema>;

/** Reads the workspace. Throws when the server can't be reached or answers something else. */
export async function readWorkspace(): Promise<Workspace> {
  const response = await fetch("/api/workspace");
  if (!response.ok) throw new Error(`GET /api/workspace: HTTP ${String(response.status)}`);
  return WorkspaceSchema.parse(await response.json());
}
