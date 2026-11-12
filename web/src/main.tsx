import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// The app-wide reset, tokens and fonts load first, so every component's styles cascade over them.
import "./styles/fonts.css";
import "./styles/tokens.css";
import App from "./App";
import { cartridge } from "./cartridge";

const root = document.getElementById("root");
if (!root) throw new Error("index.html is missing #root");
document.title = cartridge.storeName;

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
