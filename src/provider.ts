import {
  createProvider,
  type ApiStreamOptions,
  type Model,
  type Provider,
  type ProviderHeaders,
  type ProviderStreams,
  type RefreshModelsContext,
  type SimpleStreamOptions,
  type TranscriptContext,
} from "@earendil-works/pi-ai";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import {
  parseCatalogPayload,
  PROVIDER_ID,
  toFallbackModel,
  type ZenMuxApi,
  type ZenMuxCatalog,
  type ZenMuxModel,
} from "./catalog.ts";
import type { ZenMuxConfig } from "./config.ts";
import { createZenMuxOAuth, type OAuthDependencies } from "./oauth.ts";

export interface ZenMuxProviderDependencies extends OAuthDependencies {
  fetchModels?: (signal: AbortSignal) => Promise<ZenMuxModel[]>;
}

function addSessionHeader<T extends { headers?: ProviderHeaders; sessionId?: string }>(
  options?: T,
): T | undefined {
  if (!options?.sessionId) return options;
  return { ...options, headers: { ...options.headers, "x-zenmux-session-id": options.sessionId } };
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

function isZenMuxModel(value: unknown): value is ZenMuxModel {
  if (!value || typeof value !== "object") return false;
  const model = value as Partial<ZenMuxModel>;
  return (
    model.provider === PROVIDER_ID &&
    typeof model.id === "string" &&
    (model.api === "anthropic-messages" ||
      model.api === "openai-responses" ||
      model.api === "openai-completions")
  );
}

async function fetchCatalog(
  config: ZenMuxConfig,
  fetchImpl: typeof globalThis.fetch,
  signal: AbortSignal,
): Promise<ZenMuxModel[]> {
  const response = await fetchImpl(config.modelCatalogUrl, { signal });
  if (!response.ok) throw new Error(`ZenMux model discovery failed (${response.status})`);
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
  dependencies: ZenMuxProviderDependencies = {},
): Provider<ZenMuxApi> {
  let currentModels: ZenMuxModel[] = [toFallbackModel(config)];
  const fetchImpl = dependencies.fetch ?? globalThis.fetch;
  const discoverModels =
    dependencies.fetchModels ?? ((signal) => fetchCatalog(config, fetchImpl, signal));
  const apis = {
    "anthropic-messages": withSessionHeaders(anthropicMessagesApi()),
    "openai-responses": withSessionHeaders(openAIResponsesApi()),
    "openai-completions": withSessionHeaders(openAICompletionsApi()),
  };
  const dispatcher = createProvider<ZenMuxApi>({
    id: PROVIDER_ID,
    name: "ZenMux",
    baseUrl: config.apiBaseUrl,
    headers: { "X-Title": "Pi" },
    auth: { oauth: createZenMuxOAuth(config, dependencies) },
    models: [],
    api: apis,
  });

  return {
    ...dispatcher,
    getModels: () => currentModels,
    getAllModels: () => currentModels,
    refreshModels: async (context: RefreshModelsContext) => {
      if (context.stored) {
        const restored = context.stored.models.filter(isZenMuxModel);
        if (restored.length > 0) {
          const published = await context.publish({
            update: () => {
              currentModels = restored;
            },
          });
          if (!published) return;
        }
      }

      if (!context.allowNetwork || context.signal.aborted) return;
      const refreshed = await discoverModels(context.signal);
      if (context.signal.aborted || refreshed.length === 0) return;
      await context.publish({
        persist: { models: refreshed, checkedAt: Date.now() },
        update: () => {
          currentModels = refreshed;
        },
      });
    },
  };
}
