export const PRODUCTION_OAUTH_ORIGIN = "https://zenmux.ai";
export const PRODUCTION_OAUTH_CLIENT_ID = "zpc_-6SsDHPARf6Rg5TTzbvlOQka";

export interface ZenMuxConfig {
  portalOrigin: string;
  apiBaseUrl: string;
  anthropicBaseUrl: string;
  modelCatalogUrl: string;
  oauthClientId: string;
  fallbackModelId: string;
}

export type Environment = Record<string, string | undefined>;

function normalizeBaseUrl(value: string, name: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`${name} must use HTTP or HTTPS`);
  }
  return value.replace(/\/+$/, "");
}

function normalizeOrigin(value: string, name: string): string {
  const baseUrl = normalizeBaseUrl(value, name);
  const url = new URL(baseUrl);
  if ((url.pathname !== "" && url.pathname !== "/") || url.search || url.hash) {
    throw new Error(`${name} must be an origin without a path, query, or fragment`);
  }
  return url.origin;
}

export function loadConfig(env: Environment = process.env): ZenMuxConfig {
  const portalOrigin = normalizeOrigin(
    env.ZENMUX_OAUTH_ORIGIN || PRODUCTION_OAUTH_ORIGIN,
    "ZENMUX_OAUTH_ORIGIN",
  );
  // Production has a registered public client. Other origins need their own
  // client ID; this extension no longer registers or persists clients.
  const oauthClientId =
    env.ZENMUX_OAUTH_CLIENT_ID ||
    (portalOrigin === PRODUCTION_OAUTH_ORIGIN ? PRODUCTION_OAUTH_CLIENT_ID : "");
  if (!oauthClientId) {
    throw new Error("ZENMUX_OAUTH_CLIENT_ID is required for a custom ZENMUX_OAUTH_ORIGIN");
  }
  const apiBaseUrl = normalizeBaseUrl(
    env.ZENMUX_API_BASE_URL || "https://zenmux.ai/api/v1",
    "ZENMUX_API_BASE_URL",
  );
  const anthropicBaseUrl = normalizeBaseUrl(
    env.ZENMUX_ANTHROPIC_BASE_URL || apiBaseUrl.replace(/\/v1$/, "/anthropic"),
    "ZENMUX_ANTHROPIC_BASE_URL",
  );
  const modelCatalogUrl = normalizeBaseUrl(
    env.ZENMUX_MODEL_CATALOG_URL ||
      `${new URL(apiBaseUrl).origin}/api/frontend/model/available/list`,
    "ZENMUX_MODEL_CATALOG_URL",
  );
  return {
    portalOrigin,
    apiBaseUrl,
    anthropicBaseUrl,
    modelCatalogUrl,
    oauthClientId,
    fallbackModelId: env.ZENMUX_TEST_MODEL || "deepseek/deepseek-v4-flash",
  };
}
