# pi-zenmux-oauth

Use ZenMux models in Pi with OAuth 2.0 Authorization Code + PKCE. The extension registers a native Pi provider, discovers the current model catalog, and lets Pi persist the catalog for offline startup.

## Install and use

```bash
pi install git:github.com/Devin-Yeung/pi-zenmux-oauth
```

Start Pi and sign in:

```text
/login zenmux
```

After authorization, select a ZenMux model with `/model`. Set a default for new sessions with `Ctrl+S` in the model picker.

For local development, load the TypeScript entry point directly:

```bash
pi -e ./src/index.ts
```

Pi loads TypeScript extensions directly; no generated JavaScript bundle is required.

## How it works

- OAuth uses Authorization Code + PKCE with a public native client; no client secret is stored.
- `openid-client` handles PKCE, authorization response validation, code exchange, and token refresh. The extension owns only the local browser callback and Pi's OAuth adapter.
- Access and rotating refresh tokens are kept in Pi's credential store.
- Model discovery uses Pi's native provider model-store contract. Pi restores and persists the catalog; the extension keeps its last valid list when discovery fails.
- Model discovery consumes the frontend catalog with explicit TypeScript types. Protocol selection reads endpoint adapters and prefers Anthropic Messages, then OpenAI Responses, then Chat Completions. The public `/api/v1/models` schema does not expose per-model protocols.
- The JSON boundary trusts the service schema; field aliases and alternate response shapes are not supported.
- Requests use Pi AI's built-in API implementations rather than a forked streaming implementation.

The package requests only these scopes:

- `inference:invoke`
- `offline_access`

## Configuration

Production works without additional configuration. These variables are available for development and testing:

| Variable                    | Default                                      | Purpose                           |
| --------------------------- | -------------------------------------------- | --------------------------------- |
| `ZENMUX_API_BASE_URL`       | `https://zenmux.ai/api/v1`                   | OpenAI-compatible API base URL    |
| `ZENMUX_ANTHROPIC_BASE_URL` | derived as `https://zenmux.ai/api/anthropic` | Anthropic-compatible API base URL |
| `ZENMUX_MODEL_CATALOG_URL`  | derived from the API origin                  | Model catalog endpoint            |

The OAuth flow always targets `https://zenmux.ai`, where the bundled public client is registered. The authorization origin and client id are not environment-configurable, so configuration cannot redirect credentials to another authorization server.

A successful first catalog refresh can take up to the service's response time. With no Pi catalog cache and offline mode, ZenMux offers no models until a refresh succeeds; after one, Pi keeps the discovered list.

## Development

```bash
npm install
npm test
npm run check
npm pack --dry-run
```

Tests can point the OAuth flow at another origin by passing an `OAuthEndpoints` value to `loadConfig`. This seam is in-process only; there is no environment variable for it.

Pi extensions run with the permissions of the Pi process. Review source before installing packages from an untrusted source. OAuth listens only on an ephemeral `127.0.0.1` port and verifies the returned state before exchanging the authorization code.
