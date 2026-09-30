import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadConfig } from "./config.ts";
import { createZenMuxProvider } from "./provider.ts";

export default function zenMuxExtension(pi: ExtensionAPI): void {
  pi.registerProvider(createZenMuxProvider(loadConfig()));
}
