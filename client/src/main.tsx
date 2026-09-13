import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
// Self-hosted: the stylesheet declared Inter for months with nothing loading it.
// All subsets ship, but unicode-range means a browser only fetches Latin.
import "@fontsource-variable/inter";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
