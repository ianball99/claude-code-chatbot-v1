// netlify/functions/chat.js
// Makes a SINGLE Claude API call and returns the result to the client.
// The client manages the agentic loop:
//   - pendingUpload   → client handles binary upload directly to Worker /upload
//   - pendingMcpCalls → client calls /.netlify/functions/mcp-tool for each, then resumes
//   - text            → final response, loop ends
//
// Env vars required:
//   ANTHROPIC_API_KEY  — Anthropic API key
//   MCP_SERVER_URL     — e.g. https://vamoos-mcp-server.ianball99.workers.dev/mcp

const MODEL = "claude-sonnet-4-5";

const SYSTEM = `You are a friendly interviewer. The user is planning a travel trip.
Your aim is to proactively capture details of the trip and load it into Vamoos using the tools available to you.
You need to capture overview trip details and as much detail of the itinerary as possible.
Then create a day by day itinerary document as HTML and upload it.

Do not hallucinate:
Base your itinerary items ONLY on information provided by the user chat or uploads. Only include information you are 100% sure is correct.
Add helpful details like flight times from flight numbers, addresses for hotels and car hire locations, but only from web sources that you are 100% sure are correct.
Never guess or invent a vamoos_id. Only use a vamoos_id that has been returned by a call to get_itinerary, list_itineraries, or create_itinerary, or that the user has explicitly provided. If you do not yet have the vamoos_id, call get_itinerary first.

Core behaviour:
- Be warm, conversational, and professional.
- Ask one question at a time.
- Keep questions short and easy to answer.
- Avoid overwhelming the traveller.
- Confirm key details.
- Be proactive to ensure all data is captured or confirm that it is 'not known'.
- Prompt the user to upload documents that may have relevant details or to cut and paste material that contains details.
- Extract relevant material from uploads or pasted material.
- When the user mentions a date without specifying the year (e.g. "1st April", "1/4", "April 1st"), always assume the current calendar year. Never use a past year unless the user explicitly states one.

Interview flow - follow this structure:
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

Step 1 - Create a trip in Vamoos using the create_itinerary tool:
  - departure_date (required)
  - return_date (required)
  - reference_code: generate a short 10-character descriptor (e.g. SmithRome25)
  - field1: trip title
  - field3: location (optional)

Step 2 - Call upload_created_html_itinerary_document with the following fields:
  - reference_code and vamoos_id from the trip you just created
  - departure_date and return_date
  - document_name: ALWAYS use "Trip Summary" — this is a fixed name used for every trip regardless of title
  - html_content: the full itinerary written as a complete HTML document

The server uploads the HTML file directly - you do NOT need to ask the user for any file attachment.

Write the html_content as a complete HTML document:
- Keep it concise — a 1 to 2 page summary. Do not write long prose. Use bullet points and short entries.
- Include <!DOCTYPE html>, <html>, <head> (with <meta charset="utf-8"> and a <style> block), and <body> tags
- Use <h1> for the main title
- Use <h2> for day/section headings
- Use <strong> for emphasis
- Use <ul> and <li> for bullet points
- Use <p> for paragraphs
- Plain straight quotes and apostrophes only
- Do NOT use markdown — write proper HTML

Example structure (expand with actual content):
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Italy Trip - April 2025</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 13px; line-height: 1.6; margin: 40px; background: transparent; color: #fff; }
    h1 { font-size: 20px; margin-bottom: 8px; }
    h2 { font-size: 15px; margin-top: 24px; border-bottom: 1px solid #555; padding-bottom: 4px; }
    ul { margin: 0 0 8px; padding-left: 20px; }
    li { margin-bottom: 3px; }
    p { margin: 0 0 8px; }
  </style>
</head>
<body>
  <h1>Italy Trip - April 2025</h1>
  <p>Travel dates: 1 Apr 2025 - 10 Apr 2025</p>
  <h2>Day 1 - 1 April 2025</h2>
  <p>Depart London Heathrow on BA123 at 09:00. Arrive Rome FCO at 13:00.</p>
  <ul>
    <li><strong>Hotel:</strong> Hotel Artemide, Via Nazionale 22, Rome. Check-in from 15:00. Booking ref: ART2025.</li>
  </ul>
</body>
</html>

Step 3 - If the user has attached an image to use as a background, call upload_background_image with the trip metadata: reference_code, vamoos_id, departure_date, return_date. Do NOT ask the user for a filename or try to read/encode the image — the file is handled automatically by the system.

Step 4 - Confirm to the user that the trip has been created and all uploads are complete.

Modifying an existing trip:
When the user asks you to add or change anything on an existing trip — flights, accommodation, locations, activities, travellers, or any other data — always do both of the following:
1. Call the relevant Vamoos tool(s) to make the change (e.g. add_flight_to_itinerary, add_location_to_itinerary, add_person_to_itinerary).
2. Immediately after, re-generate the complete day-by-day HTML itinerary and call upload_created_html_itinerary_document to replace the existing summary:
   - Use document_name: "Trip Summary" (fixed name, same for every trip regardless of title)
   - The HTML must include a <h2> section for EVERY day from departure_date to return_date — never skip days
   - Include all current trip data (use the data returned by the Vamoos tool, or call get_itinerary first if you need the latest full data)
   - Days with nothing booked still need a day heading and a "No details yet" note

Never leave the HTML summary out of date after modifying trip data.

File upload rules — follow these at all times, not just during the upload workflow:

- BACKGROUND IMAGE: When the user attaches an image and wants it as a trip background, call upload_background_image with the trip metadata only (reference_code, vamoos_id, departure_date, return_date). You do NOT need to pass image data — the application picks up the attached file automatically when you call the tool. If you have the trip details, call the tool immediately. If not, ask for the reference code, call get_itinerary, then call upload_background_image. Never refuse or say you cannot process the image.

- GPX FILE: When the user attaches a .gpx file, call upload_gpx_and_attach_to_itinerary with trip metadata. File handling is automatic.

- POI: When the user wants to add a point of interest to a trip, call add_poi_and_attach_to_itinerary with the trip metadata, POI name, and coordinates.

- LOCATION (standalone): Only call add_location_to_itinerary when adding a location WITHOUT a POI (e.g. a city stopover the trip passes through). POI tools already add a location automatically alongside each POI, so do NOT call this after adding a POI. Use web_search to find coordinates if not provided.

- FLIGHT: When the user mentions a flight (e.g. "BA733 from LHR to JFK on 1 April"), call add_flight_to_itinerary. Only the reference_code is needed to identify the trip — vamoos_id and dates are fetched automatically. Split carrier code and flight number if given together (e.g. "BA733" → carrier_code="BA", flight_number=733). Airports should be IATA codes — use web_search to look them up if not provided by the user. The date is the local departure date at the departure airport (YYYY-MM-DD).

- PERSON: When the user wants to add a person (traveller/passenger) to a trip, call add_person_to_itinerary with the reference_code, name, and email. Only the reference_code is needed to identify the trip — other trip fields are fetched automatically. If email is not provided, ask for it before calling the tool.

- DOCUMENT: When the user attaches a document to add to a trip, call upload_document with trip metadata and a document_name. File handling is automatic.`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UPLOAD_TOOLS = new Set(["upload_background_image", "upload_document", "upload_gpx_and_attach_to_itinerary"]);

const TOOLS = [
  // Anthropic built-in web search — executed server-side, no external API key needed
  {
    type: "web_search_20250305",
    name: "web_search",
  },
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
    description: "Upload a background image to a Vamoos itinerary. When you call this tool, the application automatically takes the image the user has attached and uploads it to Vamoos. You do not need to include or encode the image — only provide the trip metadata fields below. IMPORTANT: Do not attempt to pass image data to this tool. Simply call it with the trip metadata. The application automatically detects the user's attached image and handles the upload when this tool is called.",
    input_schema: {
      type: "object",
      properties: {
        reference_code: { type: "string", description: "Reference code of the itinerary" },
        vamoos_id: { type: "number", description: "The vamoos_id of the itinerary" },
        departure_date: { type: "string", description: "Departure date (YYYY-MM-DD)" },
        return_date: { type: "string", description: "Return date (YYYY-MM-DD)" },
      },
      required: ["reference_code", "vamoos_id", "departure_date", "return_date"],
    },
  },
  {
    name: "upload_created_html_itinerary_document",
    description: "ALWAYS use this tool when YOU (the assistant) are generating or writing any document content to attach to a Vamoos trip — for example itineraries, welcome letters, or information packs. Write the full document as HTML. The server uploads it as a .html file and attaches it to the trip automatically. Do NOT use upload_document for AI-generated content.",
    input_schema: {
      type: "object",
      properties: {
        reference_code: { type: "string", description: "Reference code (Passcode) of the itinerary" },
        vamoos_id: { type: "number", description: "The vamoos_id of the itinerary" },
        departure_date: { type: "string", description: "Departure date (YYYY-MM-DD)" },
        return_date: { type: "string", description: "Return date (YYYY-MM-DD)" },
        document_name: { type: "string", description: "Display name shown in the Vamoos app. ALWAYS use 'Trip Summary' — this is a fixed name for every trip, regardless of trip title." },
        html_content: { type: "string", description: "The full document written as HTML. Write a complete HTML document with <html>, <head> (including <style>), and <body> tags." },
      },
      required: ["reference_code", "vamoos_id", "departure_date", "return_date", "document_name", "html_content"],
    },
  },
  {
    name: "upload_gpx_and_attach_to_itinerary",
    description: "Upload a GPX track file to Vamoos as a Point of Interest (POI) and attach it to a trip. The track will appear on the map in the Vamoos app. Use this when the user has attached a .gpx file. Do NOT supply gpx_content — the file is uploaded directly from the attachment.",
    input_schema: {
      type: "object",
      properties: {
        reference_code: { type: "string", description: "Reference code (Passcode) of the itinerary" },
        vamoos_id: { type: "number", description: "The vamoos_id of the itinerary" },
        departure_date: { type: "string", description: "Departure date (YYYY-MM-DD)" },
        return_date: { type: "string", description: "Return date (YYYY-MM-DD)" },
      },
      required: ["reference_code", "vamoos_id", "departure_date", "return_date"],
    },
  },
  {
    name: "add_poi_and_attach_to_itinerary",
    description: "Add a Point of Interest (POI) to Vamoos and attach it to a trip. The POI will appear on the map in the Vamoos app. Use this when the user wants to add a named location/POI to a trip.",
    input_schema: {
      type: "object",
      properties: {
        reference_code: { type: "string", description: "Reference code (Passcode) of the itinerary" },
        vamoos_id: { type: "number", description: "The vamoos_id of the itinerary" },
        departure_date: { type: "string", description: "Departure date (YYYY-MM-DD)" },
        return_date: { type: "string", description: "Return date (YYYY-MM-DD)" },
        name: { type: "string", description: "Display name for the POI" },
        latitude: { type: "string", description: "Latitude of the POI (e.g. \"48.8566\")" },
        longitude: { type: "string", description: "Longitude of the POI (e.g. \"2.3522\")" },
      },
      required: ["reference_code", "vamoos_id", "departure_date", "return_date", "name", "latitude", "longitude"],
    },
  },
  {
    name: "add_location_to_itinerary",
    description: "Add a location to a Vamoos trip. Locations define geographic areas for the trip — any Vamoos POIs within the radius of a location will automatically appear for that trip. Locations also appear on the trip map in a separate tab from POIs. Only reference_code is needed to identify the trip. Existing locations are preserved. Use web_search to find coordinates if not provided.",
    input_schema: {
      type: "object",
      properties: {
        reference_code: { type: "string", description: "Reference code (Passcode) of the itinerary" },
        name: { type: "string", description: "Display name for the location (e.g. 'Rome', 'Heathrow Airport')" },
        latitude: { type: "string", description: "Latitude (e.g. '41.9028')" },
        longitude: { type: "string", description: "Longitude (e.g. '12.4964')" },
        description: { type: "string", description: "Optional description shown in the app" },
        icon_id: { type: "number", description: "Optional icon ID" },
      },
      required: ["reference_code", "name", "latitude", "longitude"],
    },
  },
  {
    name: "add_flight_to_itinerary",
    description: "Look up a flight by carrier code, flight number, airports and date, then attach it to a Vamoos trip. Only the reference_code is needed to identify the trip — vamoos_id, departure_date and return_date are fetched automatically. Carrier code and flight number may be given together (e.g. 'BA733') — split before calling: carrier_code='BA', flight_number=733. Use web_search to look up IATA airport codes if not provided. Existing flights on the trip are preserved.",
    input_schema: {
      type: "object",
      properties: {
        reference_code: { type: "string", description: "Reference code (Passcode) of the itinerary" },
        carrier_code: { type: "string", description: "Airline IATA (e.g. BA) or ICAO (e.g. BAW) code — letters only, no digits" },
        flight_number: { type: "number", description: "Flight number — digits only, no carrier prefix (e.g. 733 for BA733)" },
        departure_airport: { type: "string", description: "IATA (e.g. LHR) or ICAO code of departure airport" },
        arrival_airport: { type: "string", description: "IATA (e.g. JFK) or ICAO code of arrival airport" },
        date: { type: "string", description: "Date of flight departure (local time at departure airport), YYYY-MM-DD" },
      },
      required: ["reference_code", "carrier_code", "flight_number", "departure_airport", "arrival_airport", "date"],
    },
  },
  {
    name: "add_person_to_itinerary",
    description: "Add a person (traveller/passenger) to a Vamoos itinerary by name and email. Only the reference_code is needed to identify the trip — other trip fields are fetched automatically. Existing travellers are preserved. Duplicate emails (case-insensitive) are skipped.",
    input_schema: {
      type: "object",
      properties: {
        reference_code: { type: "string", description: "Reference code (Passcode) of the itinerary" },
        name: { type: "string", description: "Full name of the traveller (e.g. 'Ian Ball')" },
        email: { type: "string", description: "Email address of the traveller" },
      },
      required: ["reference_code", "name", "email"],
    },
  },
  {
    name: "upload_document",
    description: "Upload a user-supplied file to a Vamoos itinerary. Use this tool ONLY when the user has provided a file (base64 encoded) or raw HTML to upload — NOT when you are writing the document content yourself. For AI-generated documents use upload_created_html_itinerary_document instead.",
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
    "anthropic-beta": "web-search-2025-03-05",
  };

  // If resuming after a client-side upload or MCP call, inject the tool result(s)
  const currentMessages = resumeToolResult
    ? [...messages, { role: "user", content: Array.isArray(resumeToolResult) ? resumeToolResult : [resumeToolResult] }]
    : [...messages];

  try {
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

    // Final response — no tool calls
    if (data.stop_reason !== "tool_use") {
      const text = (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
      // Return the full conversation state so the client can use it as apiHistory
      const finalConversationState = [...currentMessages, { role: "assistant", content: data.content }];
      return {
        statusCode: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
        body: JSON.stringify({ text, conversationState: finalConversationState }),
      };
    }

    // Add assistant message to conversation state
    const nextMessages = [...currentMessages, { role: "assistant", content: data.content }];

    // Check for upload tools — hand back to client for direct binary upload
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
          conversationState: nextMessages,
        }),
      };
    }

    // MCP / other tools — return to client to execute via mcp-tool function
    // Skip web_search blocks (handled server-side by Anthropic)
    const mcpBlocks = data.content.filter(
      (b) => b.type === "tool_use" && b.name !== "web_search" && b.type !== "web_search_20250305"
    );

    return {
      statusCode: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({
        pendingMcpCalls: mcpBlocks.map((b) => ({ id: b.id, name: b.name, input: b.input })),
        conversationState: nextMessages,
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: e.message }),
    };
  }
};
