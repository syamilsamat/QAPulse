import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

// Inject a capture-phase error suppressor BEFORE runtimeErrorOverlay registers
// its handler, so ResizeObserver loop errors never reach the Replit modal.
function suppressResizeObserverErrors() {
  return {
    name: "suppress-resize-observer-errors",
    transformIndexHtml() {
      return [
        {
          tag: "script",
          injectTo: "head-prepend" as const,
          children: `(function(){
  // Patch ResizeObserver to defer callbacks via rAF, preventing the
  // "loop completed with undelivered notifications" browser error entirely.
  var _RO = window.ResizeObserver;
  window.ResizeObserver = function(cb){
    return new _RO(function(entries, observer){
      requestAnimationFrame(function(){ cb(entries, observer); });
    });
  };
  window.ResizeObserver.prototype = _RO.prototype;
  // Belt-and-suspenders: also suppress the error event if it somehow fires.
  function _isRO(m){return typeof m==='string'&&m.indexOf('ResizeObserver')!==-1;}
  window.addEventListener('error',function(e){if(_isRO(e.message)){e.stopImmediatePropagation();e.preventDefault();}},true);
  var _fn=null;Object.defineProperty(window,'onerror',{configurable:true,get:function(){return _fn;},set:function(fn){_fn=fn?function(m,s,l,c,err){if(_isRO(m))return true;return fn.call(window,m,s,l,c,err);}:null;}});
})();`,
        },
      ];
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    suppressResizeObserverErrors(),
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
