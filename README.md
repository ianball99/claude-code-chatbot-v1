# VAMOOS Chatbot v2.3

A React-based AI chatbot interface for managing [Vamoos](https://www.vamoos.com) travel itineraries. Built with React + Vite, deployed on Netlify with serverless functions.

## Features

- **AI Chat Interface** — Claude-powered assistant for natural-language itinerary management
- **Itinerary Management** — create, view, and update Vamoos trips via chat
- **Trip Summary Documents** — generate styled HTML itinerary documents, preview them in-app, and save as PDF to Vamoos
- **Background Images** — AI-generated trip background images via Stability AI
- **File Uploads** — attach images, GPX tracks, and documents to itineraries
- **Trip Index** — per-user trip list persisted in Netlify Blobs
- **Split-Pane UI** — draggable divider between trip details and chat pane
- **Email Verification** — 6-digit OTP sent via email on each new browser; verification valid for 7 days per browser

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
| Email | Resend API |
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
        ├── fetch-document.js       # Proxy to fetch saved trip summary HTML
        ├── send-otp.js             # Generate and email 6-digit OTP via Resend
        ├── verify-otp.js           # Validate OTP; write browser verification record
        └── check-verification.js   # Check if browser+email is verified (7-day window)
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
| `RESEND_API_KEY` | Resend API key for sending OTP verification emails |
| `NETLIFY_SITE_ID` | Netlify site ID for Blobs access |
| `NETLIFY_BLOBS_TOKEN` | Netlify Blobs token for server-side storage access |

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
| `/` | `LoginPage` | Email input → OTP verification (skipped if browser already verified) |
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

#### `send-otp.js`
Generates a 6-digit OTP, stores it in Netlify Blobs (`otp-store`) with a 5-minute expiry, and emails it to the user via the Resend API. Rate-limited: rejects if a valid unexpired code already exists for that email.

#### `verify-otp.js`
Validates a submitted OTP against the stored record. On success, deletes the OTP and writes a browser verification record to Netlify Blobs (`browser-verifications`) keyed by `email:browserId`.

#### `check-verification.js`
Looks up a `browser-verifications` record for a given `email` + `browserId` pair. Returns `{ verified: true }` if the record exists and is less than 7 days old, otherwise `{ verified: false }`.

## Design Decisions

### Browser identity via localStorage UUID (not cookies)
A UUID is generated with `crypto.randomUUID()` on first visit and stored in localStorage as `vamoos_browser_id`. Cookies were considered but localStorage is simpler for a Netlify SPA with no server-side session management — no CSRF or SameSite complexity. Clearing localStorage or using a new browser generates a fresh UUID, which is the intended behaviour: a genuinely new browser context should require re-verification.

### Netlify Blobs for OTP and verification storage
The project already uses Netlify Blobs for trip-index, so adding two more stores (`otp-store`, `browser-verifications`) requires zero additional infrastructure. OTP records are short-lived and verification records are a single timestamp — neither needs relational queries, making key-value storage sufficient. Netlify Blobs has no native TTL, so expiry is enforced at read time in application code (`verify-otp.js` and `check-verification.js`) rather than at the storage layer.

### Resend for email delivery
Chosen for minimal setup: one REST API call, one env var (`RESEND_API_KEY`), no SDK needed. The shared `onboarding@resend.dev` sender was used initially but only delivers to the Resend account owner's email — arbitrary recipients require a verified sending domain. Domain `send.infoalchemy.co.uk` was verified in Resend and used as the from address (`noreply@send.infoalchemy.co.uk`). The free tier (3,000 emails/month) is sufficient for this use case.

### 5-minute OTP expiry
Short enough that an intercepted code is quickly worthless; long enough for a user on a slow connection to check their email and return to the app. Expiry is enforced server-side in `verify-otp.js` — the client has no ability to extend it.

### 7-day browser verification window
Balances security (periodic re-verification confirms ongoing email ownership) with convenience (not requiring an OTP on every visit). Checked server-side in `check-verification.js` on every protected route load via `AuthGuard`. Each browser is tracked independently — verifying on one device does not grant access on another.

### Rate-limiting on OTP send (429 response)
`send-otp.js` rejects a new request if a valid unexpired code already exists for that email, preventing accidental or deliberate email spam. The frontend treats a 429 as a soft signal rather than an error: it advances directly to step 2 (code entry) so the user can enter the code they already have in their inbox.

### Verification checked at two points in LoginPage
1. **On mount** — if `vamoos_user_email` and `vamoos_browser_id` are already in localStorage and still valid, the user is redirected to `/home` without ever seeing the login form.
2. **On email submit** — `check-verification` runs before `send-otp`, handling the case where a user signed out and re-enters the same email on an already-verified browser. Avoids sending an unnecessary OTP.

### OTP keyed by email; verification keyed by email:browserId
Only one valid OTP can exist per email at a time, so a single email key is correct. Verification records are per-browser, so the composite key `email:browserId` captures the specific combination without risk of collision across devices.

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

### Netlify Blobs Stores

| Store | Key format | Value | Purpose |
|-------|-----------|-------|---------|
| `trip-index` | `encodeURIComponent(email)` | `[{ refCode, title, ... }]` | Per-user trip list |
| `otp-store` | `encodeURIComponent(email)` | `{ code, expiresAt }` | Temporary OTP (5-min TTL) |
| `browser-verifications` | `encodeURIComponent(email):encodeURIComponent(browserId)` | `{ verifiedAt }` | Browser verification records (7-day validity) |

## Version History

### v2.3 (2026-04-01)
- Real email OTP verification per browser via Resend API
- 6-digit code sent to email, expires after 5 minutes
- Browser UUID (`vamoos_browser_id`) generated in localStorage on first visit
- Verification valid for 7 days per browser; prompts re-verification after expiry
- `AuthGuard` component wraps all protected routes — redirects to `/` if not verified
- `send-otp`, `verify-otp`, `check-verification` Netlify functions added
- Rate-limiting on OTP send (blocks resend while a valid code exists)

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
