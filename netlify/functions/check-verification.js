import { getStore } from "@netlify/blobs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: CORS,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: "Invalid JSON body" }),
    };
  }

  const { email, browserId } = body;

  if (!email || !browserId) {
    return {
      statusCode: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ verified: false }),
    };
  }

  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;

  if (!siteID || !token) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: "Server configuration error" }),
    };
  }

  const store = getStore({ name: "browser-verifications", siteID, token });
  const key = `${encodeURIComponent(email.toLowerCase().trim())}:${encodeURIComponent(browserId)}`;

  try {
    const raw = await store.get(key);
    if (!raw) {
      return {
        statusCode: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
        body: JSON.stringify({ verified: false }),
      };
    }

    const { verifiedAt } = JSON.parse(raw);

    if (Date.now() - verifiedAt > SEVEN_DAYS_MS) {
      return {
        statusCode: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
        body: JSON.stringify({ verified: false }),
      };
    }

    return {
      statusCode: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ verified: true }),
    };
  } catch {
    return {
      statusCode: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ verified: false }),
    };
  }
};
