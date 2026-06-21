// pages/EncodePage.jsx — Securepixel image encoder → .pxm
import { useState, useRef, useCallback } from "react";
import { RESOLUTIONS, autoDetect, fitDimensions } from "../core/dimensions";
import { encodePxm }                             from "../core/pxm";
import { formatBytes, downloadBuffer, drawImageToCanvas } from "../core/fileUtils";
import ProgressBar from "../components/ProgressBar";
import Btn         from "../components/Btn";

const pill = (active, accent = "#00e5ff") => ({
  padding: "4px 13px", borderRadius: 6, fontSize: 11, cursor: "pointer",
  fontFamily: "monospace", transition: "all 0.15s",
  border:     active ? `1px solid ${accent}` : "1px solid #1e2433",
  background: active ? (accent === "#00e5ff" ? "#001a20" : "#1a0020") : "transparent",
  color:      active ? accent : "#3a5a6a",
});

const infoBox = (bg, border, color) => ({
  fontFamily: "monospace", fontSize: 11, padding: "9px 13px",
  borderRadius: 8, marginBottom: 12, background: bg,
  border: `1px solid ${border}`, color,
});

// Windows sometimes returns empty MIME type — check extension as fallback
const IMAGE_EXTS = /\.(jpe?g|png|webp|gif|bmp|tiff?|avif|svg|ico)$/i;
function isImageFile(f) {
  return f.type.startsWith("image/") || IMAGE_EXTS.test(f.name);
}

// Auto-enable alpha only for formats that actually support transparency
const ALPHA_TYPES  = ["image/png", "image/webp", "image/gif", "image/avif"];
const ALPHA_EXTS   = /\.(png|webp|gif|avif)$/i;
function mightHaveAlpha(f) {
  return ALPHA_TYPES.includes(f.type) || ALPHA_EXTS.test(f.name);
}

export default function EncodePage() {
  const [file,      setFile]      = useState(null);
  const [mode,      setMode]      = useState("auto");
  const [manualRes, setManualRes] = useState(RESOLUTIONS[3]);
  const [keepAlpha, setKeepAlpha] = useState(false);
  const [status,    setStatus]    = useState("idle"); // idle | encoding | done | error
  const [progress,  setProgress]  = useState(0);
  const [eta,       setEta]       = useState(null);
  const [result,    setResult]    = useState(null);
  const [errMsg,    setErrMsg]    = useState("");
  const [dragOver,  setDragOver]  = useState(false);
  const abortRef     = useRef(null);
  const fileInputRef = useRef(null);

  // ── Load image ──────────────────────────────────────────────────────────────
  const loadFile = (f) => {
    if (!f) return;
    if (!isImageFile(f)) {
      setErrMsg("Please select an image file (JPG, PNG, WEBP, GIF, BMP…)");
      return;
    }
    setErrMsg("");
    const reader = new FileReader();
    reader.onerror = () => setErrMsg("Failed to read file — try again.");
    reader.onload  = (ev) => {
      const img = new Image();
      img.onerror = () => setErrMsg("Could not decode image — file may be corrupted.");
      img.onload  = () => {
        setKeepAlpha(mightHaveAlpha(f));
        setFile({
          dataUrl: ev.target.result,
          name:    f.name,
          nativeW: img.naturalWidth,
          nativeH: img.naturalHeight,
          type:    f.type || "image/unknown",
        });
        setStatus("idle");
        setResult(null);
        setProgress(0);
        setErrMsg("");
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(f);
  };

  // ── Target dimensions ───────────────────────────────────────────────────────
  const getTargetDims = useCallback(() => {
    if (!file) return null;
    if (mode === "auto") {
      const { finalW, finalH } = autoDetect(file.nativeW, file.nativeH);
      return { w: finalW, h: finalH };
    }
    return fitDimensions(file.nativeW, file.nativeH, manualRes.w, manualRes.h);
  }, [file, mode, manualRes]);

  // ── Encode ──────────────────────────────────────────────────────────────────
  const handleEncode = useCallback(() => {
    if (!file || status === "encoding") return;
    const dims = getTargetDims();
    if (!dims) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setStatus("encoding");
    setProgress(0);
    setEta(null);
    setResult(null);
    setErrMsg("");

    const img = new Image();
    img.onerror = () => { setStatus("error"); setErrMsg("Failed to load image for encoding."); };
    img.onload  = () => {
      let imageData;
      try {
        imageData = drawImageToCanvas(img, dims.w, dims.h);
      } catch (e) {
        setStatus("error");
        setErrMsg(`Canvas error: ${e.message}`);
        return;
      }
      encodePxm({
        imageData,
        w: dims.w,
        h: dims.h,
        hasAlpha: keepAlpha,
        signal: ctrl.signal,
        onProgress: (pct, etaSec) => { setProgress(pct); setEta(etaSec); },
        onDone: (buffer) => {
          setStatus("done");
          setResult({
            buffer,
            w: dims.w,
            h: dims.h,
            baseName: file.name.replace(/\.[^.]+$/, ""),
            hasAlpha: keepAlpha,
          });
        },
        onError: (err) => {
          if (!ctrl.signal.aborted) { setStatus("error"); setErrMsg(err.message); }
        },
      });
    };
    img.src = file.dataUrl;
  }, [file, status, keepAlpha, getTargetDims]);

  const handleCancel = () => {
    abortRef.current?.abort();
    setStatus("idle");
    setProgress(0);
    setEta(null);
  };

  const dims         = getTargetDims();
  const bpp          = keepAlpha ? 4 : 3;
  const estSize      = dims ? formatBytes(dims.w * dims.h * bpp + 16) : "";
  const wouldUpscale = dims && file && (dims.w > file.nativeW || dims.h > file.nativeH);

  return (
    // ── fix: width:100% so content fills the page, not just maxWidth box ──
    <div style={{ padding: "24px 20px", maxWidth: 580, width: "100%" }}>

      <div style={{ color: "#3a5a6a", fontSize: 11, fontFamily: "monospace", marginBottom: 14 }}>
        ── IMAGE → .pxm ENCODER ──
      </div>

      {/* Drop zone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); loadFile(e.dataTransfer.files[0]); }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        style={{
          border:       dragOver ? "1px solid #00e5ff" : file ? "1px solid #2a3a5a" : "1px dashed #2a3a5a",
          borderRadius: 10,
          overflow:     "hidden",
          background:   dragOver ? "#001a20" : "#0d1120",
          cursor:       "pointer",
          marginBottom: 16,
          minHeight:    80,
          display:      "flex",
          flexDirection:"column",
          alignItems:   "center",
          justifyContent: "center",
          transition:   "border-color 0.15s, background 0.15s",
        }}>
        {file ? (
          <>
            <img
              src={file.dataUrl}
              alt="preview"
              style={{ width: "100%", display: "block", maxHeight: 300, objectFit: "contain", background: "#050810" }}
            />
            <div style={{ padding: "8px 14px", fontFamily: "monospace", fontSize: 11, color: "#5a7a9a", width: "100%", borderTop: "1px solid #1a2433" }}>
              {file.name} · {file.nativeW}×{file.nativeH} px
            </div>
          </>
        ) : (
          <div style={{ color: "#3a5a6a", fontSize: 12, fontFamily: "monospace", padding: 28, textAlign: "center" }}>
            drop image here · or click to choose<br />
            <span style={{ color: "#2a3a5a", fontSize: 10 }}>JPG · PNG · WEBP · GIF · BMP</span>
          </div>
        )}
      </div>

      {/* Hidden file input — accept all images */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp,.tiff,.avif"
        style={{ display: "none" }}
        onChange={(e) => loadFile(e.target.files[0])}
      />

      {/* Controls — only show when file loaded and not encoding */}
      {file && status !== "encoding" && (
        <>
          {/* Alpha toggle */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ color: "#3a5a6a", fontSize: 10, fontFamily: "monospace", marginBottom: 6 }}>CHANNELS</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => setKeepAlpha(false)} style={pill(!keepAlpha)}>
                RGB <span style={{ opacity: 0.6, fontSize: 10 }}>3 bytes/px</span>
              </button>
              <button onClick={() => setKeepAlpha(true)} style={pill(keepAlpha)}>
                RGBA <span style={{ opacity: 0.6, fontSize: 10 }}>4 bytes/px · keeps transparency</span>
              </button>
            </div>
            {keepAlpha && (
              <div style={{ fontFamily: "monospace", fontSize: 10, color: "#3a6a4a", marginTop: 6 }}>
                ✓ alpha preserved — transparent areas stay transparent
              </div>
            )}
          </div>

          {/* Resolution mode */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ color: "#3a5a6a", fontSize: 10, fontFamily: "monospace", marginBottom: 6 }}>RESOLUTION</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              {["auto", "manual"].map((m) => (
                <button key={m} onClick={() => setMode(m)} style={pill(mode === m)}>
                  {m === "auto" ? "⚡ Auto (smart)" : "🎛 Manual"}
                </button>
              ))}
            </div>

            {mode === "auto" && dims && (
              <div style={infoBox("#0a1820", "#1a3a4a", "#4a90a4")}>
                ⚡ auto-detected: <strong>{dims.w}×{dims.h}</strong> · ~{estSize}
                <br />
                <span style={{ color: "#3a6a7a" }}>
                  native {file.nativeW}×{file.nativeH} · no upscaling · aspect ratio preserved
                </span>
              </div>
            )}

            {mode === "manual" && (
              <>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  {RESOLUTIONS.map((r) => (
                    <button key={r.label} onClick={() => setManualRes(r)} style={pill(manualRes.label === r.label)}>
                      {r.label}
                    </button>
                  ))}
                </div>
                {dims && (
                  <div style={infoBox("#0a1020", "#1e2433", "#4a6a8a")}>
                    → encode at <strong>{dims.w}×{dims.h}</strong> · ~{estSize}
                    {wouldUpscale && (
                      <span style={{ color: "#ff9f43", marginLeft: 8 }}>⚠ upscaling — auto recommended</span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* Encoding progress */}
      {status === "encoding" && (
        <div style={{ marginBottom: 16 }}>
          <ProgressBar
            value={progress}
            label={`encoding → .pxm at ${dims?.w}×${dims?.h}…`}
            eta={eta}
            color="#00e5ff"
          />
          <div style={{ marginTop: 10 }}>
            <Btn onClick={handleCancel} accent="#ff5a5a">✕ cancel</Btn>
          </div>
        </div>
      )}

      {/* Encode button */}
      {file && status !== "encoding" && (
        <button onClick={handleEncode} style={{
          background:   "linear-gradient(135deg,#00bcd4,#7c4dff)",
          border:       "none",
          color:        "#fff",
          borderRadius: 10,
          padding:      "11px 26px",
          fontSize:     13,
          fontWeight:   600,
          cursor:       "pointer",
          fontFamily:   "monospace",
          marginBottom: 16,
        }}>
          Encode → .pxm
        </button>
      )}

      {/* Success */}
      {status === "done" && result && (
        <div style={{ background: "#0a1a10", border: "1px solid #1a4a2a", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ color: "#00e5a0", fontFamily: "monospace", fontSize: 12, marginBottom: 4 }}>✓ encoded</div>
          <div style={{ fontFamily: "monospace", fontSize: 11, color: "#3a6a5a", marginBottom: 12 }}>
            {result.w}×{result.h} · {(result.w * result.h).toLocaleString()} pixels
            {result.hasAlpha ? " · RGBA" : " · RGB"} · {formatBytes(result.buffer.byteLength)}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn accent="#00e5ff" onClick={() =>
              downloadBuffer(result.buffer, `${result.baseName}_${result.w}x${result.h}.pxm`)
            }>
              ↓ {result.baseName}_{result.w}x{result.h}.pxm
            </Btn>
            <Btn accent="#4a6a8a" onClick={() => {
              setStatus("idle"); setResult(null); setProgress(0); setFile(null);
            }}>
              encode another
            </Btn>
          </div>
        </div>
      )}

      {/* Error */}
      {errMsg && (
        <div style={{ color: "#ff5a5a", fontFamily: "monospace", fontSize: 11, marginTop: 8 }}>
          ✕ {errMsg}
        </div>
      )}
    </div>
  );
}