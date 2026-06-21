// App.jsx — Securepixel root component
import { useState } from "react";
import Header     from "./components/Header";
import EncodePage from "./pages/EncodePage";
import VideoPage  from "./pages/VideoPage";
import DecodePage from "./pages/DecodePage";

export default function App() {
  const [tab, setTab] = useState("image");
  return (
    <div style={{ minHeight:"100vh", background:"#0a0d14", fontFamily:"'Space Grotesk','Segoe UI',system-ui,sans-serif", display:"flex", flexDirection:"column", color:"#e8eaf0" }}>
      <Header activeTab={tab} onTabChange={setTab} />
      <main style={{ flex:1, overflowY:"auto", width:"100%", minHeight:0 }}>
        {tab==="image"  && <EncodePage />}
        {tab==="video"  && <VideoPage />}
        {tab==="decode" && <DecodePage />}
      </main>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        body{background:#0a0d14;}
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-track{background:#0a0d14;}
        ::-webkit-scrollbar-thumb{background:#1e2433;border-radius:2px;}
        button{font-family:inherit;}
      `}</style>
    </div>
  );
}