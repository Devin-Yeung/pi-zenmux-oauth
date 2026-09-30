import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.ts";
import {
  parseCatalogPayload,
  resolvePiApi,
  toFallbackModel,
  type ZenMuxCatalogModel,
} from "../src/catalog.ts";

const config = loadConfig({});

test("configuration derives production endpoints and supports environment overrides", () => {
  assert.equal(config.portalOrigin, "https://zenmux.ai");
  assert.equal(config.oauthClientId, "zpc_-6SsDHPARf6Rg5TTzbvlOQka");
  assert.equal(config.anthropicBaseUrl, "https://zenmux.ai/api/anthropic");
  assert.equal(config.modelCatalogUrl, "https://zenmux.ai/api/frontend/model/available/list");

  const custom = loadConfig({
    ZENMUX_OAUTH_ORIGIN: "https://oauth.example.test/",
    ZENMUX_API_BASE_URL: "https://api.example.test/v1/",
    ZENMUX_MODEL_CATALOG_URL: "https://catalog.example.test/models",
    ZENMUX_OAUTH_CLIENT_ID: "client-id",
    ZENMUX_TEST_MODEL: "vendor/model",
  });
  assert.equal(custom.portalOrigin, "https://oauth.example.test");
  assert.equal(custom.apiBaseUrl, "https://api.example.test/v1");
  assert.equal(custom.anthropicBaseUrl, "https://api.example.test/anthropic");
  assert.equal(custom.modelCatalogUrl, "https://catalog.example.test/models");
  assert.equal(custom.oauthClientId, "client-id");
  assert.equal(custom.fallbackModelId, "vendor/model");
  assert.throws(
    () => loadConfig({ ZENMUX_OAUTH_ORIGIN: "https://oauth.example.test" }),
    /ZENMUX_OAUTH_CLIENT_ID is required/,
  );
});

// Fixtures follow the frontend catalog contract; internal database IDs and
// pricing fields are deliberately absent because the mapper does not use them.
const chatModel: ZenMuxCatalogModel = {
  slug: "vendor/model-v2",
  name: "Model V2",
  input_modalities: ["text", "image", "audio"],
  context_length: 64_000,
  endpoints: [{ supports_reasoning: 1, adapters: [{ api: "responses" }] }],
};

test("model protocol selection uses adapter APIs and preserves priority", () => {
  assert.equal(resolvePiApi(chatModel), "openai-responses");
  assert.equal(
    resolvePiApi({
      ...chatModel,
      endpoints: [
        {
          supports_reasoning: 1,
          adapters: [{ api: "responses" }, { api: "messages" }, { api: "chat.completions" }],
        },
      ],
    }),
    "anthropic-messages",
  );
  assert.equal(
    resolvePiApi({
      ...chatModel,
      endpoints: [{ supports_reasoning: 0, adapters: [{ api: "chat.completions" }] }],
    }),
    "openai-completions",
  );
});

test("catalog mapping consumes typed metadata and excludes non-chat adapters", () => {
  const models = parseCatalogPayload(
    {
      success: true,
      data: [
        chatModel,
        {
          ...chatModel,
          slug: "image-model",
          endpoints: [{ supports_reasoning: 0, adapters: [{ api: "images" }] }],
        },
      ],
    },
    config,
  );

  assert.equal(models.length, 1);
  assert.equal(models[0].id, "vendor/model-v2");
  assert.equal(models[0].api, "openai-responses");
  assert.equal(models[0].baseUrl, config.apiBaseUrl);
  assert.equal(models[0].name, "ZenMux · Model V2");
  assert.deepEqual(models[0].input, ["text", "image"]);
  assert.equal(models[0].reasoning, true);
  assert.equal(models[0].contextWindow, 64_000);
  assert.throws(() => parseCatalogPayload({ success: false, data: [] }, config), /request failed/);
});

test("fallback model is available before the first successful catalog refresh", () => {
  const model = toFallbackModel(config);
  assert.equal(model.id, "deepseek/deepseek-v4-flash");
  assert.equal(model.provider, "zenmux");
  assert.equal(model.api, "anthropic-messages");
});
