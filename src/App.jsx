import React, { useState, useRef, useEffect } from "react";

const CHAT_FN = "/.netlify/functions/chat";
const WORKER_URL_KEY = "vamoos_worker_url";
const DEFAULT_WORKER_URL = "https://vamoos-mcp-server.ianball99.workers.dev";

const css = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400&family=DM+Mono:wght@300;400&display=swap');
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; background: #0d0d0d; }
@keyframes bop { 0%,80%,100%{transform:translateY(0);opacity:0.4} 40%{transform:translateY(-5px);opacity:1} }
@keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
@keyframes float { 0%,100%{transform:translateY(0) rotate(-1deg)} 50%{transform:translateY(-8px) rotate(1deg)} }
@keyframes shimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-thumb { background: rgba(212,175,55,0.2); border-radius: 2px; }
textarea::-webkit-scrollbar { display: none; }
input::-webkit-scrollbar { display: none; }
`;

const SUGGESTIONS = [
  "List my itineraries",
  "Create a new trip SmithRome25 departing 2025-09-01 returning 2025-09-10",
  "What tools do you have available?",
  "Get itinerary ibtest4",
];

function ThinkingDots() {
  return (
    <div style={{ display: "flex", gap: 5 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{
          width: 7, height: 7, borderRadius: "50%", background: "#d4af37",
          animation: `bop 1.2s ease-in-out ${i * 0.2}s infinite`,
        }} />
      ))}
    </div>
  );
}

function ToolCallCard({ tc }) {
  const [open, setOpen] = useState(false);
  const isErr = typeof tc.result === "string" && (tc.result.startsWith("Error") || tc.result.startsWith("MCP error"));
  const isPending = tc.result === "uploading…";
  return (
    <div style={{
      margin: "6px 0", padding: "8px 12px", borderRadius: 10,
      background: "rgba(0,0,0,0.4)",
      border: `1px solid ${isErr ? "rgba(220,80,80,0.25)" : "rgba(212,175,55,0.2)"}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, color: "#d4af37" }}>⚙</span>
        <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#d4af37" }}>{tc.name}</span>
        <span style={{
          marginLeft: "auto", fontFamily: "'DM Mono',monospace", fontSize: 9,
          color: isPending ? "#d4af37" : isErr ? "#ef5350" : "#4caf50",
          padding: "2px 8px", borderRadius: 10,
          background: isPending ? "rgba(212,175,55,0.1)" : isErr ? "rgba(220,80,80,0.1)" : "rgba(76,175,80,0.1)",
          border: `1px solid ${isPending ? "rgba(212,175,55,0.2)" : isErr ? "rgba(220,80,80,0.2)" : "rgba(76,175,80,0.2)"}`,
        }}>
          {isPending ? "⏳ uploading" : isErr ? "✗ error" : "✓ done"}
        </span>
      </div>
      {!isPending && (
        <>
          <button onClick={() => setOpen((o) => !o)} style={{
            marginTop: 5, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 6, padding: "2px 10px", color: "rgba(255,255,255,0.3)",
            fontFamily: "'DM Mono',monospace", fontSize: 10, cursor: "pointer",
          }}>
            {open ? "▲ hide" : "▼ details"}
          </button>
          {open && (
            <div style={{ marginTop: 6 }}>
              <pre style={{
                padding: 8, borderRadius: 6, background: "rgba(0,0,0,0.5)",
                color: "#7ec8a0", fontFamily: "'DM Mono',monospace", fontSize: 10,
                whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 150, overflowY: "auto",
              }}>
                {JSON.stringify(tc.input, null, 2)}
              </pre>
              <pre style={{
                marginTop: 4, padding: 8, borderRadius: 6, background: "rgba(0,0,0,0.5)",
                color: isErr ? "#ef5350" : "rgba(255,255,255,0.45)",
                fontFamily: "'DM Mono',monospace", fontSize: 10,
                whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 150, overflowY: "auto",
              }}>
                {tc.result}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Bubble({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom: 4 }}>
      {!isUser && (
        <div style={{
          width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
          background: "linear-gradient(135deg,#d4af37,#a07d20)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, marginRight: 10, marginTop: 2,
        }}>✈</div>
      )}
      <div style={{
        maxWidth: "78%",
        background: isUser ? "linear-gradient(135deg,#d4af37,#b8961e)" : "rgba(255,255,255,0.04)",
        borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
        padding: "12px 16px",
        border: isUser ? "none" : "1px solid rgba(255,255,255,0.08)",
      }}>
        {msg.images?.map((img, j) => (
          <img key={j} src={img.dataUrl} alt="attached"
            style={{ maxWidth: "100%", borderRadius: 8, marginBottom: 8, display: "block" }} />
        ))}
        {msg.toolCalls?.map((tc, j) => <ToolCallCard key={j} tc={tc} />)}
        {msg.text && (
          <div style={{
            color: isUser ? "#1a1208" : "rgba(255,255,255,0.88)",
            fontSize: 14, lineHeight: 1.7, fontFamily: "Georgia,serif",
            whiteSpace: "pre-wrap", wordBreak: "break-word",
            marginTop: msg.toolCalls?.length ? 8 : 0,
          }}>
            {msg.text}
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsPanel({ workerUrl, onSave, onClose }) {
  const [val, setVal] = useState(workerUrl);
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem",
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "#1a1714", border: "1px solid rgba(212,175,55,0.25)", borderRadius: 14,
        padding: "1.75rem", width: "100%", maxWidth: 420,
        boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
      }}>
        <div style={{
          fontFamily: "'Cormorant Garamond',serif", fontSize: "1.1rem",
          color: "rgba(255,255,255,0.85)", marginBottom: "1.25rem",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          Settings
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: "1.1rem", cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ marginBottom: "1rem" }}>
          <div style={{ fontFamily: "'DM Mono',monospace", fontSize: "0.7rem", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.4rem" }}>
            Worker URL
          </div>
          <input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder="https://vamoos-mcp-server.ianball99.workers.dev"
            style={{
              width: "100%", padding: "0.6rem 0.8rem",
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 7, fontFamily: "'DM Mono',monospace", fontSize: "0.75rem",
              color: "rgba(255,255,255,0.8)", outline: "none",
            }}
          />
          <div style={{ fontFamily: "'DM Mono',monospace", fontSize: "0.65rem", color: "rgba(255,255,255,0.3)", marginTop: "0.35rem" }}>
            Used for binary file uploads (background images, documents).
          </div>
        </div>
        <button onClick={() => { onSave(val.trim()); onClose(); }} style={{
          width: "100%", padding: "0.65rem",
          background: "linear-gradient(135deg,#d4af37,#a07d20)", color: "#1a1208",
          border: "none", borderRadius: 7, fontFamily: "'DM Mono',monospace",
          fontSize: "0.82rem", fontWeight: 500, cursor: "pointer",
        }}>
          Save
        </button>
      </div>
    </div>
  );
}

export default function App() {
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
  // Keep a ref to the latest images so executeUpload can access them after state clears
  const imagesRef = useRef([]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const saveWorkerUrl = (url) => {
    setWorkerUrl(url);
    localStorage.setItem(WORKER_URL_KEY, url);
  };

  // Convert an HTML string to a PDF blob using html2pdf.js (loaded via CDN in index.html)
  const htmlToPdfBlob = (html) =>
    new Promise((resolve, reject) => {
      const container = document.createElement("div");
      container.innerHTML = html;
      // Must set an explicit width — without it html2canvas renders a zero-width element → blank PDF
      container.style.position = "fixed";
      container.style.top = "0";
      container.style.left = "0";
      container.style.width = "794px"; // A4 at 96 dpi
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

  // Execute a binary upload via multipart/form-data to the Worker /upload endpoint.
  // If pendingUpload.input.html_content is set, converts HTML→PDF first (no file attachment needed).
  const executeUpload = async (pendingUpload, images) => {
    const { input: inp, name } = pendingUpload;

    let blob, filename, contentType;

    if (inp.html_content) {
      // HTML→PDF path — no user file attachment required
      try {
        blob = await htmlToPdfBlob(inp.html_content);
      } catch (e) {
        return { ok: false, error: `PDF generation failed: ${e.message}` };
      }
      filename = inp.filename || "itinerary.pdf";
      contentType = "application/pdf";
    } else {
      // File attachment path
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
    fd.append("vamoos_id", String(inp.vamoos_id || 0));
    fd.append("departure_date", inp.departure_date || "");
    fd.append("return_date", inp.return_date || "");
    fd.append("image_filename", filename);
    fd.append("image_content_type", contentType);
    if (name === "upload_document") {
      fd.append("upload_type", "document");
      fd.append("document_name", inp.document_name || "Document");
    }

    try {
      const res = await fetch(`${workerUrl}/upload`, { method: "POST", body: fd });
      const data = await res.json();
      return { ok: data.ok, s3url: data.s3url, data };
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
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
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
    images.forEach((img) => {
      if (img.isImage) {
        contentParts.push({ type: "image", source: { type: "base64", media_type: img.type, data: img.base64 } });
      } else {
        contentParts.push({ type: "text", text: `[Attached file: ${img.name} (${img.type})]` });
      }
    });
    if (userText) contentParts.push({ type: "text", text: userText });

    setMessages((prev) => [...prev, { role: "user", text: userText, images }]);
    setLoading(true);
    setStatusText("Thinking…");

    const newHistory = [
      ...apiHistory,
      { role: "user", content: contentParts.length === 1 && images.length === 0 ? userText : contentParts },
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

  // Handles the multi-turn loop including client-side uploads
  const runLoop = async (history, resumeToolResult, images) => {
    const data = await callChat(history, resumeToolResult);

    if (data.pendingUpload) {
      const { pendingUpload, conversationState, toolCalls } = data;

      // Show the tool call card as "uploading"
      setMessages((prev) => [...prev, {
        role: "assistant",
        text: null,
        toolCalls: [...(toolCalls || []), { name: pendingUpload.name, input: pendingUpload.input, result: "uploading…" }],
      }]);
      setStatusText(pendingUpload.input?.html_content ? "Generating PDF…" : "Uploading file…");

      const uploadResult = await executeUpload(pendingUpload, images);
      const resultText = uploadResult.ok
        ? `Upload successful. File stored at: ${uploadResult.s3url}`
        : `Upload failed: ${uploadResult.error || JSON.stringify(uploadResult.data)}`;

      // Update the tool call card with the result
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.toolCalls) {
          const tcs = [...last.toolCalls];
          tcs[tcs.length - 1] = { ...tcs[tcs.length - 1], result: resultText };
          updated[updated.length - 1] = { ...last, toolCalls: tcs };
        }
        return updated;
      });

      setStatusText("Thinking…");

      // Resume the conversation with the upload result
      await runLoop(
        conversationState,
        { tool_use_id: pendingUpload.toolUseId, content: resultText },
        images
      );
    } else {
      // Normal final response
      const { text: replyText, toolCalls } = data;
      // When resuming after a client-side upload, `history` ends with the assistant's tool_use message.
      // The tool_result must be inserted between that and the final reply so the history stays valid.
      const fullHistory = resumeToolResult
        ? [
            ...history,
            { role: "user", content: [{ type: "tool_result", tool_use_id: resumeToolResult.tool_use_id, content: resumeToolResult.content }] },
            { role: "assistant", content: replyText },
          ]
        : [...history, { role: "assistant", content: replyText }];
      setApiHistory(fullHistory);
      setMessages((prev) => {
        // If the last message was a tool call card (from pendingUpload), append text to it
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && last?.toolCalls && !last?.text && replyText) {
          return [...prev.slice(0, -1), { ...last, text: replyText }];
        }
        return [...prev, { role: "assistant", text: replyText, toolCalls }];
      });
    }
  };

  const handleFiles = (files) => {
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        setPending((p) => [...p, { dataUrl, base64: dataUrl.split(",")[1], type: file.type, name: file.name, isImage: file.type.startsWith("image/") }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const isEmpty = messages.length === 0;

  return (
    <>
      <style>{css}</style>
      {showSettings && (
        <SettingsPanel
          workerUrl={workerUrl}
          onSave={saveWorkerUrl}
          onClose={() => setShowSettings(false)}
        />
      )}

      <div style={{
        minHeight: "100vh", background: "#0d0d0d",
        backgroundImage: "radial-gradient(ellipse 80% 40% at 50% -5%,rgba(212,175,55,0.07) 0%,transparent 70%)",
        display: "flex", flexDirection: "column", alignItems: "center",
      }}>
        {/* Header */}
        <div style={{
          width: "100%", maxWidth: 760, padding: "28px 24px 0",
          display: "flex", alignItems: "center", gap: 14,
          animation: "fadeUp 0.5s ease both",
        }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12, flexShrink: 0,
            background: "linear-gradient(135deg,#d4af37,#8b5e1a)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, boxShadow: "0 4px 20px rgba(212,175,55,0.3)",
          }}>✈</div>
          <div>
            <div style={{
              fontFamily: "'Cormorant Garamond',serif", fontWeight: 300,
              fontSize: 22, color: "rgba(255,255,255,0.9)", letterSpacing: "0.03em",
            }}>
              Vamoos{" "}
              <span style={{
                background: "linear-gradient(90deg,#d4af37,#f0c840,#d4af37)",
                backgroundSize: "200% auto", WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent", animation: "shimmer 3s linear infinite",
              }}>AI Assistant</span>
            </div>
            <div style={{
              fontFamily: "'DM Mono',monospace", fontSize: 10, marginTop: 2,
              color: "rgba(255,255,255,0.28)", letterSpacing: "0.1em", textTransform: "uppercase",
            }}>
              claude-sonnet-4 · mcp tools
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => setShowSettings(true)} style={{
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8, padding: "4px 12px", color: "rgba(255,255,255,0.4)",
              fontFamily: "'DM Mono',monospace", fontSize: 10, cursor: "pointer",
            }}>⚙ settings</button>
            <div style={{
              background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.22)",
              borderRadius: 20, padding: "4px 14px",
              display: "flex", alignItems: "center", gap: 7,
              fontFamily: "'DM Mono',monospace", fontSize: 10, color: "#d4af37",
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4caf50", boxShadow: "0 0 6px #4caf50" }} />
              live
            </div>
          </div>
        </div>

        {/* Chat area */}
        <div style={{
          width: "100%", maxWidth: 760, flex: 1,
          padding: "24px 24px 0", display: "flex", flexDirection: "column", gap: 16,
        }}>
          {isEmpty ? (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", paddingTop: 50, animation: "fadeUp 0.7s ease both",
            }}>
              <div style={{
                fontSize: 56, marginBottom: 20,
                animation: "float 4s ease-in-out infinite",
                filter: "drop-shadow(0 8px 24px rgba(212,175,55,0.35))",
              }}>🌍</div>
              <div style={{
                fontFamily: "'Cormorant Garamond',serif", fontWeight: 300,
                fontSize: 27, color: "rgba(255,255,255,0.8)", marginBottom: 8,
              }}>
                How can I help you today?
              </div>
              <div style={{
                fontSize: 13, fontStyle: "italic", color: "rgba(255,255,255,0.3)",
                marginBottom: 28, textAlign: "center", fontFamily: "Georgia,serif",
              }}>
                Manage Vamoos itineraries — create, update, and upload files.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", maxWidth: 520 }}>
                {SUGGESTIONS.map((s, i) => (
                  <button key={i} onClick={() => send(s)} style={{
                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 20, padding: "8px 16px", fontFamily: "Georgia,serif",
                    fontStyle: "italic", fontSize: 13, color: "rgba(255,255,255,0.5)",
                    cursor: "pointer", transition: "all 0.2s",
                  }}
                    onMouseEnter={(e) => Object.assign(e.target.style, { background: "rgba(212,175,55,0.1)", borderColor: "rgba(212,175,55,0.35)", color: "#d4af37" })}
                    onMouseLeave={(e) => Object.assign(e.target.style, { background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" })}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {messages.map((msg, i) => <Bubble key={i} msg={msg} />)}
              {loading && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, paddingLeft: 42 }}>
                  <ThinkingDots />
                  <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                    {statusText}
                  </span>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input bar */}
        <div style={{
          width: "100%", maxWidth: 760, padding: "16px 24px 28px",
          background: "linear-gradient(to top,#0d0d0d 75%,transparent)",
          position: "sticky", bottom: 0,
        }}>
          {!isEmpty && (
            <div style={{
              height: 1, marginBottom: 14,
              background: "linear-gradient(90deg,transparent,rgba(212,175,55,0.18),transparent)",
            }} />
          )}

          {pendingImages.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              {pendingImages.map((img, i) => (
                <div key={i} style={{
                  position: "relative", width: 56, height: 56,
                  borderRadius: 8, overflow: "hidden",
                  border: "1px solid rgba(212,175,55,0.3)",
                  background: "rgba(0,0,0,0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {img.isImage
                    ? <img src={img.dataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <div style={{ textAlign: "center", padding: 4 }}>
                        <div style={{ fontSize: 20 }}>📄</div>
                        <div style={{ fontSize: 8, color: "rgba(255,255,255,0.6)", wordBreak: "break-all", lineHeight: 1.2 }}>
                          {img.name.split(".").pop().toUpperCase()}
                        </div>
                      </div>
                  }
                  <button onClick={() => setPending((p) => p.filter((_, j) => j !== i))} style={{
                    position: "absolute", top: 2, right: 2, width: 16, height: 16,
                    background: "rgba(0,0,0,0.7)", border: "none", borderRadius: "50%",
                    color: "#fff", fontSize: 9, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>✕</button>
                </div>
              ))}
            </div>
          )}

          <div style={{
            display: "flex", alignItems: "flex-end", gap: 10,
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 24, padding: "12px 12px 12px 20px",
          }}>
            <label style={{
              color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: "1.2rem",
              flexShrink: 0, position: "relative",
            }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#d4af37")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}
            >
              ＋
              <input type="file" accept="image/*,application/pdf" multiple
                style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
                onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
              />
            </label>

            <textarea ref={taRef} rows={1}
              placeholder="Ask about your itineraries, or attach an image or document to upload…"
              value={input} disabled={loading}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              style={{
                flex: 1, background: "none", border: "none", outline: "none",
                color: "rgba(255,255,255,0.85)", fontFamily: "Georgia,serif",
                fontSize: 14, lineHeight: 1.5, resize: "none", minHeight: 24, maxHeight: 120,
              }}
            />

            <button onClick={() => send()}
              disabled={(!input.trim() && pendingImages.length === 0) || loading}
              style={{
                width: 38, height: 38, borderRadius: "50%", border: "none",
                background: "linear-gradient(135deg,#d4af37,#a07d20)",
                color: "#1a1208", fontSize: 17,
                cursor: (!input.trim() && pendingImages.length === 0) || loading ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                boxShadow: "0 2px 12px rgba(212,175,55,0.3)",
                opacity: (!input.trim() && pendingImages.length === 0) || loading ? 0.4 : 1,
                transition: "opacity 0.2s",
              }}>↑</button>
          </div>

          <div style={{
            fontFamily: "'DM Mono',monospace", fontSize: 10,
            color: "rgba(255,255,255,0.2)", textAlign: "center", marginTop: 8,
          }}>
            shift+enter for new line · attach image then ask to upload it
          </div>
        </div>
      </div>
    </>
  );
}
