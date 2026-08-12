import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SmileStormExperience } from "../app/components/SmileStormExperience";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SmileStormExperience />
  </StrictMode>,
);
