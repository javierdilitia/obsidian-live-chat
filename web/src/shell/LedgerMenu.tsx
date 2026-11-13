/* A cell in the shell's ledger that opens a menu of radio items (mockup/index.html `#langBtn` and
   `#userBtn`, mockup/css/overlays.css `.menu`, mockup/js/core.js `menuKeys`). The language and user
   menus are both this one component, so they look and move alike.

   The menu lives in `document.body` (a portal): the shell bar's backdrop blur would otherwise be its
   containing block. It opens 8px under its cell, right edges aligned, inside the window, with the
   keyboard on the checked item. Arrows, Home and End move between items; Esc closes and gives focus
   back to the cell; a click outside or Tab closes. Picking the checked item just closes. Picking
   another calls `onPick`: while `busy` names an item the items rest (that one stays lit) and picks
   are ignored; `onPick` resolving `true` closes the menu and focuses the cell, `false` keeps it. */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/** The menu's gap under its cell, and its least distance from the window's edges. */
const GAP = 8;
const EDGE = 12;

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

export interface LedgerMenuItem {
  id: string;
  label: string;
  /** A quiet fact beside the label (mono), such as a shopper's language. */
  aside?: string;
  checked: boolean;
}

export interface LedgerMenuProps {
  /** The menu's element ID, for the cell's `aria-controls`. */
  menuId: string;
  /** What the cell shows. */
  cell: ReactNode;
  cellClass?: string;
  cellLabel: string;
  menuLabel: string;
  /** Above the items (the user menu's head). */
  head?: ReactNode;
  items: readonly LedgerMenuItem[];
  /** The item being picked while its request is out; null when none is. */
  busy: string | null;
  /** Picks an item other than the checked one; `true` closes the menu. */
  onPick: (id: string) => Promise<boolean>;
}

export function LedgerMenu({
  menuId,
  cell: content,
  cellClass = "cell",
  cellLabel,
  menuLabel,
  head,
  items,
  busy,
  onPick,
}: LedgerMenuProps) {
  const [open, setOpen] = useState(false);
  const cell = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) cell.current?.focus();
  }, []);

  // Open: placed 8px under the cell, right edges aligned, kept inside the window; the keyboard
  // lands on the checked item.
  useLayoutEffect(() => {
    const panel = menu.current;
    const anchor = cell.current;
    if (!open || !panel || !anchor) return;
    const r = anchor.getBoundingClientRect();
    const width = panel.offsetWidth;
    const left = Math.min(Math.max(r.right - width, GAP), window.innerWidth - width - EDGE);
    panel.style.top = `${String(r.bottom + GAP)}px`;
    panel.style.left = `${String(Math.max(left, GAP))}px`;
    const radios = [...panel.querySelectorAll<HTMLElement>("[role=menuitemradio]")];
    const checked = radios.find((item) => item.getAttribute("aria-checked") === "true");
    (checked ?? radios[0])?.focus();
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

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const radios = [...event.currentTarget.querySelectorAll<HTMLElement>("[role=menuitemradio]")];
    if (!radios.length) return;
    const at = radios.indexOf(document.activeElement as HTMLElement);
    const go = (index: number) => {
      event.preventDefault();
      radios[(index + radios.length) % radios.length]?.focus();
    };
    if (event.key === "ArrowDown") go(at + 1);
    else if (event.key === "ArrowUp") go(at < 0 ? -1 : at - 1);
    else if (event.key === "Home") go(0);
    else if (event.key === "End") go(radios.length - 1);
    else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") close(false);
  }

  async function choose(item: LedgerMenuItem) {
    if (busy !== null) return;
    if (item.checked) {
      close(true);
      return;
    }
    if (await onPick(item.id)) close(true);
  }

  return (
    <>
      <button
        ref={cell}
        type="button"
        className={cellClass}
        aria-label={cellLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          setOpen((was) => !was);
        }}
      >
        {content}
      </button>
      {createPortal(
        <div
          ref={menu}
          id={menuId}
          className={open ? "menu on" : "menu"}
          role="menu"
          aria-label={menuLabel}
          aria-busy={busy !== null}
          aria-hidden={!open}
          inert={!open}
          onKeyDown={onKeyDown}
        >
          {head}
          {items.map((item) => {
            const classes = [item.checked && "sel", busy === item.id && "busy"];
            return (
              <button
                key={item.id}
                type="button"
                role="menuitemradio"
                aria-checked={item.checked}
                aria-disabled={busy !== null}
                className={classes.filter(Boolean).join(" ")}
                tabIndex={-1}
                onClick={() => {
                  void choose(item);
                }}
              >
                <span>{item.label}</span>
                {item.aside !== undefined && <span className="lang">{item.aside}</span>}
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
