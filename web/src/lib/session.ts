/* The shopper: `GET /api/session` names who the signed cookie says, `GET /api/users` lists the
   seeded shoppers, and the user menu switches with `session.switch_user` (spec §8.2, §10.3). The
   server sets the new cookie; the page then reloads into that shopper's workspace. The language
   menu stores the shopper's language with `prefs.set_language`; the cookie stays. */
import { z } from "zod";
import { asLanguage, type Language } from "../i18n/i18n";
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

/** The session's language, read before the app first renders; English when it can't be read. */
export async function bootLanguage(): Promise<Language> {
  try {
    return asLanguage((await readSession()).language);
  } catch {
    return "en";
  }
}

/** Reloads the page (a seam, so tests can watch it: jsdom has no navigation). */
export const browser = {
  reload: (): void => {
    window.location.reload();
  },
};
