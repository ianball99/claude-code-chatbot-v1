# VAMOOS Chatbot v2.2

A React-based AI chatbot interface for managing [Vamoos](https://www.vamoos.com) travel itineraries. Built with React + Vite, deployed on Netlify with serverless functions.

## Features

- **AI Chat Interface** — Claude-powered assistant for natural-language itinerary management
- **Itinerary Management** — create, view, and update Vamoos trips via chat
- **Trip Summary Documents** — generate styled HTML itinerary documents, preview them in-app, and save as PDF to Vamoos
- **Background Images** — AI-generated trip background images via Stability AI
- **File Uploads** — attach images, GPX tracks, and documents to itineraries
- **Trip Index** — per-user trip list persisted in Netlify Blobs
- **Split-Pane UI** — draggable divider between trip details and chat pane

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite 5, Tailwind CSS v4 |
| Routing | React Router v7 |
| Icons | Lucide React |
| Backend | Netlify Functions (Node 20) |
| AI | Anthropic Claude (claude-3-5-haiku) |
| MCP | Vamoos MCP Server (Cloudflare Workers) |
| Storage | Netlify Blobs |
| PDF | html2pdf.js (CDN) |
| Deployment | Netlify |

## Project Structure

```
claude-code-chatbot-v1/
├── index.html                      # App entry point (loads html2pdf.js CDN)
├── vite.config.js                  # Vite + Tailwind plugin config
├── netlify.toml                    # Build config, function directory, SPA redirect
├── src/
│   ├── main.jsx                    # React root mount
│   ├── App.jsx                     # BrowserRouter + route definitions
│   ├── index.css                   # Global styles, Tailwind theme tokens
│   ├── pages/
│   │   ├── LoginPage.jsx           # Email sign-in (step 1: email, step 2: OTP)
│   │   ├── VerifyPage.jsx          # Standalone OTP verification page
│   │   ├── HomePage.jsx            # Trip list dashboard
│   │   ├── TripPage.jsx            # Split-pane trip detail + AI chat
│   │   └── CreateTripPage.jsx      # Multi-step new trip creation form
│   └── components/
│       └── ChatPanel.jsx           # Full chat UI + MCP tool execution loop
└── netlify/
    └── functions/
        ├── chat.js                 # Claude API proxy + tool orchestration
        ├── mcp-tool.js             # MCP tool forwarding to Vamoos worker
        ├── trip-index.js           # Per-user trip list (Netlify Blobs)
        ├── format-trip.js          # AI-powered trip JSON → readable text
        ├── generate-trip-image.js  # Stability AI background image generation
        └── fetch-document.js       # Proxy to fetch saved trip summary HTML
```

## Local Development

### Prerequisites

- Node.js 20+
- Netlify CLI: `npm i -g netlify-cli`

### Environment Variables

Configure in your Netlify site dashboard under **Site settings → Environment variables**, or create a local `.env` file (never commit this):

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude |
| `STABILITY_API_KEY` | Stability AI key for background image generation |
| `VAMOOS_MCP_URL` | Vamoos MCP server base URL (Cloudflare Worker) |
| `VAMOOS_API_KEY` | Vamoos API authentication key |

### Running Locally

```bash
npm install
netlify dev
```

The app is available at `http://localhost:8888`. Netlify Dev proxies all `/.netlify/functions/*` requests automatically.

## Deployment

Pushes to `main` trigger automatic deploys via Netlify CI.

- **Build command:** `npm run build`
- **Publish directory:** `dist`
- **Node version:** 20
- **Functions directory:** `netlify/functions`

## Architecture

### Chat / MCP Tool Loop

```
ChatPanel (browser)
  │
  ├─ POST /chat  ──────────────────►  chat.js (Netlify Function)
  │   { messages }                        │
  │                                       ├─ Claude API (tool_use)
  │                                       │
  │◄── { pendingMcpCalls } ───────────────┘
  │
  ├─ POST /mcp-tool (per tool) ────►  mcp-tool.js → Vamoos MCP Worker
  │   { toolName, toolInput }                              │
  │◄── { result } ──────────────────────────────────────────┘
  │
  └─ POST /chat  ──────────────────►  chat.js (resume with tool results)
      { messages, resumeToolResult }         │
                                             └─ Claude API → final text reply
```

File uploads (images, PDFs, GPX) are handled **client-side** by `ChatPanel` via the Vamoos worker `/upload` endpoint, bypassing Netlify's function payload limit.

### Pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | `LoginPage` | Email input → OTP verification |
| `/verify` | `VerifyPage` | Standalone OTP page |
| `/home` | `HomePage` | Trip list dashboard |
| `/trip/:refCode` | `TripPage` | Split-pane trip detail + AI chat |
| `/create-trip` | `CreateTripPage` | New Vamoos itinerary creation form |

### Netlify Functions

#### `chat.js`
Proxies messages to the Anthropic Claude API with the full Vamoos MCP tool schema. Handles multi-turn tool-use loops and returns either:
- `{ pendingMcpCalls, conversationState }` — tools to execute client-side
- `{ pendingUpload, conversationState }` — a file upload to perform
- `{ text, conversationState }` — the final text reply

#### `mcp-tool.js`
Forwards a single MCP tool call to the Vamoos Cloudflare Worker. Authenticates with `VAMOOS_API_KEY`.

#### `trip-index.js`
Stores and retrieves a per-user JSON array of trips using Netlify Blobs. Supports `get` and `add` actions.

#### `format-trip.js`
Calls Claude to convert raw Vamoos itinerary JSON into a clean, human-readable text summary displayed in the Details tab.

#### `generate-trip-image.js`
Calls the Stability AI API to generate a landscape background image for a newly-created trip, returning base64 image data.

#### `fetch-document.js`
Proxies a GET request to a pre-signed S3 URL (from the Vamoos documents store), returning the raw HTML content of a saved trip summary document.

## Colour Palette

| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `#3d3d3d` | Page backgrounds |
| `--card` | `#4a4a4a` | Card / panel surfaces |
| `--sidebar` | `#5a5a5a` | Sidebar / secondary surfaces |
| `--border` | `#505050` | Dividers and outlines |
| `--primary` | `#f57c00` | Brand orange — buttons, accents, icons |
| `--muted-foreground` | `#c0c0c0` | Secondary text |
| `--foreground` | `#ffffff` | Primary text |

## Version History

### v2.2 (2026-03-31)
- Added comprehensive project documentation (this README)
- Login/verify buttons aligned to brand orange
- Version badge on login screen
- Trip count badge in HomePage dashboard header
- Orange left-accent highlight on trip card hover
- Antialiased font rendering and `::selection` colour in global CSS

### v2.1
- Trip summary document generation and PDF export
- Save summary back to Vamoos documents folder
- Draggable split-pane layout on TripPage
- `format-trip` function for readable trip details

### v2.0
- Full MCP tool orchestration loop in ChatPanel
- Background image generation on trip creation (Stability AI)
- Trip index per-user storage via Netlify Blobs
- `fetch-document` proxy for loading saved summaries

### v1.0
- Initial release: basic Claude chat interface with Vamoos MCP integration
