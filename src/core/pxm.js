// core/pxm.js
// .pxm — Securepixel Image Format v1
// Lossless binary image. 16-byte fixed header. RGB or RGBA.
//
// HEADER (16 bytes):
//   0–2   Magic: 0x53 0x50 0x58  ("SPX" — SecurePixel Image)
//   3     Version: 0x01
//   4–5   Width  (uint16 BE)
//   6–7   Height (uint16 BE)
//   8     Flags: bit0=RGBA
//   9–11  Reserved 0x00
//   12–15 Pixel count checksum (uint32 BE = W×H)
//
// BODY: W×H×bpp bytes, row-major, R G B [A] per pixel.

const MAGIC_0 = 0x53; // S
const MAGIC_1 = 0x50; // P
const MAGIC_2 = 0x58; // X
const VERSION     = 0x01;
const HEADER_SIZE = 16;
const FLAG_RGBA   = 0x01;

export const PXM_HEADER_SIZE = HEADER_SIZE;

export function writePxmHeader(view, w, h, hasAlpha) {
  view.setUint8(0, MAGIC_0); view.setUint8(1, MAGIC_1); view.setUint8(2, MAGIC_2);
  view.setUint8(3, VERSION);
  view.setUint16(4, w, false); view.setUint16(6, h, false);
  view.setUint8(8, hasAlpha ? FLAG_RGBA : 0x00);
  view.setUint8(9, 0); view.setUint8(10, 0); view.setUint8(11, 0);
  view.setUint32(12, w * h, false);
}

export function parsePxmHeader(buffer) {
  if (buffer.byteLength < HEADER_SIZE)
    throw new Error(`File too small (${buffer.byteLength}B) to be a .pxm file`);
  const view = new DataView(buffer);
  if (view.getUint8(0) !== MAGIC_0 || view.getUint8(1) !== MAGIC_1 || view.getUint8(2) !== MAGIC_2)
    throw new Error("Not a Securepixel .pxm file — magic bytes don't match");
  const version = view.getUint8(3);
  if (version !== VERSION)
    throw new Error(`Unsupported .pxm version: ${version} (decoder supports v${VERSION})`);
  const w = view.getUint16(4, false);
  const h = view.getUint16(6, false);
  if (w < 1 || h < 1) throw new Error(`Invalid dimensions: ${w}×${h}`);
  const flags      = view.getUint8(8);
  const hasAlpha   = !!(flags & FLAG_RGBA);
  const bpp        = hasAlpha ? 4 : 3;
  const storedPx   = view.getUint32(12, false);
  if (storedPx !== w * h)
    throw new Error(`Pixel count mismatch: header says ${storedPx}, dimensions give ${w * h}`);
  const bodyBytes  = w * h * bpp;
  const actualBody = buffer.byteLength - HEADER_SIZE;
  if (actualBody < bodyBytes)
    throw new Error(`Truncated .pxm: need ${bodyBytes}B body, got ${actualBody}B`);
  return { w, h, hasAlpha, bpp, pixelCount: w * h, bodyOffset: HEADER_SIZE };
}

export function isPxmFile(buffer) {
  if (buffer.byteLength < 3) return false;
  const b = new Uint8Array(buffer, 0, 3);
  return b[0] === MAGIC_0 && b[1] === MAGIC_1 && b[2] === MAGIC_2;
}

export function peekPxmInfo(buffer) {
  try {
    const { w, h, hasAlpha, bpp, pixelCount } = parsePxmHeader(buffer);
    return { w, h, hasAlpha, mode: hasAlpha ? "RGBA" : "RGB", bpp, pixelCount, totalBytes: buffer.byteLength };
  } catch (_) { return null; }
}

export function encodePxm({ imageData, w, h, hasAlpha = false, signal, onProgress, onDone, onError }) {
  try {
    const bpp        = hasAlpha ? 4 : 3;
    const pixelCount = w * h;
    const out        = new ArrayBuffer(HEADER_SIZE + pixelCount * bpp);
    const view       = new DataView(out);
    const body       = new Uint8Array(out, HEADER_SIZE);
    const src        = imageData.data;
    writePxmHeader(view, w, h, hasAlpha);
    const CHUNK = 500000;
    let i = 0;
    const t0 = Date.now();
    function step() {
      if (signal?.aborted) return;
      const end = Math.min(i + CHUNK, pixelCount);
      if (hasAlpha) {
        for (; i < end; i++) { const s=i*4,d=i*4; body[d]=src[s]; body[d+1]=src[s+1]; body[d+2]=src[s+2]; body[d+3]=src[s+3]; }
      } else {
        for (; i < end; i++) { const s=i*4,d=i*3; body[d]=src[s]; body[d+1]=src[s+1]; body[d+2]=src[s+2]; }
      }
      const pct = Math.round((i / pixelCount) * 100);
      const elapsed = (Date.now() - t0) / 1000;
      onProgress?.(pct, i > 0 ? (elapsed / i) * (pixelCount - i) : null);
      if (i < pixelCount) { setTimeout(step, 0); return; }
      onDone?.(out);
    }
    setTimeout(step, 0);
  } catch (err) { onError?.(err); }
}

export function decodePxm({ buffer, signal, onProgress, onDone, onError }) {
  let meta;
  try { meta = parsePxmHeader(buffer); } catch (err) { onError?.(err); return; }
  const { w, h, hasAlpha, bpp, pixelCount, bodyOffset } = meta;
  const body = new Uint8Array(buffer, bodyOffset);
  const rgba = new Uint8ClampedArray(pixelCount * 4);
  const CHUNK = 500000;
  let i = 0;
  function step() {
    if (signal?.aborted) return;
    const end = Math.min(i + CHUNK, pixelCount);
    if (hasAlpha) {
      for (; i < end; i++) { const s=i*4,d=i*4; rgba[d]=body[s]; rgba[d+1]=body[s+1]; rgba[d+2]=body[s+2]; rgba[d+3]=body[s+3]; }
    } else {
      for (; i < end; i++) { const s=i*3,d=i*4; rgba[d]=body[s]; rgba[d+1]=body[s+1]; rgba[d+2]=body[s+2]; rgba[d+3]=255; }
    }
    onProgress?.(Math.round((i / pixelCount) * 100));
    if (i < pixelCount) { setTimeout(step, 0); return; }
    onDone?.(new ImageData(rgba, w, h), w, h, hasAlpha);
  }
  setTimeout(step, 0);
}