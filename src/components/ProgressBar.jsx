import { formatTime } from "../core/fileUtils";
export default function ProgressBar({ value = 0, label = "", eta = null, color = "#00e5ff" }) {
  const pct = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
        <span style={{ color:"#6a7a9a", fontSize:11, fontFamily:"monospace" }}>{label}</span>
        <span style={{ color, fontFamily:"monospace", fontSize:11 }}>
          {pct}%{eta != null && eta > 1 ? ` · ~${formatTime(eta)}` : ""}
        </span>
      </div>
      <div style={{ height:3, background:"#1e1a2e", borderRadius:2, overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${pct}%`, background:`linear-gradient(90deg,${color},#7c4dff)`, transition:"width 0.2s ease", borderRadius:2 }} />
      </div>
    </div>
  );
}