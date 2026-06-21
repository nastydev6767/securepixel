// pages/DecodePage.jsx — Securepixel decoder for .pxm and .pvm
import { useState, useRef, useEffect, useCallback } from "react";
import { decodePxm, peekPxmInfo } from "../core/pxm";
import { decodePvm, peekPvmInfo } from "../core/pvm";
import { formatBytes, formatTime, downloadImageAsPNG, renderPreview } from "../core/fileUtils";
import ProgressBar from "../components/ProgressBar";
import Btn         from "../components/Btn";

const PREVIEW_MAX = 420;

function detectFormat(buffer) {
  if (buffer.byteLength < 3) return "unknown";
  const b = new Uint8Array(buffer, 0, 3);
  if (b[0]===0x53 && b[1]===0x50 && b[2]===0x58) return "pxm"; // SPX
  if (b[0]===0x53 && b[1]===0x50 && b[2]===0x56) return "pvm"; // SPV
  return "unknown";
}

function FileBadge({ buffer, format }) {
  const pxm = format==="pxm" ? peekPxmInfo(buffer) : null;
  const pvm = format==="pvm" ? peekPvmInfo(buffer) : null;
  return (
    <div style={{ fontFamily:"monospace", fontSize:10, color:"#3a5a7a",
      padding:"5px 10px", background:"#0a1020", borderRadius:6, marginBottom:12, display:"inline-block" }}>
      {pxm && <>🔒 .pxm · {pxm.w}×{pxm.h} · {pxm.mode} · {formatBytes(buffer.byteLength)}</>}
      {pvm && <>🔒 .pvm · {pvm.w}×{pvm.h} · {pvm.fps}fps · {pvm.frameCount} frames · {formatTime(pvm.duration)} · {pvm.mode} · {formatBytes(buffer.byteLength)}</>}
    </div>
  );
}

// ── Image result ──────────────────────────────────────────────────────────────
function ImageResult({ buffer, baseName, onReset }) {
  const canvasRef = useRef(null);
  const [progress, setProgress] = useState(0);
  const [done,     setDone]     = useState(false);
  const [imgData,  setImgData]  = useState(null);
  const [dims,     setDims]     = useState(null);
  const [hasAlpha, setHasAlpha] = useState(false);
  const [err,      setErr]      = useState("");
  const abortRef = useRef(new AbortController());

  useEffect(() => {
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    decodePxm({
      buffer, signal,
      onProgress: setProgress,
      onDone: (imageData, w, h, alpha=false) => {
        setImgData(imageData); setDims({w,h}); setHasAlpha(!!alpha);
        renderPreview(imageData, w, h, canvasRef.current, PREVIEW_MAX);
        setDone(true);
      },
      onError: (e) => { if (!signal.aborted) setErr(e.message); },
    });
    return () => abortRef.current.abort();
  }, [buffer]);

  return (
    <div>
      <FileBadge buffer={buffer} format="pxm" />
      {!done && !err && <div style={{ marginBottom:12 }}><ProgressBar value={progress} label="reconstructing image…" color="#7c4dff" /></div>}
      {err && <div style={{ color:"#ff5a5a", fontFamily:"monospace", fontSize:11, marginBottom:10 }}>✕ {err}</div>}
      <canvas ref={canvasRef} style={{
        borderRadius:8, display:"block", width:"100%", border:"1px solid #1e2433",
        background: hasAlpha
          ? "repeating-conic-gradient(#1a1a2a 0% 25%,#0d0d1a 0% 50%) 0 0/16px 16px"
          : "#050810",
      }} />
      {done && dims && (
        <div style={{ marginTop:12 }}>
          <div style={{ fontFamily:"monospace", fontSize:11, color:"#6a7a9a", marginBottom:10 }}>
            {(dims.w*dims.h).toLocaleString()} pixels · {dims.w}×{dims.h}{hasAlpha?" · RGBA":" · RGB"} · {formatBytes(buffer.byteLength)}
          </div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            <Btn accent="#00e5ff" onClick={()=>downloadImageAsPNG(imgData,dims.w,dims.h,baseName)}>↓ PNG at {dims.w}×{dims.h}</Btn>
            <Btn accent="#4a6a8a" onClick={onReset}>decode another</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Video result ──────────────────────────────────────────────────────────────
function VideoResult({ buffer, baseName, onReset }) {
  const canvasRef       = useRef(null);
  const allFramesRef    = useRef([]);
  const playIntervalRef = useRef(null);
  const abortRef        = useRef({ aborted:false });
  const [progress, setProgress] = useState(0);
  const [done,     setDone]     = useState(false);
  const [meta,     setMeta]     = useState(null);
  const [frames,   setFrames]   = useState([]);
  const [playing,  setPlaying]  = useState(false);
  const [curFrame, setCurFrame] = useState(0);
  const [err,      setErr]      = useState("");

  useEffect(() => {
    abortRef.current = { aborted:false };
    allFramesRef.current = [];
    decodePvm({
      buffer, signal:abortRef.current,
      onProgress: setProgress,
      onFrame: (imageData, idx) => {
        allFramesRef.current.push(imageData);
        if (canvasRef.current && idx%15===0)
          renderPreview(imageData, imageData.width, imageData.height, canvasRef.current, PREVIEW_MAX);
      },
      onDone: (m) => {
        setMeta(m);
        const f=[...allFramesRef.current]; setFrames(f);
        const last=f[f.length-1];
        if (last && canvasRef.current) renderPreview(last,last.width,last.height,canvasRef.current,PREVIEW_MAX);
        setDone(true);
      },
      onError: (e) => { if (!abortRef.current.aborted) setErr(e.message); },
    });
    return () => { abortRef.current.aborted=true; clearInterval(playIntervalRef.current); };
  }, [buffer]);

  const startPlayback = useCallback(() => {
    if (!frames.length || !meta) return;
    setPlaying(true); let f=0;
    const ms = Math.max(16, Math.round(1000/meta.fps));
    playIntervalRef.current = setInterval(() => {
      const frame=frames[f];
      if (canvasRef.current && frame) renderPreview(frame,frame.width,frame.height,canvasRef.current,PREVIEW_MAX);
      setCurFrame(f); f++;
      if (f>=frames.length) { clearInterval(playIntervalRef.current); setPlaying(false); }
    }, ms);
  }, [frames, meta]);

  const stopPlayback = () => { clearInterval(playIntervalRef.current); setPlaying(false); };

  return (
    <div>
      <FileBadge buffer={buffer} format="pvm" />
      {!done && !err && <div style={{ marginBottom:12 }}><ProgressBar value={progress} label="decoding video frames…" color="#7c4dff" /></div>}
      {err && <div style={{ color:"#ff5a5a", fontFamily:"monospace", fontSize:11, marginBottom:10 }}>✕ {err}</div>}
      <canvas ref={canvasRef} style={{ borderRadius:8, display:"block", width:"100%", background:"#050810", border:"1px solid #1e2433" }} />
      {done && meta && (
        <div style={{ marginTop:12 }}>
          <div style={{ fontFamily:"monospace", fontSize:11, color:"#6a7a9a", marginBottom:10 }}>
            {meta.frameCount} frames · {meta.w}×{meta.h} · {meta.fps}fps{meta.hasAlpha?" · RGBA":" · RGB"} · {formatTime(meta.frameCount/meta.fps)} · {formatBytes(buffer.byteLength)}
          </div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:6 }}>
            {!playing
              ? <Btn accent="#00e5ff" onClick={startPlayback}>▶ play preview</Btn>
              : <Btn accent="#ff5a5a" onClick={stopPlayback}>⏹ stop</Btn>}
            <Btn accent="#4a6a8a" onClick={onReset}>decode another</Btn>
          </div>
          {playing && <div style={{ fontFamily:"monospace", fontSize:10, color:"#3a5a6a" }}>frame {curFrame+1} / {frames.length}</div>}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DecodePage() {
  const [buffer,   setBuffer]   = useState(null);
  const [format,   setFormat]   = useState(null);
  const [baseName, setBaseName] = useState("");
  const [errMsg,   setErrMsg]   = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleFile = (f) => {
    if (!f) return;
    setErrMsg(""); setBuffer(null); setFormat(null);
    setBaseName(f.name.replace(/\.[^.]+$/,""));
    const reader = new FileReader();
    reader.onerror = () => setErrMsg("Failed to read file.");
    reader.onload = (ev) => {
      const buf = ev.target.result;
      const fmt = detectFormat(buf);
      if (fmt==="unknown") { setErrMsg("Not a Securepixel file. Accepted: .pxm (image) · .pvm (video)"); return; }
      setBuffer(buf); setFormat(fmt);
    };
    reader.readAsArrayBuffer(f);
  };

  const reset = () => { setBuffer(null); setFormat(null); setBaseName(""); setErrMsg(""); };

  return (
    <div style={{ padding:"24px 20px", maxWidth:580 }}>
      <div style={{ color:"#3a5a6a", fontSize:11, fontFamily:"monospace", marginBottom:14 }}>
        ── DECODER ── .pxm (image) · .pvm (video)
      </div>

      {!buffer && (<>
        <div
          onClick={() => fileInputRef.current?.click()}
          onDrop={(e)=>{e.preventDefault();setDragOver(false);handleFile(e.dataTransfer.files[0]);}}
          onDragOver={(e)=>{e.preventDefault();setDragOver(true);}}
          onDragLeave={()=>setDragOver(false)}
          style={{
            border: dragOver?"1px solid #00e5ff":"1px dashed #2a3a5a",
            borderRadius:10, padding:36, textAlign:"center", cursor:"pointer",
            background:dragOver?"#001a20":"#0d1120", color:"#3a5a6a",
            fontSize:12, fontFamily:"monospace", marginBottom:16,
            transition:"border-color 0.15s, background 0.15s",
          }}>
          drop .pxm or .pvm file here · or click to open
          <br /><span style={{ color:"#2a3a5a", fontSize:10 }}>Securepixel format only</span>
        </div>
        <input ref={fileInputRef} type="file" accept=".pxm,.pvm"
          style={{ display:"none" }} onChange={(e)=>handleFile(e.target.files[0])} />
      </>)}

      {errMsg && (
        <div style={{ color:"#ff5a5a", fontFamily:"monospace", fontSize:11, marginBottom:12 }}>
          ✕ {errMsg}
          <button onClick={reset} style={{ background:"none", border:"none", color:"#4a6a8a", cursor:"pointer", fontFamily:"monospace", fontSize:11, marginLeft:12 }}>try again</button>
        </div>
      )}

      {buffer && format==="pxm" && <ImageResult key={baseName+"pxm"} buffer={buffer} baseName={baseName} onReset={reset} />}
      {buffer && format==="pvm" && <VideoResult key={baseName+"pvm"} buffer={buffer} baseName={baseName} onReset={reset} />}
    </div>
  );
}