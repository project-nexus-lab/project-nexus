import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./style.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("index.html is missing #root");

// Deliberately no <StrictMode>: it double-invokes effects in dev, which
// would double-count every entry in the API call log — this iteration's
// own accurate record of which endpoints get called is a real
// requirement, not a cosmetic one (docs/history/iteration-14/SCOPE.md).
createRoot(rootElement).render(<App />);
