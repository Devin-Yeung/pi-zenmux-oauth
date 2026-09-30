import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.ts";
import { createZenMuxProvider } from "../src/provider.ts";

const config = loadConfig({
  ZENMUX_MODEL_CATALOG_URL: "https://catalog.example.test/models",
});

test("catalog refresh publishes discovered models through Pi's provider", async (t) => {
  const provider = createZenMuxProvider(config);
  assert.deepEqual(
    provider.getModels().map((model) => model.id),
    [],
  );
  assert.ok(provider.refreshModels);

  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      calls.push(url);
      assert.equal(url, config.modelCatalogUrl);
      assert.equal(init?.signal?.aborted, false);
      return Response.json({
        success: true,
        data: [
          {
            slug: "vendor/model-v2",
            name: "Model V2",
            input_modalities: ["text"],
            endpoints: [
              { supports_reasoning: 0, adapters: [{ api: "messages" }] },
            ],
          },
        ],
      });
    },
  );

  await provider.refreshModels({
    allowNetwork: false,
    signal: new AbortController().signal,
    publish: async () => true,
  });
  assert.deepEqual(calls, []);
  assert.deepEqual(
    provider.getModels().map((model) => model.id),
    [],
  );

  let persistedIds: string[] = [];
  await provider.refreshModels({
    allowNetwork: true,
    signal: new AbortController().signal,
    publish: async (publication) => {
      publication.update?.();
      persistedIds = (publication.persist?.models ?? []).map(
        (model) => model.id,
      );
      return true;
    },
  });

  assert.deepEqual(calls, [config.modelCatalogUrl]);
  assert.deepEqual(persistedIds, ["vendor/model-v2"]);
  assert.deepEqual(
    provider.getModels().map((model) => model.id),
    ["vendor/model-v2"],
  );
});
