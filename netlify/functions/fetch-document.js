// netlify/functions/fetch-document.js
// Server-side proxy to fetch an S3/external URL and return its content as text.
// Avoids browser CORS restrictions when loading saved HTML documents.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let url;
  try {
    ({ url } = JSON.parse(event.body || "{}"));
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  if (!url) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "url required" }) };
  }

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { statusCode: res.status, headers: CORS, body: JSON.stringify({ error: `Upstream HTTP ${res.status}` }) };
    }
    const text = await res.text();
    return {
      statusCode: 200,
      headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" },
      body: text,
    };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
