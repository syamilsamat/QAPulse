import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Suppress benign "ResizeObserver loop" errors that Replit runtime-error-modal
// treats as fatal. This is a known browser non-issue — it fires when a
// ResizeObserver callback causes a layout change before the next frame.
window.addEventListener("error", (e) => {
  if (e.message?.includes("ResizeObserver loop")) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
});

createRoot(document.getElementById("root")!).render(<App />);
