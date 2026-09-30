function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function oauthSuccessHtml(message: string): string {
  const text = escapeHtml(message);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Signed in to ZenMux</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #10140f;
      --card: #1a2118;
      --line: #31402c;
      --text: #f4f7f1;
      --muted: #b7c3b0;
      --mark:rgb(28, 36, 12);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 32px 20px;
      background:
        radial-gradient(circle at top, #243022 0, transparent 42%),
        var(--bg);
      color: var(--text);
      font-family: ui-sans-serif, system-ui, sans-serif;
    }
    main {
      width: min(100%, 440px);
      padding: 36px 32px 32px;
      border: 1px solid var(--line);
      border-radius: 20px;
      background: var(--card);
      text-align: center;
    }
    .mark {
      width: 56px;
      height: 56px;
      margin: 0 auto 20px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: #2a3a22;
      color: var(--mark);
    }
    h1 {
      margin: 0 0 12px;
      font-size: 28px;
      font-weight: 650;
      letter-spacing: -0.03em;
    }
    p {
      margin: 0;
      color: var(--muted);
      font-size: 16px;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <main>
    <div class="mark" aria-hidden="true">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <path d="M6 14.5 11.2 20 22 8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    <h1>Signed in to ZenMux</h1>
    <p>${text}</p>
  </main>
</body>
</html>`;
}
