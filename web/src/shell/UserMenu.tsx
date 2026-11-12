/* The user cell, the ledger's last (mockup/index.html `#userBtn`, mockup/css/chrome.css
   `.cell-user`), and its menu (mockup/css/overlays.css `.menu`, mockup/js/core.js `menuKeys`).

   The cell shows the session's shopper; the menu lists the seeded shoppers as radio items, the
   current one ticked. Picking another asks the server to switch (`session.switch_user`), which sets
   the new cookie, and the page reloads into that shopper's workspace. While the switch is out the
   items are disabled and the head says who it is switching to; a refusal goes to `onNotice` and
   the menu stays, unchanged. Arrows, Home and End move between items; Esc closes and gives focus
   back to the cell; a click outside or Tab closes. The menu lives in `document.body` (a portal):
   the shell bar's backdrop blur would otherwise be its containing block. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { browser, readSession, readUsers, switchUser, type User } from "../lib/session";

const FAILED = "Couldn't switch shopper. Try again.";
/** The menu's gap under its cell, and its least distance from the window's edges. */
const GAP = 8;
const EDGE = 12;

function Chevron() {
  return (
    <svg
      className="chev"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m7 10 5 5 5-5" />
    </svg>
  );
}

function Tick() {
  return (
    <svg
      className="tick"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 12.5 10 17.5 19 7" />
    </svg>
  );
}

export function UserMenu({ onNotice }: { onNotice: (text: string) => void }) {
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [open, setOpen] = useState(false);
  /** The shopper being switched to, while the server answers. */
  const [switching, setSwitching] = useState<User | null>(null);
  const cell = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  // Who is shopping, and who else could be. Without an answer the cell stays out of the ledger.
  useEffect(() => {
    let live = true;
    Promise.all([readSession(), readUsers()])
      .then(([current, all]) => {
        if (!live) return;
        setUser(current);
        setUsers(all);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) cell.current?.focus();
  }, []);

  // Open: placed 8px under the cell, right edges aligned, kept inside the window; the keyboard
  // lands on the current shopper.
  useLayoutEffect(() => {
    const panel = menu.current;
    const anchor = cell.current;
    if (!open || !panel || !anchor) return;
    const r = anchor.getBoundingClientRect();
    const width = panel.offsetWidth;
    const left = Math.min(Math.max(r.right - width, GAP), window.innerWidth - width - EDGE);
    panel.style.top = `${String(r.bottom + GAP)}px`;
    panel.style.left = `${String(Math.max(left, GAP))}px`;
    const items = [...panel.querySelectorAll<HTMLElement>("[role=menuitemradio]")];
    const checked = items.find((item) => item.getAttribute("aria-checked") === "true");
    (checked ?? items[0])?.focus();
  }, [open]);

  // A press anywhere else closes it.
  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      const target = event.target as Node;
      if (menu.current?.contains(target) || cell.current?.contains(target)) return;
      close(false);
    }
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, close]);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>("[role=menuitemradio]")];
    if (!items.length) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (index: number) => {
      event.preventDefault();
      items[(index + items.length) % items.length]?.focus();
    };
    if (event.key === "ArrowDown") go(at + 1);
    else if (event.key === "ArrowUp") go(at < 0 ? -1 : at - 1);
    else if (event.key === "Home") go(0);
    else if (event.key === "End") go(items.length - 1);
    else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") close(false);
  }

  async function choose(chosen: User) {
    if (switching) return;
    if (chosen.id === user?.id) {
      close(true);
      return;
    }
    setSwitching(chosen);
    let problem: string | null = FAILED;
    try {
      const result = await switchUser(chosen.id);
      problem = result.ok ? null : (result.error?.message ?? FAILED);
    } catch {
      // the server could not be reached: the shopper stays as they were
    }
    if (problem === null) {
      // the new cookie is set: the page comes back as the new shopper's workspace
      browser.reload();
      return;
    }
    setSwitching(null);
    onNotice(problem);
  }

  if (!user) return null;
  const initial = user.name.slice(0, 1).toUpperCase();
  return (
    <>
      <button
        ref={cell}
        type="button"
        className="cell cell-user"
        aria-label={`Shopper: ${user.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="user-menu"
        onClick={() => {
          setOpen((was) => !was);
        }}
      >
        <span className="initial" aria-hidden="true">
          {initial}
        </span>
        <span className="lbl">{user.name}</span>
        <Chevron />
      </button>
      {createPortal(
        <div
          ref={menu}
          id="user-menu"
          className={open ? "menu on" : "menu"}
          role="menu"
          aria-label="Switch shopper"
          aria-busy={switching !== null}
          aria-hidden={!open}
          inert={!open}
          onKeyDown={onKeyDown}
        >
          <div className="mhead">
            <b>{user.name}</b>
            <span aria-live="polite">
              {switching ? `Switching to ${switching.name}…` : "Switch shopper"}
            </span>
          </div>
          {users.map((shopper) => {
            const current = shopper.id === user.id;
            const classes = [current && "sel", switching?.id === shopper.id && "busy"];
            return (
              <button
                key={shopper.id}
                type="button"
                role="menuitemradio"
                aria-checked={current}
                aria-disabled={switching !== null}
                className={classes.filter(Boolean).join(" ")}
                tabIndex={-1}
                onClick={() => {
                  void choose(shopper);
                }}
              >
                <span>{shopper.name}</span>
                <span className="lang">{shopper.language.toUpperCase()}</span>
                <Tick />
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
