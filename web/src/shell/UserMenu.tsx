/* The user cell, the ledger's last (mockup/index.html `#userBtn`, mockup/css/chrome.css
   `.cell-user`), and its menu: a `LedgerMenu`.

   The cell shows the session's shopper; the menu lists the seeded shoppers as radio items, the
   current one ticked, each with their language. Picking another asks the server to switch
   (`session.switch_user`), which sets the new cookie, and the page reloads into that shopper's
   workspace. While the switch is out the items rest and the head says who it is switching to; a
   refusal goes to `onNotice` and the menu stays, unchanged. */
import { useEffect, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import type { Message } from "../i18n/i18n";
import { retrying } from "../lib/retry";
import { browser, readSession, readUsers, switchUser, type User } from "../lib/session";
import { LedgerMenu } from "./LedgerMenu";

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

export function UserMenu({ onNotice }: { onNotice: (message: Message) => void }) {
  const { t, language } = useI18n();
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  /** The shopper being switched to, while the server answers. */
  const [switching, setSwitching] = useState<User | null>(null);

  // Who is shopping, and who else could be. Without an answer the cell stays out of the ledger.
  useEffect(() => {
    let live = true;
    // tried again while the agent isn't up yet (the page can load first)
    retrying(
      () => Promise.all([readSession(), readUsers()]),
      () => live,
    )
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

  async function pick(id: string): Promise<boolean> {
    const chosen = users.find((shopper) => shopper.id === id);
    if (!chosen) return false;
    setSwitching(chosen);
    let switched = false;
    try {
      const result = await switchUser(chosen.id);
      switched = result.ok;
      if (result.error) console.warn(`session.switch_user: ${result.error.message}`);
    } catch {
      // the server could not be reached: the shopper stays as they were
    }
    if (switched) {
      // the new cookie is set: the page comes back as the new shopper's workspace
      browser.reload();
      return false;
    }
    setSwitching(null);
    onNotice({ key: "user.failed" });
    return false;
  }

  if (!user) return null;
  const initial = user.name.slice(0, 1).toUpperCase();
  return (
    <LedgerMenu
      menuId="user-menu"
      cellClass="cell cell-user"
      cellLabel={t("user.cell", { name: user.name })}
      menuLabel={t("user.switch")}
      cell={
        <>
          <span className="initial" aria-hidden="true">
            {initial}
          </span>
          <span className="lbl">{user.name}</span>
          <Chevron />
        </>
      }
      head={
        <div className="mhead">
          <b>{user.name}</b>
          <span aria-live="polite">
            {switching ? t("user.switching", { name: switching.name }) : t("user.switch")}
          </span>
        </div>
      }
      items={users.map((shopper) => ({
        id: shopper.id,
        label: shopper.name,
        // the session's shopper reads the language they have now, which the menu may have changed
        aside: (shopper.id === user.id ? language : shopper.language).toUpperCase(),
        checked: shopper.id === user.id,
      }))}
      busy={switching?.id ?? null}
      onPick={pick}
    />
  );
}
