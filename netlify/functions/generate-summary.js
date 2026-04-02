// netlify/functions/generate-summary.js
// Generates an initial HTML itinerary document from trip JSON and uploads it to Vamoos.
// Called by TripPage when no saved summary doc is found.
//
// Env vars required:
//   ANTHROPIC_API_KEY
//   MCP_SERVER_URL

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM = `You are a travel itinerary formatter. Given a raw Vamoos trip JSON object, generate a complete HTML itinerary document.

HTML rules:
- Write a complete HTML document with <html>, <head>, and <body> tags
- Include a Google Fonts link for Roboto and a <style> block in <head> for clean, readable formatting
- Use <h1> for the document title
- Use <h2> for day headings (e.g. <h2>Day 1 - Monday 5 May</h2>)
- You MUST include a <h2> section for EVERY day from the departure date to the return date — calculate the full date range and include each day without exception
- Use <h3> for sub-sections if needed
- Use <ul> and <li> for bullet points
- Use <strong> for bold emphasis
- Use <p> for paragraphs
- Do NOT use markdown — write proper HTML only
- Only include information present in the provided data — do not hallucinate or add details not present
- If certain days have no details, include them with their day heading and a <p>No details added yet.</p> note — NEVER omit a day from the date range

Use this style in <head>:
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  body { font-family: 'Roboto', Arial, sans-serif; font-size: 13px; line-height: 1.6; margin: 40px; background: transparent; color: #fff; }
  h1 { font-size: 20px; margin-bottom: 8px; }
  h2 { font-size: 15px; margin-top: 24px; border-bottom: 1px solid #555; padding-bottom: 4px; }
  h3 { font-size: 13px; margin-top: 12px; }
  ul { margin: 0 0 8px; padding-left: 20px; }
  li { margin-bottom: 3px; }
  p { margin: 0 0 8px; }
</style>

Output only the raw HTML document — no markdown code fences, no explanation.`;

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const mcpUrl = process.env.MCP_SERVER_URL || "";
  if (!apiKey) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }) };
  }
  if (!mcpUrl) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "MCP_SERVER_URL not set" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { tripJson, reference_code, vamoos_id, departure_date, return_date, trip_title } = body;
  if (!tripJson || !reference_code || !vamoos_id) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: "tripJson, reference_code and vamoos_id are required" }),
    };
  }

  // Step 1: Generate HTML via Claude
  let html;
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
        max_tokens: 4096,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: `Generate an HTML itinerary document for this trip:\n\n${tripJson}`,
          },
        ],
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || JSON.stringify(data));

    html = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    // Strip markdown code fences if Claude wrapped the output
    if (html.startsWith("```")) {
      html = html.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "").trim();
    }
  } catch (e) {
    return {
      statusCode: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: `HTML generation failed: ${e.message}` }),
    };
  }

  // Step 2: Upload to Vamoos (non-fatal if it fails — caller still gets the HTML)
  try {
    await callMcpTool(mcpUrl, "upload_created_html_itinerary_document", {
      reference_code,
      vamoos_id,
      departure_date: departure_date || "",
      return_date: return_date || "",
      document_name: `Trip Summary-${trip_title || reference_code}`,
      html_content: html,
    });
  } catch (e) {
    console.error("upload_created_html_itinerary_document failed:", e.message);
  }

  return {
    statusCode: 200,
    headers: { ...CORS, "Content-Type": "application/json" },
    body: JSON.stringify({ html }),
  };
};

async function callMcpTool(mcpUrl, toolName, toolInput) {
  const initRes = await fetch(mcpUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "generate-summary", version: "1.0" } },
    }),
  });
  const sessionId = initRes.headers.get("mcp-session-id");
  await readFirstSseData(initRes);

  const notifHeaders = { "Content-Type": "application/json" };
  if (sessionId) notifHeaders["mcp-session-id"] = sessionId;
  fetch(mcpUrl, {
    method: "POST",
    headers: notifHeaders,
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  }).catch(() => {});

  const toolHeaders = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  if (sessionId) toolHeaders["mcp-session-id"] = sessionId;
  const toolRes = await fetch(mcpUrl, {
    method: "POST",
    headers: toolHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0", id: 2, method: "tools/call",
      params: { name: toolName, arguments: toolInput },
    }),
  });

  const toolData = await readFirstSseData(toolRes);
  if (toolData?.error) throw new Error(JSON.stringify(toolData.error));
  return toolData;
}

async function readFirstSseData(res) {
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("text/event-stream")) {
    try { return await res.json(); } catch { return null; }
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const parsed = JSON.parse(line.slice(6));
            reader.cancel();
            return parsed;
          } catch {}
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return null;
}
