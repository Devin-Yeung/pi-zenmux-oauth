import { readFileSync } from "node:fs";

const templateUrl = new URL("./oauth-page.html", import.meta.url);

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function oauthSuccessHtml(message: string): string {
  // The template ships beside this module and is read per call: one small
  // read at login beats an import-time side effect, and it keeps the markup
  // in a real .html file instead of a string in TypeScript.
  const template = readFileSync(templateUrl, "utf8");
  // Function replacement, so "$&"-style sequences in the message stay literal.
  return template.replace("{{message}}", () => escapeHtml(message));
}
