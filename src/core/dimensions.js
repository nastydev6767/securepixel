// core/dimensions.js
// Resolution presets, smart auto-detect, aspect-ratio-safe sizing.
// Never upscales. Auto mode picks the best matching preset.

export const RESOLUTIONS = [
  { label: "360p",    w: 640,  h: 360  },
  { label: "480p",    w: 854,  h: 480  },
  { label: "720p HD", w: 1280, h: 720  },
  { label: "1080p",   w: 1920, h: 1080 },
  { label: "1440p",   w: 2560, h: 1440 },
  { label: "4K UHD",  w: 3840, h: 2160 },
  { label: "8K UHD",  w: 7680, h: 4320 },
];

/**
 * Fit srcW×srcH inside maxW×maxH preserving aspect ratio.
 * Never exceeds max dimensions. Never upscales beyond src.
 */
export function fitDimensions(srcW, srcH, maxW, maxH) {
  const ratio = srcW / srcH;
  let w = Math.min(srcW, maxW);
  let h = Math.round(w / ratio);
  if (h > maxH) { h = Math.min(srcH, maxH); w = Math.round(h * ratio); }
  return { w: Math.max(1, w), h: Math.max(1, h) };
}

/**
 * Auto-detect best encode resolution for an image or video.
 * Picks the largest preset whose long edge ≤ source long edge.
 * Falls back to native size if source is smaller than all presets.
 */
export function autoDetect(srcW, srcH) {
  if (!srcW || !srcH || srcW <= 0 || srcH <= 0)
    throw new Error(`Invalid source dimensions: ${srcW}×${srcH}`);
  const srcLong = Math.max(srcW, srcH);
  for (let i = RESOLUTIONS.length - 1; i >= 0; i--) {
    const r = RESOLUTIONS[i];
    if (Math.max(r.w, r.h) <= srcLong) {
      const { w, h } = fitDimensions(srcW, srcH, r.w, r.h);
      return { preset: r, finalW: w, finalH: h, isNative: false, label: r.label };
    }
  }
  return { preset: null, finalW: srcW, finalH: srcH, isNative: true, label: "native" };
}