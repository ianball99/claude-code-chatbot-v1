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

/**
 * trip-index — per-user trip list stored in Netlify Blobs
 *
 * POST body shapes:
 *   { action: "get", email: "user@example.com" }
 *     → returns { trips: [ { refCode, title, departureDate, returnDate } ] }
 *
 *   { action: "add", email: "user@example.com", trip: { refCode, title, departureDate, returnDate } }
 *     → adds or updates entry for refCode, returns { trips: [...] }
 *
 *   { action: "remove", email: "user@example.com", refCode: "ABC123" }
 *     → removes entry for refCode, returns { trips: [...] }
 */
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
    const store = getStore("trip-index");

    // Load existing list for this user
    let trips = [];
    try {
      const raw = await store.get(key);
      if (raw) {
        trips = JSON.parse(raw);
      }
    } catch {
      // No existing entry or parse error — start fresh
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

      // Upsert: replace existing entry with same refCode, or append
      const existing = trips.findIndex((t) => t.refCode === trip.refCode);
      if (existing >= 0) {
        trips[existing] = trip;
      } else {
        trips.push(trip);
      }

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
    // Top-level catch — blobs unavailable or unexpected error.
    // For "get" return empty trips so the page loads cleanly.
    // For mutations return the error so callers know the write didn't persist.
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
