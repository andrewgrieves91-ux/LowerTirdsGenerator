import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import { zipSync } from "fflate";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { FFmpeg } from "@ffmpeg/ffmpeg";

import gsap from "gsap";
import { GSAPAnimationController, type AnimationValues } from "@/utils/gsapAnimationController";
import { CheckCircle, Loader2, Clock, AlertCircle, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Cue {
  id: string;
  cueNumber?: number;
  name: string;
  config: {
    eyebrow?: string;
    name: string;
    title: string;
    font: string;
    fontSize: number;
    eyebrowFontSizePercent?: number;
    titleFontSizePercent?: number;
    fontWeight?: string;
    bold?: boolean;
    underline?: boolean;
    italic?: boolean;
    posX: number;
    posY: number;
    color: string;
    animationType: string;
    animationDuration: number;
    dwellDuration?: number;
    shadowEnabled?: boolean;
    shadowBlur?: number;
    shadowOffsetX?: number;
    shadowOffsetY?: number;
    shadowColor?: string;
    shadowStrength?: number;
    borderEnabled?: boolean;
    borderWidth?: number;
    borderColor?: string;
    logoDataUrl?: string;
    logoPosition?: "before" | "after";
  };
}

type QueueStatus = "queued" | "recording" | "converting" | "done" | "error";

interface QueueItem {
  id: string;
  name: string;
  status: QueueStatus;
  progress: number;
  error?: string;
}

// ─── ffmpeg singleton ─────────────────────────────────────────────────────────
let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoadState: "idle" | "loading" | "ready" | "error" = "idle";
const ffmpegLoadListeners: Array<(state: typeof ffmpegLoadState, pct: number, msg: string) => void> = [];

function notifyFFmpegListeners(state: typeof ffmpegLoadState, pct: number, msg: string) {
  ffmpegLoadListeners.forEach((fn) => fn(state, pct, msg));
}

async function getFFmpeg(onProgress?: (pct: number, msg: string) => void): Promise<FFmpeg> {
  if (ffmpegLoadState === "ready" && ffmpegInstance) return ffmpegInstance;

  if (onProgress) {
    ffmpegLoadListeners.push((state, pct, msg) => {
      if (state === "loading" || state === "ready") onProgress(pct, msg);
    });
  }

  if (ffmpegLoadState === "loading") {
    return new Promise((resolve, reject) => {
      const poll = setInterval(() => {
        if (ffmpegLoadState === "ready" && ffmpegInstance) { clearInterval(poll); resolve(ffmpegInstance); }
        if (ffmpegLoadState === "error") { clearInterval(poll); reject(new Error("ffmpeg failed to load")); }
      }, 200);
    });
  }

  ffmpegLoadState = "loading";
  ffmpegInstance = new FFmpeg();

  try {
    const base = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";

    // Use direct fetch + Blob URL instead of toBlobURL to avoid ReadableStream issues
    const fetchToBlobURL = async (url: string, mimeType: string, label: string, startPct: number, endPct: number): Promise<string> => {
      notifyFFmpegListeners("loading", startPct, `Downloading ${label}…`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch ${label}: ${res.status}`);
      const total = Number(res.headers.get("content-length") || 0);
      const reader = res.body!.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (total > 0) {
          const pct = startPct + Math.round((received / total) * (endPct - startPct));
          notifyFFmpegListeners("loading", pct, `Downloading ${label}… ${Math.round(received / total * 100)}%`);
        }
      }
      const blob = new Blob(chunks, { type: mimeType });
      return URL.createObjectURL(blob);
    }

    const coreURL = await fetchToBlobURL(`${base}/ffmpeg-core.js`, "text/javascript", "ffmpeg-core.js", 5, 40);
    const wasmURL = await fetchToBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm", "ffmpeg-core.wasm", 40, 90);

    notifyFFmpegListeners("loading", 90, "Initialising ffmpeg-core…");
    await ffmpegInstance.load({ coreURL, wasmURL });

    ffmpegLoadState = "ready";
    notifyFFmpegListeners("ready", 100, "ffmpeg-core ready");
    return ffmpegInstance;
  } catch (err) {
    ffmpegLoadState = "error";
    notifyFFmpegListeners("error", 0, "Failed to load ffmpeg-core");
    throw err;
  }
}

// ─── Canvas draw helper — mirrors Live.tsx render loop exactly ────────────────
// Base design resolution — all cue coords (posX, posY, fontSize) are in this space
const BASE_WIDTH = 1920;
const BASE_HEIGHT = 1080;

// Pre-rendered offscreen canvases for Meta animation (eliminates font rasterization stepping)
interface MetaOffscreen {
  colorCanvas: HTMLCanvasElement;
  alphaCanvas: HTMLCanvasElement;
  eyebrow: { x: number; y: number; w: number; h: number };
  name:    { x: number; y: number; w: number; h: number };
  title:   { x: number; y: number; w: number; h: number };
  maxScale: number;
  drawPad: number;
  nameContentW: number;
  nameContentH: number;
  titleContentW: number;
  titleContentH: number;
  eyebrowContentW: number;
  eyebrowContentH: number;
}

// Create offscreen canvases for Meta animation — called once per export, before the frame loop.
// Renders all three text lines at MAX scale (1.121x) so drawImage() can GPU-scale each frame.
function createMetaOffscreenForExport(
  cue: Cue,
  resScale: number,
  logoImage: HTMLImageElement | null
): MetaOffscreen {
  const RENDER_SCALE = 4.0;
  const config = cue.config;
  const baseNameFontSize    = config.fontSize * resScale;
  const baseEyebrowFontSize = baseNameFontSize * ((config.eyebrowFontSizePercent ?? 40) / 100);
  const baseTitleFontSize   = baseNameFontSize * ((config.titleFontSizePercent ?? 75) / 100);
  const maxNameFontSize    = baseNameFontSize    * RENDER_SCALE;
  const maxEyebrowFontSize = baseEyebrowFontSize * RENDER_SCALE;
  const maxTitleFontSize   = baseTitleFontSize   * RENDER_SCALE;
  const fontWeight = config.bold ? '700' : (config.fontWeight || 'normal');
  const fontStyle  = config.italic ? 'italic' : 'normal';
  const titleFontWeight = (config as any).titleFontWeight || fontWeight;
  const eyebrow = config.eyebrow || '';

  // Measure text widths at max scale using a temp canvas
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = 3840; tmpCanvas.height = 400;
  const tmpCtx = tmpCanvas.getContext('2d')!;
  tmpCtx.textBaseline = 'top';

  tmpCtx.font = `${fontStyle} ${fontWeight} ${maxEyebrowFontSize}px "${config.font}", sans-serif`;
  const eyebrowTextW = eyebrow ? tmpCtx.measureText(eyebrow).width : 0;
  const logoH = maxEyebrowFontSize;
  const logoW = logoImage ? Math.round((logoImage.naturalWidth / logoImage.naturalHeight) * logoH) : 0;
  const logoGap = logoImage ? Math.round(maxEyebrowFontSize * 0.3) : 0;
  const eyebrowTotalW = Math.ceil(eyebrowTextW + logoW + logoGap) + 4;
  const eyebrowH = Math.ceil(maxEyebrowFontSize) + 4;

  tmpCtx.font = `${fontStyle} ${fontWeight} ${maxNameFontSize}px "${config.font}", sans-serif`;
  const nameW = Math.ceil(tmpCtx.measureText(config.name).width) + 4;
  const nameH = Math.ceil(maxNameFontSize) + 4;

  tmpCtx.font = `${fontStyle} ${titleFontWeight} ${maxTitleFontSize}px "${config.font}", sans-serif`;
  const titleW = Math.ceil(tmpCtx.measureText(config.title).width) + 4;
  const titleH = Math.ceil(maxTitleFontSize) + 4;

  // Pack all three lines into a single tall offscreen canvas.
  // TEXT_PAD: fixed inset — text draw origin never shifts with border width.
  // STROKE_PAD: extra canvas space to hold stroke overflow (half lineWidth).
  const TEXT_PAD = 4;
  const bw = config.borderEnabled ? (config.borderWidth || 2) : 0;
  const STROKE_PAD = bw > 0 ? Math.ceil(bw / 2) + 2 : 0;
  const REGION_PAD = TEXT_PAD + STROKE_PAD;
  const eyebrowH2 = eyebrowH + REGION_PAD * 2;
  const nameH2    = nameH    + REGION_PAD * 2;
  const titleH2   = titleH   + REGION_PAD * 2;
  const offW = Math.max(eyebrowTotalW, nameW, titleW) + REGION_PAD * 4;
  const eyebrowRegion = { x: REGION_PAD, y: REGION_PAD,                                            w: eyebrowTotalW + REGION_PAD * 2, h: eyebrowH2 };
  const nameRegion    = { x: REGION_PAD, y: REGION_PAD + eyebrowH2 + REGION_PAD,                   w: nameW    + REGION_PAD * 2, h: nameH2 };
  const titleRegion   = { x: REGION_PAD, y: REGION_PAD + eyebrowH2 + REGION_PAD + nameH2 + REGION_PAD, w: titleW + REGION_PAD * 2, h: titleH2 };
  const offH = titleRegion.y + titleH2 + REGION_PAD;
  // Text draw origins: TEXT_PAD + STROKE_PAD from region origin — stable regardless of border width
  const eyebrowDrawX = eyebrowRegion.x + TEXT_PAD + STROKE_PAD;
  const eyebrowDrawY = eyebrowRegion.y + TEXT_PAD + STROKE_PAD;
  const nameDrawOriginX = nameRegion.x + TEXT_PAD + STROKE_PAD;
  const nameDrawOriginY = nameRegion.y + TEXT_PAD + STROKE_PAD;
  const titleDrawOriginX = titleRegion.x + TEXT_PAD + STROKE_PAD;
  const titleDrawOriginY = titleRegion.y + TEXT_PAD + STROKE_PAD;

  // Create color offscreen canvas
  const colorOff = document.createElement('canvas');
  colorOff.width = offW; colorOff.height = offH;
  const colorOffCtx = colorOff.getContext('2d')!;
  colorOffCtx.textBaseline = 'top';
  colorOffCtx.lineJoin = 'round';
  colorOffCtx.lineCap  = 'round';
  colorOffCtx.clearRect(0, 0, offW, offH);

  // Create alpha offscreen canvas
  const alphaOff = document.createElement('canvas');
  alphaOff.width = offW; alphaOff.height = offH;
  const alphaOffCtx = alphaOff.getContext('2d')!;
  alphaOffCtx.textBaseline = 'top';
  alphaOffCtx.lineJoin = 'round';
  alphaOffCtx.lineCap  = 'round';
  alphaOffCtx.clearRect(0, 0, offW, offH);

  // Draw eyebrow
  if (eyebrow || logoImage) {
    colorOffCtx.font = `${fontStyle} ${fontWeight} ${maxEyebrowFontSize}px "${config.font}", sans-serif`;
    alphaOffCtx.font  = `${fontStyle} ${fontWeight} ${maxEyebrowFontSize}px "${config.font}", sans-serif`;
    colorOffCtx.fillStyle = config.color;
    alphaOffCtx.fillStyle  = '#FFFFFF';
    const logoPos = config.logoPosition ?? 'before';
    let eyebrowTextX = eyebrowDrawX;
    let eyebrowLogoX = eyebrowDrawX;
    if (logoImage) {
      if (logoPos === 'before') { eyebrowLogoX = eyebrowDrawX; eyebrowTextX = eyebrowDrawX + logoW + logoGap; }
      else { eyebrowTextX = eyebrowDrawX; eyebrowLogoX = eyebrowDrawX + eyebrowTextW + logoGap; }
    }
  }

  // ── PASS 1: All strokes (drawn first so fills always sit on top) ──────────
  const eyebrowLogoX2 = (() => { const lp = config.logoPosition ?? 'before'; return lp === 'before' ? eyebrowDrawX : eyebrowDrawX + (eyebrow ? colorOffCtx.measureText(eyebrow).width : 0) + (logoImage ? Math.round(maxEyebrowFontSize * 0.3) : 0); })();
  const eyebrowTextX2 = (() => { const lp = config.logoPosition ?? 'before'; const lw2 = logoImage ? Math.round((logoImage.naturalWidth / logoImage.naturalHeight) * maxEyebrowFontSize) : 0; const lg2 = logoImage ? Math.round(maxEyebrowFontSize * 0.3) : 0; return lp === 'before' ? eyebrowDrawX + lw2 + lg2 : eyebrowDrawX; })();
  if (config.borderEnabled) {
    const strokeColor = config.borderColor || '#000000';
    const strokeW = config.borderWidth || 2;
    if (eyebrow) {
      colorOffCtx.font = `${fontStyle} ${fontWeight} ${maxEyebrowFontSize}px "${config.font}", sans-serif`;
      alphaOffCtx.font  = `${fontStyle} ${fontWeight} ${maxEyebrowFontSize}px "${config.font}", sans-serif`;
      colorOffCtx.strokeStyle = strokeColor; colorOffCtx.lineWidth = strokeW;
      colorOffCtx.strokeText(eyebrow, eyebrowTextX2, eyebrowDrawY);
      alphaOffCtx.strokeStyle = '#FFFFFF'; alphaOffCtx.lineWidth = strokeW;
      alphaOffCtx.strokeText(eyebrow, eyebrowTextX2, eyebrowDrawY);
    }
    colorOffCtx.font = `${fontStyle} ${fontWeight} ${maxNameFontSize}px "${config.font}", sans-serif`;
    alphaOffCtx.font  = `${fontStyle} ${fontWeight} ${maxNameFontSize}px "${config.font}", sans-serif`;
    colorOffCtx.strokeStyle = strokeColor; colorOffCtx.lineWidth = strokeW;
    colorOffCtx.strokeText(config.name, nameDrawOriginX, nameDrawOriginY);
    alphaOffCtx.strokeStyle = '#FFFFFF'; alphaOffCtx.lineWidth = strokeW;
    alphaOffCtx.strokeText(config.name, nameDrawOriginX, nameDrawOriginY);
    colorOffCtx.font = `${fontStyle} ${titleFontWeight} ${maxTitleFontSize}px "${config.font}", sans-serif`;
    alphaOffCtx.font  = `${fontStyle} ${titleFontWeight} ${maxTitleFontSize}px "${config.font}", sans-serif`;
    colorOffCtx.strokeStyle = strokeColor; colorOffCtx.lineWidth = strokeW;
    colorOffCtx.strokeText(config.title, titleDrawOriginX, titleDrawOriginY);
    alphaOffCtx.strokeStyle = '#FFFFFF'; alphaOffCtx.lineWidth = strokeW;
    alphaOffCtx.strokeText(config.title, titleDrawOriginX, titleDrawOriginY);
  }

  // ── PASS 2: All fills (always on top of strokes) ──────────────────────────
  if (eyebrow || logoImage) {
    colorOffCtx.font = `${fontStyle} ${fontWeight} ${maxEyebrowFontSize}px "${config.font}", sans-serif`;
    alphaOffCtx.font  = `${fontStyle} ${fontWeight} ${maxEyebrowFontSize}px "${config.font}", sans-serif`;
    colorOffCtx.fillStyle = config.color; alphaOffCtx.fillStyle = '#FFFFFF';
    if (logoImage) {
      colorOffCtx.drawImage(logoImage, eyebrowLogoX2, eyebrowDrawY, logoW, logoH);
      alphaOffCtx.save();
      alphaOffCtx.drawImage(logoImage, eyebrowLogoX2, eyebrowDrawY, logoW, logoH);
      alphaOffCtx.globalCompositeOperation = 'source-atop';
      alphaOffCtx.fillRect(eyebrowLogoX2, eyebrowDrawY, logoW, logoH);
      alphaOffCtx.restore();
    }
    if (eyebrow) {
      colorOffCtx.fillText(eyebrow, eyebrowTextX2, eyebrowDrawY);
      alphaOffCtx.fillText(eyebrow, eyebrowTextX2, eyebrowDrawY);
    }
  }
  colorOffCtx.font = `${fontStyle} ${fontWeight} ${maxNameFontSize}px "${config.font}", sans-serif`;
  alphaOffCtx.font  = `${fontStyle} ${fontWeight} ${maxNameFontSize}px "${config.font}", sans-serif`;
  colorOffCtx.fillStyle = config.color; alphaOffCtx.fillStyle = '#FFFFFF';
  colorOffCtx.fillText(config.name, nameDrawOriginX, nameDrawOriginY);
  alphaOffCtx.fillText(config.name, nameDrawOriginX, nameDrawOriginY);
  colorOffCtx.font = `${fontStyle} ${titleFontWeight} ${maxTitleFontSize}px "${config.font}", sans-serif`;
  alphaOffCtx.font  = `${fontStyle} ${titleFontWeight} ${maxTitleFontSize}px "${config.font}", sans-serif`;
  colorOffCtx.fillStyle = config.color; alphaOffCtx.fillStyle = '#FFFFFF';
  colorOffCtx.fillText(config.title, titleDrawOriginX, titleDrawOriginY);
  alphaOffCtx.fillText(config.title, titleDrawOriginX, titleDrawOriginY);

  return {
    colorCanvas: colorOff,
    alphaCanvas: alphaOff,
    eyebrow: eyebrowRegion,
    name: nameRegion,
    title: titleRegion,
    maxScale: RENDER_SCALE,
    drawPad: REGION_PAD,
    nameContentW: nameW,
    nameContentH: nameH,
    titleContentW: titleW,
    titleContentH: titleH,
    eyebrowContentW: eyebrowTotalW,
    eyebrowContentH: eyebrowH,
  };
}



// ─── Export format definitions ────────────────────────────────────────────────
const VIDEO_FORMATS: { value: string; label: string; ext: string; supportsAlpha: boolean; mimeType: string }[] = [
  { value: "mp4",        label: "MP4 (H.264)",                     ext: "mp4", supportsAlpha: false, mimeType: "video/mp4" },
  { value: "png-seq",   label: "PNG Sequence ZIP (Transparent)",   ext: "zip", supportsAlpha: true,  mimeType: "application/zip" },
  { value: "prores",     label: "MOV ProRes 4444",                  ext: "mov", supportsAlpha: true,  mimeType: "video/quicktime" },
  { value: "qt-anim",   label: "MOV Animation (QT RLE)",           ext: "mov", supportsAlpha: true,  mimeType: "video/quicktime" },
  { value: "avi",        label: "AVI Uncompressed",                 ext: "avi", supportsAlpha: true,  mimeType: "video/avi" },
];

// ── Shared shadow helper ─────────────────────────────────────────────────────
// Draws shadow for the current frame onto ctx.
// glyphDrawFn: function that draws the text glyphs onto a provided CanvasRenderingContext2D.
// The helper creates a transparent glyph canvas, casts shadow from it, erases glyphs,
// then composites: background → shadow → text (all source-over, works with any bgColor).
function applyShadow(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  shadowBlur: number,
  shadowOffsetX: number,
  shadowOffsetY: number,
  shadowColor: string,
  shadowStrength: number,
  bgColor: string,
  glyphDrawFn: (gCtx: CanvasRenderingContext2D) => void
) {
  // Step 1: draw glyphs onto a transparent canvas (white fill — only alpha matters for shadow)
  const glyphC = document.createElement('canvas');
  glyphC.width = W; glyphC.height = H;
  const glyphCtx = glyphC.getContext('2d')!;
  glyphCtx.fillStyle = '#ffffff';
  glyphDrawFn(glyphCtx);

  // Step 2: cast shadow from glyph mask onto shadowC
  const shadowC = document.createElement('canvas');
  shadowC.width = W; shadowC.height = H;
  const shadowCtx = shadowC.getContext('2d')!;
  shadowCtx.shadowBlur    = shadowBlur;
  shadowCtx.shadowOffsetX = shadowOffsetX;
  shadowCtx.shadowOffsetY = shadowOffsetY;
  shadowCtx.shadowColor   = shadowColor;
  shadowCtx.drawImage(glyphC, 0, 0);

  // Step 3: erase glyph pixels from shadowC — leave only the halo
  shadowCtx.globalCompositeOperation = 'destination-out';
  shadowCtx.drawImage(glyphC, 0, 0);

  // Step 4: composite shadow onto main canvas (source-over, before text)
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  const alpha1 = Math.min(shadowStrength / 100, 1);
  ctx.globalAlpha = alpha1;
  ctx.drawImage(shadowC, 0, 0);
  if (shadowStrength > 100) {
    ctx.globalAlpha = (shadowStrength - 100) / 100;
    ctx.drawImage(shadowC, 0, 0);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawFrameToCanvas(
  cue: Cue,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  values: AnimationValues,
  bgColor: string,
  isAlpha = false,
  logoImage: HTMLImageElement | null = null,
  metaOffscreen: MetaOffscreen | null = null
) {
  const config = cue.config;

  // Scale factor: map 1920x1080 design space to actual output resolution
  const scaleX = width / BASE_WIDTH;
  const scaleY = height / BASE_HEIGHT;
  const resScale = Math.min(scaleX, scaleY);

  // Design-space values
  const posX = config.posX * resScale;
  const posY = config.posY * resScale;
  const eyebrowGap = ((config as any).eyebrowGap ?? 8) * resScale;
  const titleGap = ((config as any).titleGap ?? 10) * resScale;

  const effectiveFontWeight = config.bold ? "700" : (config.fontWeight ?? "normal");
  const effectiveTitleFontWeight = (config.animationType === 'meta' && (config as any).titleFontWeight)
    ? (config as any).titleFontWeight
    : effectiveFontWeight;
  const fontStyle = config.italic ? "italic" : "normal";

  const eyebrow = config.eyebrow ?? "";

  const eyebrowValues = values.eyebrow;
  const nameValues = values.name;
  const titleValues = values.title;

  const isMetaAnim = config.animationType === 'meta';

  // Base font sizes (design space × resolution scale)
  const baseEyebrowFontSize = config.fontSize * resScale * ((config.eyebrowFontSizePercent ?? 40) / 100);
  const baseNameFontSize    = config.fontSize * resScale;
  const baseTitleFontSize   = config.fontSize * resScale * ((config.titleFontSizePercent ?? 75) / 100);

  // For Meta: NEVER bake scale into font size — use ctx.scale() transform instead.
  // Font sizes are always BASE values. The canvas GPU handles scaling (perfectly smooth).
  const metaGroupScale  = isMetaAnim ? nameValues.scale : 1;  // single shared scale from GSAP
  const metaGroupDriftX = isMetaAnim ? nameValues.x * resScale : 0; // single shared drift
  const scaledEyebrowFontSize = baseEyebrowFontSize; // always base — no font-size scaling
  const scaledNameFontSize    = baseNameFontSize;
  const scaledTitleFontSize   = baseTitleFontSize;

  const eyebrowFontString = `${fontStyle} ${effectiveFontWeight} ${scaledEyebrowFontSize}px "${config.font}", sans-serif`;
  const fontString        = `${fontStyle} ${effectiveFontWeight} ${scaledNameFontSize}px "${config.font}", sans-serif`;
  const titleFontString   = `${fontStyle} ${effectiveTitleFontWeight} ${scaledTitleFontSize}px "${config.font}", sans-serif`;

  // Y positions: always textBaseline='top', always base font sizes.
  const baseEyebrowY = (eyebrow || logoImage) ? posY - baseEyebrowFontSize - eyebrowGap : 0;
  const baseNameY    = posY;
  const baseTitleY   = posY + baseNameFontSize + titleGap;
  const eyebrowYPos = Math.round(baseEyebrowY + (isMetaAnim ? 0 : eyebrowValues.y * resScale));
  const nameYPos    = Math.round(baseNameY    + (isMetaAnim ? 0 : nameValues.y    * resScale));
  const titleYPos   = Math.round(baseTitleY   + (isMetaAnim ? 0 : titleValues.y   * resScale));

  // Canvas quality settings
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Background
  if (isAlpha) {
    // Transparent export: clear to transparent so the caller can composite a preview background
    // (checkerboard for preview, nothing for actual export frames)
    ctx.clearRect(0, 0, width, height);
  } else {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);
  }

  // Sync test mode
  if (config.animationType === "syncTest" && values.syncTestColor) {
    ctx.fillStyle = isAlpha ? "#FFFFFF" : values.syncTestColor;
    ctx.fillRect(0, 0, width, height);
    return;
  }

  ctx.save();
  // Always top-baseline.
  ctx.textBaseline = "top";
  ctx.fillStyle = config.color;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // For Meta: use pre-rendered offscreen canvases + drawImage() for perfectly smooth scaling.
  // Text is rasterized once at MAX scale; drawImage() GPU-scales it each frame (no stepping).
  if (isMetaAnim && metaOffscreen) {
    const off = metaOffscreen;
    const s = metaGroupScale / off.maxScale; // scale factor relative to max
    const dstX = posX + metaGroupDriftX;

    // Destination sizes (GPU-scaled from pre-rendered max-scale bitmap)
    const dstNameW    = off.name.w    * s;
    const dstNameH    = off.name.h    * s;
    const dstTitleW   = off.title.w   * s;
    const dstTitleH   = off.title.h   * s;
    const dstEyebrowW = off.eyebrow.w * s;
    const dstEyebrowH = off.eyebrow.h * s;

    // Destination Y positions (anchored to posY for name, growing up/down)
    const dstNameY    = posY;
    const dstTitleY   = dstNameY + dstNameH + titleGap;
    const dstEyebrowY = dstNameY - dstEyebrowH - eyebrowGap;

    // Draw each line with its own opacity using drawImage()
    // Always use colorCanvas — it has the correct text colour and globalAlpha handles fade.
    // alphaCanvas (white matte) was for the old dual-feed system and is not used for transparent export.
    const offCanvas = off.colorCanvas;
    // Eyebrow
    if (off.eyebrow.w > 0) {
      ctx.globalAlpha = eyebrowValues.opacity;
      ctx.drawImage(offCanvas, off.eyebrow.x, off.eyebrow.y, off.eyebrow.w, off.eyebrow.h, dstX, dstEyebrowY, dstEyebrowW, dstEyebrowH);
    }
    // Name
    ctx.globalAlpha = nameValues.opacity;
    ctx.drawImage(offCanvas, off.name.x, off.name.y, off.name.w, off.name.h, dstX, dstNameY, dstNameW, dstNameH);
    // Title
    ctx.globalAlpha = titleValues.opacity;
    ctx.drawImage(offCanvas, off.title.x, off.title.y, off.title.w, off.title.h, dstX, dstTitleY, dstTitleW, dstTitleH);

    ctx.globalAlpha = 1;
    ctx.restore();

    // ── META SHADOW PASS (matching Live page) ──────────────────────────────────
    if (config.shadowEnabled) {
      const W = width;
      const H = height;
      applyShadow(
        ctx, W, H,
        (config.shadowBlur ?? 10) * resScale,
        (config.shadowOffsetX ?? 0) * resScale,
        (config.shadowOffsetY ?? 0) * resScale,
        config.shadowColor ?? 'rgba(0,0,0,0.8)',
        config.shadowStrength ?? 100,
        bgColor,
        (gCtx) => {
          gCtx.textBaseline = 'top';
          gCtx.imageSmoothingEnabled = true;
          gCtx.imageSmoothingQuality = 'high';
          if (off.eyebrow.w > 0) {
            gCtx.globalAlpha = eyebrowValues.opacity;
            gCtx.drawImage(off.alphaCanvas, off.eyebrow.x, off.eyebrow.y, off.eyebrow.w, off.eyebrow.h, dstX, dstEyebrowY, dstEyebrowW, dstEyebrowH);
          }
          gCtx.globalAlpha = nameValues.opacity;
          gCtx.drawImage(off.alphaCanvas, off.name.x, off.name.y, off.name.w, off.name.h, dstX, dstNameY, dstNameW, dstNameH);
          gCtx.globalAlpha = titleValues.opacity;
          gCtx.drawImage(off.alphaCanvas, off.title.x, off.title.y, off.title.w, off.title.h, dstX, dstTitleY, dstTitleW, dstTitleH);
          gCtx.globalAlpha = 1;
        }
      );
      // Redraw text on top of shadow (matching Live page)
      if (off.eyebrow.w > 0) {
        ctx.globalAlpha = eyebrowValues.opacity;
        ctx.drawImage(offCanvas, off.eyebrow.x, off.eyebrow.y, off.eyebrow.w, off.eyebrow.h, dstX, dstEyebrowY, dstEyebrowW, dstEyebrowH);
      }
      ctx.globalAlpha = nameValues.opacity;
      ctx.drawImage(offCanvas, off.name.x, off.name.y, off.name.w, off.name.h, dstX, dstNameY, dstNameW, dstNameH);
      ctx.globalAlpha = titleValues.opacity;
      ctx.drawImage(offCanvas, off.title.x, off.title.y, off.title.w, off.title.h, dstX, dstTitleY, dstTitleW, dstTitleH);
      ctx.globalAlpha = 1;
    }

    return; // Meta rendering complete — skip standard text rendering
  }

  // Shadow is applied AFTER text is drawn (see shadow pass below).
  // Do NOT set shadowBlur on ctx here — inner save/restore calls would clear it.

  const useLetterAnim = eyebrowValues.letterOpacities || nameValues.letterOpacities || titleValues.letterOpacities;

  const textX = posX;
  // X positions: for non-Meta, apply per-line drift.
  const metaSharedLeftX = posX; // unused for non-Meta, kept for letter-anim path

  if (useLetterAnim) {
    // Letter animation path (unchanged)
    if (eyebrow && eyebrowValues.letterOpacities) {
      ctx.font = eyebrowFontString;
      let cx = isMetaAnim ? metaSharedLeftX : textX + eyebrowValues.x * resScale;
      eyebrow.split("").forEach((letter, i) => {
        const lo = eyebrowValues.letterOpacities![i] ?? 0;
        ctx.globalAlpha = lo;
        if (lo > 0) {
          if (config.borderEnabled) { ctx.strokeStyle = config.borderColor ?? "#000"; ctx.lineWidth = (config.borderWidth ?? 2) * resScale; ctx.strokeText(letter, cx, eyebrowYPos); }
          ctx.fillText(letter, cx, eyebrowYPos);
        }
        cx += ctx.measureText(letter).width;
      });
    }
    if (nameValues.letterOpacities) {
      ctx.font = fontString;
      let cx = isMetaAnim ? metaSharedLeftX : textX + nameValues.x * resScale;
      config.name.split("").forEach((letter, i) => {
        const lo = nameValues.letterOpacities![i] ?? 0;
        ctx.globalAlpha = lo;
        if (lo > 0) {
          if (config.borderEnabled) { ctx.strokeStyle = config.borderColor ?? "#000"; ctx.lineWidth = (config.borderWidth ?? 2) * resScale; ctx.strokeText(letter, cx, nameYPos); }
          ctx.fillText(letter, cx, nameYPos);
        }
        cx += ctx.measureText(letter).width;
      });
    }
    if (titleValues.letterOpacities) {
      ctx.font = titleFontString;
      let cx = isMetaAnim ? metaSharedLeftX : textX + titleValues.x * resScale;
      config.title.split("").forEach((letter, i) => {
        const lo = titleValues.letterOpacities![i] ?? 0;
        ctx.globalAlpha = lo;
        if (lo > 0) {
          if (config.borderEnabled) { ctx.strokeStyle = config.borderColor ?? "#000"; ctx.lineWidth = (config.borderWidth ?? 2) * resScale; ctx.strokeText(letter, cx, titleYPos); }
          ctx.fillText(letter, cx, titleYPos);
        }
        cx += ctx.measureText(letter).width;
      });
    }
  } else {
    // Standard (non-letter) animation path
    // For Meta: transform handles drift, so draw at base posX.
    // For others: apply per-line drift.
    const eyebrowDrawX = isMetaAnim ? textX : Math.round(textX + eyebrowValues.x * resScale);
    const nameDrawX    = isMetaAnim ? textX : Math.round(textX + nameValues.x * resScale);
    const titleDrawX   = isMetaAnim ? textX : Math.round(textX + titleValues.x * resScale);

    // Eyebrow
    if (eyebrow || logoImage) {
      ctx.save();
      ctx.font = eyebrowFontString;
      ctx.globalAlpha = eyebrowValues.opacity;

      const logoH = scaledEyebrowFontSize;
      const logoW = logoImage ? Math.round((logoImage.naturalWidth / logoImage.naturalHeight) * logoH) : 0;
      const logoGap2 = logoImage ? Math.round(scaledEyebrowFontSize * 0.3) : 0;
      const textW = eyebrow ? ctx.measureText(eyebrow).width : 0;
      const logoPos = config.logoPosition ?? "before";

      let textDrawXEyebrow = eyebrowDrawX;
      let logoDrawX = eyebrowDrawX;
      if (logoImage) {
        if (logoPos === "before") {
          logoDrawX = eyebrowDrawX;
          textDrawXEyebrow = eyebrowDrawX + logoW + logoGap2;
        } else {
          textDrawXEyebrow = eyebrowDrawX;
          logoDrawX = eyebrowDrawX + textW + logoGap2;
        }
      }

      // drawImage uses top-left Y anchor — same as textBaseline='top'.
      const logoTopY = eyebrowYPos;
      if (logoImage) {
        if (isAlpha) {
          ctx.save();
          ctx.globalCompositeOperation = "source-over";
          ctx.drawImage(logoImage, logoDrawX, logoTopY, logoW, logoH);
          ctx.globalCompositeOperation = "source-atop";
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(logoDrawX, logoTopY, logoW, logoH);
          ctx.restore();
        } else {
          ctx.drawImage(logoImage, logoDrawX, logoTopY, logoW, logoH);
        }
      }

      if (eyebrow) {
        if (config.borderEnabled) { ctx.strokeStyle = config.borderColor ?? "#000"; ctx.lineWidth = (config.borderWidth ?? 2) * resScale; ctx.strokeText(eyebrow, textDrawXEyebrow, eyebrowYPos); }
        ctx.fillText(eyebrow, textDrawXEyebrow, eyebrowYPos);
      }
      ctx.restore();
    }

    // Name
    ctx.save();
    ctx.font = fontString;
    ctx.globalAlpha = nameValues.opacity;
    if (config.borderEnabled) { ctx.strokeStyle = config.borderColor ?? "#000"; ctx.lineWidth = (config.borderWidth ?? 2) * resScale; ctx.strokeText(config.name, nameDrawX, nameYPos); }
    ctx.fillText(config.name, nameDrawX, nameYPos);
    ctx.restore();

    // Title
    ctx.save();
    ctx.font = titleFontString;
    ctx.globalAlpha = titleValues.opacity;
    if (config.borderEnabled) { ctx.strokeStyle = config.borderColor ?? "#000"; ctx.lineWidth = (config.borderWidth ?? 2) * resScale; ctx.strokeText(config.title, titleDrawX, titleYPos); }
    ctx.fillText(config.title, titleDrawX, titleYPos);
    ctx.restore();
  }

  // ── SHADOW PASS (colour canvas only) ────────────────────────────────────
  // Draw glyphs onto a fresh transparent canvas, cast shadow, composite before text.
  // This approach works with any bgColor including transparent.
  if (config.shadowEnabled) {
    const W = width;
    const H = height;
    const eyebrowDrawX2 = isMetaAnim ? textX : Math.round(textX + eyebrowValues.x * resScale);
    const nameDrawX2    = isMetaAnim ? textX : Math.round(textX + nameValues.x * resScale);
    const titleDrawX2   = isMetaAnim ? textX : Math.round(textX + titleValues.x * resScale);
    applyShadow(
      ctx, W, H,
      (config.shadowBlur ?? 10) * resScale,
      (config.shadowOffsetX ?? 3) * resScale,
      (config.shadowOffsetY ?? 3) * resScale,
      config.shadowColor ?? '#000000',
      config.shadowStrength ?? 100,
      bgColor,
      (gCtx) => {
        gCtx.textBaseline = 'top';
        gCtx.imageSmoothingEnabled = true;
        gCtx.imageSmoothingQuality = 'high';
        // Eyebrow
        if (eyebrow) {
          gCtx.font = eyebrowFontString;
          gCtx.globalAlpha = eyebrowValues.opacity;
          gCtx.fillText(eyebrow, eyebrowDrawX2, eyebrowYPos);
        }
        // Name
        gCtx.font = fontString;
        gCtx.globalAlpha = nameValues.opacity;
        gCtx.fillText(config.name, nameDrawX2, nameYPos);
        // Title
        gCtx.font = titleFontString;
        gCtx.globalAlpha = titleValues.opacity;
        gCtx.fillText(config.title, titleDrawX2, titleYPos);
        gCtx.globalAlpha = 1;
      }
    );
  }

  if (config.underline) {
    ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.font = fontString;
    const nameWidth = ctx.measureText(config.name).width;
    ctx.font = titleFontString;
    const titleWidth = ctx.measureText(config.title).width;
    ctx.strokeStyle = config.color;
    ctx.lineWidth = Math.max(2 * resScale, scaledNameFontSize / 24);
    ctx.globalAlpha = 1;
    // Underline goes below the text (textBaseline='top' + font size + 2px gap).
    const ulNameY  = nameYPos  + scaledNameFontSize  + 2 * resScale;
    const ulTitleY = titleYPos + scaledTitleFontSize + 2 * resScale;
    const ulX = isMetaAnim ? metaSharedLeftX : textX;
    ctx.beginPath();
    ctx.moveTo(ulX, ulNameY);
    ctx.lineTo(ulX + nameWidth, ulNameY);
    ctx.moveTo(ulX, ulTitleY);
    ctx.lineTo(ulX + titleWidth, ulTitleY);
    ctx.stroke();
  }

  ctx.restore();
}

// ─── Render all frames to PNG blobs (synchronous, deterministic) ─────────────
// Uses GSAP seekTo to step through the timeline frame-by-frame.
// Returns an array of PNG Uint8Arrays, one per frame, ready for ffmpeg.
async function renderFramesToPNGs(
  cue: Cue,
  width: number,
  height: number,
  fps: number,
  isAlpha: boolean,
  bgColor: string,
  animDur: number,
  dwellDur: number,
  onProgress: (frame: number, total: number) => void,
  logoImage: HTMLImageElement | null = null
): Promise<Uint8Array[]> {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  // willReadFrequently: false = GPU-accelerated path (we write then toBlob, no readback needed)
  const ctx = canvas.getContext("2d", { willReadFrequently: false, alpha: true })!;
  ctx.lineJoin = 'round';
  ctx.lineCap  = 'round';

  // Alpha export strategy:
  // canvas.toBlob('image/png') produces STRAIGHT alpha PNGs — the browser correctly
  // un-premultiplies when encoding to PNG. Premiere Pro 2022+ treats ProRes 4444 as
  // straight alpha by default, so these frames composite correctly without any
  // Interpret Footage step. No manual premultiplication needed.

  const controller = new GSAPAnimationController();
  // Build the GSAP timeline paused at time=0 (blank frame)
  controller.playAnimation(cue, animDur, dwellDur, true);
  const timelineDuration = controller.getTotalDuration(); // seconds
  const frameDuration = 1 / fps; // seconds per frame

  // Total frames = full timeline + 3 extra blank tail frames to guarantee out-animation completes
  const totalFrames = Math.ceil(timelineDuration * fps) + 3;

  const frames: Uint8Array[] = [];

  // For Meta animation: create offscreen canvases once (pre-rendered at MAX scale)
  // so drawImage() can GPU-scale each frame without font rasterization stepping.
  const resScale = Math.min(width / BASE_WIDTH, height / BASE_HEIGHT);
  const metaOffscreen = (cue.config.animationType === 'meta')
    ? createMetaOffscreenForExport(cue, resScale, logoImage)
    : null;

  for (let frame = 0; frame < totalFrames; frame++) {
    // Seek GSAP to exact frame time. After timeline end, seek to end so final state is blank.
    const timeSec = frame * frameDuration;
    const clampedTime = Math.min(timeSec, timelineDuration);
    controller.seekTo(clampedTime);
    const values = controller.getValues();

    drawFrameToCanvas(cue, ctx, width, height, values, bgColor, isAlpha, logoImage, metaOffscreen);

    // Export frame as PNG
    const pngData = await new Promise<Uint8Array>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error(`Frame ${frame} toBlob failed`)); return; }
        blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf))).catch(reject);
      }, "image/png");
    });
    frames.push(pngData);
    onProgress(frame + 1, totalFrames);

    // Yield to browser every 10 frames to keep UI responsive
    if (frame % 10 === 9) {
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }

  controller.stop();
  return frames;
}

// ─── Component ────────────────────────────────────────────────────────────────
// Draw a checkerboard pattern onto a canvas context (preview only, never exported)
function drawCheckerboard(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const tileSize = Math.round(width / 48); // ~40px at 1920
  const c1 = '#444444';
  const c2 = '#222222';
  for (let row = 0; row < Math.ceil(height / tileSize); row++) {
    for (let col = 0; col < Math.ceil(width / tileSize); col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? c1 : c2;
      ctx.fillRect(col * tileSize, row * tileSize, tileSize, tileSize);
    }
  }
}

export default function Export() {
  const [cues, setCues] = useState<Cue[]>([]);
  const [selectedCue, setSelectedCue] = useState<string>("all");
  const [exportFormat, setExportFormat] = useState<string>("png");
  const [transparentBackground, setTransparentBackground] = useState(false);
  const [resolution, setResolution] = useState<string>("1920x1080");
  const [exporting, setExporting] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [bgColor, setBgColor] = useState<string>(() => localStorage.getItem('live-bgColor') || '#000000');

  // ffmpeg load state
  const [ffmpegState, setFfmpegState] = useState<"idle" | "loading" | "ready" | "error">(
    ffmpegLoadState === "ready" ? "ready" : "idle"
  );
  const [ffmpegLoadPct, setFfmpegLoadPct] = useState(ffmpegLoadState === "ready" ? 100 : 0);
  const [ffmpegLoadMsg, setFfmpegLoadMsg] = useState(ffmpegLoadState === "ready" ? "ffmpeg-core ready" : "");

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewGsapRef = useRef<GSAPAnimationController>(new GSAPAnimationController());
  const logoImageRef = useRef<HTMLImageElement | null>(null);

  // Load logo image whenever the selected cue changes
  useEffect(() => {
    const cue = cues.find(c => c.id === selectedCue);
    const logoUrl = cue?.config?.logoDataUrl;
    if (!logoUrl) { logoImageRef.current = null; return; }
    const img = new Image();
    img.onload = () => { logoImageRef.current = img; };
    img.src = logoUrl;
  }, [selectedCue, cues]);
  const previewProgressRafRef = useRef<number | null>(null);
  const previewStartTimeRef = useRef<number | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [previewElapsedMs, setPreviewElapsedMs] = useState(0);
  const [previewTotalMs, setPreviewTotalMs] = useState(0);

  // ─── Filename dialog state ────────────────────────────────────────────────
  const [filenameDialog, setFilenameDialog] = useState<{
    open: boolean;
    currentName: string;
    resolve: ((name: string | null) => void) | null;
  }>({ open: false, currentName: "", resolve: null });
  const [filenameInput, setFilenameInput] = useState("");

  // Prompts user to confirm/edit a filename. Returns the confirmed name or null if cancelled.
  const promptFilename = useCallback((suggestedName: string): Promise<string | null> => {
    return new Promise((resolve) => {
      setFilenameInput(suggestedName);
      setFilenameDialog({ open: true, currentName: suggestedName, resolve });
    });
  }, []);

  const handleFilenameConfirm = () => {
    const name = filenameInput.trim() || filenameDialog.currentName;
    setFilenameDialog((d) => ({ ...d, open: false }));
    filenameDialog.resolve?.(name);
  };

  const handleFilenameCancel = () => {
    setFilenameDialog((d) => ({ ...d, open: false }));
    filenameDialog.resolve?.(null);
  };

  useEffect(() => {
    const saved = localStorage.getItem("lower-thirds-cues");
    if (saved) setCues(JSON.parse(saved));
  }, []);

  // Pre-warm ffmpeg when any video format is selected
  // png-seq uses fflate (no ffmpeg needed); only true video formats need ffmpeg
  const isVideoFormat = exportFormat !== "png" && exportFormat !== "png-seq";
  useEffect(() => {
    if (isVideoFormat && ffmpegLoadState === "idle") {
      setFfmpegState("loading");
      getFFmpeg((pct, msg) => {
        setFfmpegLoadPct(pct);
        setFfmpegLoadMsg(msg);
        if (pct >= 100) setFfmpegState("ready");
      }).catch(() => {
        setFfmpegState("error");
        setFfmpegLoadMsg("Failed to load ffmpeg-core");
      });
    }
  }, [exportFormat]);

  // Static preview
  useEffect(() => {
    if (selectedCue === "all" || cues.length === 0) return;
    const cue = cues.find((c) => c.id === selectedCue);
    if (!cue || !previewCanvasRef.current) return;
    const [w, h] = resolution.split("x").map(Number);
    const canvas = previewCanvasRef.current;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.lineJoin = 'round';
    ctx.lineCap  = 'round';
    const controller = new GSAPAnimationController();
    const animDur = cue.config.animationDuration;
    const dwellDur = cue.config.dwellDuration ?? 3000;
    controller.playAnimation(cue, animDur, dwellDur);
    // Pre-render offscreen for Meta animation
    const rs = Math.min(w / BASE_WIDTH, h / BASE_HEIGHT);
    const metaOff = cue.config.animationType === 'meta' ? createMetaOffscreenForExport(cue, rs, logoImageRef.current) : null;
    // Show the fully-visible dwell frame
    setTimeout(() => {
      const values = controller.getValues();
      if (transparentBackground) drawCheckerboard(ctx, w, h);
      drawFrameToCanvas(cue, ctx, w, h, values, transparentBackground ? 'rgba(0,0,0,0)' : bgColor, transparentBackground, logoImageRef.current, metaOff);
      controller.stop();
    }, animDur + 100);
  }, [selectedCue, cues, resolution, bgColor, transparentBackground]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Preview playback: GSAP-driven render loop ─────────────────────────────────────────────
  useEffect(() => {
    if (!isPreviewPlaying) {
      // Stop render loop and reset
      if (previewProgressRafRef.current) cancelAnimationFrame(previewProgressRafRef.current);
      previewGsapRef.current.reset();
      // Restore static dwell frame
      if (selectedCue !== 'all' && cues.length > 0) {
        const cue = cues.find((c) => c.id === selectedCue);
        if (cue && previewCanvasRef.current) {
          const [w, h] = resolution.split('x').map(Number);
          const canvas = previewCanvasRef.current;
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d')!;
          ctx.lineJoin = 'round';
          ctx.lineCap  = 'round';
          const ctrl = new GSAPAnimationController();
          const animDur = cue.config.animationDuration;
          const dwellDur = cue.config.dwellDuration ?? 3000;
          ctrl.playAnimation(cue, animDur, dwellDur);
          const rs2 = Math.min(w / BASE_WIDTH, h / BASE_HEIGHT);
          const metaOff2 = cue.config.animationType === 'meta' ? createMetaOffscreenForExport(cue, rs2, logoImageRef.current) : null;
          setTimeout(() => {
            const values = ctrl.getValues();
            if (transparentBackground) drawCheckerboard(ctx, w, h);
            drawFrameToCanvas(cue, ctx, w, h, values, transparentBackground ? 'rgba(0,0,0,0)' : bgColor, transparentBackground, logoImageRef.current, metaOff2);
            ctrl.stop();
          }, animDur + 100);
        }
      }
      return;
    }

    const cue = cues.find((c) => c.id === selectedCue);
    if (!cue || !previewCanvasRef.current) return;

    const [w, h] = resolution.split('x').map(Number);
    const canvas = previewCanvasRef.current;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: false })!;
    ctx.lineJoin = 'round';
    ctx.lineCap  = 'round';

    const animDur = cue.config.animationDuration || 1000;
    const dwellDur = cue.config.dwellDuration ?? 3000;

    // Start GSAP animation in real-time (not paused)
    previewGsapRef.current.playAnimation(cue, animDur, dwellDur, false);
    const gsDuration = previewGsapRef.current.getTotalDuration(); // seconds
    const totalMs = Math.ceil(gsDuration * 1000) + 500;
    setPreviewTotalMs(totalMs);
    setPreviewElapsedMs(0);
    setPreviewProgress(0);
    previewStartTimeRef.current = performance.now();

    // Pre-render offscreen for Meta animation (created once, used every frame)
    const rs3 = Math.min(w / BASE_WIDTH, h / BASE_HEIGHT);
    const metaOff3 = cue.config.animationType === 'meta' ? createMetaOffscreenForExport(cue, rs3, logoImageRef.current) : null;

    // Canvas render loop — driven by GSAP's own ticker so draw always
    // happens after GSAP has computed values for this frame (no jitter).
    const renderFrame = () => {
      const values = previewGsapRef.current.getValues();
      if (transparentBackground) drawCheckerboard(ctx, w, h);
      drawFrameToCanvas(cue, ctx, w, h, values, transparentBackground ? 'rgba(0,0,0,0)' : bgColor, transparentBackground, logoImageRef.current, metaOff3);
    };
    gsap.ticker.add(renderFrame);
    renderFrame(); // immediate first draw

    // Progress ticker
    const tickProgress = () => {
      const elapsed = performance.now() - (previewStartTimeRef.current ?? 0);
      const pct = Math.min((elapsed / totalMs) * 100, 100);
      setPreviewProgress(pct);
      setPreviewElapsedMs(elapsed);
      if (pct < 100) {
        previewProgressRafRef.current = requestAnimationFrame(tickProgress);
      }
    };
    previewProgressRafRef.current = requestAnimationFrame(tickProgress);

    // Auto-stop after full animation
    const stopId = setTimeout(() => {
      setIsPreviewPlaying(false);
      setPreviewProgress(0);
      setPreviewElapsedMs(0);
      previewStartTimeRef.current = null;
    }, totalMs);

    return () => {
      clearTimeout(stopId);
      gsap.ticker.remove(renderFrame);
      if (previewProgressRafRef.current) cancelAnimationFrame(previewProgressRafRef.current);
    };
  }, [isPreviewPlaying]);

  // Stop preview when cue or resolution changes
  useEffect(() => {
    if (isPreviewPlaying) setIsPreviewPlaying(false);
  }, [selectedCue, resolution]);

  const updateQueueItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    setQueue((prev) => prev.map((item) => item.id === id ? { ...item, ...patch } : item));
  }, []);

  // ─── Main export handler ───────────────────────────────────────────────────
  const handleExportMedia = async () => {
    if (cues.length === 0) { toast.error("No cues available to export"); return; }

    const list = selectedCue === "all" ? cues : cues.filter((c) => c.id === selectedCue);
    const initialQueue: QueueItem[] = list.map((c) => ({ id: c.id, name: c.name, status: "queued", progress: 0 }));
    setQueue(initialQueue);
    setExporting(true);

    try {
      const [width, height] = resolution.split("x").map(Number);
      const fps = 50; // 50fps for smooth animation (broadcast standard for PAL/50Hz content)

      for (const cue of list) {
        // Always use the cue's saved timing values
        const animDur = cue.config.animationDuration || 1000;
        const dwellDur = cue.config.dwellDuration ?? 3000;

        // Prompt user for filename before rendering this cue
        const fmtDef = VIDEO_FORMATS.find(f => f.value === exportFormat);
        const ext = fmtDef ? fmtDef.ext : "png";
        const suggestedName = `${cue.name.replace(/\s+/g, "_")}.${ext}`;
        const confirmedName = await promptFilename(suggestedName);
        if (confirmedName === null) {
          // User cancelled — skip this cue
          updateQueueItem(cue.id, { status: "error", error: "Cancelled" });
          continue;
        }
        // Ensure correct extension
        const finalName = confirmedName.endsWith(`.${ext}`) ? confirmedName : `${confirmedName}.${ext}`;

        if (exportFormat === "png") {
          updateQueueItem(cue.id, { status: "recording", progress: 50 });
          const canvas = document.createElement("canvas");
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext("2d")!;
          ctx.lineJoin = 'round';
          ctx.lineCap  = 'round';
          const controller = new GSAPAnimationController();
          controller.playAnimation(cue, animDur, dwellDur);
          const rs4 = Math.min(width / BASE_WIDTH, height / BASE_HEIGHT);
          const metaOff4 = cue.config.animationType === 'meta' ? createMetaOffscreenForExport(cue, rs4, logoImageRef.current) : null;
          await new Promise<void>((res) => {
            setTimeout(() => {
              const values = controller.getValues();
              drawFrameToCanvas(cue, ctx, width, height, values, transparentBackground ? "rgba(0,0,0,0)" : bgColor, false, logoImageRef.current, metaOff4);
              controller.stop();
              canvas.toBlob((blob) => {
                if (blob) {
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url; a.download = finalName; a.click();
                  URL.revokeObjectURL(url);
                }
                res();
              }, "image/png");
            }, animDur + 100);
          });
          updateQueueItem(cue.id, { status: "done", progress: 100 });

        } else if (fmtDef && exportFormat === "png-seq") {
          // ── PNG Sequence ZIP export (no ffmpeg needed) ──────────────────────────
          // This is the most reliable transparent export for Premiere Pro.
          // Renders all frames as RGBA PNGs, packages them into a ZIP.
          // In Premiere: File > Import > select frame_0001.png > tick "Image Sequence"
          updateQueueItem(cue.id, { status: "recording", progress: 0 });

          const cueLogoImage = await new Promise<HTMLImageElement | null>((resolve) => {
            const url = cue.config.logoDataUrl;
            if (!url) { resolve(null); return; }
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = url;
          });

          // Always render transparent for PNG sequence (that's the whole point)
          const seqFrames = await renderFramesToPNGs(
            cue, width, height, fps, true, "rgba(0,0,0,0)", animDur, dwellDur,
            (f: number, t: number) => {
              updateQueueItem(cue.id, { progress: Math.round((f / t) * 80) });
            },
            cueLogoImage
          );

          updateQueueItem(cue.id, { status: "converting", progress: 82 });

          // Build ZIP with numbered frames: frame_0001.png, frame_0002.png, ...
          // Also include a README with Premiere import instructions
          const zipFiles: Record<string, Uint8Array> = {};
          for (let i = 0; i < seqFrames.length; i++) {
            const frameName = `frame_${String(i + 1).padStart(4, "0")}.png`;
            zipFiles[frameName] = seqFrames[i];
          }
          const readmeTxt = [
            `PNG Sequence — ${cue.name}`,
            `Frames: ${seqFrames.length} @ ${fps}fps`,
            `Resolution: ${width}x${height}`,
            ``,
            `HOW TO IMPORT IN PREMIERE PRO:`,
            `1. File > Import (or drag into Project panel)`,
            `2. Select frame_0001.png`,
            `3. Tick "Image Sequence" in the import dialog`,
            `4. Click Open`,
            `5. Right-click the clip > Modify > Interpret Footage`,
            `   Set frame rate to ${fps} fps`,
            `6. Drop on V2 above your footage — transparency works automatically`,
            ``,
            `Note: The PNG frames use straight (unassociated) alpha.`,
            `If colours look washed out, set Interpret Footage alpha to "Straight - Unmatted".`,
          ].join("\n");
          zipFiles["README.txt"] = new TextEncoder().encode(readmeTxt);

          updateQueueItem(cue.id, { status: "converting", progress: 90 });

          const zipped = zipSync(zipFiles, { level: 0 }); // level 0 = store only (PNGs are already compressed)
          const zipBlob = new Blob([zipped], { type: "application/zip" });
          const zipUrl = URL.createObjectURL(zipBlob);
          const aZip = document.createElement("a");
          aZip.href = zipUrl;
          aZip.download = finalName;
          aZip.click();
          setTimeout(() => URL.revokeObjectURL(zipUrl), 5000);

          updateQueueItem(cue.id, { status: "done", progress: 100 });

        } else if (fmtDef) {
          // ── Video export: render PNG frames then encode with ffmpeg ──
          updateQueueItem(cue.id, { status: "recording", progress: 0 });

          // Load logo for this specific cue (may differ from selectedCue in batch mode)
          const cueLogoImage = await new Promise<HTMLImageElement | null>((resolve) => {
            const url = cue.config.logoDataUrl;
            if (!url) { resolve(null); return; }
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = url;
          });

          // For alpha-capable formats with transparent background, render with transparency
          const renderTransparent = transparentBackground && fmtDef.supportsAlpha;
          const renderBg = renderTransparent ? "rgba(0,0,0,0)" : bgColor;

          const colorFrames = await renderFramesToPNGs(
            cue, width, height, fps, renderTransparent, renderBg, animDur, dwellDur,
            (f: number, t: number) => {
              updateQueueItem(cue.id, { progress: Math.round((f / t) * 55) });
            },
            cueLogoImage
          );

          updateQueueItem(cue.id, { status: "converting", progress: 55 });

          const ffmpeg = await getFFmpeg((pct, msg) => {
            setFfmpegLoadPct(pct); setFfmpegLoadMsg(msg);
          });

          // Write frames to ffmpeg virtual FS
          const framePrefix = `fr_${cue.id}`;
          for (let i = 0; i < colorFrames.length; i++) {
            await ffmpeg.writeFile(`${framePrefix}_${String(i).padStart(6, "0")}.png`, colorFrames[i]);
          }

          // Build ffmpeg args based on format
          const outFile = `out_${cue.id}.${fmtDef.ext}`;
          let ffmpegArgs: string[];

          if (exportFormat === "mp4") {
            ffmpegArgs = [
              "-framerate", String(fps),
              "-i", `${framePrefix}_%06d.png`,
              "-c:v", "libx264",
              "-preset", "ultrafast",
              "-crf", "18",
              "-pix_fmt", "yuv420p",
              "-movflags", "+faststart",
              outFile
            ];
          } else if (exportFormat === "prores") {
            // ProRes 4444 with alpha channel
            // PNG frames are premultiplied against black so Premiere Pro's default
            // "Premultiplied - Matted With Color: Black" interpretation works correctly
            // without any Interpret Footage step needed.
            ffmpegArgs = [
              "-framerate", String(fps),
              "-i", `${framePrefix}_%06d.png`,
              "-c:v", "prores_ks",
              "-profile:v", "4444",
              "-pix_fmt", renderTransparent ? "yuva444p10le" : "yuv444p10le",
              "-vendor", "apl0",
              ...(renderTransparent ? ["-alpha_bits", "16"] : []),
              outFile
            ];
          } else if (exportFormat === "qt-anim") {
            // QuickTime Animation (RLE) — lossless with alpha
            // PNG frames are premultiplied against black; argb pix_fmt preserves alpha channel
            ffmpegArgs = [
              "-framerate", String(fps),
              "-i", `${framePrefix}_%06d.png`,
              "-c:v", "qtrle",
              "-pix_fmt", renderTransparent ? "argb" : "rgb24",
              outFile
            ];
          } else {
            // AVI Uncompressed with alpha (bgra = straight alpha in raw video)
            ffmpegArgs = [
              "-framerate", String(fps),
              "-i", `${framePrefix}_%06d.png`,
              "-c:v", "rawvideo",
              "-pix_fmt", renderTransparent ? "bgra" : "bgr24",
              outFile
            ];
          }

          await ffmpeg.exec(ffmpegArgs);
          let outData = await ffmpeg.readFile(outFile);

          // For transparent ProRes 4444 exports: patch the alpha_type field in every ProRes
          // frame header (bitstream level). This is the field Premiere Pro 2026 actually reads
          // to determine whether a ProRes 4444 file contains an alpha channel.
          //
          // ProRes frame header structure (offsets from 'icpf' signature):
          //   +0  'icpf' (4 bytes)
          //   +4  header size (2 bytes)
          //   +6  version (2 bytes)
          //   +8  encoder identifier (4 bytes)
          //   +12 width (2 bytes)
          //   +14 height (2 bytes)
          //   +16 chroma format + interlace flags (1 byte)
          //   +17 aspect ratio (1 byte)
          //   +18 frame rate code (1 byte)
          //   +19 color primaries (1 byte)
          //   +20 transfer characteristic (1 byte)
          //   +21 matrix coefficients (1 byte)
          //   +22 ALPHA CHANNEL TYPE (1 byte) ← 0=none, 1=straight, 2=premultiplied
          //   +23 reserved (1 byte)
          //
          // ffmpeg prores_ks always writes alpha_type=0 even when encoding yuva444p10le.
          // Patching this to 1 (straight alpha) tells Premiere Pro to use the alpha channel.
          //
          // Also patch the MOV container stsd entry:
          //   - vendor_id at codecIdx+16: 'FFMP' → 'appl'
          //   - depth at codecIdx+78: 0x0020 → 0x8020 (32-bit with alpha flag)
          if ((exportFormat === "prores" || exportFormat === "qt-anim") && renderTransparent) {
            const buf = outData instanceof Uint8Array ? outData : new Uint8Array(outData as unknown as ArrayBuffer);
            const patched = new Uint8Array(buf);

            if (exportFormat === "prores") {
              // ── Patch 1: ProRes bitstream frame headers ──────────────────────────
              // Find every 'icpf' signature and set alpha_type = 1 (straight alpha)
              const icpf0 = 0x69, icpf1 = 0x63, icpf2 = 0x70, icpf3 = 0x66; // 'icpf'
              let framesPatchedCount = 0;
              for (let fi = 0; fi < patched.length - 26; fi++) {
                if (patched[fi] === icpf0 && patched[fi+1] === icpf1 &&
                    patched[fi+2] === icpf2 && patched[fi+3] === icpf3) {
                  // Validate: header size should be between 28 and 200
                  const hdrSize = (patched[fi+4] << 8) | patched[fi+5];
                  if (hdrSize >= 28 && hdrSize <= 200) {
                    // alpha_type is at icpf_offset + 22
                    if (patched[fi+22] === 0) { // only patch if currently 'no alpha'
                      patched[fi+22] = 1; // straight alpha
                      framesPatchedCount++;
                    }
                  }
                }
              }
              

              // ── Patch 2: MOV container stsd entry ────────────────────────────────
              // Find last 'ap4h' codec tag (stsd atom, not bitstream)
              const ap4h0 = 0x61, ap4h1 = 0x70, ap4h2 = 0x34, ap4h3 = 0x68;
              let codecIdx = -1;
              for (let ci = patched.length - 4; ci >= 0; ci--) {
                if (patched[ci] === ap4h0 && patched[ci+1] === ap4h1 &&
                    patched[ci+2] === ap4h2 && patched[ci+3] === ap4h3) {
                  codecIdx = ci;
                  break;
                }
              }
              if (codecIdx >= 0) {
                // vendor_id at +16: 'FFMP' → 'appl'
                const vOff = codecIdx + 16;
                if (patched[vOff] === 0x46 && patched[vOff+1] === 0x46 &&
                    patched[vOff+2] === 0x4D && patched[vOff+3] === 0x50) {
                  patched[vOff] = 0x61; patched[vOff+1] = 0x70;
                  patched[vOff+2] = 0x70; patched[vOff+3] = 0x6C;
                }
                // depth at +78: 0x0020 → 0x8020
                const dOff = codecIdx + 78;
                if (patched[dOff] === 0x00 && patched[dOff+1] === 0x20) {
                  patched[dOff] = 0x80;
                }
              }
            } else {
              // QT Animation: only patch the stsd container entry
              const rle0 = 0x72, rle1 = 0x6C, rle2 = 0x65, rle3 = 0x20; // 'rle '
              let codecIdx = -1;
              for (let ci = patched.length - 4; ci >= 0; ci--) {
                if (patched[ci] === rle0 && patched[ci+1] === rle1 &&
                    patched[ci+2] === rle2 && patched[ci+3] === rle3) {
                  codecIdx = ci;
                  break;
                }
              }
              if (codecIdx >= 0) {
                const vOff = codecIdx + 16;
                if (patched[vOff] === 0x46 && patched[vOff+1] === 0x46 &&
                    patched[vOff+2] === 0x4D && patched[vOff+3] === 0x50) {
                  patched[vOff] = 0x61; patched[vOff+1] = 0x70;
                  patched[vOff+2] = 0x70; patched[vOff+3] = 0x6C;
                }
                const dOff = codecIdx + 78;
                if (patched[dOff] === 0x00 && patched[dOff+1] === 0x20) {
                  patched[dOff] = 0x80;
                }
              }
            }

            outData = patched;
          }

          // Clean up frames
          for (let i = 0; i < colorFrames.length; i++) {
            await ffmpeg.deleteFile(`${framePrefix}_${String(i).padStart(6, "0")}.png`);
          }
          await ffmpeg.deleteFile(outFile);

          const outBlob = new Blob([outData], { type: fmtDef.mimeType });
          const outUrl = URL.createObjectURL(outBlob);
          const aOut = document.createElement("a");
          aOut.href = outUrl;
          aOut.download = finalName;
          aOut.click();
          setTimeout(() => URL.revokeObjectURL(outUrl), 5000);

          updateQueueItem(cue.id, { status: "done", progress: 100 });
        }
      }
      const _fmtLabel = VIDEO_FORMATS.find(f => f.value === exportFormat)?.label ?? exportFormat;
      toast.success(`${_fmtLabel.toUpperCase()} export completed`);
    } catch (err) {
      toast.error("Export failed — check browser console for details");
      setQueue((prev) => prev.map((item) => item.status !== "done" ? { ...item, status: "error", error: "Export failed" } : item));
    } finally {
      setExporting(false);
    }
  };

  // ─── Cue list import/export ────────────────────────────────────────────────
  const handleExportCueList = async () => {
    const storedName = localStorage.getItem("lower-thirds-cue-list-name") || "lower-thirds-cues";
    const confirmedName = await promptFilename(`${storedName}.json`);
    if (confirmedName === null) return;
    const finalName = confirmedName.endsWith(".json") ? confirmedName : `${confirmedName}.json`;
    const blob = new Blob([JSON.stringify(cues, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = finalName; a.click();
    URL.revokeObjectURL(url);
    toast.success("Cue list exported successfully");
  };

  const handleImportCueList = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target?.result as string);
        localStorage.setItem("lower-thirds-cues", JSON.stringify(imported));
        setCues(imported);
        toast.success(`Imported ${imported.length} cues successfully`);
      } catch { toast.error("Failed to import cue list. Invalid file format."); }
    };
    reader.readAsText(file);
  };

  const statusIcon = (status: QueueStatus) => {
    if (status === "done") return <CheckCircle className="w-4 h-4 text-green-400" />;
    if (status === "error") return <AlertCircle className="w-4 h-4 text-red-400" />;
    if (status === "recording" || status === "converting") return <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />;
    return <Clock className="w-4 h-4 text-gray-500" />;
  };

  const statusBadge = (status: QueueStatus) => {
    const map: Record<QueueStatus, string> = {
      queued: "bg-gray-700 text-gray-300",
      recording: "bg-blue-900 text-blue-300",
      converting: "bg-yellow-900 text-yellow-300",
      done: "bg-green-900 text-green-300",
      error: "bg-red-900 text-red-300",
    };
    return <span className={`text-xs px-2 py-0.5 rounded font-mono ${map[status]}`}>{status.toUpperCase()}</span>;
  };

  const exportReady = exportFormat === "png" || exportFormat === "png-seq" || ffmpegState === "ready";

  // ─── File size estimates ─────────────────────────────────────────────────────
  // Estimates are based on resolution, fps, and total animation duration.
  // Bitrate/compression assumptions:
  //   MP4 H.264:        ~8 Mbps at 1080p (ultrafast CRF 18)
  //   ProRes 4444:      ~330 Mbps at 1080p (Apple spec)
  //   QT Animation RLE: ~200 Mbps at 1080p (lossless, typical lower-thirds)
  //   AVI Uncompressed: width * height * 4 bytes/frame * fps (raw BGRA)
  const formatSizeEstimates = (() => {
    const [w, h] = resolution.split("x").map(Number);
    const fps = 50;
    // Use selected cue timing or a sensible default
    const cue = cues.find(c => c.id === selectedCue);
    const animMs = cue?.config.animationDuration ?? 1000;
    const dwellMs = cue?.config.dwellDuration ?? 3000;
    const totalSec = (animMs * 2 + dwellMs) / 1000; // in + dwell + out
    const totalFrames = Math.ceil(totalSec * fps);
    const scaleFactor = (w * h) / (1920 * 1080); // scale bitrate by pixel count

    const formatBytes = (bytes: number) => {
      if (bytes >= 1e9) return `~${(bytes / 1e9).toFixed(1)} GB`;
      if (bytes >= 1e6) return `~${(bytes / 1e6).toFixed(0)} MB`;
      return `~${(bytes / 1e3).toFixed(0)} KB`;
    };

    // PNG sequence: ~100KB per frame at 1080p (typical lower-thirds with sparse content)
    // Actual size varies greatly; this is a conservative estimate
    return {
      mp4:       formatBytes((8_000_000 * scaleFactor / 8) * totalSec),
      "png-seq": formatBytes(100_000 * scaleFactor * totalFrames),
      prores:    formatBytes((330_000_000 * scaleFactor / 8) * totalSec),
      "qt-anim": formatBytes((200_000_000 * scaleFactor / 8) * totalSec),
      avi:       formatBytes(w * h * 4 * totalFrames),
    } as Record<string, string>;
  })();

  // ─── UI ────────────────────────────────────────────────────────────────────
  return (
    <>
    <div className="h-screen bg-black text-white flex flex-col font-mono overflow-hidden">
      {/* Nav */}
      <div className="border-b-2 border-[#00c951] px-3 flex items-center justify-between flex-shrink-0 gap-2 min-w-0 h-14">
        <div className="flex items-center gap-2 min-w-0 shrink">
          <h1 className="text-xs font-bold tracking-wider whitespace-nowrap hidden md:block">LOWER THIRDS GENERATOR</h1>
          <nav className="flex gap-2 items-center">
            <Link href="/live" className="text-xs hover:text-cyan-400 transition-colors whitespace-nowrap" style={{ color: "#ff0000" }}>LIVE</Link>
            <Link href="/edit" className="text-xs text-gray-400 hover:text-cyan-400 transition-colors whitespace-nowrap">EDIT</Link>
            <Link href="/export" className="text-2xl font-bold flex items-center gap-1 whitespace-nowrap" style={{ color: "oklch(0.789 0.154 211.53)" }}>
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 flex-shrink-0"></span>EXPORT
            </Link>
            <Link href="/settings" className="text-xs text-gray-400 hover:text-cyan-400 transition-colors whitespace-nowrap">SETTINGS</Link>
          </nav>
        </div>
        <p className="text-xs text-gray-500 whitespace-nowrap hidden 2xl:block">1920×1080</p>
      </div>

      {/* Main */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-80 border-r border-r-[#22c55e] p-6 overflow-y-auto flex-shrink-0 text-[#eeeeee]">
          <h2 className="text-lg font-bold mb-6 text-cyan-400">EXPORT SETTINGS</h2>

          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Select Cue</label>
            <Select value={selectedCue} onValueChange={setSelectedCue}>
              <SelectTrigger className="w-full bg-black border-gray-800"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cues</SelectItem>
                {cues.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Export Format</label>
            <Select value={exportFormat} onValueChange={setExportFormat}>
              <SelectTrigger className="w-full bg-black border-gray-800"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="png">PNG (Still Image)</SelectItem>
                {VIDEO_FORMATS.map((f) => {
                  const sizeEst = formatSizeEstimates[f.value];
                  const noAlpha = transparentBackground && !f.supportsAlpha;
                  return (
                    <SelectItem
                      key={f.value}
                      value={f.value}
                      disabled={noAlpha}
                      className={noAlpha ? "opacity-40 cursor-not-allowed" : ""}
                    >
                      <span className={noAlpha ? "line-through" : ""}>{f.label}</span>
                      {sizeEst && !noAlpha && (
                        <span className="ml-2 text-xs text-gray-400">{sizeEst}</span>
                      )}
                      {noAlpha && <span className="ml-2 text-xs text-red-400">no alpha</span>}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {transparentBackground && VIDEO_FORMATS.some(f => f.value === exportFormat && !f.supportsAlpha) && (
              <p className="text-xs text-yellow-400 mt-1">⚠ This format does not support transparency. Switch to PNG Sequence ZIP for guaranteed alpha output.</p>
            )}
            {exportFormat === "png-seq" && (
              <p className="text-xs text-cyan-400 mt-1">ℹ️ Exports a ZIP of numbered PNGs. In Premiere: import frame_0001.png → tick “Image Sequence”. Transparency works 100% reliably.</p>
            )}
          </div>

          {/* ffmpeg load status */}
          {isVideoFormat && (
            <div className="mb-6 rounded border border-gray-800 bg-gray-900 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">ffmpeg-core</span>
                {ffmpegState === "ready" && <span className="text-xs text-green-400 font-bold">READY ✓</span>}
                {ffmpegState === "loading" && <span className="text-xs text-yellow-400 animate-pulse">LOADING…</span>}
                {ffmpegState === "error" && <span className="text-xs text-red-400">ERROR</span>}
                {ffmpegState === "idle" && <span className="text-xs text-gray-500">IDLE</span>}
              </div>
              {(ffmpegState === "loading" || ffmpegState === "ready") && (
                <>
                  <Progress value={ffmpegLoadPct} className="h-1.5" />
                  <p className="text-xs text-gray-500 truncate">{ffmpegLoadMsg}</p>
                </>
              )}
              {ffmpegState === "error" && (
                <p className="text-xs text-red-400">Failed to load. Check your connection and refresh.</p>
              )}
            </div>
          )}

          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Resolution</label>
            <Select value={resolution} onValueChange={setResolution}>
              <SelectTrigger className="w-full bg-black border-gray-800"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1920x1080">1920×1080 (Full HD)</SelectItem>
                <SelectItem value="3840x2160">3840×2160 (4K)</SelectItem>
                <SelectItem value="1280x720">1280×720 (HD)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Background Colour */}
          <div className={`mb-6 transition-opacity ${transparentBackground ? 'opacity-40 pointer-events-none' : ''}`}>
            <h3 className="text-xs font-bold text-cyan-400 mb-3">BACKGROUND COLOUR</h3>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Black", value: "#000000" },
                { label: "Green", value: "#00B140" },
                { label: "Blue",  value: "#0047AB" },
              ].map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => setBgColor(value)}
                  className={`flex flex-col items-center gap-1 p-2 rounded border transition-colors ${
                    bgColor === value
                      ? 'border-cyan-400 bg-cyan-500/10'
                      : 'border-gray-700 hover:border-gray-500'
                  }`}
                >
                  <div className="w-8 h-8 rounded border border-gray-600" style={{ backgroundColor: value }} />
                  <span className="text-xs text-gray-300">{label}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {transparentBackground ? 'Background colour ignored — transparent export' :
               bgColor === '#00B140' ? 'Broadcast standard chroma green (ITU-R BT.601)' :
               bgColor === '#0047AB' ? 'Broadcast standard chroma blue' :
               'Black background'}
            </p>
          </div>

          <div className="mb-6 flex items-center gap-2">
            <Checkbox id="transparent" checked={transparentBackground} onCheckedChange={(v) => setTransparentBackground(v as boolean)} />
            <label htmlFor="transparent" className="text-sm font-medium cursor-pointer">Transparent Background</label>
          </div>
          <p className="text-xs text-yellow-500 mt-1">⚠ Currently not working within export files</p>


          <Button
            onClick={handleExportMedia}
            disabled={exporting || cues.length === 0 || !exportReady}
            className="w-full bg-cyan-600 hover:bg-cyan-700 text-white"
          >
            {exporting ? "Exporting…" : `Export ${exportFormat.toUpperCase()}`}
          </Button>
        </div>

        {/* Centre — Preview + Queue */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6 text-[#00c951]">
          {/* Preview */}
          <div>
            <h2 className="text-lg font-bold mb-4 text-cyan-400">PREVIEW</h2>
            {cues.length === 0 ? (
              <div className="border border-gray-800 rounded p-4 bg-gray-900">
                <p className="text-gray-400 text-center py-12">No cues available. Create cues in the Edit page first.</p>
              </div>
            ) : selectedCue === "all" ? (
              <div className="border border-gray-800 rounded p-4 bg-gray-900">
                <p className="text-gray-400 text-center py-12">Select a specific cue to preview</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-cyan-400">
                    {isPreviewPlaying ? 'LIVE PREVIEW' : 'STILL PREVIEW (dwell frame)'}
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{resolution}</span>
                    <Button
                      size="sm"
                      onClick={() => setIsPreviewPlaying((p) => !p)}
                      className={isPreviewPlaying
                        ? 'bg-red-600 hover:bg-red-700 text-white h-7 px-3 text-xs font-bold'
                        : 'bg-cyan-500 hover:bg-cyan-600 text-black h-7 px-3 text-xs font-bold'
                      }
                    >
                      {isPreviewPlaying ? 'Stop' : '▶ Play Preview'}
                    </Button>
                  </div>
                </div>
                <div
                  className="border border-gray-800 rounded p-2"
                  style={transparentBackground ? {
                    backgroundImage: 'repeating-conic-gradient(#444 0% 25%, #222 0% 50%)',
                    backgroundSize: '20px 20px',
                  } : { background: '#000' }}
                >
                  <canvas ref={previewCanvasRef} className="w-full h-auto" style={{ display: "block", maxHeight: "360px", objectFit: "contain" }} />
                </div>
                {isPreviewPlaying && (
                  <div>
                    <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-cyan-400 rounded-full transition-none"
                        style={{ width: `${previewProgress}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-xs text-gray-500 font-mono">{(previewElapsedMs / 1000).toFixed(1)}s</span>
                      <span className="text-xs text-gray-500 font-mono">{(previewTotalMs / 1000).toFixed(1)}s total</span>
                    </div>
                  </div>
                )}
                {(() => {
                  const cue = cues.find((c) => c.id === selectedCue);
                  if (!cue || exportFormat !== "mp4") return null;
                  const animMs = cue.config.animationDuration || 1000;
                  const dwellMs = cue.config.dwellDuration ?? 3000;
                  const total = animMs * 2 + dwellMs;
                  return (
                    <div className="flex gap-4 text-xs font-mono mt-1">
                      <span className="text-gray-400">Animate: <span className="text-cyan-400">{(animMs / 1000).toFixed(1)}s</span></span>
                      <span className="text-gray-400">Dwell: <span className="text-cyan-400">{(dwellMs / 1000).toFixed(1)}s</span></span>
                      <span className="text-gray-400">Total: <span className="text-white font-bold">{(total / 1000).toFixed(1)}s</span></span>
                    </div>
                  );
                })()}
                <p className="text-xs text-gray-500">The exported MP4 will include the full animation (in → dwell → out).</p>
              </div>
            )}
          </div>

          {/* Export Queue */}
          {queue.length > 0 && (
            <div>
              <h2 className="text-lg font-bold mb-4 text-cyan-400">EXPORT QUEUE</h2>
              <div className="space-y-2">
                {queue.map((item) => (
                  <div key={item.id} className="border border-gray-800 rounded bg-gray-900 p-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        {statusIcon(item.status)}
                        <span className="text-sm truncate">{item.name}</span>
                      </div>
                      {statusBadge(item.status)}
                    </div>
                    {item.status !== "queued" && item.status !== "done" && (
                      <Progress value={item.progress} className="h-1 mt-2" />
                    )}
                    {item.status === "done" && (
                      <div className="h-1 mt-2 rounded bg-green-500/40" />
                    )}
                    {item.error && <p className="text-xs text-red-400 mt-1">{item.error}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar */}
        <div className="w-72 border-l border-[#22c55e] p-6 overflow-y-auto flex-shrink-0">
          <h2 className="text-lg font-bold mb-6 text-cyan-400">CUE LIST</h2>
          <div className="mb-6">
            <Button onClick={handleExportCueList} disabled={cues.length === 0} className="w-full bg-gray-800 hover:bg-gray-700 text-white mb-2">Export Cue List (JSON)</Button>
            <p className="text-xs text-gray-500">Export all cues to JSON for backup or sharing</p>
          </div>
          <div className="mb-6">
            <Button onClick={() => document.getElementById("import-file")?.click()} className="w-full bg-gray-800 hover:bg-gray-700 text-white mb-2">Import Cue List (JSON)</Button>
            <input id="import-file" type="file" accept=".json" onChange={handleImportCueList} className="hidden" />
            <p className="text-xs text-gray-500">Import cues from a previously exported JSON file</p>
          </div>
          <div className="border border-gray-800 rounded p-4 bg-gray-900 space-y-1">
            <p className="text-sm text-gray-400">Total Cues: <span className="text-white font-bold">{cues.length}</span></p>
            {queue.length > 0 && (
              <>
                <p className="text-sm text-gray-400">Done: <span className="text-green-400 font-bold">{queue.filter((q) => q.status === "done").length}</span></p>
                <p className="text-sm text-gray-400">Remaining: <span className="text-yellow-400 font-bold">{queue.filter((q) => q.status !== "done" && q.status !== "error").length}</span></p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>

    {/* ─── Filename confirmation dialog ────────────────────────────────────────── */}
    <Dialog open={filenameDialog.open} onOpenChange={(open) => { if (!open) handleFilenameCancel(); }}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-cyan-400">
            <Pencil className="w-4 h-4" />
            Export Filename
          </DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <Label htmlFor="filename-input" className="text-xs text-gray-400 mb-2 block">File name</Label>
          <Input
            id="filename-input"
            value={filenameInput}
            onChange={(e) => setFilenameInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleFilenameConfirm(); if (e.key === "Escape") handleFilenameCancel(); }}
            className="bg-black border-gray-700 text-white font-mono"
            autoFocus
            spellCheck={false}
          />
          <p className="text-xs text-gray-500 mt-1">Press Enter to confirm or Escape to cancel this cue.</p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleFilenameCancel} className="border-gray-700 text-gray-300 hover:text-white">Skip</Button>
          <Button onClick={handleFilenameConfirm} className="bg-cyan-600 hover:bg-cyan-700 text-white">Export</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
