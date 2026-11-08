export type DesktopCatalogCursor = { hostId: string; value: string };
export type DesktopCatalogSession = {
  id: string;
  hostId: string;
  title: string | null;
  cwd: string | null;
  listedState: "active" | "idle" | "notLoaded" | "systemError" | null;
  updatedAtSeconds: number | null;
};
export type DesktopCatalogPage = {
  source: "desktop-native:list_threads/history";
  hostId: string;
  sessions: DesktopCatalogSession[];
  nextCursor: DesktopCatalogCursor | null;
  runtimeFreshness: "not-established";
  transport: {
    connections: number;
    rpcRequests: number;
    cancelRequests: number;
  };
};
export type DesktopCatalogAvailability = {
  grantId: string;
  scopeKey: string;
  hosts: string[];
  pageSize: number;
  maxReads: number;
  expiresAt: string;
  expired: boolean;
};
