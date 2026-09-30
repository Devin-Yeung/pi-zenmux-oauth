import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { loadConfig } from "../src/config.ts";
import { createZenMuxOAuth } from "../src/oauth.ts";

const config = loadConfig({
  ZENMUX_OAUTH_ORIGIN: "https://oauth.example.test",
  ZENMUX_OAUTH_CLIENT_ID: "public-client",
});

test("OAuth login validates state and PKCE, then refreshes a rotating token", async () => {
  const tokenRequests: URLSearchParams[] = [];
  const fetchToken: typeof fetch = async (input, init) => {
    assert.equal(String(input), "https://oauth.example.test/oauth/token");
    assert.equal(init?.method, "POST");
    assert.equal(init?.signal?.aborted, false);
    const body = init?.body;
    assert.ok(body instanceof URLSearchParams);
    tokenRequests.push(body);
    return Response.json({
      access_token: `access-${tokenRequests.length}`,
      refresh_token: `refresh-${tokenRequests.length}`,
      expires_in: 3600,
      token_type: "Bearer",
    });
  };
  const oauth = createZenMuxOAuth(config, { fetch: fetchToken });
  let receiveAuthorizationUrl!: (url: URL) => void;
  const authorizationUrl = new Promise<URL>((resolve) => {
    receiveAuthorizationUrl = resolve;
  });
  const login = oauth.login({
    signal: new AbortController().signal,
    prompt: async () => {
      throw new Error("Unexpected prompt");
    },
    notify: (event) => {
      if (event.type === "auth_url") receiveAuthorizationUrl(new URL(event.url));
    },
  });

  const url = await authorizationUrl;
  assert.equal(url.origin, "https://oauth.example.test");
  assert.equal(url.pathname, "/oauth/authorize");
  assert.equal(url.searchParams.get("client_id"), "public-client");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("scope"), "inference:invoke offline_access");
  const redirectUri = url.searchParams.get("redirect_uri");
  const state = url.searchParams.get("state");
  assert.ok(redirectUri);
  assert.ok(state);

  const rejectedCallback = await fetch(`${redirectUri}?code=ignored&state=wrong`);
  assert.equal(rejectedCallback.status, 400);
  const acceptedCallback = await fetch(`${redirectUri}?code=authorization-code&state=${state}`);
  assert.equal(acceptedCallback.status, 200);
  const credential = await login;
  assert.equal(credential.access, "access-1");
  assert.equal(credential.refresh, "refresh-1");
  assert.ok(credential.expires > Date.now());
  assert.equal(tokenRequests[0].get("grant_type"), "authorization_code");
  assert.equal(tokenRequests[0].get("code"), "authorization-code");
  assert.equal(tokenRequests[0].get("redirect_uri"), redirectUri);
  const verifier = tokenRequests[0].get("code_verifier");
  assert.ok(verifier);
  assert.equal(
    createHash("sha256").update(verifier).digest("base64url"),
    url.searchParams.get("code_challenge"),
  );

  const refreshed = await oauth.refresh(credential, new AbortController().signal);
  assert.equal(refreshed.access, "access-2");
  assert.equal(refreshed.refresh, "refresh-2");
  assert.equal(tokenRequests[1].get("grant_type"), "refresh_token");
  assert.equal(tokenRequests[1].get("refresh_token"), "refresh-1");
  assert.deepEqual(await oauth.toAuth(refreshed), {
    headers: { Authorization: "Bearer access-2" },
  });
});

test("cancelling a pending browser login closes the callback listener", async () => {
  const abort = new AbortController();
  let receiveAuthorizationUrl!: (url: URL) => void;
  const authorizationUrl = new Promise<URL>((resolve) => {
    receiveAuthorizationUrl = resolve;
  });
  const oauth = createZenMuxOAuth(config);
  const login = oauth.login({
    signal: abort.signal,
    prompt: async () => {
      throw new Error("Unexpected prompt");
    },
    notify: (event) => {
      if (event.type === "auth_url") receiveAuthorizationUrl(new URL(event.url));
    },
  });
  const url = await authorizationUrl;
  const redirectUri = url.searchParams.get("redirect_uri");
  assert.ok(redirectUri);
  abort.abort(new Error("Login cancelled"));
  await assert.rejects(login, /Login cancelled/);
  await assert.rejects(fetch(redirectUri), /fetch failed/);
});
