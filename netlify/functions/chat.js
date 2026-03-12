// netlify/functions/chat.js
// Discovers tools from the MCP server at startup, passes them to Claude
// as regular tools, and handles the tool-use loop by calling the MCP server.
//
// Env vars required:
//   ANTHROPIC_API_KEY  — Anthropic API key
//   MCP_SERVER_URL     — e.g. https://vamoos-mcp-server.ianball99.workers.dev/mcp

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

  // Discover tools from the MCP server
  let tools = [];
  let mcpSession = null;
  if (mcpUrl) {
    try {
      const { tools: discovered, sessionId } = await discoverMcpTools(mcpUrl);
      tools = discovered;
      mcpSession = sessionId;
    } catch (e) {
      console.warn("MCP tool discovery failed:", e.message);
    }
  }

  const claudeHeaders = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };

  try {
    let currentMessages = [...messages];
    const toolCalls = [];

    while (true) {
      const requestBody = {
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM,
        messages: currentMessages,
        ...(tools.length > 0 ? { tools } : {}),
      };

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: claudeHeaders,
        body: JSON.stringify(requestBody),
      });

      const data = await res.json();

      if (!res.ok) {
        return {
          statusCode: res.status,
          headers: { ...CORS, "Content-Type": "application/json" },
          body: JSON.stringify({ error: data.error?.message || JSON.stringify(data) }),
        };
      }

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

      // Handle tool_use — call the MCP server for each
      currentMessages = [...currentMessages, { role: "assistant", content: data.content }];
      const toolResults = [];

      for (const block of data.content) {
        if (block.type !== "tool_use") continue;

        const result = mcpUrl
          ? await callMcpTool(mcpUrl, block.name, block.input, mcpSession)
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

// Initialize an MCP session and return tool definitions + session ID
async function discoverMcpTools(mcpUrl) {
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

  // Send initialized notification
  const notifHeaders = { "Content-Type": "application/json" };
  if (sessionId) notifHeaders["mcp-session-id"] = sessionId;
  await fetch(mcpUrl, {
    method: "POST",
    headers: notifHeaders,
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });

  // List tools
  const listHeaders = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  if (sessionId) listHeaders["mcp-session-id"] = sessionId;
  const listRes = await fetch(mcpUrl, {
    method: "POST",
    headers: listHeaders,
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
  });

  const listData = await parseResponse(listRes);
  const mcpTools = listData?.result?.tools || [];

  // Convert MCP tool format → Anthropic tool format
  const tools = mcpTools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema || { type: "object", properties: {} },
  }));

  return { tools, sessionId };
}

// Call a specific tool on the MCP server
async function callMcpTool(mcpUrl, toolName, toolInput, sessionId) {
  try {
    // If no session yet, initialize one
    let sid = sessionId;
    if (!sid) {
      const { sessionId: newSid } = await discoverMcpTools(mcpUrl);
      sid = newSid;
    }

    const toolHeaders = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
    if (sid) toolHeaders["mcp-session-id"] = sid;

    const toolRes = await fetch(mcpUrl, {
      method: "POST",
      headers: toolHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
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

// Parse JSON or SSE response from the MCP server
async function parseResponse(res) {
  const ct = res.headers.get("content-type") || "";
  const text = await res.text();
  if (ct.includes("text/event-stream")) {
    for (const line of text.split("\n")) {
      if (line.startsWith("data: ")) {
        try { return JSON.parse(line.slice(6)); } catch {}
      }
    }
    return null;
  }
  try { return JSON.parse(text); } catch { return null; }
}
