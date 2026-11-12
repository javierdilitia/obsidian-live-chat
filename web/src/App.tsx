/* The demo shell, from the mockup's chrome: the shell bar (the store, the cart, the agent's seam),
   one tab the agent opens, the command bar, the workspace that holds the page, toasts and the one
   disclaimer. A command runs over SSE (`streamRun`); its A2UI messages go to one
   `MessageProcessor([shopCatalog])`, whose action handler posts the page's buttons to the server.
   On mount the app shows what the server holds (`readWorkspace`), so a reload keeps the page,
   with no build motion; a streamed message the processor rejects re-syncs the page the same way.
   Each run plays the mockup's motion grammar (`motion/run.ts`): the dot globe thinks, its dots land
   on the page, and an edit moves only the parts it names. Every fixed string comes from the EN/ES
   bundle (`useI18n`); the server's errors are codes, worded here. */
import { A2uiSurface, type ReactCatalogComponent } from "@a2ui/react";
import { MessageProcessor, type ActionPayload, type SurfaceModel } from "@a2ui/web_core/v1_0";
import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type SubmitEvent,
} from "react";
import { shopCatalog } from "./a2ui/catalog";
import { cartridge } from "./cartridge";
import { useI18n } from "./i18n/I18nProvider";
import { actionErrorMessage, runErrorMessage, type Message } from "./i18n/i18n";
import { dispatchAction, type CartLine } from "./lib/actions";
import { cart, landFlight, useCart } from "./lib/cart";
import { streamRun, type RunEnd } from "./lib/sse";
import { readWorkspace, type Workspace } from "./lib/workspace";
import type { DotGlobe } from "./motion/globe";
import { IdleGlobe, ThinkingGlobe } from "./motion/GlobeCanvas";
import type { RunState } from "./motion/choreography";
import { playMessages, startThinking, stopThinking, type Stage } from "./motion/run";
import { Seam } from "./motion/Seam";
import { CartDrawer } from "./shell/CartDrawer";
import { UserMenu } from "./shell/UserMenu";
import { prefersReducedMotion } from "./a2ui/motion";
import "./styles/shell.css";

type Surface = SurfaceModel<ReactCatalogComponent>;
/** The page on screen; `key` changes whenever the surface is created again (a re-sync). */
interface Page {
  surface: Surface;
  key: number;
}

/** What the state field says, as bundle keys: it is worded at render, so a language switch
 *  re-words a field already showing. */
type Status =
  | { kind: "building" | "updating" }
  /** "Built · just now", "Updated · 1 section added"; `rested`: the field has faded out, keeping
   *  its text while it fades. */
  | { kind: "done"; state: RunState; rested?: boolean }
  | { kind: "error"; message: Message };

const TAB_ID = "page-tab";
/** "Built · just now" stays this long, then the state field and the seam fade (the mockup's timing). */
const BUILT_MS = 2400;
const BUILT: RunState = { lead: "run.built", detail: { key: "run.justNow" } };
const TOAST_MS = 2600;
const TOAST_OUT_MS = 320;
/** The server's limit on a command. */
const COMMAND_LIMIT = 500;

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

/** What the cart cell shows: "2 · €1,948", or "empty". Keyed by the amount, not its words, so a
 *  language switch re-words it in place instead of rolling it. */
interface Shown {
  key: string;
  items: number;
  totalCents: number;
}

function CartValue({ items, totalCents }: { items: number; totalCents: number }) {
  const { t, money } = useI18n();
  const key = items === 0 ? "empty" : `${String(items)}·${String(totalCents)}`;
  const [shown, setShown] = useState<Shown>({ key, items, totalCents });
  const [leaving, setLeaving] = useState<Shown | null>(null);
  // The value changed: the old one lifts away while the new one rises in (the mockup's roll).
  if (shown.key !== key) {
    setLeaving(prefersReducedMotion() ? null : shown);
    setShown({ key, items, totalCents });
  }
  useEffect(() => {
    if (!leaving) return;
    const gone = setTimeout(() => {
      setLeaving(null);
    }, 360);
    return () => {
      clearTimeout(gone);
    };
  }, [leaving]);
  const content = (value: Shown) =>
    value.items === 0 ? (
      t("cart.empty")
    ) : (
      <>
        <b>{value.items}</b>
        <span className="wide"> · {money(value.totalCents)}</span>
      </>
    );
  return (
    <span className="fact roll" data-cart-fact>
      {leaving && (
        <span key={leaving.key} className="out" aria-hidden="true">
          {content(leaving)}
        </span>
      )}
      <span key={shown.key} className="in">
        {content(shown)}
      </span>
    </span>
  );
}

/** The cart in the shell's ledger: a button that opens the cart drawer. */
function CartCell({ lines, open }: { lines: readonly CartLine[]; open: boolean }) {
  const { t, money } = useI18n();
  const items = lines.reduce((sum, line) => sum + line.qty, 0);
  const totalCents = lines.reduce((sum, line) => sum + line.qty * line.price_cents, 0);
  const label =
    items === 0 ? t("cart.cellEmpty") : t("cart.cell", { count: items, total: money(totalCents) });
  return (
    <button
      type="button"
      className="cell"
      data-cart-cell
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls="cart-drawer"
      onClick={() => {
        cart.open();
      }}
    >
      <span className="ico">
        <Icon size={16} d={CART} />
      </span>
      <span className="lbl">{t("cart.label")}</span>
      <CartValue items={items} totalCents={totalCents} />
    </button>
  );
}

/* ——— toasts ——— */

/** A toast says a shell notice (already worded) or a page action's answer (worded at render, so
 *  it follows a language switch like everything else). */
interface Toast {
  id: number;
  text: string | Message;
}

let nextToastId = 0;

function ToastPill({ toast, onGone }: { toast: Toast; onGone: (id: number) => void }) {
  const { t } = useI18n();
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
      <span>
        {typeof toast.text === "string" ? toast.text : t(toast.text.key, toast.text.params)}
      </span>
    </div>
  );
}

/** What adding to cart says: the server's answer, or why it could not be asked. */
async function sendAction(
  action: ActionPayload,
): Promise<{ cart?: CartLine[]; message: Message; added: boolean }> {
  try {
    const result = await dispatchAction(action);
    if (result.error) {
      console.warn(`${action.name}: ${result.error.message}`);
      return { cart: result.cart, message: actionErrorMessage(result.error), added: false };
    }
    const line = result.cart.find((item) => item.productId === action.context.productId);
    return {
      cart: result.cart,
      message: line
        ? { key: "cart.added", params: { name: line.name } }
        : { key: "cart.addedNoName" },
      added: true,
    };
  } catch {
    return { message: { key: "cart.addFailed" }, added: false };
  }
}

/* ——— the page ——— */

/**
 * Keeps the shell when the page throws while rendering: one line stands where the page was. When
 * `attempt` changes, which the app does once a run's change has been applied to the page, it tries
 * the page again, without remounting a page that rendered.
 */
export class PageBoundary extends Component<
  { attempt: number; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidUpdate(previous: Readonly<{ attempt: number }>) {
    if (previous.attempt !== this.props.attempt && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return <PageError />;
  }
}

function PageError() {
  const { t } = useI18n();
  return (
    <p className="page-error" role="alert">
      {t("page.error")}
    </p>
  );
}

/* ——— the state field in the command bar ——— */

function StateText({ status }: { status: Status }) {
  const { t } = useI18n();
  switch (status.kind) {
    case "building":
      return <b>{t("run.building")}</b>;
    case "updating":
      return <b>{t("run.updating")}</b>;
    case "done": {
      const { lead, detail } = status.state;
      return (
        <>
          <b>{t(lead)}</b> ·{" "}
          {t(detail.key, detail.count === undefined ? {} : { count: detail.count })}
        </>
      );
    }
    case "error":
      return <span className="err">{t(status.message.key, status.message.params)}</span>;
  }
}

/* ——— the app ——— */

export default function App() {
  const { t, language } = useI18n();
  const { lines, open: cartOpen } = useCart();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notify = useCallback((text: string | Message) => {
    const id = (nextToastId += 1);
    setToasts((list) => [...list, { id, text }]);
  }, []);
  const [processor] = useState(
    () =>
      new MessageProcessor<ReactCatalogComponent>([shopCatalog], async (action) => {
        const { cart: saved, message, added } = await sendAction(action);
        if (saved) cart.setLines(saved);
        // the dot flies once the server has put the product in the cart
        const productId = action.context.productId;
        if (typeof productId === "string") landFlight(productId, added);
        notify(message);
      }),
  );
  const [page, setPage] = useState<Page | null>(null);
  /** The page came back from the server (a reload or a re-sync): it fades in, nothing rises. */
  const [restored, setRestored] = useState(false);
  /** The shell took the restored tab without its motion: the hero folded, the bar in place. */
  const [instant, setInstant] = useState(false);
  /** The tab came back with the page: it is there already, it doesn't slide in. */
  const [tabSettled, setTabSettled] = useState(false);
  /** Runs ended; the page, with the run's change in it, gets another try if it failed to render. */
  const [attempt, setAttempt] = useState(0);
  /** How far the seam has filled while a run works. */
  const [progress, setProgress] = useState(0);
  const [tabTitle, setTabTitle] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [command, setCommand] = useState("");
  /** The command that built or last changed the page: the bar shows it, like an address bar. */
  const [shown, setShown] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const chrome = useRef<HTMLDivElement>(null);
  const workspace = useRef<HTMLElement>(null);
  const seamLine = useRef<HTMLSpanElement>(null);
  const globe = useRef<DotGlobe | null>(null);
  const refocus = useRef(false);
  /** A command has been sent: the reload's answer, if it comes later, is out of date. */
  const sent = useRef(false);

  const running = status?.kind === "building" || status?.kind === "updating";

  useEffect(() => {
    let created = 0;
    const subscriptions = [
      processor.onSurfaceCreated((surface) => {
        setPage({ surface, key: (created += 1) });
      }),
      processor.onSurfaceDeleted(() => {
        setPage(null);
      }),
    ];
    return () => {
      for (const subscription of subscriptions) subscription.unsubscribe();
    };
  }, [processor]);

  /** Shows what the server holds: its cart, its tab and its page, rendered as it is now. */
  const showSaved = useCallback(
    ({ tab, cart: saved }: Workspace) => {
      cart.setLines(saved);
      if (!tab) return;
      setInstant(true);
      setTabSettled(true);
      setTabTitle(tab.title);
      processor.model.deleteSurface(tab.surface_id);
      if (!tab.snapshot) return;
      setRestored(true);
      processor.processMessagesWithErrors(tab.snapshot);
    },
    [processor],
  );

  // A reload: the server still holds the tab, the page and the cart.
  useEffect(() => {
    let live = true;
    readWorkspace()
      .then((saved) => {
        if (live && !sent.current && (saved.tab || saved.cart.length > 0)) showSaved(saved);
      })
      .catch(() => undefined); // no server yet, or nothing it holds can be shown: start empty
    return () => {
      live = false;
    };
  }, [showSaved]);

  useEffect(() => {
    if (status?.kind !== "done" || status.rested) return;
    const timer = setTimeout(() => {
      setStatus({ ...status, rested: true });
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

  /** What a run moves; the workspace is always on screen once the app has mounted. */
  function stage(): Stage | null {
    if (!workspace.current) return null;
    return {
      workspace: workspace.current,
      chrome: chrome.current,
      globe: globe.current,
      seam: setProgress,
    };
  }

  async function run(text: string) {
    sent.current = true;
    setRestored(false);
    setInstant(false);
    setStatus({ kind: page ? "updating" : "building" });
    const moving = stage();
    if (moving) startThinking(moving, page !== null);
    // The messages go to the page together once the stream ends, so the run's choreography
    // knows every part the run changes.
    const messages: Record<string, unknown>[] = [];
    let end: RunEnd;
    try {
      end = await streamRun(text, (event) => {
        if (event.type !== "CUSTOM") return;
        if (event.name === "tab_opened") setTabTitle(event.value.title);
        else messages.push(event.value);
      });
    } catch {
      end = { type: "RUN_ERROR", code: "unreachable", message: "Couldn't reach the assistant." };
    }
    let rejected: unknown[] = [];
    let done = BUILT;
    try {
      if (moving && messages.length > 0) {
        const played = await playMessages(moving, processor, messages, page?.surface ?? null);
        rejected = played.rejected;
        if (played.plan) done = played.plan.state;
      } else if (moving) {
        stopThinking(moving);
      }
    } catch (error) {
      rejected = [error];
    }
    // The server kept the change, so the page on screen is out of date: take the server's.
    if (rejected.length > 0) {
      try {
        showSaved(await readWorkspace());
      } catch {
        // the server can't be read or its page can't be shown: the state field says so below
      }
    }
    // the change (or the server's page) is in the model now: a page that failed to render tries again
    setAttempt((count) => count + 1);
    if (end.type === "RUN_ERROR") {
      console.warn(`run ${end.code}: ${end.message}`);
      setStatus({ kind: "error", message: runErrorMessage(end.code) });
    } else if (rejected.length > 0) {
      setStatus({ kind: "error", message: { key: "page.notShown" } });
    } else {
      setShown(text);
      setStatus({ kind: "done", state: done });
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
  const fresh = status !== null && !(status.kind === "done" && status.rested);
  // The seam fills as the run goes, reaches 100 % when it is done, then fades.
  const seamLevel = running ? progress : fresh && status.kind === "done" ? 1 : null;
  const appClass = ["app", tabTitle === null ? "" : "tabs-on", instant ? "instant" : ""];

  return (
    <div className={appClass.filter(Boolean).join(" ")}>
      <Sprite />
      <header className="shell">
        <div className="wordmark">
          <b className="store">{cartridge.storeName}</b>
          <span className="by">
            <Shard size={14} />
            {t("shell.assistantBy")}
          </span>
        </div>
        <div className="ledger">
          <CartCell lines={lines} open={cartOpen} />
          <UserMenu onNotice={notify} />
        </div>
        {/* the agent's line: breathes with the landing globe, fills while a page builds */}
        <Seam level={seamLevel} ref={seamLine} />
      </header>

      <main className="stage">
        <div ref={chrome} className="chrome">
          <div className={tabTitle === null ? "collapse closed" : "collapse"}>
            <div className="collapse-inner">
              <div className="tabband">
                <div className="col tabbar">
                  <div className="tabs" role="tablist" aria-label={t("shell.tabs")}>
                    {tabTitle !== null && (
                      <div className={tabSettled ? "tab active settled" : "tab active"}>
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
                    <span>{t("shell.heroLead")}</span> {t("shell.heroRest")}
                  </h1>
                  {/* the agent, waiting */}
                  <IdleGlobe active={tabTitle === null} input={input} seam={seamLine} />
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
                  placeholder={t("shell.prompt")}
                  aria-label={t("shell.prompt")}
                  autoComplete="off"
                  maxLength={COMMAND_LIMIT}
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
                  aria-label={t("shell.assistant")}
                  aria-hidden={status && !fresh ? true : undefined}
                >
                  {status && <StateText status={status} />}
                </span>
                <button
                  className={ready ? "send ready" : "send"}
                  type="submit"
                  aria-label={t("shell.send")}
                  disabled={running}
                >
                  <Icon size={17} width={1.8} d={ARROW_UP} />
                </button>
              </form>
            </div>
          </div>
        </div>

        <section
          ref={workspace}
          id="workspace"
          className={restored ? "workspace col restored" : "workspace col"}
          {...(tabTitle === null
            ? { "aria-label": t("shell.workspace") }
            : { role: "tabpanel", "aria-labelledby": TAB_ID })}
        >
          {page && (
            <PageBoundary key={page.key} attempt={attempt}>
              <A2uiSurface surface={page.surface} />
            </PageBoundary>
          )}
        </section>

        {/* the one disclaimer, where a store keeps its small print */}
        <footer className="col demo-note">{cartridge.disclaimer[language].shell}</footer>
      </main>

      <CartDrawer onNotice={notify} />

      {/* the thinking globe, over the workspace and under the chrome */}
      <ThinkingGlobe globeRef={globe} />

      <div className="toasts" aria-live="polite">
        {toasts.map((toast) => (
          <ToastPill key={toast.id} toast={toast} onGone={dropToast} />
        ))}
      </div>
    </div>
  );
}
