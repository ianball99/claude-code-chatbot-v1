import React, { useState, useRef, useEffect } from "react";
import { Settings, Send } from "lucide-react";

const CHAT_FN = "/.netlify/functions/chat";
const WORKER_URL_KEY = "vamoos_worker_url";
const DEFAULT_WORKER_URL = "https://vamoos-mcp-server.ianball99.workers.dev";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ThinkingDots() {
  return (
    <div className="flex gap-1.5 px-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-2 h-2 rounded-full bg-[#ff7c46]"
          style={{ animation: `bop 1.2s ease-in-out ${i * 0.2}s infinite` }}
        />
      ))}
    </div>
  );
}

function ToolCallCard({ tc }) {
  const [open, setOpen] = useState(false);
  const isErr =
    typeof tc.result === "string" &&
    (tc.result.startsWith("Error") || tc.result.startsWith("MCP error"));
  const isPending = tc.result === "uploading…";

  return (
    <div
      className="my-1.5 rounded-xl px-3 py-2"
      style={{
        background: "rgba(0,0,0,0.25)",
        border: `1px solid ${isErr ? "rgba(220,80,80,0.3)" : "rgba(255,124,70,0.25)"}`,
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-[#ff7c46] text-xs">⚙</span>
        <span className="font-mono text-[11px] text-[#ff7c46]">{tc.name}</span>
        <span
          className="ml-auto font-mono text-[9px] px-2 py-0.5 rounded-full"
          style={{
            color: isPending ? "#ff7c46" : isErr ? "#ef5350" : "#4caf50",
            background: isPending
              ? "rgba(255,124,70,0.1)"
              : isErr
              ? "rgba(220,80,80,0.1)"
              : "rgba(76,175,80,0.1)",
            border: `1px solid ${
              isPending
                ? "rgba(255,124,70,0.25)"
                : isErr
                ? "rgba(220,80,80,0.25)"
                : "rgba(76,175,80,0.25)"
            }`,
          }}
        >
          {isPending ? "⏳ uploading" : isErr ? "✗ error" : "✓ done"}
        </span>
      </div>
      {!isPending && (
        <>
          <button
            onClick={() => setOpen((o) => !o)}
            className="mt-1 text-[10px] font-mono text-white/30 bg-white/5 border border-white/10 rounded px-2.5 py-0.5 cursor-pointer"
          >
            {open ? "▲ hide" : "▼ details"}
          </button>
          {open && (
            <div className="mt-1.5 space-y-1">
              <pre className="p-2 rounded bg-black/40 text-[#7ec8a0] font-mono text-[10px] whitespace-pre-wrap break-all max-h-36 overflow-y-auto">
                {JSON.stringify(tc.input, null, 2)}
              </pre>
              <pre
                className="p-2 rounded bg-black/40 font-mono text-[10px] whitespace-pre-wrap break-all max-h-36 overflow-y-auto"
                style={{ color: isErr ? "#ef5350" : "rgba(255,255,255,0.5)" }}
              >
                {tc.result}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function renderWithBold(text) {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i} style={{ fontWeight: 600 }}>{part}</strong> : part
  );
}

function Bubble({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-1`}>
      {!isUser && (
        <img
          src="/vamoos-logo-transparent-white-v.png"
          alt="Vamoos"
          className="w-8 h-8 shrink-0 object-contain mr-2.5 mt-0.5"
        />
      )}
      <div
        className="max-w-[78%] rounded-2xl px-4 py-3"
        style={{
          background: isUser ? "#ff7c46" : "rgba(255,255,255,0.06)",
          borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
          border: isUser ? "none" : "1px solid rgba(255,255,255,0.1)",
        }}
      >
        {msg.images?.map((img, j) =>
          img.isGpx ? (
            <div key={j} className="text-xs text-white/60 mb-1.5">
              📍 {img.name}
            </div>
          ) : img.isImage ? (
            <img
              key={j}
              src={img.dataUrl}
              alt="attached"
              className="max-w-full rounded-lg mb-2 block"
            />
          ) : null
        )}
        {msg.toolCalls?.map((tc, j) => (
          <ToolCallCard key={j} tc={tc} />
        ))}
        {msg.text && (
          <div
            className="text-sm leading-relaxed whitespace-pre-wrap break-words"
            style={{
              color: isUser ? "#fff" : "rgba(255,255,255,0.88)",
              marginTop: msg.toolCalls?.length ? 8 : 0,
            }}
          >
            {renderWithBold(msg.text)}
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsPanel({ workerUrl, onSave, onClose }) {
  const [val, setVal] = useState(workerUrl);
  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[#2a2a2a] border border-[#ff7c46]/25 rounded-2xl p-7 w-full max-w-sm shadow-2xl">
        <div className="flex justify-between items-center mb-5 text-white/80 text-lg">
          Settings
          <button onClick={onClose} className="text-white/40 text-base bg-transparent border-none cursor-pointer">
            ✕
          </button>
        </div>
        <div className="mb-4">
          <div className="font-mono text-[10px] text-white/40 uppercase tracking-widest mb-1.5">
            Worker URL
          </div>
          <input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder="https://vamoos-mcp-server.ianball99.workers.dev"
            className="w-full px-3 py-2 bg-white/5 border border-white/12 rounded-lg font-mono text-xs text-white/80 outline-none"
          />
          <div className="font-mono text-[10px] text-white/30 mt-1">
            Used for binary file uploads (background images, documents).
          </div>
        </div>
        <button
          onClick={() => { onSave(val.trim()); onClose(); }}
          className="w-full py-2.5 bg-[#ff7c46] text-white border-none rounded-lg font-mono text-sm font-medium cursor-pointer"
        >
          Save
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main ChatPanel component
// ---------------------------------------------------------------------------

export default function ChatPanel({
  initialSystemContext,
  onHtmlGenerated,
  onTripMutated,
  onRefCodeKnown,
  onPersonAdded,
}) {
  const [messages, setMessages] = useState([]);
  const [apiHistory, setApiHistory] = useState([]);
  const [input, setInput] = useState("");
  const [pendingImages, setPending] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [workerUrl, setWorkerUrl] = useState(
    () => localStorage.getItem(WORKER_URL_KEY) || DEFAULT_WORKER_URL
  );
  const bottomRef = useRef(null);
  const taRef = useRef(null);
  const imagesRef = useRef([]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const saveWorkerUrl = (url) => {
    setWorkerUrl(url);
    localStorage.setItem(WORKER_URL_KEY, url);
  };

  const htmlToPdfBlob = (html) =>
    new Promise((resolve, reject) => {
      const container = document.createElement("div");
      container.innerHTML = html;
      container.style.position = "fixed";
      container.style.top = "0";
      container.style.left = "0";
      container.style.width = "794px";
      container.style.zIndex = "-9999";
      container.style.opacity = "0";
      container.style.pointerEvents = "none";
      document.body.appendChild(container);
      window.html2pdf()
        .set({
          margin: 10,
          filename: "itinerary.pdf",
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          html2canvas: { scale: 2, useCORS: true, logging: false },
        })
        .from(container)
        .outputPdf("blob")
        .then((blob) => { document.body.removeChild(container); resolve(blob); })
        .catch((err) => { document.body.removeChild(container); reject(err); });
    });

  const executeUpload = async (pendingUpload, images) => {
    const { input: inp, name } = pendingUpload;
    let blob, filename, contentType;

    if (inp.html_content) {
      onHtmlGenerated?.(inp.html_content);
      try {
        blob = await htmlToPdfBlob(inp.html_content);
      } catch (e) {
        return { ok: false, error: `PDF generation failed: ${e.message}` };
      }
      filename = inp.filename || "itinerary.pdf";
      contentType = "application/pdf";
    } else if (name === "upload_gpx_and_attach_to_itinerary") {
      const img = images.find((i) => i.isGpx);
      if (!img) return { ok: false, error: "No GPX file attached" };
      blob = new Blob([img.textContent], { type: "application/gpx+xml" });
      filename = img.name;
      contentType = "application/gpx+xml";
    } else {
      const img = images[0];
      if (!img) return { ok: false, error: "No file attached" };
      const byteString = atob(img.base64);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
      blob = new Blob([ab], { type: img.type });
      filename = inp.filename || img.name;
      contentType = inp.content_type || img.type;
    }

    const fd = new FormData();
    fd.append("file", blob, filename);
    fd.append("reference_id", inp.reference_code || "");
    fd.append("image_filename", filename);
    fd.append("image_content_type", contentType);
    if (name === "upload_document") {
      fd.append("upload_type", "document");
      fd.append("document_name", inp.document_name || "Document");
    } else if (name === "upload_gpx_and_attach_to_itinerary") {
      fd.append("upload_type", "gpx");
    }

    try {
      const res = await fetch(`${workerUrl}/upload`, { method: "POST", body: fd });
      const data = await res.json();
      return { ok: data.ok, s3url: data.s3url, message: data.message, error: data.error, data };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };

  const callChat = async (messages, resumeToolResult) => {
    const body = resumeToolResult ? { messages, resumeToolResult } : { messages };
    const res = await fetch(CHAT_FN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      let msg;
      try { msg = JSON.parse(text).error; } catch { msg = `HTTP ${res.status}`; }
      throw new Error(msg);
    }
    return res.json();
  };

  const callMcpTool = async (toolName, toolInput) => {
    const res = await fetch("/.netlify/functions/mcp-tool", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolName, toolInput }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `MCP HTTP ${res.status}`);
    return data.result;
  };

  const extractRefCode = (toolName, result) => {
    if (toolName !== "create_itinerary") return null;
    try {
      const parsed = JSON.parse(result);
      return parsed.reference_code || parsed.referenceCode || parsed.ref_code || null;
    } catch {
      const match = result.match(/"?reference_?code"?\s*[=:]\s*"?([A-Za-z0-9_-]+)"?/i);
      return match ? match[1] : null;
    }
  };

  const runLoop = async (history, resumeToolResult, images, accumulatedToolCalls = []) => {
    const data = await callChat(history, resumeToolResult);

    if (data.pendingMcpCalls) {
      const { pendingMcpCalls, conversationState } = data;

      const inProgressCards = pendingMcpCalls.map((tc) => ({
        name: tc.name, input: tc.input, result: "uploading…",
      }));
      setMessages((prev) => [...prev, { role: "assistant", text: null, toolCalls: inProgressCards }]);
      setStatusText("Calling tools…");

      const results = await Promise.all(
        pendingMcpCalls.map((tc) => callMcpTool(tc.name, tc.input).catch((e) => `Error: ${e.message}`))
      );

      setMessages((prev) => {
        const updated = [...prev];
        const last = { ...updated[updated.length - 1] };
        last.toolCalls = pendingMcpCalls.map((tc, i) => ({
          name: tc.name, input: tc.input, result: results[i],
        }));
        updated[updated.length - 1] = last;
        return updated;
      });

      pendingMcpCalls.forEach((tc, i) => {
        onTripMutated?.(tc.name, results[i]);
        const ref = extractRefCode(tc.name, results[i]);
        if (ref) onRefCodeKnown?.(ref);
        if (tc.name === "upload_created_html_itinerary_document" && tc.input?.html_content) {
          onHtmlGenerated?.(tc.input.html_content);
        }
        if (tc.name === "add_person_to_itinerary" && tc.input?.email) {
          onPersonAdded?.(tc.input.email, tc.input.reference_code);
        }
      });

      const toolResults = pendingMcpCalls.map((tc, i) => ({
        type: "tool_result",
        tool_use_id: tc.id,
        content: results[i],
      }));

      const newToolCalls = pendingMcpCalls.map((tc, i) => ({
        name: tc.name, input: tc.input, result: results[i],
      }));
      setStatusText("Thinking…");
      await runLoop(conversationState, toolResults, images, [...accumulatedToolCalls, ...newToolCalls]);

    } else if (data.pendingUpload) {
      const { pendingUpload, conversationState } = data;

      setMessages((prev) => [...prev, {
        role: "assistant", text: null,
        toolCalls: [{ name: pendingUpload.name, input: pendingUpload.input, result: "uploading…" }],
      }]);
      setStatusText(pendingUpload.input?.html_content ? "Generating PDF…" : "Uploading file…");

      const uploadResult = await executeUpload(pendingUpload, images);
      const resultText = uploadResult.ok
        ? uploadResult.s3url
          ? `Upload successful. File stored at: ${uploadResult.s3url}`
          : `Upload successful. ${uploadResult.message || JSON.stringify(uploadResult.data)}`
        : `Upload failed: ${uploadResult.error || JSON.stringify(uploadResult.data)}`;

      setMessages((prev) => {
        const updated = [...prev];
        const last = { ...updated[updated.length - 1] };
        const tcs = [...last.toolCalls];
        tcs[tcs.length - 1] = { ...tcs[tcs.length - 1], result: resultText };
        last.toolCalls = tcs;
        updated[updated.length - 1] = last;
        return updated;
      });

      setStatusText("Thinking…");
      const uploadToolResult = {
        type: "tool_result",
        tool_use_id: pendingUpload.toolUseId,
        content: resultText,
      };
      await runLoop(conversationState, [uploadToolResult], images, [
        ...accumulatedToolCalls,
        { name: pendingUpload.name, input: pendingUpload.input, result: resultText },
      ]);

    } else {
      const { text: replyText, conversationState } = data;
      setApiHistory(conversationState || [...history, { role: "assistant", content: replyText }]);
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && last?.toolCalls && !last?.text && replyText) {
          return [...prev.slice(0, -1), { ...last, text: replyText }];
        }
        return [...prev, {
          role: "assistant", text: replyText,
          toolCalls: accumulatedToolCalls.length ? accumulatedToolCalls : undefined,
        }];
      });
    }
  };

  const send = async (text) => {
    const userText = (text || input).trim();
    const images = [...pendingImages];
    if (!userText && images.length === 0) return;
    if (loading) return;

    setInput("");
    setPending([]);
    imagesRef.current = images;
    if (taRef.current) taRef.current.style.height = "auto";

    const contentParts = [];
    const contextPrefix =
      initialSystemContext && apiHistory.length === 0
        ? `[Context: ${initialSystemContext}]\n\n`
        : "";

    images.forEach((img) => {
      if (img.isGpx) {
        contentParts.push({ type: "text", text: `[GPX file attached: ${img.name}]` });
      } else if (img.isImage) {
        contentParts.push({ type: "image", source: { type: "base64", media_type: img.type, data: img.base64 } });
      } else {
        contentParts.push({ type: "text", text: `[Attached file: ${img.name} (${img.type})]` });
      }
    });
    if (contextPrefix || userText) {
      contentParts.push({ type: "text", text: contextPrefix + userText });
    }

    setMessages((prev) => [...prev, { role: "user", text: userText, images }]);
    setLoading(true);
    setStatusText("Thinking…");

    const newHistory = [
      ...apiHistory,
      {
        role: "user",
        content:
          contentParts.length === 1 && images.length === 0
            ? contextPrefix + userText
            : contentParts,
      },
    ];

    try {
      await runLoop(newHistory, null, images);
    } catch (e) {
      setMessages((prev) => [...prev, { role: "assistant", text: `⚠ ${e.message}` }]);
    } finally {
      setLoading(false);
      setStatusText("");
    }
  };

  const handleFiles = (files) => {
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      if (file.name.endsWith(".gpx")) {
        reader.onload = (e) => {
          setPending((p) => [...p, { textContent: e.target.result, type: "application/gpx+xml", name: file.name, isGpx: true }]);
        };
        reader.readAsText(file);
      } else {
        reader.onload = (e) => {
          const dataUrl = e.target.result;
          setPending((p) => [...p, {
            dataUrl, base64: dataUrl.split(",")[1],
            type: file.type, name: file.name, isImage: file.type.startsWith("image/"),
          }]);
        };
        reader.readAsDataURL(file);
      }
    });
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full bg-[#3d3d3d] overflow-hidden">
      <style>{`
        @keyframes bop {
          0%,80%,100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>

      {showSettings && (
        <SettingsPanel
          workerUrl={workerUrl}
          onSave={saveWorkerUrl}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#505050] shrink-0">
        <div className="flex items-center gap-2">
          <img src="/vamoos-logo-transparent-white-v.png" alt="Vamoos" className="w-7 h-7 object-contain" />
          <span className="text-white/80 text-sm">Vamoos AI Assistant</span>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="text-white/40 hover:text-[#ff7c46] transition-colors"
        >
          <Settings size={15} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-white/70 text-lg mb-1">How can I help you?</div>
            <div className="text-white/30 text-sm italic">
              Manage Vamoos itineraries — create, update, and upload files.
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <Bubble key={i} msg={msg} />
            ))}
            {loading && (
              <div className="flex items-center gap-2 pl-10">
                <ThinkingDots />
                <span className="font-mono text-[11px] text-white/30">{statusText}</span>
              </div>
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* File previews */}
      {pendingImages.length > 0 && (
        <div className="flex gap-2 px-4 pb-2 flex-wrap shrink-0">
          {pendingImages.map((img, i) => (
            <div
              key={i}
              className="relative w-14 h-14 rounded-lg overflow-hidden border border-[#ff7c46]/30 bg-black/30 flex items-center justify-center"
            >
              {img.isImage ? (
                <img src={img.dataUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="text-center p-1">
                  <div className="text-lg">📄</div>
                  <div className="text-[8px] text-white/60 break-all leading-tight">
                    {img.name.split(".").pop().toUpperCase()}
                  </div>
                </div>
              )}
              <button
                onClick={() => setPending((p) => p.filter((_, j) => j !== i))}
                className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/70 border-none rounded-full text-white text-[9px] flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div className="shrink-0 px-4 pb-4 pt-2 border-t border-[#505050]">
        <div className="flex items-end gap-2 bg-[#4a4a4a] border border-[#606060] rounded-full px-4 py-2 focus-within:border-[#ff7c46] transition-colors">
          <label className="text-white/40 hover:text-[#ff7c46] cursor-pointer text-xl shrink-0 transition-colors">
            ＋
            <input
              type="file"
              accept="image/*,application/pdf,.gpx"
              multiple
              className="absolute w-px h-px opacity-0"
              onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
            />
          </label>
          <textarea
            ref={taRef}
            rows={1}
            placeholder="Type a message…"
            value={input}
            disabled={loading}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            className="flex-1 bg-transparent border-none outline-none text-white/88 text-sm leading-relaxed resize-none min-h-6 max-h-28"
            style={{ color: "rgba(255,255,255,0.88)" }}
          />
          <button
            onClick={() => send()}
            disabled={(!input.trim() && pendingImages.length === 0) || loading}
            className="w-8 h-8 rounded-full bg-[#ff7c46] text-white border-none flex items-center justify-center cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            <Send size={14} />
          </button>
        </div>
        <div className="text-center font-mono text-[10px] text-white/20 mt-1.5">
          shift+enter for new line · attach image or file to upload
        </div>
      </div>
    </div>
  );
}
