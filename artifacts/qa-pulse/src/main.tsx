import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Diagnose non-Error unhandled rejections/errors that Replit reports as "(unknown runtime error)"
if (import.meta.env.DEV) {
  window.addEventListener("unhandledrejection", (e) => {
    if (!(e.reason instanceof Error)) {
      console.warn("[QAPulse] Non-Error unhandled rejection:", e.reason);
    }
  });
  window.addEventListener("error", (e) => {
    if (!(e.error instanceof Error)) {
      console.warn("[QAPulse] Non-Error window error:", e.message, e.filename, e.error);
    }
  });
}

createRoot(document.getElementById("root")!).render(<App />);
