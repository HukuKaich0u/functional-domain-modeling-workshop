export type WorkerRoute =
  | Readonly<{ kind: "health" }>
  | Readonly<{ kind: "redirect"; location: string }>
  | Readonly<{ kind: "asset" }>;

type RedirectRoute = Readonly<{ pathname: string; location: string }>;

export const redirectRoutes = [] as const satisfies readonly RedirectRoute[];

const redirectLocations = new Map<string, string>(
  redirectRoutes.map(({ pathname, location }) => [pathname, location]),
);

export const resolveWorkerRoute = (pathname: string): WorkerRoute => {
  if (pathname === "/healthz") return { kind: "health" };

  const location = redirectLocations.get(pathname);
  if (location !== undefined) {
    return { kind: "redirect", location };
  }

  return { kind: "asset" };
};
