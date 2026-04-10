// netlify/functions/mcp-tool.js
// Thin proxy: executes a single MCP tool call and returns the result.
// Called by the client during its agentic loop.
//
// Env vars required:
//   MCP_SERVER_URL — e.g. https://vamoos-mcp-server.ianball99.workers.dev/mcp

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Fields that belong to the chatbot/client layer only and must NOT be forwarded
// to the MCP server for a given tool. For example, `visit_datetime` on
// add_location_to_itinerary is stored in Netlify Blobs client-side to order
// locations chronologically — Vamoos's schema rejects it.
const CLIENT_ONLY_FIELDS = {
  add_location_to_itinerary: ["visit_datetime"],
};

function stripClientOnlyFields(toolName, toolInput) {
  const toStrip = CLIENT_ONLY_FIELDS[toolName];
  if (!toStrip || !toolInput || typeof toolInput !== "object") return toolInput;
  const cleaned = { ...toolInput };
  for (const field of toStrip) delete cleaned[field];
  return cleaned;
}

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const mcpUrl = process.env.MCP_SERVER_URL || "";
  if (!mcpUrl) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "MCP_SERVER_URL not set" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { toolName, toolInput } = body;
  if (!toolName) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "toolName required" }) };
  }

  const forwardedInput = stripClientOnlyFields(toolName, toolInput || {});

  try {
    const result = await callMcpTool(mcpUrl, toolName, forwardedInput);
    return {
      statusCode: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ result }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: e.message }),
    };
  }
};

async function callMcpTool(mcpUrl, toolName, toolInput) {
  try {
    const initRes = await fetch(mcpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "claude-chatbot-v1", version: "1.0" } },
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
    if (toolData?.result?.content) {
      return toolData.result.content.map((c) => (c.type === "text" ? c.text : JSON.stringify(c))).join("\n");
    }
    if (toolData?.result) return JSON.stringify(toolData.result);
    if (toolData?.error) return `MCP error: ${JSON.stringify(toolData.error)}`;
    return "No result returned";
  } catch (e) {
    return `Error calling ${toolName}: ${e.message}`;
  }
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
