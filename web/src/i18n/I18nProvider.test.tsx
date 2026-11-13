/* The provider follows a session that answers after the first render (#27), unless the shopper
   has switched already, and remembers the language it shows for the next visit's first guess. */
import { act, render, screen } from "@testing-library/react";
import type { Language } from "./i18n";
import { I18nProvider, useI18n } from "./I18nProvider";
import { rememberedLanguage } from "./remembered";

function Probe() {
  const { language, setLanguage } = useI18n();
  return (
    <button
      type="button"
      onClick={() => {
        setLanguage("en");
      }}
    >
      {language}
    </button>
  );
}

function deferred() {
  let resolve: (language: Language | null) => void = () => undefined;
  const later = new Promise<Language | null>((r) => {
    resolve = r;
  });
  return { later, resolve };
}

test("a session that answers late switches the language", async () => {
  const session = deferred();
  render(
    <I18nProvider language="en" later={session.later}>
      <Probe />
    </I18nProvider>,
  );
  expect(screen.getByRole("button")).toHaveTextContent("en");

  await act(async () => {
    session.resolve("es");
    await session.later;
  });

  expect(screen.getByRole("button")).toHaveTextContent("es");
});

test("a late answer doesn't undo the shopper's own switch", async () => {
  const session = deferred();
  render(
    <I18nProvider language="es" later={session.later}>
      <Probe />
    </I18nProvider>,
  );
  act(() => {
    screen.getByRole("button").click();
  });

  await act(async () => {
    session.resolve("es");
    await session.later;
  });

  expect(screen.getByRole("button")).toHaveTextContent("en");
});

test("the language shown is remembered for the next visit", () => {
  render(
    <I18nProvider language="es">
      <Probe />
    </I18nProvider>,
  );
  expect(rememberedLanguage()).toBe("es");

  act(() => {
    screen.getByRole("button").click();
  });
  expect(rememberedLanguage()).toBe("en");
});
