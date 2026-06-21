// components/Header.jsx
const TABS = [
  { id:"image",  label:"🖼 Image"  },
  { id:"video",  label:"🎬 Video"  },
  { id:"decode", label:"🔍 Decode" },
];

export default function Header({ activeTab, onTabChange }) {
  return (
    <header style={{
      display:"flex", alignItems:"center", gap:12, padding:"13px 20px",
      borderBottom:"1px solid #1e2433", background:"#0d1120",
      flexWrap:"wrap", position:"sticky", top:0, zIndex:10,
    }}>
      {/* Logo */}
      <div style={{
        width:36, height:36, borderRadius:10, flexShrink:0,
        background:"linear-gradient(135deg,#00e5ff,#7c4dff)",
        display:"flex", alignItems:"center", justifyContent:"center", fontSize:19,
        userSelect:"none",
      }}>🔒</div>

      <div style={{ flexShrink:0 }}>
        <div style={{ color:"#e8eaf0", fontWeight:700, fontSize:17, letterSpacing:"-0.4px" }}>
          Securepixel
        </div>
        <div style={{ color:"#4a5568", fontSize:10, fontFamily:"monospace" }}>
          lossless pixel-perfect format · .pxm · .pvm
        </div>
      </div>

      <nav style={{ marginLeft:"auto", display:"flex", gap:4 }}>
        {TABS.map(({ id, label }) => (
          <button key={id} onClick={() => onTabChange(id)}
            aria-current={activeTab === id ? "page" : undefined}
            style={{
              background: activeTab===id ? "#1a2340" : "transparent",
              border:     activeTab===id ? "1px solid #2a3a5a" : "1px solid transparent",
              color:      activeTab===id ? "#e8eaf0" : "#4a6a8a",
              borderRadius:8, padding:"5px 13px", fontSize:12,
              cursor:"pointer", transition:"all 0.15s", fontFamily:"inherit",
            }}>{label}</button>
        ))}
      </nav>
    </header>
  );
}