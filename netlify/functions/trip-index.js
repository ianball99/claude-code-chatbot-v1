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

  console.log("[trip-index] action:", action, "email:", email);

  if (!action || !email) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: "action and email are required" }),
    };
  }

  const key = emailToKey(email);
  console.log("[trip-index] key:", key);

  try {
    const store = getStore("trip-index");
    console.log("[trip-index] store ready");

    // Load existing list for this user
    let trips = [];
    try {
      const raw = await store.get(key);
      console.log("[trip-index] store.get raw:", raw);
      if (raw) {
        trips = JSON.parse(raw);
      }
    } catch (getErr) {
      console.warn("[trip-index] store.get error:", getErr.message);
      trips = [];
    }

    console.log("[trip-index] loaded trips:", trips.length);

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

      const existing = trips.findIndex((t) => t.refCode === trip.refCode);
      if (existing >= 0) {
        trips[existing] = trip;
      } else {
        trips.push(trip);
      }

      console.log("[trip-index] writing trips:", trips.length);
      await store.set(key, JSON.stringify(trips));
      console.log("[trip-index] write complete");

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
    console.error("[trip-index] top-level error:", err.message, err.stack);
    if (action === "get") {
      return {
        statusCode: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
        body: JSON.stringify({ trips: [], warning: `Blobs unavailable: ${err.message}` }),
      };
    }
    return {
      statusCode: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: `Blobs error: ${err.message}` }),
    };
  }
};
