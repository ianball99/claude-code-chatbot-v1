// netlify/functions/chat.js
// Proxies to Claude API and handles MCP tool-use loop server-side.
// Env vars required:
//   ANTHROPIC_API_KEY  — Anthropic API key
//   MCP_SERVER_URL     — Full URL of the Cloudflare Worker MCP endpoint
//                        e.g. https://your-worker.workers.dev/mcp

const MODEL = "claude-sonnet-4-20250514";

const SYSTEM = `You are a helpful Vamoos travel assistant. You have access to tools to manage Vamoos itineraries: create trips, update details, upload background images, and attach travel documents. Always use the available tools to fulfil requests — never invent data. Be concise and friendly.`;

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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }) };
  }

  const mcpUrl = process.env.MCP_SERVER_URL || "";

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { messages } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "messages array required" }) };
  }

  const claudeHeaders = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };
  // Use MCP client beta if a server URL is configured
  if (mcpUrl) {
    claudeHeaders["anthropic-beta"] = "mcp-client-2025-04-04";
  }

  const baseRequest = {
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM,
    ...(mcpUrl ? { mcp_servers: [{ type: "url", url: mcpUrl, name: "vamoos" }] } : {}),
  };

  try {
    let currentMessages = [...messages];
    const toolCalls = [];

    // Agentic loop — keeps going until end_turn or error
    while (true) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: claudeHeaders,
        body: JSON.stringify({ ...baseRequest, messages: currentMessages }),
      });

      const data = await res.json();

      if (!res.ok) {
        return {
          statusCode: res.status,
          headers: { ...CORS, "Content-Type": "application/json" },
          body: JSON.stringify({ error: data.error?.message || JSON.stringify(data) }),
        };
      }

      // No more tool calls — return final answer
      if (data.stop_reason !== "tool_use") {
        const text = (data.content || [])
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("");
        return {
          statusCode: 200,
          headers: { ...CORS, "Content-Type": "application/json" },
          body: JSON.stringify({ text, toolCalls }),
        };
      }

      // Handle tool_use blocks — call MCP server for each
      currentMessages = [...currentMessages, { role: "assistant", content: data.content }];
      const toolResults = [];

      for (const block of data.content) {
        if (block.type !== "tool_use") continue;

        const result = mcpUrl
          ? await callMcpTool(mcpUrl, block.name, block.input)
          : JSON.stringify({ error: "No MCP server configured" });

        toolCalls.push({ name: block.name, input: block.input, result });
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
      }

      currentMessages = [...currentMessages, { role: "user", content: toolResults }];
    }
  } catch (e) {
    return {
      statusCode: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: e.message }),
    };
  }
};

// Call a tool on the MCP server via JSON-RPC over HTTP (Streamable HTTP transport)
async function callMcpTool(mcpUrl, toolName, toolInput) {
  try {
    // Step 1: initialize session
    const initRes = await fetch(mcpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "claude-chatbot-v1", version: "1.0" },
        },
      }),
    });

    const sessionId = initRes.headers.get("mcp-session-id");
    await parseResponse(initRes);

    // Step 2: send initialized notification
    const notifHeaders = { "Content-Type": "application/json" };
    if (sessionId) notifHeaders["mcp-session-id"] = sessionId;
    await fetch(mcpUrl, {
      method: "POST",
      headers: notifHeaders,
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });

    // Step 3: call the tool
    const toolHeaders = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
    if (sessionId) toolHeaders["mcp-session-id"] = sessionId;

    const toolRes = await fetch(mcpUrl, {
      method: "POST",
      headers: toolHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: toolName, arguments: toolInput },
      }),
    });

    const toolData = await parseResponse(toolRes);

    if (toolData?.result?.content) {
      return toolData.result.content
        .map((c) => (c.type === "text" ? c.text : JSON.stringify(c)))
        .join("\n");
    }
    if (toolData?.result) return JSON.stringify(toolData.result);
    if (toolData?.error) return `MCP error: ${JSON.stringify(toolData.error)}`;
    return "No result returned";
  } catch (e) {
    return `Error calling ${toolName}: ${e.message}`;
  }
}

// Parse either JSON or SSE response from the MCP server
async function parseResponse(res) {
  const ct = res.headers.get("content-type") || "";
  const text = await res.text();
  if (ct.includes("text/event-stream")) {
    for (const line of text.split("\n")) {
      if (line.startsWith("data: ")) {
        try {
          return JSON.parse(line.slice(6));
        } catch {}
      }
    }
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
