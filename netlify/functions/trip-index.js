import { getStore } from "@netlify/blobs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Encode email into a blob-safe key.
// Netlify Blobs uses URL paths internally — @ and . can break key resolution.
function emailToKey(email) {
  return encodeURIComponent(email.toLowerCase().trim());
}

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

  const { action, email } = body;

  if (!action || !email) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: "action and email are required" }),
    };
  }

  const key = emailToKey(email);

  try {
    const siteID = process.env.NETLIFY_SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN;

    if (!siteID || !token) {
      throw new Error("NETLIFY_SITE_ID or NETLIFY_BLOBS_TOKEN env var not set");
    }

    const store = getStore({ name: "trip-index", siteID, token });

    // Load existing list for this user
    let trips = [];
    try {
      const raw = await store.get(key);
      if (raw) trips = JSON.parse(raw);
    } catch {
      trips = [];
    }

    if (action === "get") {
      return {
        statusCode: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
        body: JSON.stringify({ trips }),
      };
    }

    if (action === "add") {
      const { trip } = body;
      if (!trip || !trip.refCode) {
        return {
          statusCode: 400,
          headers: CORS,
          body: JSON.stringify({ error: "trip.refCode is required for action=add" }),
        };
      }

      const idx = trips.findIndex((t) => t.refCode === trip.refCode);
      if (idx >= 0) trips[idx] = trip;
      else trips.push(trip);

      await store.set(key, JSON.stringify(trips));

      return {
        statusCode: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
        body: JSON.stringify({ trips }),
      };
    }

    if (action === "remove") {
      const { refCode } = body;
      if (!refCode) {
        return {
          statusCode: 400,
          headers: CORS,
          body: JSON.stringify({ error: "refCode is required for action=remove" }),
        };
      }

      trips = trips.filter((t) => t.refCode !== refCode);
      await store.set(key, JSON.stringify(trips));

      return {
        statusCode: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
        body: JSON.stringify({ trips }),
      };
    }

    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: `Unknown action: ${action}` }),
    };

  } catch (err) {
    if (action === "get") {
      return {
        statusCode: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
        body: JSON.stringify({ trips: [], warning: err.message }),
      };
    }
    return {
      statusCode: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
