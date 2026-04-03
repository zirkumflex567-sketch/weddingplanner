#!/usr/bin/env node

const args = process.argv.slice(2);
const messageIndex = args.indexOf("--message");
const prompt =
  messageIndex >= 0 && typeof args[messageIndex + 1] === "string"
    ? args[messageIndex + 1]
    : "";
const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
const model = process.env.GEMINI_WORKSPACE_AGENT_MODEL ?? "gemini-2.5-flash";

if (!prompt.trim()) {
  console.error("Missing --message prompt");
  process.exit(1);
}

if (!apiKey) {
  console.error("Missing GEMINI_API_KEY or GOOGLE_API_KEY");
  process.exit(1);
}

const endpoint = new URL(
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
);
endpoint.searchParams.set("key", apiKey);

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json"
    }
  })
});

if (!response.ok) {
  console.error(await response.text());
  process.exit(1);
}

const payload = await response.json();
const text =
  payload?.candidates?.[0]?.content?.parts
    ?.map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim() ?? "";

if (!text) {
  console.error(JSON.stringify(payload));
  process.exit(1);
}

process.stdout.write(text);

