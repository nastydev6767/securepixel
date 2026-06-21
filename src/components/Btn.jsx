export default function Btn({ onClick, children, accent="#00e5ff", disabled=false, full=false }) {
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{
      background:"transparent", border:`1px solid ${disabled?"#2a2a3a":accent}`,
      color:disabled?"#3a3a5a":accent, borderRadius:7, padding:"6px 14px",
      fontSize:11, cursor:disabled?"not-allowed":"pointer", fontFamily:"monospace",
      width:full?"100%":undefined, opacity:disabled?0.5:1, userSelect:"none",
      transition:"opacity 0.15s",
    }}>{children}</button>
  );
}