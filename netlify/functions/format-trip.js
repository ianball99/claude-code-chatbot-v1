// netlify/functions/format-trip.js
// Lightweight single-call Claude formatter — no tools, no agentic loop.
// Takes raw Vamoos itinerary JSON and returns a clean readable summary.
//
// Env vars required:
//   ANTHROPIC_API_KEY

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM = `You are a travel data formatter for a trip management dashboard.
Given a raw Vamoos itinerary JSON object, produce a clean plain-text summary.

Rules:
- Use clear section headings in ALL CAPS followed by a colon (e.g. OVERVIEW:)
- Use dashes for list items
- Format all dates as "1 Apr 2026" or "1 Apr 2026 at 14:30 UTC"
- Do NOT use markdown — no asterisks, no bold, no italic, no backticks, no hashes
- Skip purely internal/technical fields: id, operator_id, operator_code, is_current_version, source, version, created_at, updated_at, original_created_at, tag, itinerary_id, s3_url, meta (object), routing, passcode_groups, start_time, timezone, type, is_listed, is_public, requested_listing_status, loc_position, on_weather, on_maps, country_iso, icon_id
- Include all meaningful content fields — if Vamoos adds new fields in future, include them
- For field1/field2/field3/field4 use labels: Title, Subtitle, Location, Notes
- Skip field2/field3/field4 if empty
- For flights: show carrier + flight number, operated-by if different carrier, route (airport codes), departure and arrival date/time
- For travellers: show name and email
- For locations: show name and country
- For POIs: show name and type (Track or Pin)
- For documents: show document name and folder (Travel or Destination)
- For background: show filename only
- For preview_link: include it at the end
- For downloads: include as "Downloaded N times"
- Keep it concise — no prose, just structured facts`;

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { tripJson } = body;
  if (!tripJson) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "tripJson required" }) };
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: SYSTEM,
        messages: [
          { role: "user", content: `Format this Vamoos trip:\n\n${tripJson}` },
        ],
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        statusCode: res.status,
        headers: { ...CORS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: data.error?.message || JSON.stringify(data) }),
      };
    }

    let text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    // Strip any markdown bold/italic markers Claude may have included despite instructions
    text = text.replace(/\*\*/g, "").replace(/\*/g, "");

    return {
      statusCode: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: e.message }),
    };
  }
};
