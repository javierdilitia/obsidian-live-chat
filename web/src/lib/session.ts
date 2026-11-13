/* The shopper: `GET /api/session` names who the signed cookie says, `GET /api/users` lists the
   seeded shoppers, and the user menu switches with `session.switch_user` (spec §8.2, §10.3). The
   server sets the new cookie; the page then reloads into that shopper's workspace. The language
   menu stores the shopper's language with `prefs.set_language`; the cookie stays. */
import { z } from "zod";
import { asLanguage, type Language } from "../i18n/i18n";
import { rememberedLanguage } from "../i18n/remembered";
import { UserSchema, dispatchAction, type ActionResult, type User } from "./actions";

export type { User };

const SessionSchema = z.object({ user: UserSchema });
const UsersSchema = z.object({ users: z.array(UserSchema) });

async function getJson(path: string): Promise<unknown> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`GET ${path}: HTTP ${String(response.status)}`);
  return response.json();
}

/** The session's shopper. Throws when the server can't be reached or answers something else. */
export async function readSession(): Promise<User> {
  return SessionSchema.parse(await getJson("/api/session")).user;
}

/** The seeded shoppers, by ID. */
export async function readUsers(): Promise<User[]> {
  return UsersSchema.parse(await getJson("/api/users")).users;
}

/** Signs this browser in as `userId`; the answer carries the new shopper and their cart. */
export function switchUser(userId: string): Promise<ActionResult> {
  return dispatchAction({
    name: "session.switch_user",
    surfaceId: "shell",
    sourceComponentId: "user-menu",
    context: { userId },
  });
}

/** Stores the shopper's language; the answer carries the shopper with it. */
export function setLanguagePref(language: Language): Promise<ActionResult> {
  return dispatchAction({
    name: "prefs.set_language",
    surfaceId: "shell",
    sourceComponentId: "language-menu",
    context: { language },
  });
}

/** How long the first render waits for the session before it guesses. */
export const BOOT_WAIT_MS = 1000;

export interface BootLanguage {
  /** The first render's language: the session's when it answers within the wait, else the one
   *  this browser showed last (English on a first visit). */
  language: Language;
  /** The session's language whenever it answers, to switch to; null when it can't be read. */
  later: Promise<Language | null>;
}

/** The language to render in first. A hung server no longer leaves a blank page, and a slow first
 *  request no longer leaves a returning shopper in English (#27). */
export async function bootLanguage(waitMs = BOOT_WAIT_MS): Promise<BootLanguage> {
  const later = readSession().then(
    (user) => asLanguage(user.language),
    () => null,
  );
  const wait = new Promise<null>((resolve) => {
    setTimeout(() => {
      resolve(null);
    }, waitMs);
  });
  const answered = await Promise.race([later, wait]);
  return { language: answered ?? rememberedLanguage(), later };
}

/** Reloads the page (a seam, so tests can watch it: jsdom has no navigation). */
export const browser = {
  reload: (): void => {
    window.location.reload();
  },
};
