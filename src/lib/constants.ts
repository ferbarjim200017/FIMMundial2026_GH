export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "FIM Mundial 2026";

export const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const CURRENCY = "EUR";
export const LOCALE = "es-ES";

export const ROUTES = {
  login: "/login",
  register: "/register",
  dashboard: "/dashboard",
  bets: "/bets",
  ranking: "/ranking",
  profile: (uid: string) => `/profile/${uid}`,
  worldCup: "/world-cup",
  feed: "/feed",
  suggestions: "/suggestions",
  admin: "/admin",
  compare: (a: string, b: string) => `/compare?a=${a}&b=${b}`,
  upcoming: "/upcoming",
} as const;
