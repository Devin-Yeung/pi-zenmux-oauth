import { createServer, type Server } from "node:http";
import type { OAuthAuth, OAuthCredential, ProviderAuthInteraction } from "@earendil-works/pi-ai";
import { oauthSuccessHtml } from "@earendil-works/pi-ai/utils/oauth-page";
import {
  allowInsecureRequests,
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  Configuration,
  customFetch,
  None,
  randomPKCECodeVerifier,
  randomState,
  refreshTokenGrant,
} from "openid-client";
import type { ZenMuxConfig } from "./config.ts";

const OAUTH_SCOPES = "inference:invoke offline_access";
const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error("ZenMux OAuth was cancelled");
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError(signal);
}

function createOAuthConfiguration(config: ZenMuxConfig, signal: AbortSignal): Configuration {
  // ZenMux's fixed endpoints are known, so metadata discovery would add a
  // network dependency to every login and refresh. This is a public client.
  const oauth = new Configuration(
    {
      issuer: config.portalOrigin,
      authorization_endpoint: `${config.portalOrigin}/oauth/authorize`,
      token_endpoint: `${config.portalOrigin}/oauth/token`,
    },
    config.oauthClientId,
    undefined,
    None(),
  );

  // Preserve Pi's cancellation signal alongside the library's own timeout.
  // Node's RequestInit and openid-client's FetchBody types differ for typed arrays.
  oauth[customFetch] = (input, init) =>
    fetch(input, {
      ...init,
      signal: AbortSignal.any([signal, init?.signal ?? signal]),
    } as RequestInit);
  if (new URL(config.portalOrigin).protocol === "http:") allowInsecureRequests(oauth);
  return oauth;
}

function toCredential(tokens: {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}): OAuthCredential {
  // Pi persists rotating refresh tokens and needs a concrete expiry for its
  // locked refresh flow. A partial token response cannot be used safely.
  if (!tokens.refresh_token) throw new Error("ZenMux did not return a refresh token");
  if (
    typeof tokens.expires_in !== "number" ||
    !Number.isFinite(tokens.expires_in) ||
    tokens.expires_in <= 0
  ) {
    throw new Error("ZenMux token response did not include a valid expiration");
  }
  return {
    type: "oauth",
    access: tokens.access_token,
    refresh: tokens.refresh_token,
    expires: Date.now() + tokens.expires_in * 1000,
  };
}

async function waitForCallback(
  interaction: ProviderAuthInteraction,
  state: string,
  authorizationUrl: (redirectUri: string) => URL,
): Promise<URL> {
  throwIfAborted(interaction.signal);

  return new Promise<URL>((resolve, reject) => {
    const server: Server = createServer((request, response) => {
      if (settled) {
        response.writeHead(409).end("OAuth callback is no longer active");
        return;
      }
      if (!redirectUri || request.method !== "GET") {
        response.writeHead(404).end("Not found");
        return;
      }

      let callbackUrl: URL;
      try {
        callbackUrl = new URL(request.url || "/", redirectUri);
      } catch {
        response.writeHead(400).end("Invalid callback URL");
        return;
      }
      if (callbackUrl.pathname !== "/callback") {
        response.writeHead(404).end("Not found");
        return;
      }
      // Ignore unrelated loopback requests and leave the real login pending.
      // openid-client validates state again before exchanging the code.
      if (callbackUrl.searchParams.get("state") !== state) {
        response
          .writeHead(400)
          .end("ZenMux authorization state did not match. You can close this window.");
        return;
      }
      const oauthError = callbackUrl.searchParams.get("error");
      if (oauthError) {
        response.writeHead(400).end("ZenMux authorization failed. You can close this window.");
        finish(new Error(oauthError));
        return;
      }
      if (!callbackUrl.searchParams.has("code")) {
        response
          .writeHead(400)
          .end("ZenMux did not return an authorization code. You can close this window.");
        return;
      }

      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(oauthSuccessHtml("Authorization received. Return to Pi to finish sign-in."));
      finish(undefined, callbackUrl);
    });

    let settled = false;
    let redirectUri: string | undefined;
    let timeout: NodeJS.Timeout | undefined;

    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      interaction.signal.removeEventListener("abort", onAbort);
      if (server.listening) server.close();
    };
    const finish = (error?: Error, callbackUrl?: URL) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else if (callbackUrl) resolve(callbackUrl);
      else reject(new Error("ZenMux OAuth callback ended without a result"));
    };
    const onAbort = () => finish(abortError(interaction.signal));

    server.on("error", (error) => finish(error));
    interaction.signal.addEventListener("abort", onAbort, { once: true });
    timeout = setTimeout(
      () => finish(new Error("ZenMux OAuth callback timed out after 5 minutes")),
      CALLBACK_TIMEOUT_MS,
    );
    timeout.unref();

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        finish(new Error("Could not determine the ZenMux OAuth callback address"));
        return;
      }
      redirectUri = `http://127.0.0.1:${address.port}/callback`;
      interaction.notify({ type: "auth_url", url: authorizationUrl(redirectUri).toString() });
      interaction.notify({
        type: "progress",
        message: "Waiting for ZenMux authorization in your browser…",
      });
    });
  });
}

export function createZenMuxOAuth(config: ZenMuxConfig): OAuthAuth {
  return {
    name: "ZenMux OAuth (PKCE)",
    login: async (interaction) => {
      const oauth = createOAuthConfiguration(config, interaction.signal);
      const verifier = randomPKCECodeVerifier();
      const challenge = await calculatePKCECodeChallenge(verifier);
      const state = randomState();
      const callbackUrl = await waitForCallback(interaction, state, (redirectUri) =>
        buildAuthorizationUrl(oauth, {
          redirect_uri: redirectUri,
          scope: OAUTH_SCOPES,
          state,
          code_challenge: challenge,
          code_challenge_method: "S256",
        }),
      );
      return toCredential(
        await authorizationCodeGrant(oauth, callbackUrl, {
          pkceCodeVerifier: verifier,
          expectedState: state,
        }),
      );
    },
    refresh: async (credential, signal) => {
      throwIfAborted(signal);
      const oauth = createOAuthConfiguration(config, signal);
      return toCredential(await refreshTokenGrant(oauth, credential.refresh));
    },
    toAuth: async (credential: OAuthCredential) => ({
      headers: { Authorization: `Bearer ${credential.access}` },
    }),
  };
}
