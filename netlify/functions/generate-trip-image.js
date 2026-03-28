// generate-trip-image.js
// Uses Claude Haiku to extract destination keywords from a trip title,
// then fetches a relevant travel photo from Pixabay and returns it as base64.
//
// Env vars required:
//   ANTHROPIC_API_KEY
//   PIXABAY_API_KEY

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

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const pixabayKey = process.env.PIXABAY_API_KEY;

  if (!anthropicKey) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }) };
  }
  if (!pixabayKey) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "PIXABAY_API_KEY not set" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { title } = body;
  if (!title) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "title required" }) };
  }

  // Step 1: Extract destination keywords using Claude Haiku
  let keywords = title; // fallback: use raw title
  try {
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 30,
        system:
          "Extract 2-3 English destination or landscape keywords suitable for a travel photo search. " +
          "Return only the keywords separated by spaces, no punctuation, no explanation.",
        messages: [{ role: "user", content: `Trip title: ${title}` }],
      }),
    });
    const claudeData = await claudeRes.json();
    const extracted = (claudeData.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text.trim())
      .join(" ");
    if (extracted) keywords = extracted;
  } catch {
    // Keep raw title as fallback
  }

  // Step 2: Search Pixabay for a travel landscape image
  const pixabayUrl =
    `https://pixabay.com/api/?key=${encodeURIComponent(pixabayKey)}` +
    `&q=${encodeURIComponent(keywords)}` +
    `&image_type=photo&orientation=horizontal&category=travel&per_page=5&safesearch=true`;

  let imageUrl;
  try {
    const pixabayRes = await fetch(pixabayUrl);
    const pixabayData = await pixabayRes.json();
    const hits = pixabayData.hits || [];
    if (hits.length === 0) {
      return {
        statusCode: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: `No Pixabay results for keywords: ${keywords}` }),
      };
    }
    // Prefer largeImageURL, fall back to webformatURL
    imageUrl = hits[0].largeImageURL || hits[0].webformatURL;
  } catch (e) {
    return {
      statusCode: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: `Pixabay request failed: ${e.message}` }),
    };
  }

  // Step 3: Download image and convert to base64
  try {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      return {
        statusCode: 502,
        headers: { ...CORS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: `Failed to download image: HTTP ${imgRes.status}` }),
      };
    }
    const arrayBuffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const contentType = imgRes.headers.get("content-type") || "image/jpeg";

    return {
      statusCode: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ imageData: base64, contentType, filename: "background.jpg" }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: `Image download failed: ${e.message}` }),
    };
  }
};
