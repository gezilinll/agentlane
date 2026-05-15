import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./ui/tokens.css";
import "./styles.css";

const authMode = import.meta.env.VITE_LORUME_AUTH_MODE === "disabled" ? "disabled" : "required";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App authMode={authMode} />
  </React.StrictMode>,
);
