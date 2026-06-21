// core/fileUtils.js
// Download helpers, canvas preview utilities, formatting.

export function formatBytes(n) {
  if (!n || n <= 0) return "0 B";
  if (n < 1024) return n + " B";
  if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
  if (n < 1073741824) return (n / 1048576).toFixed(1) + " MB";
  return (n / 1073741824).toFixed(2) + " GB";
}

export function formatTime(seconds) {
  if (!seconds || seconds < 0) return "0s";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

export function downloadBuffer(buffer, fileName) {
  const blob = new Blob([buffer], { type: "application/octet-stream" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadImageAsPNG(imageData, w, h, baseName) {
  const off  = new OffscreenCanvas(w, h);
  off.getContext("2d").putImageData(imageData, 0, 0);
  const blob = await off.convertToBlob({ type: "image/png" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `${baseName}_${w}x${h}.png`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function renderPreview(imageData, w, h, canvasEl, maxSize = 400) {
  if (!canvasEl) return;
  const scale = Math.min(maxSize / w, maxSize / h, 1);
  const dw = Math.max(1, Math.round(w * scale));
  const dh = Math.max(1, Math.round(h * scale));
  canvasEl.width = dw; canvasEl.height = dh;
  const off = new OffscreenCanvas(w, h);
  off.getContext("2d").putImageData(imageData, 0, 0);
  const ctx = canvasEl.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(off, 0, 0, dw, dh);
}

export function drawImageToCanvas(imgEl, tw, th) {
  const canvas = document.createElement("canvas");
  canvas.width = tw; canvas.height = th;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(imgEl, 0, 0, tw, th);
  return ctx.getImageData(0, 0, tw, th);
}