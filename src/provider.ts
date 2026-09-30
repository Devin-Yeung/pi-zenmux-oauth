import {
  createProvider,
  type ApiStreamOptions,
  type Model,
  type Provider,
  type ProviderHeaders,
  type ProviderStreams,
  type SimpleStreamOptions,
  type TranscriptContext,
} from "@earendil-works/pi-ai";
import {
  anthropicMessagesApi,
  openAICompletionsApi,
  openAIResponsesApi,
} from "@earendil-works/pi-ai/compat";
import {
  parseCatalogPayload,
  PROVIDER_ID,
  type ZenMuxApi,
  type ZenMuxCatalog,
  type ZenMuxModel,
} from "./catalog.ts";
import type { ZenMuxConfig } from "./config.ts";
import { createZenMuxOAuth } from "./oauth.ts";

function addSessionHeader<
  T extends { headers?: ProviderHeaders; sessionId?: string },
>(options?: T): T | undefined {
  if (!options?.sessionId) return options;
  return {
    ...options,
    headers: { ...options.headers, "x-zenmux-session-id": options.sessionId },
  };
}

function withSessionHeaders(streams: ProviderStreams): ProviderStreams {
  return {
    ...streams,
    stream: (
      model: Model<ZenMuxApi>,
      context: TranscriptContext,
      options?: ApiStreamOptions<ZenMuxApi>,
    ) => streams.stream(model, context, addSessionHeader(options)),
    streamSimple: (
      model: Model<ZenMuxApi>,
      context: TranscriptContext,
      options?: SimpleStreamOptions,
    ) => streams.streamSimple(model, context, addSessionHeader(options)),
  };
}

async function fetchCatalog(
  config: ZenMuxConfig,
  signal: AbortSignal,
): Promise<ZenMuxModel[]> {
  const response = await fetch(config.modelCatalogUrl, { signal });
  if (!response.ok)
    throw new Error(`ZenMux model discovery failed (${response.status})`);
  // Trust the service schema at the JSON boundary; mapping uses concrete types.
  // Schema changes fail discovery rather than trying unrelated field aliases.
  const payload = (await response.json()) as ZenMuxCatalog;
  const models = parseCatalogPayload(payload, config);
  if (models.length === 0)
    throw new Error("ZenMux model discovery returned no supported chat models");
  return models;
}

export function createZenMuxProvider(
  config: ZenMuxConfig,
): Provider<ZenMuxApi> {
  const apis = {
    "anthropic-messages": withSessionHeaders(anthropicMessagesApi()),
    "openai-responses": withSessionHeaders(openAIResponsesApi()),
    "openai-completions": withSessionHeaders(openAICompletionsApi()),
  };
  return createProvider<ZenMuxApi>({
    id: PROVIDER_ID,
    name: "ZenMux",
    baseUrl: config.apiBaseUrl,
    headers: { "X-Title": "Pi" },
    auth: { oauth: createZenMuxOAuth(config) },
    // Purely dynamic: the model list is whatever the catalog last published.
    models: [],
    fetchModels: (context) => fetchCatalog(config, context.signal),
    api: apis,
  });
}
