import React, { useState, useRef, useEffect } from "react";

const CHAT_FN = "/.netlify/functions/chat";

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
        <div
          key={i}
          style={{
            width: 7, height: 7, borderRadius: "50%", background: "#d4af37",
            animation: `bop 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

function ToolCallCard({ tc }) {
  const [open, setOpen] = useState(false);
  const isErr = typeof tc.result === "string" && (tc.result.startsWith("Error") || tc.result.startsWith("MCP error"));
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
          color: isErr ? "#ef5350" : "#4caf50", padding: "2px 8px", borderRadius: 10,
          background: isErr ? "rgba(220,80,80,0.1)" : "rgba(76,175,80,0.1)",
          border: `1px solid ${isErr ? "rgba(220,80,80,0.2)" : "rgba(76,175,80,0.2)"}`,
        }}>
          {isErr ? "✗ error" : "✓ done"}
        </span>
      </div>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          marginTop: 5, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 6, padding: "2px 10px", color: "rgba(255,255,255,0.3)",
          fontFamily: "'DM Mono',monospace", fontSize: 10, cursor: "pointer",
        }}
      >
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
          <img
            key={j} src={img.dataUrl} alt="attached"
            style={{ maxWidth: "100%", borderRadius: 8, marginBottom: 8, display: "block" }}
          />
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

export default function App() {
  const [messages, setMessages] = useState([]);
  const [apiHistory, setApiHistory] = useState([]);
  const [input, setInput] = useState("");
  const [pendingImages, setPending] = useState([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const taRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text) => {
    const userText = (text || input).trim();
    const images = [...pendingImages];
    if (!userText && images.length === 0) return;
    if (loading) return;

    setInput("");
    setPending([]);
    if (taRef.current) taRef.current.style.height = "auto";

    // Build API message — images as base64 vision blocks, then text
    const contentParts = [];
    images.forEach((img) =>
      contentParts.push({ type: "image", source: { type: "base64", media_type: img.type, data: img.base64 } })
    );
    if (userText) contentParts.push({ type: "text", text: userText });

    setMessages((prev) => [...prev, { role: "user", text: userText, images }]);
    setLoading(true);

    const newHistory = [
      ...apiHistory,
      { role: "user", content: contentParts.length === 1 && images.length === 0 ? userText : contentParts },
    ];

    try {
      const res = await fetch(CHAT_FN, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newHistory }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      const { text: replyText, toolCalls } = data;
      setApiHistory([...newHistory, { role: "assistant", content: replyText }]);
      setMessages((prev) => [...prev, { role: "assistant", text: replyText, toolCalls }]);
    } catch (e) {
      setMessages((prev) => [...prev, { role: "assistant", text: `⚠ ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleFiles = (files) => {
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        setPending((p) => [...p, { dataUrl, base64: dataUrl.split(",")[1], type: file.type, name: file.name }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const isEmpty = messages.length === 0;

  return (
    <>
      <style>{css}</style>
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
          <div style={{ marginLeft: "auto" }}>
            <div style={{
              background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.22)",
              borderRadius: 20, padding: "4px 14px",
              display: "flex", alignItems: "center", gap: 7,
              fontFamily: "'DM Mono',monospace", fontSize: 10, color: "#d4af37",
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: "50%",
                background: "#4caf50", boxShadow: "0 0 6px #4caf50",
              }} />
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
                I can manage your Vamoos itineraries — create, update, and upload files.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", maxWidth: 520 }}>
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => send(s)}
                    style={{
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
                  <span style={{
                    fontFamily: "'DM Mono',monospace", fontSize: 11,
                    color: "rgba(255,255,255,0.3)",
                  }}>
                    Thinking…
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

          {/* Image thumbnails */}
          {pendingImages.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              {pendingImages.map((img, i) => (
                <div key={i} style={{
                  position: "relative", width: 56, height: 56,
                  borderRadius: 8, overflow: "hidden",
                  border: "1px solid rgba(212,175,55,0.3)",
                }}>
                  <img src={img.dataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <button
                    onClick={() => setPending((p) => p.filter((_, j) => j !== i))}
                    style={{
                      position: "absolute", top: 2, right: 2, width: 16, height: 16,
                      background: "rgba(0,0,0,0.7)", border: "none", borderRadius: "50%",
                      color: "#fff", fontSize: 9, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >✕</button>
                </div>
              ))}
            </div>
          )}

          <div style={{
            display: "flex", alignItems: "flex-end", gap: 10,
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 24, padding: "12px 12px 12px 20px",
          }}>
            {/* Image attach */}
            <label
              style={{ color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: "1.2rem", flexShrink: 0, position: "relative" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#d4af37")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}
            >
              ＋
              <input
                type="file" accept="image/*" multiple
                style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
                onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
              />
            </label>

            <textarea
              ref={taRef}
              rows={1}
              placeholder="Ask about your itineraries, or attach an image…"
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
              style={{
                flex: 1, background: "none", border: "none", outline: "none",
                color: "rgba(255,255,255,0.85)", fontFamily: "Georgia,serif",
                fontSize: 14, lineHeight: 1.5, resize: "none", minHeight: 24, maxHeight: 120,
              }}
            />

            <button
              onClick={() => send()}
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
              }}
            >↑</button>
          </div>

          <div style={{
            fontFamily: "'DM Mono',monospace", fontSize: 10,
            color: "rgba(255,255,255,0.2)", textAlign: "center", marginTop: 8,
          }}>
            shift+enter for new line · attach images for vision
          </div>
        </div>
      </div>
    </>
  );
}
