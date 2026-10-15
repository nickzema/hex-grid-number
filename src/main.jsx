import React from "react";
import ReactDOM from "react-dom/client";
import OBR from "@owlbear-rodeo/sdk";
import "./styles.css";
import App from "./App.jsx";

OBR.onReady(() => {
  ReactDOM.createRoot(document.getElementById("root")).render(<App />);
});
