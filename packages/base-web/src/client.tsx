import {
  createInertiaApp,
  type ResolvedComponent,
} from "@inertiajs/react";
import { createRoot } from "react-dom/client";

import ClinicDashboard from "./ClinicDashboard.js";
import MoonbaseDashboard from "./MoonbaseDashboard.js";

const pages: Readonly<Record<string, unknown>> = {
  ClinicDashboard,
  MoonbaseDashboard,
};

export const startClinicClient = (): void => {
  void createInertiaApp({
    resolve: (name) => {
      const page = pages[name];
      if (page === undefined) {
        throw new TypeError(`Unknown Inertia page: ${name}`);
      }
      return page as ResolvedComponent;
    },
    setup({ el, App, props }) {
      createRoot(el).render(<App {...props} />);
    },
  });
};
