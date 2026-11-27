import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { RenderHarness } from "./RenderHarness";
import "./styles/studio.css";

const isRenderRoute =
  window.location.pathname.replace(/\/+$/, "") === "/render" ||
  new URLSearchParams(window.location.search).get("mode") === "render";

ReactDOM.createRoot(document.getElementById("root")!).render(
  isRenderRoute ? (
    <RenderHarness />
  ) : (
    <React.StrictMode>
      <App />
    </React.StrictMode>
  ),
);
