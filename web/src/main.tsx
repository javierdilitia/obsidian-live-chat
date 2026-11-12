import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// The app-wide reset, tokens and fonts load first, so every component's styles cascade over them.
import "./styles/fonts.css";
import "./styles/tokens.css";
import App from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("index.html is missing #root");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
