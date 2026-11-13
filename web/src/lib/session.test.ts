/* The first render's language (#27): the session's when it answers within the wait; otherwise the
   one this browser showed last, so a slow first request (the agent connecting, migrating and
   seeding) doesn't leave Ana in English, and a hung server doesn't leave a blank page. */
import { mockApi } from "../a2ui/test-helpers";
import { rememberLanguage } from "../i18n/remembered";
import { bootLanguage } from "./session";

const hang = () => new Promise<Response>(() => undefined);

test("the session's language when it answers in time", async () => {
  mockApi(undefined, {
    users: [
      { id: "ana", name: "Ana", language: "es" },
      { id: "demo-user", name: "Javier", language: "en" },
    ],
  });
  const boot = await bootLanguage();
  expect(boot.language).toBe("es");
  expect(await boot.later).toBe("es");
});

test("a hung session: the language this browser showed last", async () => {
  rememberLanguage("es");
  vi.stubGlobal("fetch", hang);
  expect((await bootLanguage(10)).language).toBe("es");
});

test("a hung session on a first visit: English", async () => {
  vi.stubGlobal("fetch", hang);
  expect((await bootLanguage(10)).language).toBe("en");
});

test("a session that can't be read: the remembered language, and nothing to switch to", async () => {
  rememberLanguage("es");
  vi.stubGlobal("fetch", () => Promise.resolve(new Response(null, { status: 500 })));
  const boot = await bootLanguage();
  expect(boot.language).toBe("es");
  expect(await boot.later).toBeNull();
});
