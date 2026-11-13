/* jsdom does no layout, so this reads the stylesheet. A section's room is a one-column grid; with an
   `auto` column the column is never narrower than its content, and on a phone the shelf's sideways
   scroller (about three products wide) stretches every section past the screen (#32). The column
   must be allowed to shrink to the screen. */
import pageCss from "./page.css?raw";

function rule(selector: string): string {
  const escaped = selector.replace(/[.[\]]/g, "\\$&");
  const match = new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, "m").exec(pageCss);
  if (match?.[1] === undefined) throw new Error(`no rule for ${selector}`);
  return match[1];
}

test("a room's one column can shrink below its content's width", () => {
  expect(rule(".room")).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
});
