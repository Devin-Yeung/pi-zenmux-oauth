import type { Model } from "@earendil-works/pi-ai";
import type { ZenMuxConfig } from "./config.ts";

export const PROVIDER_ID = "zenmux";
export type ZenMuxApi =
  "anthropic-messages" | "openai-responses" | "openai-completions";
export type ZenMuxModel = Model<ZenMuxApi>;
type Modality = "text" | "image" | "video" | "audio" | "file";

// This is the consumed portion of /api/frontend/model/available/list, not
// /api/v1/models. The latter has documented metadata but no per-model protocols.
// TODO: migrate to public catalogs once they expose equivalent protocol coverage.
export interface ZenMuxCatalog {
  success: boolean;
  data: ZenMuxCatalogModel[];
}

export interface ZenMuxCatalogModel {
  slug: string;
  name: string;
  input_modalities: Modality[];
  context_length?: number;
  endpoints: Array<{
    supports_reasoning: number;
    adapters: Array<{ api: string }>;
  }>;
}

export function parseCatalogPayload(
  payload: ZenMuxCatalog,
  config: ZenMuxConfig,
): ZenMuxModel[] {
  if (!payload.success) throw new Error("ZenMux model catalog request failed");
  return payload.data.flatMap((source) => {
    const api = resolvePiApi(source);
    return api ? [toZenMuxModel(source, api, config)] : [];
  });
}

export function resolvePiApi(model: ZenMuxCatalogModel): ZenMuxApi | undefined {
  const protocols = new Set(
    model.endpoints.flatMap((endpoint) =>
      endpoint.adapters.map((adapter) => adapter.api),
    ),
  );
  // Preserve the existing preference; unsupported adapters are non-chat APIs.
  if (protocols.has("messages")) return "anthropic-messages";
  if (protocols.has("responses")) return "openai-responses";
  if (protocols.has("chat.completions")) return "openai-completions";
  return undefined;
}

export function toZenMuxModel(
  source: ZenMuxCatalogModel,
  api: ZenMuxApi,
  config: ZenMuxConfig,
): ZenMuxModel {
  const input = source.input_modalities.filter(
    (modality): modality is "text" | "image" =>
      modality === "text" || modality === "image",
  );
  const contextWindow = source.context_length ?? 128_000;
  return {
    id: source.slug,
    name: `ZenMux · ${source.name}`,
    api,
    provider: PROVIDER_ID,
    baseUrl:
      api === "anthropic-messages"
        ? config.anthropicBaseUrl
        : config.apiBaseUrl,
    reasoning: source.endpoints.some(
      (endpoint) => endpoint.supports_reasoning > 0,
    ),
    // Pi chat models only represent text/image inputs. File/audio/video are omitted.
    input: input.length > 0 ? input : ["text"],
    // Subscription usage has no per-token cost here; the catalog's tiered PAYG
    // pricing is intentionally omitted. Max output is a conservative local cap.
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: contextWindow > 0 ? contextWindow : 128_000,
    maxTokens: 16_384,
  };
}
