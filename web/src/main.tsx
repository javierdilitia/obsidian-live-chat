import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// The app-wide reset, tokens and fonts load first, so every component's styles cascade over them.
import "./styles/fonts.css";
import "./styles/tokens.css";
import App from "./App";
import { cartridge } from "./cartridge";
import { I18nProvider } from "./i18n/I18nProvider";
import { bootLanguage } from "./lib/session";

const root = document.getElementById("root");
if (!root) throw new Error("index.html is missing #root");
document.title = cartridge.storeName;

// The shopper's language is known before the first render, so nothing shows in English first.
void bootLanguage().then((language) => {
  createRoot(root).render(
    <StrictMode>
      <I18nProvider language={language}>
        <App />
      </I18nProvider>
    </StrictMode>,
  );
});
