import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { WeddingV2Page } from "./WeddingV2Page";
import "./app.css";

const isV2Path = /\/wedding\/v2\/?$/.test(window.location.pathname);
const RootComponent = isV2Path ? WeddingV2Page : App;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>
);
