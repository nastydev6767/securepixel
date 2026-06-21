// pages/VideoPage.jsx — Securepixel video encoder → .pvm
import { useState, useRef, useCallback } from "react";
import { RESOLUTIONS, autoDetect, fitDimensions } from "../core/dimensions";
import { PvmEncoder }  from "../core/pvm";
import { formatBytes, formatTime, downloadBuffer } from "../core/fileUtils";
import ProgressBar from "../components/ProgressBar";
import Btn         from "../components/Btn";

const pill = (active, accent="#00e5ff") => ({
  padding:"4px 13px", borderRadius:6, fontSize:11, cursor:"pointer",
  fontFamily:"monospace", transition:"all 0.15s",
  border:     active ? `1px solid ${accent}` : "1px solid #1e2433",
  background: active ? "#001a20" : "transparent",
  color:      active ? accent : "#3a5a6a",
});
const infoBox = (bg,border,color) => ({
  fontFamily:"monospace", fontSize:11, padding:"9px 13px",
  borderRadius:8, marginBottom:12, background:bg, border:`1px solid ${border}`, color,
});

export default function VideoPage() {
  const [videoFile, setVideoFile] = useState(null);
  const [mode,      setMode]      = useState("auto");
  const [manualRes, setManualRes] = useState(RESOLUTIONS[2]);
  const [keepAlpha, setKeepAlpha] = useState(false);
  const [phase,     setPhase]     = useState("idle");
  const [capPct,    setCapPct]    = useState(0);
  const [compPct,   setCompPct]   = useState(0);
  const [captured,  setCaptured]  = useState(0);
  const [totalF,    setTotalF]    = useState(0);
  const [result,    setResult]    = useState(null);
  const [errMsg,    setErrMsg]    = useState("");
  const [dragOver,  setDragOver]  = useState(false);
  const canvasRef    = useRef(null);
  const fileInputRef = useRef(null);
  const abortRef     = useRef(false);

  const loadVideo = (f) => {
    if (!f) return;
    if (!f.type.startsWith("video/")) { setErrMsg("Please select a video file."); return; }
    setErrMsg("");
    if (videoFile?.url) URL.revokeObjectURL(videoFile.url);
    const url = URL.createObjectURL(f);
    const vid = document.createElement("video");
    vid.preload="metadata"; vid.muted=true; vid.src=url;
    vid.onerror = () => setErrMsg("Could not read video. Try MP4 or WebM.");
    vid.onloadedmetadata = () => {
      setVideoFile({ name:f.name, url, nativeW:vid.videoWidth, nativeH:vid.videoHeight, fps:30, duration:vid.duration });
      setPhase("idle"); setResult(null); setErrMsg("");
    };
  };

  const getTargetDims = useCallback(() => {
    if (!videoFile) return null;
    if (mode==="auto") { const { finalW, finalH } = autoDetect(videoFile.nativeW, videoFile.nativeH); return { w:finalW, h:finalH }; }
    return fitDimensions(videoFile.nativeW, videoFile.nativeH, manualRes.w, manualRes.h);
  }, [videoFile, mode, manualRes]);

  const handleEncode = useCallback(async () => {
    if (!videoFile || phase==="capturing" || phase==="compressing") return;
    const dims = getTargetDims(); if (!dims) return;
    abortRef.current=false;
    setPhase("capturing"); setCapPct(0); setCompPct(0); setCaptured(0); setResult(null); setErrMsg("");
    const { url, name, fps, duration } = videoFile;
    const { w, h } = dims;
    const frameInterval = 1/fps;
    setTotalF(Math.ceil(duration*fps));
    const canvas = canvasRef.current;
    canvas.width=w; canvas.height=h;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality="high";
    const vid = document.createElement("video");
    vid.muted=true; vid.src=url;
    try {
      await new Promise((res,rej) => { vid.oncanplay=res; vid.onerror=()=>rej(new Error("Video failed to load.")); vid.load(); });
    } catch(err) { setErrMsg(err.message); setPhase("error"); return; }
    if (abortRef.current) return;
    const encoder = new PvmEncoder(w, h, fps, { hasAlpha:keepAlpha, kfi:30 });
    let frameCount=0, t=0;
    while (t<=duration+frameInterval*0.5 && !abortRef.current) {
      vid.currentTime = Math.min(t, duration);
      await new Promise((res) => { vid.onseeked=res; });
      if (abortRef.current) break;
      ctx.drawImage(vid, 0, 0, w, h);
      encoder.addFrame(ctx.getImageData(0, 0, w, h));
      frameCount++;
      setCaptured(frameCount);
      setCapPct(Math.min(99, Math.round((t/duration)*100)));
      t += frameInterval;
      if (frameCount%5===0) await new Promise((res)=>setTimeout(res,0));
    }
    if (abortRef.current) { setPhase("idle"); encoder.dispose(); return; }
    setCapPct(100);
    setPhase("compressing");
    await new Promise((res)=>setTimeout(res,80));
    let buffer;
    try { buffer = encoder.finalize((pct)=>setCompPct(pct)); }
    catch(err) { setErrMsg(`Compression failed: ${err.message}`); setPhase("error"); encoder.dispose(); return; }
    encoder.dispose();
    setResult({ buffer, w, h, baseName:name.replace(/\.[^.]+$/,""), frameCount, hasAlpha:keepAlpha });
    setPhase("done");
  }, [videoFile, phase, keepAlpha, getTargetDims]);

  const handleCancel = () => { abortRef.current=true; setPhase("idle"); setCapPct(0); setCompPct(0); };

  const dims   = getTargetDims();
  const bpp    = keepAlpha ? 4 : 3;
  const estRaw = dims && videoFile ? formatBytes(dims.w*dims.h*bpp*Math.ceil(videoFile.duration*videoFile.fps)) : "";

  return (
    <div style={{ padding:"24px 20px", maxWidth:580 }}>
      <canvas ref={canvasRef} style={{ display:"none" }} aria-hidden="true" />
      <div style={{ color:"#3a5a6a", fontSize:11, fontFamily:"monospace", marginBottom:14 }}>
        ── VIDEO → .pvm ENCODER ── lossless · two-pass · delta compressed
      </div>

      {/* Drop zone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); loadVideo(e.dataTransfer.files[0]); }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        style={{
          border: dragOver?"1px solid #00e5ff":videoFile?"1px solid #2a3a5a":"1px dashed #2a3a5a",
          borderRadius:10, background:dragOver?"#001a20":"#0d1120",
          cursor:"pointer", marginBottom:16, minHeight:80,
          display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
          transition:"border-color 0.15s",
        }}>
        {videoFile ? (
          <div style={{ padding:"16px 18px", width:"100%" }}>
            <div style={{ color:"#e8eaf0", fontFamily:"monospace", fontSize:13, marginBottom:6 }}>🎬 {videoFile.name}</div>
            <div style={{ color:"#5a7a9a", fontFamily:"monospace", fontSize:11 }}>
              {videoFile.nativeW}×{videoFile.nativeH} · {videoFile.fps}fps · {formatTime(videoFile.duration)} · ~{Math.ceil(videoFile.duration*videoFile.fps)} frames
            </div>
          </div>
        ) : (
          <div style={{ color:"#3a5a6a", fontSize:12, fontFamily:"monospace", padding:28, textAlign:"center" }}>
            drop video here · or click to choose<br />
            <span style={{ color:"#2a3a5a", fontSize:10 }}>MP4 · WebM · MOV</span>
          </div>
        )}
      </div>
      <input ref={fileInputRef} type="file" accept="video/*" style={{ display:"none" }}
        onChange={(e)=>loadVideo(e.target.files[0])} />

      {videoFile && phase==="idle" && (<>
        {/* Alpha toggle */}
        <div style={{ marginBottom:14 }}>
          <div style={{ color:"#3a5a6a", fontSize:10, fontFamily:"monospace", marginBottom:6 }}>CHANNELS</div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={()=>setKeepAlpha(false)} style={pill(!keepAlpha)}>RGB <span style={{ opacity:0.6, fontSize:10 }}>3 bytes/px</span></button>
            <button onClick={()=>setKeepAlpha(true)}  style={pill(keepAlpha)}>RGBA <span style={{ opacity:0.6, fontSize:10 }}>4 bytes/px · transparency</span></button>
          </div>
        </div>

        {/* Resolution */}
        <div style={{ marginBottom:14 }}>
          <div style={{ color:"#3a5a6a", fontSize:10, fontFamily:"monospace", marginBottom:6 }}>RESOLUTION</div>
          <div style={{ display:"flex", gap:8, marginBottom:10 }}>
            {["auto","manual"].map((m)=>(
              <button key={m} onClick={()=>setMode(m)} style={pill(mode===m)}>
                {m==="auto"?"⚡ Auto (smart)":"🎛 Manual"}
              </button>
            ))}
          </div>
          {mode==="auto" && dims && (
            <div style={infoBox("#0a1820","#1a3a4a","#4a90a4")}>
              ⚡ auto-detected: <strong>{dims.w}×{dims.h}</strong>
              <br /><span style={{ color:"#3a6a7a" }}>native {videoFile.nativeW}×{videoFile.nativeH} · no upscaling · ~{estRaw} before delta</span>
            </div>
          )}
          {mode==="manual" && (<>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:8 }}>
              {RESOLUTIONS.map((r)=>(
                <button key={r.label} onClick={()=>setManualRes(r)} style={pill(manualRes.label===r.label)}>{r.label}</button>
              ))}
            </div>
            {dims && <div style={infoBox("#0a1020","#1e2433","#4a6a8a")}>→ {dims.w}×{dims.h} · ~{estRaw} before delta compression</div>}
          </>)}
          {videoFile.duration>60 && (
            <div style={{ fontFamily:"monospace", fontSize:11, color:"#ff9f43", padding:"8px 12px", background:"#1a1200", borderRadius:6, marginBottom:10 }}>
              ⚠ {formatTime(videoFile.duration)} · ~{Math.ceil(videoFile.duration*videoFile.fps)} frames. Delta compression reduces size significantly for static scenes.
            </div>
          )}
        </div>
      </>)}

      {phase==="capturing" && (
        <div style={{ marginBottom:16 }}>
          <ProgressBar value={capPct} label={`pass 1/2 — capturing frames (${captured}/${totalF})…`} color="#00e5ff" />
          <div style={{ marginTop:10 }}><Btn onClick={handleCancel} accent="#ff5a5a">✕ cancel</Btn></div>
        </div>
      )}
      {phase==="compressing" && (
        <div style={{ marginBottom:16 }}>
          <ProgressBar value={compPct} label={`pass 2/2 — delta compressing ${captured} frames…`} color="#7c4dff" />
          <div style={{ fontFamily:"monospace", fontSize:11, color:"#3a5a6a", marginTop:6 }}>zero quality loss</div>
        </div>
      )}

      {videoFile && phase==="idle" && (
        <button onClick={handleEncode} style={{
          background:"linear-gradient(135deg,#7c4dff,#00e5ff)", border:"none", color:"#fff",
          borderRadius:10, padding:"11px 26px", fontSize:13, fontWeight:600,
          cursor:"pointer", fontFamily:"monospace", marginBottom:16,
        }}>Encode → .pvm</button>
      )}

      {phase==="done" && result && (
        <div style={{ background:"#0a1a10", border:"1px solid #1a4a2a", borderRadius:10, padding:"14px 16px" }}>
          <div style={{ color:"#00e5a0", fontFamily:"monospace", fontSize:12, marginBottom:4 }}>✓ encoded</div>
          <div style={{ fontFamily:"monospace", fontSize:11, color:"#3a6a5a", marginBottom:12 }}>
            {result.frameCount} frames · {result.w}×{result.h}{result.hasAlpha?" · RGBA":" · RGB"} · {formatBytes(result.buffer.byteLength)}
          </div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            <Btn accent="#00e5ff" onClick={()=>downloadBuffer(result.buffer,`${result.baseName}_${result.w}x${result.h}.pvm`)}>
              ↓ {result.baseName}_{result.w}x{result.h}.pvm
            </Btn>
            <Btn accent="#4a6a8a" onClick={()=>{setPhase("idle");setResult(null);}}>encode another</Btn>
          </div>
        </div>
      )}
      {errMsg && <div style={{ color:"#ff5a5a", fontFamily:"monospace", fontSize:11, marginTop:8 }}>✕ {errMsg}</div>}
    </div>
  );
}