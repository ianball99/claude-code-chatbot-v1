// netlify/functions/chat.js
// For non-upload tools: full agentic loop via MCP server.
// For upload tools: stops and returns pendingUpload to the React app,
// which POSTs the binary blob directly to the Worker /upload endpoint.
//
// Env vars required:
//   ANTHROPIC_API_KEY  — Anthropic API key
//   MCP_SERVER_URL     — e.g. https://vamoos-mcp-server.ianball99.workers.dev/mcp

const MODEL = "claude-sonnet-4-20250514";

const SYSTEM = `You are a friendly interviewer. The user is planning a travel trip. Your aim is to proactively capture details of the trip and load it into Vamoos via the tools available to you.

You need to capture overview trip details and as much detail of the itinerary as possible. Then create a very simple HTML file with a day by day itinerary.

Do not hallucinate:
Base your itinerary items ONLY on information provided by the user chat or uploads. Only include information you are 100% sure is correct.
Add helpful details like flight times from flight numbers, addresses for hotels and car hire locations, but only from web sources that you are 100% sure are correct.

Core behaviour:
- Be warm, conversational, and professional.
- Ask one question at a time.
- Keep questions short and easy to answer.
- Avoid overwhelming the traveller.
- Confirm key details.
- Be proactive to ensure all data is captured or confirm that it is 'not known'.
- Prompt the user to upload documents that may have relevant details or to cut and paste material that contains details.
- Extract relevant material from uploads or pasted material.

Interview flow — follow this structure:
1. Trip basics: Destination(s), Travel dates

2. What travel and accommodation is booked or planned for each day of the trip:
   - Flights, train or bus tickets, other transport
   - Hire cars
   - Accommodation
   - Transfers to and from airports
   - Activities or tours
   - Restaurants or events

   Create a day by day itinerary from start to end date with travel and accommodation details, booking references, etc.

3. Review and amend: Play back the overview and itinerary document to check if the user is happy to upload or wants changes.

Once the user is happy to upload, do the following in order:

Step 1 — Create a trip in Vamoos using the create_itinerary tool:
  - departure_date (required)
  - return_date (required)
  - reference_code: generate a short 10-character descriptor (e.g. SmithRome25)
  - field1: trip title
  - field3: location (optional)

Step 2 — Call upload_document with the following fields:
  - reference_code and vamoos_id from the trip you just created
  - departure_date and return_date
  - document_name: a friendly presentation name (e.g. "Italy Itinerary")
  - filename: e.g. "itinerary.pdf"
  - content_type: "application/pdf"
  - html_content: a complete HTML string for the itinerary document

The html_content should be a self-contained HTML document. Keep it very simple, similar to:
<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Trip Itinerary</title><style>body{font-family:Arial,Helvetica,sans-serif;line-height:1.5;margin:40px}h1{margin:0 0 12px}h2{margin:18px 0 8px}p{margin:0 0 10px}</style></head><body><h1>Trip Title</h1><h2>Day 1 — Date</h2><p>Details...</p></body></html>

The app will convert the HTML to PDF automatically — you do NOT need to ask the user for any file attachment for this step.

Step 3 — Confirm to the user that the trip has been created and the itinerary document has been uploaded to Vamoos.`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UPLOAD_TOOLS = new Set(["upload_background_image", "upload_document"]);

const TOOLS = [
  {
    name: "list_itineraries",
    description: "List all Vamoos itineraries (also called trips) for the operator. Use this when the user asks to list, show, or browse their trips or itineraries. Returns a summary including reference codes, dates, and vamoos_ids.",
    input_schema: {
      type: "object",
      properties: {
        page: { type: "number", description: "Page number (default: 1)" },
        per_page: { type: "number", description: "Results per page, max 100 (default: 50)" },
      },
    },
  },
  {
    name: "get_itinerary",
    description: "Retrieve a single Vamoos itinerary (also called a trip) by its reference code (Passcode). Use this when the user asks to get, look up, or view a specific trip or itinerary. Returns full details including vamoos_id, dates, background, documents, and all fields.",
    input_schema: {
      type: "object",
      properties: {
        reference_code: { type: "string", description: "The reference code (Passcode) of the itinerary to retrieve" },
      },
      required: ["reference_code"],
    },
  },
  {
    name: "create_itinerary",
    description: "Create a new Vamoos itinerary (also called a trip). Use this when the user asks to create, add, or start a new trip. The reference_code is shown as the Passcode in the app.",
    input_schema: {
      type: "object",
      properties: {
        reference_code: { type: "string", description: "Unique reference code (e.g. SmithRome25)" },
        departure_date: { type: "string", description: "Departure date (YYYY-MM-DD)" },
        return_date: { type: "string", description: "Return date (YYYY-MM-DD)" },
        field1: { type: "string", description: "Destination / Event Title (optional)" },
        field3: { type: "string", description: "Name / Location (optional)" },
      },
      required: ["reference_code", "departure_date", "return_date"],
    },
  },
  {
    name: "update_itinerary",
    description: "Update an existing Vamoos itinerary (also called a trip). Use when the user asks to update, edit, or modify a trip. Requires the vamoos_id which stays constant across updates.",
    input_schema: {
      type: "object",
      properties: {
        reference_code: { type: "string", description: "Reference code of the itinerary to update" },
        vamoos_id: { type: "number", description: "The vamoos_id — stays constant across all updates" },
        departure_date: { type: "string", description: "Departure date (YYYY-MM-DD)" },
        return_date: { type: "string", description: "Return date (YYYY-MM-DD)" },
        field1: { type: "string", description: "Destination / Event Title (optional)" },
        field3: { type: "string", description: "Name / Location (optional)" },
      },
      required: ["reference_code", "vamoos_id", "departure_date", "return_date"],
    },
  },
  {
    name: "upload_background_image",
    description: "Upload a background image to a Vamoos itinerary. The file binary is handled automatically from the user's attachment — just provide the metadata.",
    input_schema: {
      type: "object",
      properties: {
        reference_code: { type: "string", description: "Reference code of the itinerary" },
        vamoos_id: { type: "number", description: "The vamoos_id of the itinerary" },
        departure_date: { type: "string", description: "Departure date (YYYY-MM-DD)" },
        return_date: { type: "string", description: "Return date (YYYY-MM-DD)" },
        filename: { type: "string", description: "Filename including extension (e.g. background.jpg)" },
        content_type: { type: "string", description: "MIME type (e.g. image/jpeg)" },
      },
      required: ["reference_code", "vamoos_id", "departure_date", "return_date"],
    },
  },
  {
    name: "upload_document",
    description: "Upload a document to a Vamoos itinerary (also called a trip). If html_content is provided the app will convert it to PDF automatically — no file attachment is needed from the user.",
    input_schema: {
      type: "object",
      properties: {
        reference_code: { type: "string", description: "Reference code of the itinerary/trip" },
        vamoos_id: { type: "number", description: "The vamoos_id of the itinerary/trip" },
        departure_date: { type: "string", description: "Departure date (YYYY-MM-DD)" },
        return_date: { type: "string", description: "Return date (YYYY-MM-DD)" },
        filename: { type: "string", description: "Filename including extension (e.g. itinerary.pdf)" },
        content_type: { type: "string", description: "MIME type (e.g. application/pdf)" },
        document_name: { type: "string", description: "Display name shown in the app (e.g. Travel Itinerary)" },
        html_content: { type: "string", description: "Full HTML string to convert to PDF. When provided the app generates the PDF client-side — no file attachment needed." },
      },
      required: ["reference_code", "vamoos_id", "departure_date", "return_date", "document_name"],
    },
  },
];

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

  const { messages, resumeToolResult } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "messages array required" }) };
  }

  const claudeHeaders = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };

  try {
    // If resuming after a client-side upload, inject the tool result
    let currentMessages = resumeToolResult
      ? [...messages, { role: "user", content: [{ type: "tool_result", tool_use_id: resumeToolResult.tool_use_id, content: resumeToolResult.content }] }]
      : [...messages];

    const toolCalls = [];

    while (true) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: claudeHeaders,
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 4096,
          system: SYSTEM,
          tools: TOOLS,
          messages: currentMessages,
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

      // Add assistant message (with tool_use blocks) to history
      currentMessages = [...currentMessages, { role: "assistant", content: data.content }];

      // Check for upload tools — hand these back to the client
      const uploadBlock = data.content.find((b) => b.type === "tool_use" && UPLOAD_TOOLS.has(b.name));
      if (uploadBlock) {
        return {
          statusCode: 200,
          headers: { ...CORS, "Content-Type": "application/json" },
          body: JSON.stringify({
            pendingUpload: {
              toolUseId: uploadBlock.id,
              name: uploadBlock.name,
              input: uploadBlock.input,
            },
            conversationState: currentMessages,
            toolCalls,
          }),
        };
      }

      // Non-upload tool — execute via MCP server
      const toolResults = [];
      for (const block of data.content) {
        if (block.type !== "tool_use") continue;
        const result = mcpUrl
          ? await callMcpTool(mcpUrl, block.name, block.input)
          : JSON.stringify({ error: "MCP_SERVER_URL not configured" });
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
