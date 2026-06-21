// core/pvm.js
// .pvm — Securepixel Video Format v1
// Lossless two-pass delta-compressed binary video. 32-byte fixed header.
//
// HEADER (32 bytes):
//   0–2   Magic: 0x53 0x50 0x56  ("SPV" — SecurePixel Video)
//   3     Version: 0x01
//   4–5   Width  (uint16 BE)
//   6–7   Height (uint16 BE)
//   8–9   FPS × 1000 (uint16 BE) e.g. 29970 = 29.97fps
//   10–13 Frame count (uint32 BE)
//   14–15 Keyframe interval (uint16 BE)
//   16    Flags: bit0=RGBA, bit1=delta-compressed
//   17–23 Reserved 0x00
//   24–27 Header checksum (uint32 BE = XOR of bytes 0–23 in uint32 words)
//   28–31 Total body bytes (uint32 BE)
//
// BODY: sequential frame blocks
//   Each block: [4B frame index] [1B type 0x00=key/0x01=delta]
//               [4B body length] [body bytes]
//   Keyframe body: W×H×bpp raw pixels
//   Delta body: RLE records — [bpp color bytes | sentinel 0xFE×bpp] [2B run uint16 BE]

const MAGIC_0 = 0x53; // S
const MAGIC_1 = 0x50; // P
const MAGIC_2 = 0x56; // V
const VERSION        = 0x01;
const HEADER_SIZE    = 32;
const BLOCK_KEY      = 0x00;
const BLOCK_DELTA    = 0x01;
const FLAG_RGBA      = 0x01;
const FLAG_DELTA     = 0x02;
const SENTINEL       = 0xFE;
const DEFAULT_KFI    = 30;
const MAX_RUN        = 65535;

export const PVM_HEADER_SIZE = HEADER_SIZE;

function xorChecksum(view) {
  let cs = 0;
  for (let o = 0; o < 24; o += 4) cs ^= view.getUint32(o, false);
  return cs >>> 0;
}

export function writePvmHeader(view, { w, h, fps, frameCount, kfi, hasAlpha, useDelta, bodyBytes }) {
  view.setUint8(0, MAGIC_0); view.setUint8(1, MAGIC_1); view.setUint8(2, MAGIC_2);
  view.setUint8(3, VERSION);
  view.setUint16(4, w, false); view.setUint16(6, h, false);
  view.setUint16(8, Math.round(fps * 1000), false);
  view.setUint32(10, frameCount, false);
  view.setUint16(14, kfi, false);
  view.setUint8(16, (hasAlpha ? FLAG_RGBA : 0) | (useDelta ? FLAG_DELTA : 0));
  for (let i = 17; i < 24; i++) view.setUint8(i, 0x00);
  view.setUint32(24, xorChecksum(view), false);
  view.setUint32(28, bodyBytes, false);
}

export function parsePvmHeader(buffer) {
  if (buffer.byteLength < HEADER_SIZE)
    throw new Error(`File too small (${buffer.byteLength}B) to be a .pvm file`);
  const view = new DataView(buffer);
  if (view.getUint8(0) !== MAGIC_0 || view.getUint8(1) !== MAGIC_1 || view.getUint8(2) !== MAGIC_2)
    throw new Error("Not a Securepixel .pvm file — magic bytes don't match");
  const version = view.getUint8(3);
  if (version !== VERSION) throw new Error(`Unsupported .pvm version: ${version}`);
  const w          = view.getUint16(4,  false);
  const h          = view.getUint16(6,  false);
  const fpsRaw     = view.getUint16(8,  false);
  const frameCount = view.getUint32(10, false);
  const kfi        = view.getUint16(14, false);
  const flags      = view.getUint8(16);
  const hasAlpha   = !!(flags & FLAG_RGBA);
  const useDelta   = !!(flags & FLAG_DELTA);
  const storedCs   = view.getUint32(24, false);
  const bodyBytes  = view.getUint32(28, false);
  if (w < 1 || h < 1)  throw new Error(`Invalid dimensions: ${w}×${h}`);
  if (frameCount < 1)   throw new Error(`Invalid frame count: ${frameCount}`);
  if (fpsRaw < 1)       throw new Error(`Invalid FPS value: ${fpsRaw}`);
  // Verify checksum over bytes 0–23
  const tmp = buffer.slice(0, 24);
  let cs = 0;
  const tv = new DataView(tmp);
  for (let o = 0; o < 24; o += 4) cs ^= tv.getUint32(o, false);
  if ((cs >>> 0) !== storedCs)
    throw new Error(`Header checksum mismatch — file may be corrupted`);
  const actualBody = buffer.byteLength - HEADER_SIZE;
  if (actualBody < bodyBytes)
    throw new Error(`Truncated .pvm: body is ${actualBody}B, header says ${bodyBytes}B`);
  return { w, h, fps: fpsRaw / 1000, frameCount, kfi, hasAlpha, useDelta, bpp: hasAlpha ? 4 : 3, bodyBytes };
}

export function isPvmFile(buffer) {
  if (buffer.byteLength < 3) return false;
  const b = new Uint8Array(buffer, 0, 3);
  return b[0] === MAGIC_0 && b[1] === MAGIC_1 && b[2] === MAGIC_2;
}

export function peekPvmInfo(buffer) {
  try {
    const m = parsePvmHeader(buffer);
    return { ...m, mode: m.hasAlpha ? "RGBA" : "RGB", duration: m.frameCount / m.fps, totalBytes: buffer.byteLength };
  } catch (_) { return null; }
}

// ── Delta ─────────────────────────────────────────────────────────────────────
function compressDelta(curr, prev, pixelCount, bpp) {
  const out = new Uint8Array(pixelCount * (bpp + 2));
  let outPos = 0, i = 0;
  while (i < pixelCount) {
    let same = true;
    for (let c = 0; c < bpp; c++) if (curr[i*bpp+c] !== prev[i*bpp+c]) { same = false; break; }
    let run = 1;
    while (i + run < pixelCount && run < MAX_RUN) {
      let ns = true;
      for (let c = 0; c < bpp; c++) if (curr[(i+run)*bpp+c] !== prev[(i+run)*bpp+c]) { ns = false; break; }
      if (ns !== same) break;
      run++;
    }
    if (same) {
      for (let c = 0; c < bpp; c++) out[outPos++] = SENTINEL;
      out[outPos++] = run >> 8; out[outPos++] = run & 0xFF;
    } else {
      for (let k = 0; k < run; k++) {
        for (let c = 0; c < bpp; c++) out[outPos++] = curr[(i+k)*bpp+c];
        out[outPos++] = 0x00; out[outPos++] = 0x01;
      }
    }
    i += run;
  }
  return out.slice(0, outPos);
}

// ── Encoder ───────────────────────────────────────────────────────────────────
export class PvmEncoder {
  constructor(w, h, fps, { hasAlpha = false, kfi = DEFAULT_KFI } = {}) {
    this.w = w; this.h = h; this.fps = fps;
    this.hasAlpha = hasAlpha; this.kfi = kfi;
    this.bpp = hasAlpha ? 4 : 3;
    this.pixelCount = w * h;
    this.frames = [];
  }

  addFrame(imageData) {
    const { pixelCount, bpp, hasAlpha } = this;
    const src = imageData.data;
    const px = new Uint8Array(pixelCount * bpp);
    for (let i = 0; i < pixelCount; i++) {
      px[i*bpp] = src[i*4]; px[i*bpp+1] = src[i*4+1]; px[i*bpp+2] = src[i*4+2];
      if (hasAlpha) px[i*bpp+3] = src[i*4+3];
    }
    this.frames.push(px);
  }

  finalize(onProgress) {
    const { w, h, fps, kfi, frames, pixelCount, bpp, hasAlpha } = this;
    const fc = frames.length;
    if (fc === 0) throw new Error("No frames to encode");
    const blocks = [];
    let bodyBytes = 0;
    for (let f = 0; f < fc; f++) {
      const isKey = f === 0 || f % kfi === 0;
      const body  = isKey ? new Uint8Array(frames[f]) : compressDelta(frames[f], frames[f-1], pixelCount, bpp);
      const block = new Uint8Array(9 + body.length);
      const bv    = new DataView(block.buffer);
      bv.setUint32(0, f, false); block[4] = isKey ? BLOCK_KEY : BLOCK_DELTA;
      bv.setUint32(5, body.length, false); block.set(body, 9);
      blocks.push(block); bodyBytes += block.length;
      onProgress?.(Math.round(((f+1)/fc)*100));
    }
    const out  = new ArrayBuffer(HEADER_SIZE + bodyBytes);
    const view = new DataView(out);
    const arr  = new Uint8Array(out);
    writePvmHeader(view, { w, h, fps, frameCount: fc, kfi, hasAlpha, useDelta: true, bodyBytes });
    let pos = HEADER_SIZE;
    for (const b of blocks) { arr.set(b, pos); pos += b.length; }
    return out;
  }

  dispose() { this.frames = []; }
}

// ── Decoder ───────────────────────────────────────────────────────────────────
export function decodePvm({ buffer, signal, onFrame, onProgress, onDone, onError } = {}) {
  let meta;
  try { meta = parsePvmHeader(buffer); } catch (err) { onError?.(err); return null; }
  const { w, h, frameCount, bpp, hasAlpha } = meta;
  const pixelCount = w * h;
  const view = new DataView(buffer);
  let bytePos = HEADER_SIZE, prevPx = null, f = 0;

  function next() {
    if (signal?.aborted) return;
    if (f >= frameCount || bytePos >= buffer.byteLength) { onDone?.(meta); return; }
    try {
      const frameIdx  = view.getUint32(bytePos, false);
      const blockType = view.getUint8(bytePos + 4);
      const bodyLen   = view.getUint32(bytePos + 5, false);
      bytePos += 9;
      const outPx = new Uint8Array(pixelCount * bpp);

      if (blockType === BLOCK_KEY) {
        for (let p = 0; p < pixelCount * bpp; p++) outPx[p] = view.getUint8(bytePos + p);
        bytePos += pixelCount * bpp;
      } else if (blockType === BLOCK_DELTA) {
        if (!prevPx) throw new Error(`Delta at frame ${frameIdx} has no keyframe`);
        outPx.set(prevPx);
        let pixPos = 0;
        const blockEnd = bytePos + bodyLen;
        while (pixPos < pixelCount && bytePos < blockEnd) {
          let isSentinel = true;
          for (let c = 0; c < bpp; c++) if (view.getUint8(bytePos+c) !== SENTINEL) { isSentinel = false; break; }
          const color = new Uint8Array(bpp);
          for (let c = 0; c < bpp; c++) color[c] = view.getUint8(bytePos + c);
          const runLen = view.getUint16(bytePos + bpp, false);
          bytePos += bpp + 2;
          if (!isSentinel) {
            for (let k = 0; k < runLen; k++)
              for (let c = 0; c < bpp; c++) outPx[(pixPos+k)*bpp+c] = color[c];
          }
          pixPos += runLen;
        }
        bytePos = bytePos > blockEnd ? blockEnd : bytePos;
      } else {
        bytePos += bodyLen; f++; setTimeout(next, 0); return;
      }

      const rgba = new Uint8ClampedArray(pixelCount * 4);
      for (let p = 0; p < pixelCount; p++) {
        rgba[p*4]=outPx[p*bpp]; rgba[p*4+1]=outPx[p*bpp+1]; rgba[p*4+2]=outPx[p*bpp+2];
        rgba[p*4+3] = hasAlpha ? outPx[p*bpp+3] : 255;
      }
      prevPx = outPx;
      onFrame?.(new ImageData(rgba, w, h), frameIdx);
      onProgress?.(Math.round(((f+1)/frameCount)*100), f);
      f++; setTimeout(next, 0);
    } catch (err) { onError?.(err); }
  }
  setTimeout(next, 0);
  return meta;
}