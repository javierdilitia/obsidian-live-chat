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

// The first render waits a moment for the shopper's language, then guesses the one this browser
// showed last and switches when the session answers (#27).
void bootLanguage().then(({ language, later }) => {
  createRoot(root).render(
    <StrictMode>
      <I18nProvider language={language} later={later}>
        <App />
      </I18nProvider>
    </StrictMode>,
  );
});
