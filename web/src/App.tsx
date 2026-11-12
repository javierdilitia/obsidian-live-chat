/* The demo shell, from the mockup's chrome: the shell bar (the store, the cart, the agent's seam),
   one tab the agent opens, the command bar, the workspace that holds the page, toasts and the one
   disclaimer. A command runs over SSE (`streamRun`); its A2UI messages go to one
   `MessageProcessor([shopCatalog])`, whose action handler posts the page's buttons to the server. */
import { A2uiSurface, type ReactCatalogComponent } from "@a2ui/react";
import { MessageProcessor, type ActionPayload, type SurfaceModel } from "@a2ui/web_core/v1_0";
import { useCallback, useEffect, useRef, useState, type SubmitEvent } from "react";
import { formatPrice, shopCatalog } from "./a2ui/catalog";
import { dispatchAction, type CartLine } from "./lib/actions";
import { streamRun, type RunEnd } from "./lib/sse";
import "./styles/shell.css";

type Surface = SurfaceModel<ReactCatalogComponent>;

type Status =
  | { kind: "building" | "updating" }
  /** `rested`: the field has faded out, keeping its text while it fades. */
  | { kind: "built"; rested?: boolean }
  | { kind: "error"; message: string };

const PROMPT = "What are you shopping for?";
const TAB_ID = "page-tab";
/** "Built · just now" stays this long, then the state field and the seam fade (the mockup's timing). */
const BUILT_MS = 2400;
const TOAST_MS = 2600;
const TOAST_OUT_MS = 320;
const UNREACHABLE = "Couldn't reach the assistant. Try again.";

/* ——— icons, from mockup/index.html ——— */

/** The shard mark's gradients and symbol, once for the page; icons refer to `#i-shard`. */
function Sprite() {
  return (
    <svg className="sprite" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="g-shard-lit" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#EEF5FC" />
          <stop offset="1" stopColor="#9CBEE0" />
        </linearGradient>
        <linearGradient id="g-shard-side" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7FA8D8" />
          <stop offset="1" stopColor="#2E4866" />
        </linearGradient>
        <linearGradient id="g-shard-left" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3D5068" />
          <stop offset="1" stopColor="#1B2430" />
        </linearGradient>
        <symbol id="i-shard" viewBox="0 0 24 24">
          <path d="M12.4 1.5 20 9 11.2 10.2Z" fill="url(#g-shard-lit)" />
          <path d="M12.4 1.5 11.2 10.2 4 13.4 7.4 4.8Z" fill="url(#g-shard-left)" />
          <path d="M20 9 16.8 20.6 12.6 16 11.2 10.2Z" fill="url(#g-shard-side)" />
          <path d="M4 13.4 11.2 10.2 12.6 16 9.2 22.6Z" fill="#141A23" />
          <path d="M12.6 16 16.8 20.6 9.2 22.6Z" fill="#22334A" />
          <path
            d="M12.4 1.5 11.2 10.2 12.6 16"
            fill="none"
            stroke="#D6E6F5"
            strokeOpacity=".35"
            strokeWidth=".5"
            strokeLinejoin="round"
          />
          <path
            d="M12.4 1.5 20 9 16.8 20.6 9.2 22.6 4 13.4 7.4 4.8Z"
            fill="none"
            stroke="#9CBEE0"
            strokeOpacity=".7"
            strokeWidth=".8"
            strokeLinejoin="round"
          />
        </symbol>
      </defs>
    </svg>
  );
}

function Shard({ size }: { size: number }) {
  return (
    <svg width={size} height={size} aria-hidden="true" focusable="false">
      <use href="#i-shard" />
    </svg>
  );
}

/** A stroked 24×24 line icon. */
function Icon({ size, width = 1.5, d }: { size: number; width?: number; d: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}

const SPARK = "M12 4v6M12 14v6M4 12h6M14 12h6";
const ARROW_UP = "M12 19V6M6.5 11.5 12 6l5.5 5.5";
const COMPARE = "M5 20V12M12 20V6M19 20V9";
const CART =
  "M3.5 5h2l2.2 10.5h10.6L20.5 8H7M9.5 17.8a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8ZM16.5 17.8a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8Z";

/* ——— the cart, in the shell's ledger ——— */

function CartCell({ lines }: { lines: readonly CartLine[] }) {
  const items = lines.reduce((sum, line) => sum + line.qty, 0);
  const total = formatPrice(lines.reduce((sum, line) => sum + line.qty * line.price_cents, 0));
  const label =
    items === 0 ? "Cart, empty" : `Cart, ${String(items)} item${items === 1 ? "" : "s"}, ${total}`;
  return (
    <div className="cell" role="status" aria-label={label}>
      <span className="ico">
        <Icon size={16} d={CART} />
      </span>
      <span className="lbl">Cart</span>
      {/* the value rolls in whenever it changes */}
      <span className="fact roll">
        {items === 0 ? (
          <span>empty</span>
        ) : (
          <span key={`${String(items)}·${total}`} className="in">
            <b>{items}</b>
            <span className="wide"> · {total}</span>
          </span>
        )}
      </span>
    </div>
  );
}

/* ——— toasts ——— */

interface Toast {
  id: number;
  text: string;
}

let nextToastId = 0;

function ToastPill({ toast, onGone }: { toast: Toast; onGone: (id: number) => void }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const out = setTimeout(() => {
      setLeaving(true);
    }, TOAST_MS);
    const gone = setTimeout(() => {
      onGone(toast.id);
    }, TOAST_MS + TOAST_OUT_MS);
    return () => {
      clearTimeout(out);
      clearTimeout(gone);
    };
  }, [toast.id, onGone]);
  return (
    <div className={leaving ? "toast out" : "toast"}>
      <Shard size={15} />
      <span>{toast.text}</span>
    </div>
  );
}

/** What adding to cart says: the server's answer, or why it could not be asked. */
async function sendAction(action: ActionPayload): Promise<{ cart?: CartLine[]; message: string }> {
  try {
    const result = await dispatchAction(action);
    if (result.error) return { cart: result.cart, message: result.error.message };
    const added = result.cart.find((line) => line.productId === action.context.productId);
    return {
      cart: result.cart,
      message: added ? `${added.name} added to your cart` : "Added to your cart",
    };
  } catch {
    return { message: "Couldn't add to cart. Try again." };
  }
}

/* ——— the state field in the command bar ——— */

function StateText({ status }: { status: Status }) {
  switch (status.kind) {
    case "building":
      return <b>Building comparison…</b>;
    case "updating":
      return <b>Updating this page…</b>;
    case "built":
      return (
        <>
          <b>Built</b> · just now
        </>
      );
    case "error":
      return <span className="err">{status.message}</span>;
  }
}

/* ——— the app ——— */

export default function App() {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [processor] = useState(
    () =>
      new MessageProcessor<ReactCatalogComponent>([shopCatalog], async (action) => {
        const { cart: lines, message } = await sendAction(action);
        if (lines) setCart(lines);
        const id = (nextToastId += 1);
        setToasts((list) => [...list, { id, text: message }]);
      }),
  );
  const [surface, setSurface] = useState<Surface | null>(null);
  const [tabTitle, setTabTitle] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [command, setCommand] = useState("");
  /** The command that built or last changed the page: the bar shows it, like an address bar. */
  const [shown, setShown] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const refocus = useRef(false);

  const running = status?.kind === "building" || status?.kind === "updating";

  useEffect(() => {
    const created = processor.onSurfaceCreated(setSurface);
    return () => {
      created.unsubscribe();
    };
  }, [processor]);

  useEffect(() => {
    if (status?.kind !== "built" || status.rested) return;
    const timer = setTimeout(() => {
      setStatus({ kind: "built", rested: true });
    }, BUILT_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [status]);

  // The input is disabled during a run, which drops its focus; give it back when the run ends.
  useEffect(() => {
    if (running || !refocus.current) return;
    refocus.current = false;
    input.current?.focus();
  }, [running]);

  const dropToast = useCallback((id: number) => {
    setToasts((list) => list.filter((toast) => toast.id !== id));
  }, []);

  async function run(text: string) {
    setStatus({ kind: surface ? "updating" : "building" });
    const rejected: unknown[] = [];
    let end: RunEnd;
    try {
      end = await streamRun(text, (event) => {
        if (event.type !== "CUSTOM") return;
        if (event.name === "tab_opened") setTabTitle(event.value.title);
        else rejected.push(...processor.processMessagesWithErrors(event.value));
      });
    } catch {
      end = { type: "RUN_ERROR", code: "unreachable", message: UNREACHABLE };
    }
    if (end.type === "RUN_ERROR") {
      setStatus({ kind: "error", message: end.message });
    } else if (rejected.length > 0) {
      setStatus({ kind: "error", message: "Couldn't show all of this page." });
    } else {
      setShown(text);
      setStatus({ kind: "built" });
    }
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = command.trim();
    if (!text || running) return;
    refocus.current = document.activeElement === input.current;
    void run(text);
  }

  const ready = command.trim() !== "" && command.trim() !== shown && !running;
  // The state field shows until "Built · just now" rests.
  const fresh = status !== null && !(status.kind === "built" && status.rested);
  // The seam fills to 55 % while the model works and to 100 % when the page is built, then fades.
  const seamOn = running || (fresh && status.kind === "built");
  const seam: Record<string, number> = {
    "--p": running ? 0.55 : seamOn ? 1 : 0,
    "--on": seamOn ? 1 : 0,
  };

  return (
    <div className={tabTitle === null ? "app" : "app tabs-on"}>
      <Sprite />
      <header className="shell">
        <div className="wordmark">
          <b className="store">Halden</b>
          <span className="by">
            <Shard size={14} />
            assistant by Obsidian
          </span>
        </div>
        <div className="ledger">
          <CartCell lines={cart} />
        </div>
        {/* the agent's line: fills while a page builds */}
        <span className={seamOn ? "seam" : "seam rest"} style={seam} aria-hidden="true" />
      </header>

      <main className="stage">
        <div className="chrome">
          <div className={tabTitle === null ? "collapse closed" : "collapse"}>
            <div className="collapse-inner">
              <div className="tabband">
                <div className="col tabbar">
                  <div className="tabs" role="tablist" aria-label="Pages the assistant built">
                    {tabTitle !== null && (
                      <div className="tab active">
                        <button
                          id={TAB_ID}
                          className="tab-main"
                          type="button"
                          role="tab"
                          aria-selected="true"
                          aria-controls="workspace"
                          aria-busy={running}
                          title={tabTitle}
                        >
                          <span className="tab-ico">
                            {running ? (
                              <span className="tload" aria-hidden="true" />
                            ) : (
                              <Icon size={14} width={1.6} d={COMPARE} />
                            )}
                          </span>
                          <span className="tab-t">{tabTitle}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="toolbar">
            <div className="collapse hero-fold" aria-hidden={tabTitle !== null || undefined}>
              <div className="collapse-inner">
                <div className="col hero">
                  <h1>
                    <span>Tell us what it’s for.</span> We’ll build you the shortlist.
                  </h1>
                </div>
              </div>
            </div>
            <div className="col">
              <form className="capsule" onSubmit={submit}>
                <span className="spark">
                  <Icon size={18} d={SPARK} />
                </span>
                <input
                  ref={input}
                  className="caret"
                  type="text"
                  value={command}
                  placeholder={PROMPT}
                  aria-label={PROMPT}
                  autoComplete="off"
                  disabled={running}
                  onChange={(event) => {
                    setCommand(event.target.value);
                  }}
                  onFocus={(event) => {
                    event.target.select();
                  }}
                />
                <span
                  className={fresh ? "cap-state on" : "cap-state"}
                  role="status"
                  aria-label="Assistant"
                  aria-hidden={status && !fresh ? true : undefined}
                >
                  {status && <StateText status={status} />}
                </span>
                <button
                  className={ready ? "send ready" : "send"}
                  type="submit"
                  aria-label="Send"
                  disabled={running}
                >
                  <Icon size={17} width={1.8} d={ARROW_UP} />
                </button>
              </form>
            </div>
          </div>
        </div>

        <section
          id="workspace"
          className="workspace col"
          {...(tabTitle === null
            ? { "aria-label": "AI workspace" }
            : { role: "tabpanel", "aria-labelledby": TAB_ID })}
        >
          {surface && <A2uiSurface surface={surface} />}
        </section>

        {/* the one disclaimer, where a store keeps its small print */}
        <footer className="col demo-note">
          Concept demo · every product, price, rating and order is fictional
        </footer>
      </main>

      <div className="toasts" aria-live="polite">
        {toasts.map((toast) => (
          <ToastPill key={toast.id} toast={toast} onGone={dropToast} />
        ))}
      </div>
    </div>
  );
}
