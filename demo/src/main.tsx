// SPDX-License-Identifier: Apache-2.0
import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import App from "./App";
import { ErrorBoundary } from "./ErrorBoundary";

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary label="PayStream">
    <App />
  </ErrorBoundary>
);
