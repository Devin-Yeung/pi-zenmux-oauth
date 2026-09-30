export const PRODUCTION_OAUTH_ORIGIN = "https://zenmux.ai";
export const PRODUCTION_OAUTH_CLIENT_ID = "zpc_-6SsDHPARf6Rg5TTzbvlOQka";

export interface ZenMuxConfig {
  portalOrigin: string;
  apiBaseUrl: string;
  anthropicBaseUrl: string;
  modelCatalogUrl: string;
  oauthClientId: string;
}

/**
 * OAuth endpoints the extension signs in against. Overridable only by an
 * in-process caller of `loadConfig`, and deliberately not environment
 * configurable: configuration must not be able to redirect credentials to an
 * authorization server other than ZenMux's. Tests use this to run the flow
 * against a staging or loopback origin.
 */
export type OAuthEndpoints = Pick<
  ZenMuxConfig,
  "portalOrigin" | "oauthClientId"
>;

const PRODUCTION_OAUTH_ENDPOINTS: OAuthEndpoints = {
  portalOrigin: PRODUCTION_OAUTH_ORIGIN,
  oauthClientId: PRODUCTION_OAUTH_CLIENT_ID,
};

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

export function loadConfig(
  env: Environment = process.env,
  oauth: OAuthEndpoints = PRODUCTION_OAUTH_ENDPOINTS,
): ZenMuxConfig {
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
    portalOrigin: oauth.portalOrigin,
    apiBaseUrl,
    anthropicBaseUrl,
    modelCatalogUrl,
    oauthClientId: oauth.oauthClientId,
  };
}
