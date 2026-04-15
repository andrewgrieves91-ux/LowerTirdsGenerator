/*
Edit Page: Create and save lower thirds cues
- All configuration controls (text, typography, position, color, animation)
- Save cues for use in Live page
- Preview both feeds using GSAP animation controller
*/

import React, { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { Save, Trash2, PlusCircle } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";
import gsap from "gsap";
import { GSAPAnimationController, AnimationValues } from "@/utils/gsapAnimationController";

// Pre-rendered offscreen canvases for Meta animation (eliminates font rasterization stepping)
interface MetaOffscreenEdit {
  colorCanvas: HTMLCanvasElement;
  alphaCanvas: HTMLCanvasElement;
  eyebrow: { x: number; y: number; w: number; h: number };
  regionPad: number;  // total canvas padding (TEXT + STROKE + SHADOW)
  drawPad: number;    // text-only padding (TEXT + STROKE) — use this for drawImage destination offset
  nameContentW: number;
  nameContentH: number;
  titleContentW: number;
  titleContentH: number;
  eyebrowContentW: number;
  eyebrowContentH: number;
  name:    { x: number; y: number; w: number; h: number };
  title:   { x: number; y: number; w: number; h: number };
  maxScale: number;
}

// Create offscreen canvases for Meta animation in Edit page — 1920x1080 design space.
// Renders all three text lines at MAX scale (1.121x) so drawImage() can GPU-scale each frame.
function createMetaOffscreenForEdit(
  name: string,
  title: string,
  eyebrow: string,
  font: string,
  fontSize: number,
  eyebrowFontSizePercent: number,
  titleFontSizePercent: number,
  fontWeight: string,
  bold: boolean,
  italic: boolean,
  titleFontWeight: string,
  color: string,
  borderEnabled: boolean,
  borderColor: string,
  borderWidth: number,
  logoImage: HTMLImageElement | null,
  logoPosition: string,
): MetaOffscreenEdit {
  const MAX_SCALE = 4.0;
  const effectiveFontWeight = bold ? '700' : fontWeight;
  const effectiveTitleFontWeight = titleFontWeight || effectiveFontWeight;
  const fontStyle = italic ? 'italic' : 'normal';
  const baseNameFontSize    = fontSize;
  const baseEyebrowFontSize = fontSize * (eyebrowFontSizePercent / 100);
  const baseTitleFontSize   = fontSize * (titleFontSizePercent / 100);
  const maxNameFontSize    = baseNameFontSize    * MAX_SCALE;
  const maxEyebrowFontSize = baseEyebrowFontSize * MAX_SCALE;
  const maxTitleFontSize   = baseTitleFontSize   * MAX_SCALE;

  // Measure text widths at max scale
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = 3840; tmpCanvas.height = 400;
  const tmpCtx = tmpCanvas.getContext('2d')!;
  tmpCtx.textBaseline = 'top';

  tmpCtx.font = `${fontStyle} ${effectiveFontWeight} ${maxEyebrowFontSize}px "${font}", sans-serif`;
  const eyebrowTextW = eyebrow ? tmpCtx.measureText(eyebrow).width : 0;
  const logoH = maxEyebrowFontSize;
  const logoW = logoImage ? Math.round((logoImage.naturalWidth / logoImage.naturalHeight) * logoH) : 0;
  const logoGap = logoImage ? Math.round(maxEyebrowFontSize * 0.3) : 0;
  const eyebrowTotalW = Math.ceil(eyebrowTextW + logoW + logoGap) + 4;
  const eyebrowH = Math.ceil(maxEyebrowFontSize) + 4;

  tmpCtx.font = `${fontStyle} ${effectiveFontWeight} ${maxNameFontSize}px "${font}", sans-serif`;
  const nameW = Math.ceil(tmpCtx.measureText(name).width) + 4;
  const nameH = Math.ceil(maxNameFontSize) + 4;

  tmpCtx.font = `${fontStyle} ${effectiveTitleFontWeight} ${maxTitleFontSize}px "${font}", sans-serif`;
  const titleW = Math.ceil(tmpCtx.measureText(title).width) + 4;
  const titleH = Math.ceil(maxTitleFontSize) + 4;

  // Three separate padding constants — each controls a different concern:
  //   TEXT_PAD   : fixed inset for text draw origin — NEVER changes (stable text position)
  //   STROKE_PAD : extra canvas space for stroke overflow (half lineWidth)
  //   SHADOW_PAD : extra canvas space for shadow blur + offset overflow
  // Text draw origins use only TEXT_PAD + STROKE_PAD.
  // Canvas/region sizes use all three.
  // drawImage compensation uses all three so text pixels always land at the same screen position.
  const TEXT_PAD   = 4;
  const STROKE_PAD = borderEnabled ? Math.ceil(borderWidth / 2) + 2 : 0;
  // DRAW_PAD = TEXT_PAD + STROKE_PAD: all that's needed since shadow is drawn on main canvas
  const DRAW_PAD   = TEXT_PAD + STROKE_PAD;
  // REGION_PAD = DRAW_PAD: shadow no longer contributes to offscreen canvas size
  const REGION_PAD = DRAW_PAD;

  const eyebrowH2 = eyebrowH + REGION_PAD * 2;
  const nameH2    = nameH    + REGION_PAD * 2;
  const titleH2   = titleH   + REGION_PAD * 2;
  const offW = Math.max(eyebrowTotalW, nameW, titleW) + REGION_PAD * 4;
  const eyebrowRegion = { x: REGION_PAD, y: REGION_PAD,                                        w: eyebrowTotalW + REGION_PAD * 2, h: eyebrowH2 };
  const nameRegion    = { x: REGION_PAD, y: REGION_PAD + eyebrowH2 + REGION_PAD,               w: nameW    + REGION_PAD * 2, h: nameH2 };
  const titleRegion   = { x: REGION_PAD, y: REGION_PAD + eyebrowH2 + REGION_PAD + nameH2 + REGION_PAD, w: titleW + REGION_PAD * 2, h: titleH2 };
  const offH = titleRegion.y + titleH2 + REGION_PAD;
  // Text draw origins: DRAW_PAD from region origin — stable regardless of shadow settings
  const eyebrowDrawX = eyebrowRegion.x + DRAW_PAD;
  const eyebrowDrawY = eyebrowRegion.y + DRAW_PAD;
  const nameDrawOriginX = nameRegion.x + DRAW_PAD;
  const nameDrawOriginY = nameRegion.y + DRAW_PAD;
  const titleDrawOriginX = titleRegion.x + DRAW_PAD;
  const titleDrawOriginY = titleRegion.y + DRAW_PAD;

  const colorOff = document.createElement('canvas');
  colorOff.width = offW; colorOff.height = offH;
  const colorOffCtx = colorOff.getContext('2d')!;
  colorOffCtx.textBaseline = 'top';
  colorOffCtx.lineJoin = 'round';
  colorOffCtx.lineCap = 'round';
  // NOTE: Shadow is NOT applied here — it is applied on the main canvas in a separate pass
  // so it can extend freely in any direction without being clipped by offscreen region boundaries.

  const alphaOff = document.createElement('canvas');
  alphaOff.width = offW; alphaOff.height = offH;
  const alphaOffCtx = alphaOff.getContext('2d')!;
  alphaOffCtx.textBaseline = 'top';
  alphaOffCtx.lineJoin = 'round';
  alphaOffCtx.lineCap = 'round';
  // Alpha/matte canvas: no shadow — shadow is a color-only effect

  // Compute logo/eyebrow text positions once (used in both stroke and fill passes)
  let eyebrowTextX = eyebrowDrawX;
  let eyebrowLogoX = eyebrowDrawX;
  if (logoImage) {
    if (logoPosition === 'before') { eyebrowLogoX = eyebrowDrawX; eyebrowTextX = eyebrowDrawX + logoW + logoGap; }
    else { eyebrowTextX = eyebrowDrawX; eyebrowLogoX = eyebrowDrawX + eyebrowTextW + logoGap; }
  }

  // ── PASS 1: All strokes (drawn first so fills always sit on top) ──────────
  if (borderEnabled) {
    // Eyebrow stroke
    if (eyebrow) {
      colorOffCtx.font = `${fontStyle} ${effectiveFontWeight} ${maxEyebrowFontSize}px "${font}", sans-serif`;
      alphaOffCtx.font  = `${fontStyle} ${effectiveFontWeight} ${maxEyebrowFontSize}px "${font}", sans-serif`;
      colorOffCtx.strokeStyle = borderColor;
      colorOffCtx.lineWidth = borderWidth;
      colorOffCtx.strokeText(eyebrow, eyebrowTextX, eyebrowDrawY);
      alphaOffCtx.strokeStyle = '#FFFFFF';
      alphaOffCtx.lineWidth = borderWidth;
      alphaOffCtx.strokeText(eyebrow, eyebrowTextX, eyebrowDrawY);
    }
    // Name stroke
    colorOffCtx.font = `${fontStyle} ${effectiveFontWeight} ${maxNameFontSize}px "${font}", sans-serif`;
    alphaOffCtx.font  = `${fontStyle} ${effectiveFontWeight} ${maxNameFontSize}px "${font}", sans-serif`;
    colorOffCtx.strokeStyle = borderColor;
    colorOffCtx.lineWidth = borderWidth;
    colorOffCtx.strokeText(name, nameDrawOriginX, nameDrawOriginY);
    alphaOffCtx.strokeStyle = '#FFFFFF';
    alphaOffCtx.lineWidth = borderWidth;
    alphaOffCtx.strokeText(name, nameDrawOriginX, nameDrawOriginY);
    // Title stroke
    colorOffCtx.font = `${fontStyle} ${effectiveTitleFontWeight} ${maxTitleFontSize}px "${font}", sans-serif`;
    alphaOffCtx.font  = `${fontStyle} ${effectiveTitleFontWeight} ${maxTitleFontSize}px "${font}", sans-serif`;
    colorOffCtx.strokeStyle = borderColor;
    colorOffCtx.lineWidth = borderWidth;
    colorOffCtx.strokeText(title, titleDrawOriginX, titleDrawOriginY);
    alphaOffCtx.strokeStyle = '#FFFFFF';
    alphaOffCtx.lineWidth = borderWidth;
    alphaOffCtx.strokeText(title, titleDrawOriginX, titleDrawOriginY);
  }

  // ── PASS 2: All fills (always on top of strokes) ──────────────────────────
  // Eyebrow fill + logo
  if (eyebrow || logoImage) {
    colorOffCtx.font = `${fontStyle} ${effectiveFontWeight} ${maxEyebrowFontSize}px "${font}", sans-serif`;
    alphaOffCtx.font  = `${fontStyle} ${effectiveFontWeight} ${maxEyebrowFontSize}px "${font}", sans-serif`;
    colorOffCtx.fillStyle = color;
    alphaOffCtx.fillStyle  = '#FFFFFF';
    if (logoImage) {
      colorOffCtx.drawImage(logoImage, eyebrowLogoX, eyebrowDrawY, logoW, logoH);
      alphaOffCtx.save();
      alphaOffCtx.drawImage(logoImage, eyebrowLogoX, eyebrowDrawY, logoW, logoH);
      alphaOffCtx.globalCompositeOperation = 'source-atop';
      alphaOffCtx.fillRect(eyebrowLogoX, eyebrowDrawY, logoW, logoH);
      alphaOffCtx.restore();
    }
    if (eyebrow) {
      colorOffCtx.fillText(eyebrow, eyebrowTextX, eyebrowDrawY);
      alphaOffCtx.fillText(eyebrow, eyebrowTextX, eyebrowDrawY);
    }
  }
  // Name fill
  colorOffCtx.font = `${fontStyle} ${effectiveFontWeight} ${maxNameFontSize}px "${font}", sans-serif`;
  alphaOffCtx.font  = `${fontStyle} ${effectiveFontWeight} ${maxNameFontSize}px "${font}", sans-serif`;
  colorOffCtx.fillStyle = color;
  alphaOffCtx.fillStyle  = '#FFFFFF';
  colorOffCtx.fillText(name, nameDrawOriginX, nameDrawOriginY);
  alphaOffCtx.fillText(name, nameDrawOriginX, nameDrawOriginY);
  // Title fill
  colorOffCtx.font = `${fontStyle} ${effectiveTitleFontWeight} ${maxTitleFontSize}px "${font}", sans-serif`;
  alphaOffCtx.font  = `${fontStyle} ${effectiveTitleFontWeight} ${maxTitleFontSize}px "${font}", sans-serif`;
  colorOffCtx.fillStyle = color;
  alphaOffCtx.fillStyle  = '#FFFFFF';
  colorOffCtx.fillText(title, titleDrawOriginX, titleDrawOriginY);
  alphaOffCtx.fillText(title, titleDrawOriginX, titleDrawOriginY);

  return {
    colorCanvas: colorOff,
    alphaCanvas: alphaOff,
    eyebrow: eyebrowRegion,
    name: nameRegion,
    title: titleRegion,
    maxScale: MAX_SCALE,
    // regionPad is the total padding on each side of every region.
    // drawImage callers must subtract (regionPad * scale) from destination X/Y
    // and subtract (regionPad * 2 * scale) from destination W/H so that
    // the text pixels land at the same screen position regardless of border width.
    regionPad: REGION_PAD,
    drawPad: DRAW_PAD,  // use this for drawImage destination offset — shadow-stable
    // Content-only dimensions (without padding) — use these for destination size
    nameContentW: nameW,
    nameContentH: nameH,
    titleContentW: titleW,
    titleContentH: titleH,
    eyebrowContentW: eyebrowTotalW,
    eyebrowContentH: eyebrowH,
  };
}
import { useAppSettings } from "@/contexts/AppSettingsContext";
import { BUILT_IN_TEMPLATES } from "@/types/presets";

const FONTS = [
  { value: "Roboto Condensed", label: "Roboto Condensed" },
  { value: "Roboto", label: "Roboto" },
  { value: "Open Sans", label: "Open Sans" },
  { value: "Montserrat", label: "Montserrat" },
  { value: "Oswald", label: "Oswald" },
  { value: "Optimistic Display", label: "Optimistic Display" },
];

const PRESET_COLORS = [
  { name: "White", value: "#FFFFFF" },
  { name: "Cyan", value: "#00FFFF" },
  { name: "Yellow", value: "#FFFF00" },
  { name: "Magenta", value: "#FF00FF" },
  { name: "Red", value: "#FF0000" },
  { name: "Green", value: "#00FF00" },
  { name: "Blue", value: "#0000FF" },
];

const ANIMATION_TYPES = [
  { value: "none", label: "None" },
  { value: "slideLeft", label: "Slide from Left" },
  { value: "slideRight", label: "Slide from Right" },
  { value: "slideUp", label: "Slide from Bottom" },
  { value: "slideDown", label: "Slide from Top" },
  { value: "fade", label: "Fade In/Out" },
  { value: "meta", label: "Meta" },
  { value: "syncTest", label: "Sync Test (20s Color Frames)" },
];

interface CustomPreset {
  id: string;
  name: string;
  config: {
    eyebrow: string;
    name: string;
    title: string;
    font: string;
    fontSize: number;
    eyebrowFontSizePercent: number;
    titleFontSizePercent: number;
    fontWeight: string;
    bold: boolean;
    underline: boolean;
    italic: boolean;
    posX: number;
    posY: number;
    color: string;
    animationType: string;
    animationDuration: number;
    dwellDuration: number;
    shadowEnabled: boolean;
    shadowBlur: number;
    shadowOffsetX: number;
    shadowOffsetY: number;
    shadowColor: string;
    borderEnabled: boolean;
    borderWidth: number;
    borderColor: string;
    logoDataUrl?: string;
    logoPosition?: "before" | "after";
  };
}

interface Cue {
  id: string;
  cueNumber: number;
  name: string;
  config: {
    eyebrow: string;
    name: string;
    title: string;
    font: string;
    fontSize: number;
    eyebrowFontSizePercent: number;
    titleFontSizePercent: number;
    fontWeight: string;
    bold: boolean;
    underline: boolean;
    italic: boolean;
    posX: number;
    posY: number;
    color: string;
    animationType: string;
    animationDuration: number;
    dwellDuration: number;
    shadowEnabled: boolean;
    shadowBlur: number;
    shadowOffsetX: number;
    shadowOffsetY: number;
    shadowColor: string;
    borderEnabled: boolean;
    borderWidth: number;
    borderColor: string;
    logoDataUrl?: string;
    logoPosition?: "before" | "after";
  };
}

export default function Edit() {
  const { showFeed2Alpha } = useAppSettings();
  const [eyebrow, setEyebrow] = useState("");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [font, setFont] = useState("Optimistic Display");
  const [fontSize, setFontSize] = useState(69);
  const [eyebrowFontSizePercent, setEyebrowFontSizePercent] = useState(41);
  const [titleFontSizePercent, setTitleFontSizePercent] = useState(52);
  const [fontWeight, setFontWeight] = useState("500");
  const [titleFontWeight, setTitleFontWeight] = useState<string | undefined>("400");
  const [bold, setBold] = useState(false);
  const [underline, setUnderline] = useState(false);
  const [italic, setItalic] = useState(false);
  const [posX, setPosX] = useState(209);
  const [posY, setPosY] = useState(852);
  const [eyebrowGap, setEyebrowGap] = useState(29);
  const [titleGap, setTitleGap] = useState(19);
  const [color, setColor] = useState("#FFFFFF");
  const [showGrid, setShowGrid] = useState(false);
  
  // Shadow and border controls
  const [shadowEnabled, setShadowEnabled] = useState(false);
  const [shadowBlur, setShadowBlur] = useState(10);
  const [shadowOffsetX, setShadowOffsetX] = useState(3);
  const [shadowOffsetY, setShadowOffsetY] = useState(3);
  const [shadowColor, setShadowColor] = useState("#000000");
  const [shadowStrength, setShadowStrength] = useState(100); // 0–200%
  const [borderEnabled, setBorderEnabled] = useState(false);
  const [borderWidth, setBorderWidth] = useState(2);
  const [borderColor, setBorderColor] = useState("#000000");

  // Logo controls
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [logoPosition, setLogoPosition] = useState<"before" | "after">("before");
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const logoImageRef = useRef<HTMLImageElement | null>(null);
  const [logoImageLoaded, setLogoImageLoaded] = useState(false);

  useEffect(() => {
    if (!logoDataUrl) {
      logoImageRef.current = null;
      setLogoImageLoaded(false);
      return;
    }
    const img = new Image();
    img.onload = () => {
      logoImageRef.current = img;
      setLogoImageLoaded(true);
    };
    img.src = logoDataUrl;
  }, [logoDataUrl]);
  
  // Animation controls
  const [animationType, setAnimationType] = useState("meta");
  const [animationSeconds, setAnimationSeconds] = useState(0);
  const [animationTenths, setAnimationTenths] = useState(5);
  const animationDuration = animationSeconds * 1000 + animationTenths * 100;
  
  // Dwell time controls
  const [dwellSeconds, setDwellSeconds] = useState(3);
  const [dwellTenths, setDwellTenths] = useState(6);
  const dwellDuration = dwellSeconds * 1000 + dwellTenths * 100;
  
  // Cue management
  const [cues, setCues] = useState<Cue[]>([]);
  const [cueName, setCueName] = useState("");
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0); // 0–100
  const [previewTotalMs, setPreviewTotalMs] = useState(0);
  const [previewElapsedMs, setPreviewElapsedMs] = useState(0);
  const previewStartTimeRef = useRef<number | null>(null);
  const previewProgressRafRef = useRef<number | null>(null);
  const [loadedCueId, setLoadedCueId] = useState<string | null>(null);

  // Preview background selector
  type PreviewBg = "checkerLight" | "checkerDark" | "black" | "green" | "blue";
  const [previewBg, setPreviewBg] = useState<PreviewBg>(() => {
    return (localStorage.getItem("edit-preview-bg") as PreviewBg) ?? "checkerLight";
  });

  // Persist preview bg choice
  useEffect(() => {
    localStorage.setItem("edit-preview-bg", previewBg);
  }, [previewBg]);

  const PREVIEW_BG_OPTIONS: { id: PreviewBg; label: string; swatch: React.CSSProperties }[] = [
    {
      id: "checkerLight",
      label: "Checker (Light)",
      swatch: {
        backgroundImage:
          "linear-gradient(45deg, #b0b0b0 25%, transparent 25%), " +
          "linear-gradient(-45deg, #b0b0b0 25%, transparent 25%), " +
          "linear-gradient(45deg, transparent 75%, #b0b0b0 75%), " +
          "linear-gradient(-45deg, transparent 75%, #b0b0b0 75%)",
        backgroundSize: "10px 10px",
        backgroundPosition: "0 0, 0 5px, 5px -5px, -5px 0px",
        backgroundColor: "#d0d0d0",
      },
    },
    {
      id: "checkerDark",
      label: "Checker (Dark)",
      swatch: {
        backgroundImage:
          "linear-gradient(45deg, #3a3a3a 25%, transparent 25%), " +
          "linear-gradient(-45deg, #3a3a3a 25%, transparent 25%), " +
          "linear-gradient(45deg, transparent 75%, #3a3a3a 75%), " +
          "linear-gradient(-45deg, transparent 75%, #3a3a3a 75%)",
        backgroundSize: "10px 10px",
        backgroundPosition: "0 0, 0 5px, 5px -5px, -5px 0px",
        backgroundColor: "#1a1a1a",
      },
    },
    {
      id: "black",
      label: "Black",
      swatch: { backgroundColor: "#000000" },
    },
    {
      id: "green",
      label: "Green",
      swatch: { backgroundColor: "#00B140" },
    },
    {
      id: "blue",
      label: "Blue",
      swatch: { backgroundColor: "#0047AB" },
    },
  ];

  const getPreviewBgStyle = (bg: PreviewBg): React.CSSProperties => {
    const opt = PREVIEW_BG_OPTIONS.find(o => o.id === bg);
    return opt ? opt.swatch : {};
  };
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // Custom presets management
  const [customPresets, setCustomPresets] = useState<CustomPreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [showPresetInput, setShowPresetInput] = useState(false);

  const colorCanvasRef = useRef<HTMLCanvasElement>(null);
  const alphaCanvasRef = useRef<HTMLCanvasElement>(null);
  const gsapControllerRef = useRef<GSAPAnimationController>(new GSAPAnimationController());

  // Drag-to-position state
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCtxRef = useRef<CanvasRenderingContext2D | null>(null); // stable ctx, never re-created
  const textBoundsRef = useRef<{ left: number; top: number; right: number; bottom: number } | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{
    mouseX: number; mouseY: number;
    posX: number; posY: number;
    // Edge offsets from posX/posY anchor to text bounds edges, captured once at drag start
    dLeft: number; dRight: number; dTop: number; dBottom: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  // Stable refs for posX/posY so drag handlers always see the latest value without closure staleness
  const posXRef = useRef(posX);
  const posYRef = useRef(posY);
  const isPreviewPlayingRef = useRef(isPreviewPlaying);
  useEffect(() => { posXRef.current = posX; }, [posX]);
  useEffect(() => { posYRef.current = posY; }, [posY]);
  useEffect(() => { isPreviewPlayingRef.current = isPreviewPlaying; }, [isPreviewPlaying]);

  // Load cues from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("lower-thirds-cues");
    if (saved) {
      try {
        const loadedCues = JSON.parse(saved);
        // Migrate old cues without cueNumber
        const migratedCues = loadedCues.map((cue: Cue, index: number) => ({
          ...cue,
          cueNumber: cue.cueNumber ?? index + 1
        }));
        setCues(migratedCues);
      } catch (e) {
        console.error("Failed to load cues:", e);
      }
    }
  }, []);

  // Save cues to localStorage and sync to server whenever they change
  useEffect(() => {
    localStorage.setItem("lower-thirds-cues", JSON.stringify(cues));
    fetch("/api/companion/cues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cues }),
    }).catch(() => {});
  }, [cues]);

  // Load custom presets from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("lower-thirds-custom-presets");
    if (saved) {
      try {
        const loadedPresets = JSON.parse(saved);
        setCustomPresets(loadedPresets);
      } catch (e) {
        console.error("Failed to load custom presets:", e);
      }
    }
  }, []);

  // Save custom presets to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("lower-thirds-custom-presets", JSON.stringify(customPresets));
  }, [customPresets]);

  // Detect changes to mark cue as unsaved
  useEffect(() => {
    if (!loadedCueId) {
      setHasUnsavedChanges(false);
      return;
    }

    const loadedCue = cues.find(c => c.id === loadedCueId);
    if (!loadedCue) {
      setHasUnsavedChanges(false);
      return;
    }

    // Compare current state with loaded cue
    const hasChanges = 
      loadedCue.config.name !== name ||
      loadedCue.config.title !== title ||
      loadedCue.config.font !== font ||
      loadedCue.config.fontSize !== fontSize ||
      loadedCue.config.titleFontSizePercent !== titleFontSizePercent ||
      loadedCue.config.bold !== bold ||
      loadedCue.config.underline !== underline ||
      loadedCue.config.italic !== italic ||
      loadedCue.config.posX !== posX ||
      loadedCue.config.posY !== posY ||
      loadedCue.config.color !== color ||
      loadedCue.config.animationType !== animationType ||
      loadedCue.config.animationDuration !== animationDuration ||
      loadedCue.config.dwellDuration !== dwellDuration ||
      loadedCue.config.shadowEnabled !== shadowEnabled ||
      loadedCue.config.shadowBlur !== shadowBlur ||
      loadedCue.config.shadowOffsetX !== shadowOffsetX ||
      loadedCue.config.shadowOffsetY !== shadowOffsetY ||
      loadedCue.config.shadowColor !== shadowColor ||
      loadedCue.config.borderEnabled !== borderEnabled ||
      loadedCue.config.borderWidth !== borderWidth ||
      loadedCue.config.borderColor !== borderColor;

    setHasUnsavedChanges(hasChanges);
  }, [loadedCueId, cues, name, title, font, fontSize, titleFontSizePercent, bold, underline, italic, posX, posY, color, animationType, animationDuration, dwellDuration, shadowEnabled, shadowBlur, shadowOffsetX, shadowOffsetY, shadowColor, shadowStrength, borderEnabled, borderWidth, borderColor]);

  // Preview animation using GSAP
  useEffect(() => {
    if (!isPreviewPlaying) {
      gsapControllerRef.current.reset();
      return;
    }

    // Create a temporary cue object for preview
    const previewCue = {
      config: {
        eyebrow,
        name,
        title,
        font,
        fontSize,
        eyebrowFontSizePercent,
        titleFontSizePercent,
        fontWeight,
        bold,
        underline,
        italic,
        posX,
        posY,
        color,
        animationType,
        animationDuration,
        dwellDuration,
        shadowEnabled,
        shadowBlur,
        shadowOffsetX,
        shadowOffsetY,
        shadowColor,
        shadowStrength,
        borderEnabled,
        borderWidth,
        borderColor
      }
    };

    // Start GSAP animation (not paused — plays in real time)
    gsapControllerRef.current.playAnimation(previewCue, animationDuration, dwellDuration);

    // Use GSAP's own total duration so metaStyle and other complex animations are covered
    const gsDuration = gsapControllerRef.current.getTotalDuration(); // seconds
    const totalMs = Math.ceil(gsDuration * 1000) + 500; // +0.5s tail
    setPreviewTotalMs(totalMs);
    setPreviewElapsedMs(0);
    setPreviewProgress(0);
    previewStartTimeRef.current = performance.now();

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

    const timeoutId = setTimeout(() => {
      setIsPreviewPlaying(false);
      gsapControllerRef.current.reset();
      setPreviewProgress(0);
      setPreviewElapsedMs(0);
      previewStartTimeRef.current = null;
      if (previewProgressRafRef.current) cancelAnimationFrame(previewProgressRafRef.current);
    }, totalMs);

    return () => {
      clearTimeout(timeoutId);
      if (previewProgressRafRef.current) cancelAnimationFrame(previewProgressRafRef.current);
    };
  }, [isPreviewPlaying]);

  // Continuous render loop for canvas (reads GSAP values every frame)
  useEffect(() => {
    const colorCanvas = colorCanvasRef.current;
    const alphaCanvas = alphaCanvasRef.current;
    if (!colorCanvas || !alphaCanvas) return;

    colorCanvas.width = 1920;
    colorCanvas.height = 1080;
    alphaCanvas.width = 1920;
    alphaCanvas.height = 1080;

    const colorCtx = colorCanvas.getContext("2d");
    const alphaCtx = alphaCanvas.getContext("2d");
    if (!colorCtx || !alphaCtx) return;

    // Pre-render offscreen for Meta animation — created once per useEffect run
    // (re-created when text/font/style deps change, which is correct behaviour)
    const metaOffscreen: MetaOffscreenEdit | null = (animationType === 'meta')
      ? createMetaOffscreenForEdit(
          name, title, eyebrow, font, fontSize,
          eyebrowFontSizePercent, titleFontSizePercent,
          fontWeight, bold, italic, titleFontWeight ?? '',
          color, borderEnabled, borderColor, borderWidth,
          logoImageRef.current, logoPosition
        )
      : null;

    const render = () => {
      // Get GSAP animation values (or use static values when not playing).
      // NOTE: this function is called from gsap.ticker.add() below so it always
      // fires immediately after GSAP has updated its values for this tick —
      // never between two GSAP ticks, which was the source of the jitter.
      const values = isPreviewPlaying 
        ? gsapControllerRef.current.getValues()
        : {
            eyebrow: { x: 0, y: 0, opacity: 1, scale: 1 },
            name: { x: 0, y: 0, opacity: 1, scale: 1 },
            title: { x: 0, y: 0, opacity: 1, scale: 1 }
          };

      // Build base font sizes
      const effectiveFontWeight = bold ? "700" : fontWeight;
      // For Meta: title uses a lighter font weight than the name
      const effectiveTitleFontWeight = (animationType === 'meta' && titleFontWeight) ? titleFontWeight : effectiveFontWeight;
      const fontStyle = italic ? "italic" : "normal";
      const baseEyebrowFontSize = fontSize * (eyebrowFontSizePercent / 100);
      const baseNameFontSize = fontSize;
      const baseTitleFontSize = fontSize * (titleFontSizePercent / 100);

      const isMetaAnim = animationType === 'meta';

      // For Meta: NEVER bake scale into font size — use ctx.scale() transform instead.
      // Font sizes are always BASE values. The canvas GPU handles scaling (perfectly smooth).
      const metaGroupScale  = isMetaAnim ? values.name.scale : 1;
      const metaGroupDriftX = isMetaAnim ? values.name.x : 0;
      const scaledEyebrowFontSize = baseEyebrowFontSize; // always base
      const scaledNameFontSize    = baseNameFontSize;
      const scaledTitleFontSize   = baseTitleFontSize;
      const eyebrowFontString = `${fontStyle} ${effectiveFontWeight} ${scaledEyebrowFontSize}px "${font}", sans-serif`;
      const fontString        = `${fontStyle} ${effectiveFontWeight} ${scaledNameFontSize}px "${font}", sans-serif`;
      const titleFontString   = `${fontStyle} ${effectiveTitleFontWeight} ${scaledTitleFontSize}px "${font}", sans-serif`;

      // Y positions: always textBaseline='top', always base font sizes.
      const baseEyebrowY = (eyebrow || logoImageRef.current) ? posY - baseEyebrowFontSize - eyebrowGap : 0;
      const baseNameY    = posY;
      const baseTitleY   = posY + baseNameFontSize + titleGap;
      const eyebrowY = Math.round(baseEyebrowY);
      const nameY    = Math.round(baseNameY);
      const titleY   = Math.round(baseTitleY);

      // Clear both canvases
      colorCtx.clearRect(0, 0, 1920, 1080);
      alphaCtx.fillStyle = "#000000";
      alphaCtx.fillRect(0, 0, 1920, 1080);

      // Draw checkerboard onto colorCtx as first layer when a checker bg is selected.
      // This ensures shadows composite correctly over the checker pattern in the preview.
      // The checker is ONLY drawn on the preview canvas — it is never broadcast or exported.
      if (previewBg === 'checkerLight' || previewBg === 'checkerDark') {
        const tileSize = 40; // 40px tiles at 1920×1080
        const c1 = previewBg === 'checkerLight' ? '#d0d0d0' : '#1a1a1a';
        const c2 = previewBg === 'checkerLight' ? '#b0b0b0' : '#3a3a3a';
        for (let row = 0; row < Math.ceil(1080 / tileSize); row++) {
          for (let col = 0; col < Math.ceil(1920 / tileSize); col++) {
            colorCtx.fillStyle = (row + col) % 2 === 0 ? c1 : c2;
            colorCtx.fillRect(col * tileSize, row * tileSize, tileSize, tileSize);
          }
        }
      } else if (previewBg === 'black') {
        colorCtx.fillStyle = '#000000';
        colorCtx.fillRect(0, 0, 1920, 1080);
      } else if (previewBg === 'green') {
        colorCtx.fillStyle = '#00B140';
        colorCtx.fillRect(0, 0, 1920, 1080);
      } else if (previewBg === 'blue') {
        colorCtx.fillStyle = '#0047AB';
        colorCtx.fillRect(0, 0, 1920, 1080);
      }

      // For Meta: use pre-rendered offscreen canvases + drawImage() for perfectly smooth scaling.
      // Text is rasterized once at MAX scale; drawImage() GPU-scales it each frame (no stepping).
      if (isMetaAnim && metaOffscreen) {
        const off = metaOffscreen;
        const s = metaGroupScale / off.maxScale; // scale factor relative to max
        const dstX = posX + metaGroupDriftX;
        const eyebrowGapPx = eyebrowGap;
        const titleGapPx   = titleGap;

        // Destination offset uses DRAW_PAD (TEXT+STROKE only) — shadow does NOT shift text.
        // Destination size uses REGION_PAD so the full padded source rect is mapped correctly.
        const pad     = off.drawPad;    // offset compensation — shadow-stable
        const fullPad = off.regionPad;  // full padding for size compensation
        const dstNameW    = off.nameContentW    * s;
        const dstNameH    = off.nameContentH    * s;
        const dstTitleW   = off.titleContentW   * s;
        const dstTitleH   = off.titleContentH   * s;
        const dstEyebrowW = off.eyebrowContentW * s;
        const dstEyebrowH = off.eyebrowContentH * s;

        // Destination Y positions (anchored to posY for name, growing up/down)
        const dstNameY    = nameY;
        const dstTitleY   = dstNameY + dstNameH + titleGapPx;
        const dstEyebrowY = dstNameY - dstEyebrowH - eyebrowGapPx;

        // ── SHADOW PASS ──────────────────────────────────────────────────────────────────────
        // Steps:
        //  1. Draw text glyphs onto tmpC (source canvas) at normal scale.
        //  2. Draw tmpC onto shadowC with ctx shadow props set + optional scale for size.
        //     This produces the shadow pixels on shadowC.
        //  3. Erase source glyph pixels from shadowC (destination-out) — shadowC now has
        //     ONLY the shadow, no text.
        //  4. Composite shadowC onto main canvas with source-over AFTER text is drawn —
        //     shadow halo appears over background but not over text (glyph pixels erased).

        // ── TEXT PASS — ctx.scale() transform for smooth sub-pixel scaling ──
        // drawImage copies at 1:1; GPU transform handles the scale change each frame.
        const drawScaled = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, region: {x:number,y:number,w:number,h:number}, dx: number, dy: number, alpha: number) => {
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.translate(dx, dy);
          ctx.scale(s, s);
          ctx.drawImage(canvas, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h);
          ctx.restore();
        };
        if (off.eyebrowContentW > 0) {
          drawScaled(colorCtx, off.colorCanvas, off.eyebrow, dstX - pad * s, dstEyebrowY - pad * s, values.eyebrow.opacity);
          drawScaled(alphaCtx, off.alphaCanvas, off.eyebrow, dstX - pad * s, dstEyebrowY - pad * s, values.eyebrow.opacity);
        }
        drawScaled(colorCtx, off.colorCanvas, off.name, dstX - pad * s, dstNameY - pad * s, values.name.opacity);
        drawScaled(alphaCtx, off.alphaCanvas, off.name, dstX - pad * s, dstNameY - pad * s, values.name.opacity);
        drawScaled(colorCtx, off.colorCanvas, off.title, dstX - pad * s, dstTitleY - pad * s, values.title.opacity);
        drawScaled(alphaCtx, off.alphaCanvas, off.title, dstX - pad * s, dstTitleY - pad * s, values.title.opacity);

        colorCtx.globalAlpha = 1;
        alphaCtx.globalAlpha  = 1;

        // ── SHADOW PASS (after text, source-over so it's visible over the background) ──
        if (shadowEnabled) {
          const W = colorCanvas.width;
          const H = colorCanvas.height;
          const tmpC = document.createElement('canvas');
          tmpC.width = W; tmpC.height = H;
          const tmpCtx = tmpC.getContext('2d')!;
          if (off.eyebrowContentW > 0) {
            drawScaled(tmpCtx, off.alphaCanvas, off.eyebrow, dstX - pad * s, dstEyebrowY - pad * s, values.eyebrow.opacity);
          }
          drawScaled(tmpCtx, off.alphaCanvas, off.name, dstX - pad * s, dstNameY - pad * s, values.name.opacity);
          drawScaled(tmpCtx, off.alphaCanvas, off.title, dstX - pad * s, dstTitleY - pad * s, values.title.opacity);
          const shadowC = document.createElement('canvas');
          shadowC.width = W; shadowC.height = H;
          const shadowCtx = shadowC.getContext('2d')!;
          shadowCtx.shadowBlur    = shadowBlur;
          shadowCtx.shadowOffsetX = shadowOffsetX;
          shadowCtx.shadowOffsetY = shadowOffsetY;
          shadowCtx.shadowColor   = shadowColor;
          shadowCtx.drawImage(tmpC, 0, 0);
          shadowCtx.globalCompositeOperation = 'destination-out';
          shadowCtx.drawImage(tmpC, 0, 0);
          colorCtx.save();
          colorCtx.globalAlpha = Math.min(shadowStrength / 100, 1);
          colorCtx.drawImage(shadowC, 0, 0);
          if (shadowStrength > 100) {
            colorCtx.globalAlpha = (shadowStrength - 100) / 100;
            colorCtx.drawImage(shadowC, 0, 0);
          }
          colorCtx.restore();
          if (off.eyebrowContentW > 0) {
            drawScaled(colorCtx, off.colorCanvas, off.eyebrow, dstX - pad * s, dstEyebrowY - pad * s, values.eyebrow.opacity);
          }
          drawScaled(colorCtx, off.colorCanvas, off.name, dstX - pad * s, dstNameY - pad * s, values.name.opacity);
          drawScaled(colorCtx, off.colorCanvas, off.title, dstX - pad * s, dstTitleY - pad * s, values.title.opacity);
        }
      } else {

      // Render text (non-Meta path)
      colorCtx.save();
      alphaCtx.save();

      // Always top-baseline.
      colorCtx.textBaseline = 'top';
      alphaCtx.textBaseline  = 'top';
      colorCtx.lineJoin = 'round';
      colorCtx.lineCap  = 'round';
      alphaCtx.lineJoin = 'round';
      alphaCtx.lineCap  = 'round';

      // X positions: for non-Meta, apply per-line drift.
      const metaSharedLeftX = posX; // unused for non-Meta, kept for consistency


      // Hoist position variables so they're accessible in the shadow pass
      let _eyebrowTextDrawX = posX;
      let _eyebrowYPos = eyebrowY;
      let _nameX = posX;
      let _nameYPos = nameY;
      let _titleX = posX;
      let _titleYPos = titleY;

      // Shadow pass runs AFTER text is drawn — see POST-DRAW SHADOW PASS below

      // Apply GSAP transforms for eyebrow (text + optional logo)
      if (eyebrow || logoImageRef.current) {
        colorCtx.save();
        alphaCtx.save();
        
        const eyebrowX    = isMetaAnim ? metaSharedLeftX : posX + values.eyebrow.x;
        const eyebrowYPos = eyebrowY + (isMetaAnim ? 0 : values.eyebrow.y);
        _eyebrowYPos = eyebrowYPos;
        
        colorCtx.globalAlpha = values.eyebrow.opacity;
        alphaCtx.globalAlpha = values.eyebrow.opacity;
        
        // Scale is baked into eyebrowFontString (scaledEyebrowFontSize) — no ctx.scale() needed.
        colorCtx.font = eyebrowFontString;
        alphaCtx.font = eyebrowFontString;

        // Calculate logo dimensions (height = scaledEyebrowFontSize, width auto)
        const logoImg = logoImageRef.current;
        const logoH = scaledEyebrowFontSize;
        const logoW = logoImg ? Math.round((logoImg.naturalWidth / logoImg.naturalHeight) * logoH) : 0;
        const logoGap = logoImg ? Math.round(scaledEyebrowFontSize * 0.3) : 0;

        // Measure text width to position logo after text
        const textW = eyebrow ? colorCtx.measureText(eyebrow).width : 0;

        // Determine draw positions based on logoPosition
        let textDrawX = eyebrowX;
        let logoDrawX = eyebrowX;
        if (logoImg) {
          if (logoPosition === "before") {
            logoDrawX = eyebrowX;
            textDrawX = eyebrowX + logoW + logoGap;
          } else {
            textDrawX = eyebrowX;
            logoDrawX = eyebrowX + textW + logoGap;
          }
        }
        _eyebrowTextDrawX = textDrawX;

        // drawImage uses top-left Y anchor — same as textBaseline='top'.
        const logoTopY = eyebrowYPos;
        if (logoImg) {
          colorCtx.drawImage(logoImg, logoDrawX, logoTopY, logoW, logoH);
          // Draw white silhouette on alpha canvas
          alphaCtx.save();
          alphaCtx.globalCompositeOperation = "source-over";
          alphaCtx.drawImage(logoImg, logoDrawX, logoTopY, logoW, logoH);
          // Tint to white for alpha matte
          alphaCtx.globalCompositeOperation = "source-atop";
          alphaCtx.fillStyle = "#FFFFFF";
          alphaCtx.fillRect(logoDrawX, logoTopY, logoW, logoH);
          alphaCtx.restore();
        }

        if (eyebrow) {
          if (borderEnabled) {
            colorCtx.strokeStyle = borderColor;
            colorCtx.lineWidth = borderWidth;
            colorCtx.strokeText(eyebrow, textDrawX, eyebrowYPos);
            
            alphaCtx.strokeStyle = "#FFFFFF";
            alphaCtx.lineWidth = borderWidth;
            alphaCtx.strokeText(eyebrow, textDrawX, eyebrowYPos);
          }
          
          colorCtx.fillStyle = color;
          colorCtx.fillText(eyebrow, textDrawX, eyebrowYPos);
          
          alphaCtx.fillStyle = "#FFFFFF";
          alphaCtx.fillText(eyebrow, textDrawX, eyebrowYPos);
        }
        
        colorCtx.restore();
        alphaCtx.restore();
      }

      // Apply GSAP transforms for name
      colorCtx.save();
      alphaCtx.save();
      
      const nameX    = isMetaAnim ? metaSharedLeftX : posX + values.name.x;
      const nameYPos = nameY + (isMetaAnim ? 0 : values.name.y);
      _nameX = nameX; _nameYPos = nameYPos;
      
      colorCtx.globalAlpha = values.name.opacity;
      alphaCtx.globalAlpha = values.name.opacity;
      
      // Scale is baked into fontString (scaledNameFontSize) — no ctx.scale() needed.
      colorCtx.font = fontString;
      alphaCtx.font = fontString;
      
      if (borderEnabled) {
        colorCtx.strokeStyle = borderColor;
        colorCtx.lineWidth = borderWidth;
        colorCtx.strokeText(name, nameX, nameYPos);
        
        alphaCtx.strokeStyle = "#FFFFFF";
        alphaCtx.lineWidth = borderWidth;
        alphaCtx.strokeText(name, nameX, nameYPos);
      }
      
      colorCtx.fillStyle = color;
      colorCtx.fillText(name, nameX, nameYPos);
      
      alphaCtx.fillStyle = "#FFFFFF";
      alphaCtx.fillText(name, nameX, nameYPos);
      
      if (underline) {
        const nameWidth = colorCtx.measureText(name).width;
        colorCtx.strokeStyle = color;
        colorCtx.lineWidth = Math.max(2, scaledNameFontSize / 24);
        // Underline goes below the text (textBaseline='top' + font size + 2px gap).
        const ulNameY = nameYPos + scaledNameFontSize + 2;
        colorCtx.beginPath();
        colorCtx.moveTo(nameX, ulNameY);
        colorCtx.lineTo(nameX + nameWidth, ulNameY);
        colorCtx.stroke();
        
        alphaCtx.strokeStyle = "#FFFFFF";
        alphaCtx.lineWidth = Math.max(2, scaledNameFontSize / 24);
        alphaCtx.beginPath();
        alphaCtx.moveTo(nameX, ulNameY);
        alphaCtx.lineTo(nameX + nameWidth, ulNameY);
        alphaCtx.stroke();
      }
      
      colorCtx.restore();
      alphaCtx.restore();

      // Apply GSAP transforms for title
      colorCtx.save();
      alphaCtx.save();
      
      const titleX    = isMetaAnim ? metaSharedLeftX : posX + values.title.x;
      const titleYPos = titleY + (isMetaAnim ? 0 : values.title.y);
      _titleX = titleX; _titleYPos = titleYPos;
      
      colorCtx.globalAlpha = values.title.opacity;
      alphaCtx.globalAlpha = values.title.opacity;
      
      // Scale is baked into titleFontString (scaledTitleFontSize) — no ctx.scale() needed.
      colorCtx.font = titleFontString;
      alphaCtx.font = titleFontString;
      
      if (borderEnabled) {
        colorCtx.strokeStyle = borderColor;
        colorCtx.lineWidth = borderWidth;
        colorCtx.strokeText(title, titleX, titleYPos);
        
        alphaCtx.strokeStyle = "#FFFFFF";
        alphaCtx.lineWidth = borderWidth;
        alphaCtx.strokeText(title, titleX, titleYPos);
      }
      
      colorCtx.fillStyle = color;
      colorCtx.fillText(title, titleX, titleYPos);
      
      alphaCtx.fillStyle = "#FFFFFF";
      alphaCtx.fillText(title, titleX, titleYPos);
      
      if (underline) {
        const titleWidth = colorCtx.measureText(title).width;
        const ulTitleY = titleYPos + scaledTitleFontSize + 2;
        colorCtx.strokeStyle = color;
        colorCtx.lineWidth = Math.max(2, scaledTitleFontSize / 24);
        colorCtx.beginPath();
        colorCtx.moveTo(titleX, ulTitleY);
        colorCtx.lineTo(titleX + titleWidth, ulTitleY);
        colorCtx.stroke();
        
        alphaCtx.strokeStyle = "#FFFFFF";
        alphaCtx.lineWidth = Math.max(2, scaledTitleFontSize / 24);
        alphaCtx.beginPath();
        alphaCtx.moveTo(titleX, ulTitleY);
        alphaCtx.lineTo(titleX + titleWidth, ulTitleY);
        alphaCtx.stroke();
      }
      
      colorCtx.restore(); // title inner
      alphaCtx.restore();

      // ── POST-DRAW SHADOW PASS (non-Meta) ─────────────────────────────────────────────────────
      // Runs AFTER all text is drawn so _* position variables hold the actual animated positions.
      // Uses source-over: shadow halo composited on top of background, glyph pixels erased so
      // shadow does not cover text. Mirrors Live.tsx non-Meta shadow pass exactly.
      if (shadowEnabled) {
        const W = colorCanvas.width;
        const H = colorCanvas.height;
        // Step 1: glyph canvas — text at actual (animated) positions, no shadow
        const glyphC = document.createElement('canvas');
        glyphC.width = W; glyphC.height = H;
        const glyphCtx = glyphC.getContext('2d')!;
        glyphCtx.textBaseline = 'top';
        glyphCtx.fillStyle = '#ffffff';
        if (eyebrow) {
          glyphCtx.font = eyebrowFontString;
          glyphCtx.fillText(eyebrow, _eyebrowTextDrawX, _eyebrowYPos);
        }
        glyphCtx.font = fontString;
        glyphCtx.fillText(name, _nameX, _nameYPos);
        glyphCtx.font = titleFontString;
        glyphCtx.fillText(title, _titleX, _titleYPos);
        // Step 2: shadow canvas — cast shadow from glyph mask
        const shadowC = document.createElement('canvas');
        shadowC.width = W; shadowC.height = H;
        const shadowCtx = shadowC.getContext('2d')!;
        shadowCtx.shadowBlur    = shadowBlur;
        shadowCtx.shadowOffsetX = shadowOffsetX;
        shadowCtx.shadowOffsetY = shadowOffsetY;
        shadowCtx.shadowColor   = shadowColor;
        shadowCtx.drawImage(glyphC, 0, 0);
        // Step 3: erase glyph pixels — leave only the shadow halo
        shadowCtx.globalCompositeOperation = 'destination-out';
        shadowCtx.drawImage(glyphC, 0, 0);
        // Step 4: composite shadow with source-over (halo pixels appear over background, text
        // pixels are erased from shadowC so shadow does not cover text)
        colorCtx.save();
        colorCtx.globalCompositeOperation = 'source-over';
        colorCtx.globalAlpha = Math.min(shadowStrength / 100, 1);
        colorCtx.drawImage(shadowC, 0, 0);
        if (shadowStrength > 100) {
          colorCtx.globalAlpha = (shadowStrength - 100) / 100;
          colorCtx.drawImage(shadowC, 0, 0);
        }
        colorCtx.restore();
      }

      colorCtx.restore(); // outer (textBaseline save)
      alphaCtx.restore();

      } // end else (non-Meta path)

      // Update text bounds for drag hit-testing (design-space coordinates)
      {
        // Measure the full text group bounding box in design space
        const tmpCtx = colorCtx; // reuse existing context for measurement
        const effectiveFW = bold ? '700' : fontWeight;
        const fStyle = italic ? 'italic' : 'normal';
        const bNameFS = fontSize;
        const bTitleFS = fontSize * (titleFontSizePercent / 100);
        const bEyebrowFS = fontSize * (eyebrowFontSizePercent / 100);

        tmpCtx.save();
        tmpCtx.font = `${fStyle} ${effectiveFW} ${bNameFS}px "${font}", sans-serif`;
        const nameW = tmpCtx.measureText(name).width;
        tmpCtx.font = `${fStyle} ${effectiveFW} ${bTitleFS}px "${font}", sans-serif`;
        const titleW = tmpCtx.measureText(title).width;
        tmpCtx.font = `${fStyle} ${effectiveFW} ${bEyebrowFS}px "${font}", sans-serif`;
        const eyebrowW = eyebrow ? tmpCtx.measureText(eyebrow).width : 0;
        tmpCtx.restore();

        const maxW = Math.max(nameW, titleW, eyebrowW) + 8;
        const topY = eyebrow ? (posY - bEyebrowFS - eyebrowGap) : posY;
        const bottomY = posY + bNameFS + titleGap + bTitleFS + 8;
        textBoundsRef.current = {
          left: posX - 4,
          top: topY - 4,
          right: posX + maxW,
          bottom: bottomY,
        };
      }

      // Draw grid overlay if enabled
      if (showGrid) {
        const drawGrid = (ctx: CanvasRenderingContext2D) => {
          ctx.strokeStyle = "rgba(0, 255, 255, 0.2)";
          ctx.lineWidth = 1;
          
          for (let x = 0; x <= 1920; x += 100) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, 1080);
            ctx.stroke();
          }
          
          for (let y = 0; y <= 1080; y += 100) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(1920, y);
            ctx.stroke();
          }
          
          ctx.strokeStyle = "rgba(255, 0, 0, 0.6)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(posX - 20, posY);
          ctx.lineTo(posX + 20, posY);
          ctx.moveTo(posX, posY - 20);
          ctx.lineTo(posX, posY + 20);
          ctx.stroke();
        };
        
        drawGrid(colorCtx);
        drawGrid(alphaCtx);
      }

      // No self-scheduling here — gsap.ticker drives the loop below.
    };

    // Drive the canvas render from GSAP's own ticker so the draw always
    // happens immediately after GSAP has computed values for this frame.
    // This eliminates the frame-phase mismatch (reading mid-tick) that
    // caused the subtle vertical jitter in the Meta-style animation.
    gsap.ticker.add(render);
    // Also do one immediate draw so the canvas isn't blank on mount.
    render();

    return () => {
      gsap.ticker.remove(render);
    };
  }, [eyebrow, name, title, font, fontSize, eyebrowFontSizePercent, titleFontSizePercent, fontWeight, bold, underline, italic, posX, posY, eyebrowGap, titleGap, color, showGrid, shadowEnabled, shadowBlur, shadowOffsetX, shadowOffsetY, shadowColor, shadowStrength, borderEnabled, borderWidth, borderColor, animationType, isPreviewPlaying, logoImageLoaded, logoPosition, previewBg]);

  // ─── Drag-to-position: guide drawing + mouse event handlers ───────────────

  // Broadcast-standard safe area margins (EBU R95 / SMPTE RP 218)
  // Action safe: 5% each side; Title safe: 10% each side
  const SAFE_ACTION_H = 0.05 * 1920; // 96px
  const SAFE_ACTION_V = 0.05 * 1080; // 54px
  const SAFE_TITLE_H  = 0.10 * 1920; // 192px
  const SAFE_TITLE_V  = 0.10 * 1080; // 108px

  // Rule-of-thirds lines
  const THIRD_H1 = 1920 / 3;  // 640
  const THIRD_H2 = (1920 / 3) * 2; // 1280
  const THIRD_V1 = 1080 / 3;  // 360
  const THIRD_V2 = (1080 / 3) * 2; // 720

  // All snappable X and Y guide values (in design space)
  const SNAP_X_GUIDES = [
    SAFE_ACTION_H, SAFE_TITLE_H, THIRD_H1, THIRD_H2,
    1920 - SAFE_ACTION_H, 1920 - SAFE_TITLE_H,
    960, // center
  ];
  const SNAP_Y_GUIDES = [
    SAFE_ACTION_V, SAFE_TITLE_V, THIRD_V1, THIRD_V2,
    1080 - SAFE_ACTION_V, 1080 - SAFE_TITLE_V,
    540, // center
  ];
  const SNAP_THRESHOLD_DS = 18; // design-space pixels

  function drawGuides(overlayCtx: CanvasRenderingContext2D, bounds: { left: number; top: number; right: number; bottom: number } | null) {
    const W = 1920, H = 1080;
    overlayCtx.clearRect(0, 0, W, H);

    // Rule-of-thirds — white, semi-transparent
    overlayCtx.save();
    overlayCtx.strokeStyle = 'rgba(255,255,255,0.55)';
    overlayCtx.lineWidth = 2;
    overlayCtx.setLineDash([]);
    for (const x of [THIRD_H1, THIRD_H2]) {
      overlayCtx.beginPath();
      overlayCtx.moveTo(x, 0); overlayCtx.lineTo(x, H);
      overlayCtx.stroke();
    }
    for (const y of [THIRD_V1, THIRD_V2]) {
      overlayCtx.beginPath();
      overlayCtx.moveTo(0, y); overlayCtx.lineTo(W, y);
      overlayCtx.stroke();
    }
    overlayCtx.restore();

    // Action safe — red solid
    overlayCtx.save();
    overlayCtx.strokeStyle = 'rgba(255,60,60,0.75)';
    overlayCtx.lineWidth = 2;
    overlayCtx.setLineDash([]);
    overlayCtx.strokeRect(SAFE_ACTION_H, SAFE_ACTION_V, W - 2 * SAFE_ACTION_H, H - 2 * SAFE_ACTION_V);
    overlayCtx.restore();

    // Title safe — red dashed
    overlayCtx.save();
    overlayCtx.strokeStyle = 'rgba(255,60,60,0.75)';
    overlayCtx.lineWidth = 2;
    overlayCtx.setLineDash([12, 8]);
    overlayCtx.strokeRect(SAFE_TITLE_H, SAFE_TITLE_V, W - 2 * SAFE_TITLE_H, H - 2 * SAFE_TITLE_V);
    overlayCtx.restore();

    // Labels
    overlayCtx.save();
    overlayCtx.font = 'bold 22px monospace';
    overlayCtx.fillStyle = 'rgba(255,80,80,0.85)';
    overlayCtx.fillText('ACTION SAFE', SAFE_ACTION_H + 6, SAFE_ACTION_V + 6);
    overlayCtx.fillText('TITLE SAFE', SAFE_TITLE_H + 6, SAFE_TITLE_V + 6);
    overlayCtx.restore();

    // Text bounding box highlight
    if (bounds) {
      overlayCtx.save();
      overlayCtx.strokeStyle = 'rgba(0,255,255,0.9)';
      overlayCtx.lineWidth = 2;
      overlayCtx.setLineDash([6, 4]);
      overlayCtx.strokeRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
      // Corner handles
      overlayCtx.setLineDash([]);
      overlayCtx.fillStyle = 'rgba(0,255,255,0.9)';
      const hs = 6;
      for (const [cx, cy] of [
        [bounds.left, bounds.top], [bounds.right, bounds.top],
        [bounds.left, bounds.bottom], [bounds.right, bounds.bottom]
      ]) {
        overlayCtx.fillRect(cx - hs/2, cy - hs/2, hs, hs);
      }
      overlayCtx.restore();
    }
  }

  function snapValue(value: number, guides: number[], threshold: number): number {
    let best = value;
    let bestDist = threshold;
    for (const g of guides) {
      const d = Math.abs(value - g);
      if (d < bestDist) { bestDist = d; best = g; }
    }
    return best;
  }

  // Convert display-space mouse coords to design-space (1920×1080) coords
  function toDesignSpace(canvas: HTMLCanvasElement, clientX: number, clientY: number): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const scaleX = 1920 / rect.width;
    const scaleY = 1080 / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top)  * scaleY,
    };
  }

  // Initialise the overlay canvas ONCE on mount — never re-assign width/height (that clears it)
  useEffect(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    overlay.width  = 1920;
    overlay.height = 1080;
    overlayCtxRef.current = overlay.getContext('2d');
  }, []);

  // Stable drag event handlers — mounted once, use refs for all mutable values
  useEffect(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;

    const endDrag = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      setIsDragging(false);
      dragStartRef.current = null;
      overlayCtxRef.current?.clearRect(0, 0, 1920, 1080);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (isPreviewPlayingRef.current) return;
      const ds = toDesignSpace(overlay, e.clientX, e.clientY);
      const bounds = textBoundsRef.current;
      if (!bounds) return;
      if (ds.x >= bounds.left && ds.x <= bounds.right && ds.y >= bounds.top && ds.y <= bounds.bottom) {
        isDraggingRef.current = true;
        setIsDragging(true);
        const startPosX = posXRef.current;
        const startPosY = posYRef.current;
        // Capture edge offsets ONCE at drag start — these are constant throughout the drag
        // because they depend only on font metrics, not on the text position
        dragStartRef.current = {
          mouseX: ds.x, mouseY: ds.y,
          posX: startPosX, posY: startPosY,
          dLeft:   bounds.left   - startPosX,
          dRight:  bounds.right  - startPosX,
          dTop:    bounds.top    - startPosY,
          dBottom: bounds.bottom - startPosY,
        };
        if (overlayCtxRef.current) drawGuides(overlayCtxRef.current, textBoundsRef.current);
        e.preventDefault();
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !dragStartRef.current) return;
      const ds = toDesignSpace(overlay, e.clientX, e.clientY);
      const start = dragStartRef.current;

      // Raw new position: delta from drag-start mouse position applied to drag-start posX/posY
      let newPosX = start.posX + (ds.x - start.mouseX);
      let newPosY = start.posY + (ds.y - start.mouseY);

      // Snap each text edge to the nearest guide line.
      // Use the offsets captured at drag start — they are stable (font metrics don't change mid-drag).
      // For each axis, try snapping from both edges. Only snap if a guide is actually within threshold.
      // Key insight: snapValue returns the ORIGINAL value when no guide is within threshold,
      // so we must check whether the edge actually moved before using it as a candidate.
      const trySnapX = (edgeOffset: number): { snappedPosX: number; dist: number } => {
        const edgePos = newPosX + edgeOffset;
        const snappedEdge = snapValue(edgePos, SNAP_X_GUIDES, SNAP_THRESHOLD_DS);
        const dist = Math.abs(snappedEdge - edgePos); // 0 if no guide nearby
        return { snappedPosX: snappedEdge - edgeOffset, dist };
      };
      const trySnapY = (edgeOffset: number): { snappedPosY: number; dist: number } => {
        const edgePos = newPosY + edgeOffset;
        const snappedEdge = snapValue(edgePos, SNAP_Y_GUIDES, SNAP_THRESHOLD_DS);
        const dist = Math.abs(snappedEdge - edgePos);
        return { snappedPosY: snappedEdge - edgeOffset, dist };
      };

      const snapL = trySnapX(start.dLeft);
      const snapR = trySnapX(start.dRight);
      const snapT = trySnapY(start.dTop);
      const snapB = trySnapY(start.dBottom);

      // Only consider edges that actually snapped (dist > 0 means a guide was within threshold)
      // Pick the edge with the smallest snap distance among those that snapped
      const xCandidates = [snapL, snapR].filter(s => s.dist > 0);
      const yCandidates = [snapT, snapB].filter(s => s.dist > 0);

      if (xCandidates.length > 0) {
        const best = xCandidates.reduce((a, b) => a.dist <= b.dist ? a : b);
        newPosX = best.snappedPosX;
      }
      if (yCandidates.length > 0) {
        const best = yCandidates.reduce((a, b) => a.dist <= b.dist ? a : b);
        newPosY = best.snappedPosY;
      }

      newPosX = Math.round(Math.max(0, Math.min(1920, newPosX)));
      newPosY = Math.round(Math.max(0, Math.min(1080, newPosY)));

      setPosX(newPosX);
      setPosY(newPosY);
      posXRef.current = newPosX;
      posYRef.current = newPosY;

      if (overlayCtxRef.current) drawGuides(overlayCtxRef.current, textBoundsRef.current);
    };

    // Hover cursor: show 'grab' when over text, 'crosshair' otherwise
    const onOverlayMouseMove = (e: MouseEvent) => {
      if (isDraggingRef.current) {
        overlay.style.cursor = 'grabbing';
        return;
      }
      const ds = toDesignSpace(overlay, e.clientX, e.clientY);
      const bounds = textBoundsRef.current;
      if (bounds && ds.x >= bounds.left && ds.x <= bounds.right && ds.y >= bounds.top && ds.y <= bounds.bottom) {
        overlay.style.cursor = 'grab';
      } else {
        overlay.style.cursor = 'crosshair';
      }
    };

    overlay.addEventListener('mousedown', onMouseDown);
    overlay.addEventListener('mousemove', onOverlayMouseMove);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', endDrag);
    overlay.addEventListener('mouseleave', endDrag);

    return () => {
      overlay.removeEventListener('mousedown', onMouseDown);
      overlay.removeEventListener('mousemove', onOverlayMouseMove);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', endDrag);
      overlay.removeEventListener('mouseleave', endDrag);
    };
  // Run once — all mutable values are accessed via refs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveCue = () => {
    if (!cueName.trim()) {
      toast.error("Please enter a cue name");
      return;
    }

    const cueConfig = {
      eyebrow,
      name,
      title,
      font,
      fontSize,
      eyebrowFontSizePercent,
      titleFontSizePercent,
      fontWeight,
      bold,
      underline,
      italic,
      posX,
      posY,
      eyebrowGap,
      titleGap,
      color,
      animationType,
      animationDuration,
      dwellDuration,
      shadowEnabled,
      shadowBlur,
      shadowOffsetX,
      shadowOffsetY,
      shadowColor,
      shadowStrength,
      borderEnabled,
      borderWidth,
      borderColor,
      logoDataUrl: logoDataUrl ?? undefined,
      logoPosition
    };

    if (loadedCueId) {
      // Update existing cue
      setCues(prevCues =>
        prevCues.map(cue =>
          cue.id === loadedCueId
            ? { ...cue, name: cueName, config: cueConfig }
            : cue
        )
      );
      toast.success("Cue updated!");
      setHasUnsavedChanges(false);
    } else {
      // Create new cue with sequential number
      const nextCueNumber = cues.length > 0 ? Math.max(...cues.map(c => c.cueNumber)) + 1 : 1;
      const newCue: Cue = {
        id: Date.now().toString(),
        cueNumber: nextCueNumber,
        name: cueName,
        config: cueConfig
      };
      setCues(prevCues => [...prevCues, newCue]);
      toast.success("Cue saved!");
    }

    setCueName("");
    setLoadedCueId(null);
  };

  const loadCue = (cue: Cue) => {
    setCueName(cue.name);
    setEyebrow(cue.config.eyebrow);
    setName(cue.config.name);
    setTitle(cue.config.title);
    setFont(cue.config.font);
    setFontSize(cue.config.fontSize);
    setEyebrowFontSizePercent(cue.config.eyebrowFontSizePercent);
    setTitleFontSizePercent(cue.config.titleFontSizePercent);
    setFontWeight(cue.config.fontWeight);
    setTitleFontWeight((cue.config as any).titleFontWeight ?? undefined);
    setBold(cue.config.bold);
    setUnderline(cue.config.underline);
    setItalic(cue.config.italic);
    setPosX(cue.config.posX);
    setPosY(cue.config.posY);
    setColor(cue.config.color);
    setAnimationType(cue.config.animationType);
    
    const animSec = Math.floor(cue.config.animationDuration / 1000);
    const animTenth = Math.floor((cue.config.animationDuration % 1000) / 100);
    setAnimationSeconds(animSec);
    setAnimationTenths(animTenth);
    
    const dwellSec = Math.floor(cue.config.dwellDuration / 1000);
    const dwellTenth = Math.floor((cue.config.dwellDuration % 1000) / 100);
    setDwellSeconds(dwellSec);
    setDwellTenths(dwellTenth);
    
    setShadowEnabled(cue.config.shadowEnabled);
    setShadowBlur(cue.config.shadowBlur);
    setShadowOffsetX(cue.config.shadowOffsetX);
    setShadowOffsetY(cue.config.shadowOffsetY);
    setShadowColor(cue.config.shadowColor);
    setShadowStrength((cue.config as any).shadowStrength ?? 100);
    setBorderEnabled(cue.config.borderEnabled);
    setBorderWidth(cue.config.borderWidth);
    setBorderColor(cue.config.borderColor);
    setLogoDataUrl(cue.config.logoDataUrl ?? null);
    setLogoPosition(cue.config.logoPosition ?? "before");
    
    setLoadedCueId(cue.id);
    setHasUnsavedChanges(false);
    toast.success(`Loaded cue: ${cue.name}`);
  };

  const handleNewCue = () => {
    // Deselect any loaded cue
    setLoadedCueId(null);
    setHasUnsavedChanges(false);
    setCueName("");
    // Reset all settings to Meta preset defaults
    setEyebrow("");
    setName("");
    setTitle("");
    setFont("Optimistic Display");
    setFontSize(69);
    setEyebrowFontSizePercent(41);
    setTitleFontSizePercent(52);
    setFontWeight("500");
    setTitleFontWeight("400");
    setBold(false);
    setUnderline(false);
    setItalic(false);
    setPosX(209);
    setPosY(852);
    setEyebrowGap(29);
    setTitleGap(19);
    setColor("#FFFFFF");
    setAnimationType("meta");
    setAnimationSeconds(0);
    setAnimationTenths(5);
    setDwellSeconds(3);
    setDwellTenths(6);
    setShadowEnabled(false);
    setShadowBlur(10);
    setShadowOffsetX(3);
    setShadowOffsetY(3);
    setShadowColor("#000000");
    setShadowStrength(100);
    setBorderEnabled(false);
    setBorderWidth(2);
    setBorderColor("#000000");
    setLogoDataUrl(null);
    setLogoPosition("before");
    toast.success("New cue — Meta preset loaded");
  };

  const deleteCue = (id: string) => {
    setCues(prevCues => prevCues.filter(cue => cue.id !== id));
    if (loadedCueId === id) {
      setLoadedCueId(null);
      setHasUnsavedChanges(false);
    }
    toast.success("Cue deleted");
  };

  const saveCustomPreset = () => {
    if (!presetName.trim()) {
      toast.error("Please enter a preset name");
      return;
    }

    const presetConfig = {
      eyebrow,
      name,
      title,
      font,
      fontSize,
      eyebrowFontSizePercent,
      titleFontSizePercent,
      fontWeight,
      bold,
      underline,
      italic,
      posX,
      posY,
      eyebrowGap,
      titleGap,
      color,
      animationType,
      animationDuration,
      dwellDuration,
      shadowEnabled,
      shadowBlur,
      shadowOffsetX,
      shadowOffsetY,
      shadowColor,
      shadowStrength,
      borderEnabled,
      borderWidth,
      borderColor,
      logoDataUrl: logoDataUrl ?? undefined,
      logoPosition
    };

    const newPreset: CustomPreset = {
      id: Date.now().toString(),
      name: presetName,
      config: presetConfig
    };

    setCustomPresets(prev => [...prev, newPreset]);
    setPresetName("");
    setShowPresetInput(false);
    toast.success(`Preset "${presetName}" saved!`);
  };

  const loadCustomPreset = (preset: CustomPreset) => {
    // Text content (eyebrow, name, title) is intentionally NOT overwritten by presets
    setFont(preset.config.font);
    setFontSize(preset.config.fontSize);
    setEyebrowFontSizePercent(preset.config.eyebrowFontSizePercent);
    setTitleFontSizePercent(preset.config.titleFontSizePercent);
    setFontWeight(preset.config.fontWeight);
    setTitleFontWeight((preset.config as any).titleFontWeight ?? undefined);
    setBold(preset.config.bold);
    setUnderline(preset.config.underline);
    setItalic(preset.config.italic);
    setPosX(preset.config.posX);
    setPosY(preset.config.posY);
    setEyebrowGap((preset.config as any).eyebrowGap ?? 8);
    setTitleGap((preset.config as any).titleGap ?? 10);
    setColor(preset.config.color);
    setAnimationType(preset.config.animationType);
    
    const animSec = Math.floor(preset.config.animationDuration / 1000);
    const animTenth = Math.floor((preset.config.animationDuration % 1000) / 100);
    setAnimationSeconds(animSec);
    setAnimationTenths(animTenth);
    
    const dwellSec = Math.floor(preset.config.dwellDuration / 1000);
    const dwellTenth = Math.floor((preset.config.dwellDuration % 1000) / 100);
    setDwellSeconds(dwellSec);
    setDwellTenths(dwellTenth);
    
    setShadowEnabled(preset.config.shadowEnabled);
    setShadowBlur(preset.config.shadowBlur);
    setShadowOffsetX(preset.config.shadowOffsetX);
    setShadowOffsetY(preset.config.shadowOffsetY);
    setShadowColor(preset.config.shadowColor);
    setShadowStrength((preset.config as any).shadowStrength ?? 100);
    setBorderEnabled(preset.config.borderEnabled);
    setBorderWidth(preset.config.borderWidth);
    setBorderColor(preset.config.borderColor);
    setLogoDataUrl(preset.config.logoDataUrl ?? null);
    setLogoPosition(preset.config.logoPosition ?? "before");
    
    toast.success(`Loaded preset: ${preset.name}`);
  };

  const deleteCustomPreset = (id: string) => {
    setCustomPresets(prev => prev.filter(preset => preset.id !== id));
    toast.success("Custom preset deleted");
  };



  return (
    <div className="min-h-screen bg-black text-white font-mono">
      {/* Top Navigation */}
      <div className="border-b border-cyan-500/30 px-3 flex items-center justify-between flex-shrink-0 gap-2 min-w-0 h-9" style={{borderBottomColor: 'rgba(0, 146, 184, 1)'}}>
        <div className="flex items-center gap-2 min-w-0 shrink">
          <h1 className="text-xs font-bold tracking-wider whitespace-nowrap hidden md:block">LOWER THIRDS GENERATOR</h1>
          <nav className="flex gap-2">
            <Link href="/live" className="text-xs hover:text-cyan-400 transition-colors whitespace-nowrap" style={{color: '#ff0000'}}>
              LIVE
            </Link>
            <Link href="/edit" className="text-xs font-bold flex items-center gap-1 whitespace-nowrap" style={{color: 'rgba(0, 146, 184, 1)'}}>
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 flex-shrink-0"></span>
              EDIT
            </Link>
            <Link href="/export" className="text-xs text-gray-400 hover:text-cyan-400 transition-colors whitespace-nowrap">
              EXPORT
            </Link>
            <Link href="/settings" className="text-xs text-gray-400 hover:text-cyan-400 transition-colors whitespace-nowrap">
              SETTINGS
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <p className="text-xs text-gray-500 whitespace-nowrap hidden 2xl:block">1920×1080</p>
        </div>
      </div>

      <div className="flex h-[calc(100vh-36px)]">
        {/* Left Sidebar - Controls */}
        <div className="w-56 sm:w-64 lg:w-72 xl:w-80 border-r border-cyan-500/30 overflow-y-auto p-3 sm:p-4" style={{borderStyle: 'none'}}>
          <Accordion type="multiple" defaultValue={["text"]} className="space-y-2">
            {/* Text Content */}
            <AccordionItem value="text" className="border border-cyan-500/30 rounded-md">
              <AccordionTrigger className="px-4 py-2 hover:bg-cyan-500/5">
                <span className="text-cyan-400 font-semibold">TEXT CONTENT</span>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-3">
                <div>
                  <Label htmlFor="eyebrow" className="text-xs text-gray-400">Company / Pronouns (Optional)</Label>
                  <Input
                    id="eyebrow"
                    value={eyebrow}
                    onChange={(e) => setEyebrow(e.target.value)}
                    className="bg-black border-cyan-500/30 text-white mt-1"
                    placeholder="e.g. Acme Corp or they/them"
                  />
                </div>

                {/* Logo uploader */}
                <div className="space-y-2">
                  <Label className="text-xs text-gray-400">Company Logo (PNG)</Label>
                  {/* Meta logo quick-select */}
                  <div className="flex gap-2 items-center mb-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 hover:underline text-xs flex items-center gap-1.5"
                      onClick={() => {
                        const img = new Image();
                        img.onload = () => {
                          const c = document.createElement('canvas');
                          c.width = img.naturalWidth;
                          c.height = img.naturalHeight;
                          c.getContext('2d')!.drawImage(img, 0, 0);
                          setLogoDataUrl(c.toDataURL('image/png'));
                          toast.success('Meta logo loaded');
                        };
                        img.onerror = () => toast.error('Failed to load Meta logo');
                        img.src = '/meta_logo_white.c074df21.png';
                      }}
                    >
                      <img src="/meta_logo_white.c074df21.png" alt="Meta" className="h-3 w-auto" />
                      Use Meta Logo
                    </Button>
                  </div>
                  <div className="flex gap-2 items-center">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 hover:underline text-xs"
                      onClick={() => logoFileInputRef.current?.click()}
                    >
                      {logoDataUrl ? "Replace Logo" : "Upload Custom Logo"}
                    </Button>
                    {logoDataUrl && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs"
                        onClick={() => setLogoDataUrl(null)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  <input
                    ref={logoFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        setLogoDataUrl(ev.target?.result as string);
                      };
                      reader.readAsDataURL(file);
                      e.target.value = "";
                    }}
                  />
                  {logoDataUrl && (
                    <>
                      <div className="flex items-center gap-2 mt-1">
                        <img src={logoDataUrl} alt="Logo preview" className="h-8 w-auto object-contain border border-cyan-500/20 rounded bg-gray-900 p-0.5" />
                        <span className="text-xs text-gray-500">Logo loaded</span>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-400">Position</Label>
                        <div className="flex gap-2 mt-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className={`text-xs flex-1 ${
                              logoPosition === "before"
                                ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
                                : "border-cyan-500/30 text-gray-400"
                            }`}
                            onClick={() => setLogoPosition("before")}
                          >
                            Before Text
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className={`text-xs flex-1 ${
                              logoPosition === "after"
                                ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
                                : "border-cyan-500/30 text-gray-400"
                            }`}
                            onClick={() => setLogoPosition("after")}
                          >
                            After Text
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <div>
                  <Label htmlFor="name" className="text-xs text-gray-400">Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="bg-black border-cyan-500/30 text-white mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="title" className="text-xs text-gray-400">Title</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="bg-black border-cyan-500/30 text-white mt-1"
                  />
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Presets */}
            <AccordionItem value="presets" className="border border-cyan-500/30 rounded-md">
              <AccordionTrigger className="px-4 py-2 hover:bg-cyan-500/5">
                <span className="text-cyan-400 font-semibold">PRESETS</span>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-3">
                {/* Save Current as Preset */}
                <div className="space-y-2 pt-3 border-t border-cyan-500/30">
                  <Label className="text-xs text-gray-400">Save Current Configuration</Label>
                  {!showPresetInput ? (
                    <Button
                      onClick={() => setShowPresetInput(true)}
                      variant="outline"
                      className="w-full border-cyan-500 text-cyan-400 hover:bg-cyan-500/10"
                      size="sm"
                    >
                      + Save as Custom Preset
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <Input
                        value={presetName}
                        onChange={(e) => setPresetName(e.target.value)}
                        placeholder="Enter preset name..."
                        className="bg-black border-cyan-500/30 text-white"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            saveCustomPreset();
                          } else if (e.key === 'Escape') {
                            setShowPresetInput(false);
                            setPresetName("");
                          }
                        }}
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <Button
                          onClick={saveCustomPreset}
                          className="flex-1 bg-cyan-500 hover:bg-cyan-600 text-black font-bold"
                          size="sm"
                        >
                          Save
                        </Button>
                        <Button
                          onClick={() => {
                            setShowPresetInput(false);
                            setPresetName("");
                          }}
                          variant="outline"
                          className="flex-1 border-cyan-500/30 text-gray-400 hover:bg-cyan-500/5"
                          size="sm"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Built-in Presets */}
                <div className="space-y-2 pt-3 border-t border-cyan-500/30">
                  <Label className="text-xs text-gray-400">Built-in Presets</Label>
                  <div className="space-y-2">
                    {BUILT_IN_TEMPLATES.map(preset => (
                      <Button
                        key={preset.id}
                        onClick={() => loadCustomPreset(preset as any)}
                        variant="outline"
                        className="w-full border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 justify-start"
                        size="sm"
                      >
                        {preset.name}
                        {preset.description && (
                          <span className="ml-2 text-xs text-gray-500 truncate">{preset.description.split(':')[0]}</span>
                        )}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Custom Presets List */}
                {customPresets.length > 0 && (
                  <div className="space-y-2 pt-3 border-t border-cyan-500/30">
                    <Label className="text-xs text-gray-400">Custom Presets</Label>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {customPresets.map(preset => (
                        <div
                          key={preset.id}
                          className="flex items-center gap-2"
                        >
                          <Button
                            onClick={() => loadCustomPreset(preset)}
                            variant="outline"
                            className="flex-1 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 justify-start"
                            size="sm"
                          >
                            {preset.name}
                          </Button>
                          <Button
                            onClick={() => deleteCustomPreset(preset.id)}
                            variant="ghost"
                            size="sm"
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10 px-2"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-xs text-gray-500 mt-2">
                  Load preset configurations or save your current settings as a custom preset
                </p>
              </AccordionContent>
            </AccordionItem>

            {/* Typography */}
            <AccordionItem value="typography" className="border border-cyan-500/30 rounded-md">
              <AccordionTrigger className="px-4 py-2 hover:bg-cyan-500/5">
                <span className="text-cyan-400 font-semibold">TYPOGRAPHY</span>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-3">
                <div>
                  <Label className="text-xs text-gray-400">Font Family</Label>
                  <Select value={font} onValueChange={setFont}>
                    <SelectTrigger className="bg-black border-cyan-500/30 text-white mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FONTS.map(f => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-gray-400">Font Size (Name): {fontSize}px</Label>
                  <Slider
                    value={[fontSize]}
                    onValueChange={([v]) => setFontSize(v)}
                    min={12}
                    max={120}
                    step={1}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-400">Eyebrow Size: {eyebrowFontSizePercent}%</Label>
                  <Slider
                    value={[eyebrowFontSizePercent]}
                    onValueChange={([v]) => setEyebrowFontSizePercent(v)}
                    min={20}
                    max={100}
                    step={5}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-400">Title Size: {titleFontSizePercent}%</Label>
                  <Slider
                    value={[titleFontSizePercent]}
                    onValueChange={([v]) => setTitleFontSizePercent(v)}
                    min={20}
                    max={100}
                    step={5}
                    className="mt-2"
                  />
                </div>
                <div className="flex gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={bold} onCheckedChange={(c) => setBold(!!c)} />
                    <span className="text-xs">Bold</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={italic} onCheckedChange={(c) => setItalic(!!c)} />
                    <span className="text-xs">Italic</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={underline} onCheckedChange={(c) => setUnderline(!!c)} />
                    <span className="text-xs">Underline</span>
                  </label>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Position */}
            <AccordionItem value="position" className="border border-cyan-500/30 rounded-md">
              <AccordionTrigger className="px-4 py-2 hover:bg-cyan-500/5">
                <span className="text-cyan-400 font-semibold">POSITION</span>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-3">
                <div>
                  <Label className="text-xs text-gray-400">X Position: {posX}px</Label>
                  <Slider
                    value={[posX]}
                    onValueChange={([v]) => setPosX(v)}
                    min={0}
                    max={1920}
                    step={1}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-400">Y Position: {posY}px</Label>
                  <Slider
                    value={[posY]}
                    onValueChange={([v]) => setPosY(v)}
                    min={0}
                    max={1080}
                    step={1}
                    className="mt-2"
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={showGrid} onCheckedChange={(c) => setShowGrid(!!c)} />
                  <span className="text-xs">Show Grid</span>
                </label>
              </AccordionContent>
            </AccordionItem>

            {/* Color */}
            <AccordionItem value="color" className="border border-cyan-500/30 rounded-md">
              <AccordionTrigger className="px-4 py-2 hover:bg-cyan-500/5">
                <span className="text-cyan-400 font-semibold">COLOR</span>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-3">
                <div className="flex gap-2 flex-wrap">
                  {PRESET_COLORS.map(preset => (
                    <button
                      key={preset.value}
                      onClick={() => setColor(preset.value)}
                      className="w-10 h-10 rounded border-2 border-cyan-500/30 hover:border-cyan-500"
                      style={{ backgroundColor: preset.value }}
                      title={preset.name}
                    />
                  ))}
                </div>
                <div>
                  <Label className="text-xs text-gray-400">Custom Color</Label>
                  <Input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-10 mt-1"
                  />
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Animation */}
            <AccordionItem value="animation" className="border border-cyan-500/30 rounded-md">
              <AccordionTrigger className="px-4 py-2 hover:bg-cyan-500/5">
                <span className="text-cyan-400 font-semibold">ANIMATION</span>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-3">
                <div>
                  <Label className="text-xs text-gray-400">Animation Type</Label>
                  <Select value={animationType} onValueChange={setAnimationType}>
                    <SelectTrigger className="bg-black border-cyan-500/30 text-white mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ANIMATION_TYPES.map(anim => (
                        <SelectItem key={anim.value} value={anim.value}>{anim.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Animate In/Out + Dwell spinners — same style as Live page */}
                <div className="flex gap-8 items-start">
                  {/* Animation In/Out Duration */}
                  <div className="flex-1">
                    <label className="text-xs text-gray-400 mb-2 block text-center">In/Out</label>
                    <div className="flex gap-4 justify-center">
                      {/* Seconds */}
                      <div className="flex flex-col items-center">
                        <button
                          onClick={() => setAnimationSeconds(Math.min(10, animationSeconds + 1))}
                          className="w-8 h-8 bg-gray-800 text-white rounded flex items-center justify-center text-lg hover:bg-gray-700 cursor-pointer"
                        >+</button>
                        <input
                          type="number"
                          value={animationSeconds}
                          onChange={(e) => setAnimationSeconds(Math.max(0, Math.min(10, parseInt(e.target.value) || 0)))}
                          className="w-8 h-10 bg-black border-3 border-gray-800 text-white text-center my-1"
                          min="0"
                          max="10"
                        />
                        <button
                          onClick={() => setAnimationSeconds(Math.max(0, animationSeconds - 1))}
                          className="w-8 h-8 bg-gray-800 text-white rounded flex items-center justify-center text-lg hover:bg-gray-700 cursor-pointer"
                        >−</button>
                        <span className="text-xs text-gray-500 mt-1">s</span>
                      </div>
                      {/* Tenths */}
                      <div className="flex flex-col items-center">
                        <button
                          onClick={() => setAnimationTenths(Math.min(9, animationTenths + 1))}
                          className="w-8 h-8 bg-gray-800 text-white rounded flex items-center justify-center text-lg hover:bg-gray-700 cursor-pointer"
                        >+</button>
                        <input
                          type="number"
                          value={animationTenths}
                          onChange={(e) => setAnimationTenths(Math.max(0, Math.min(9, parseInt(e.target.value) || 0)))}
                          className="w-8 h-10 bg-black border-3 border-gray-800 text-white text-center my-1"
                          min="0"
                          max="9"
                          step="1"
                        />
                        <button
                          onClick={() => setAnimationTenths(Math.max(0, animationTenths - 1))}
                          className="w-8 h-8 bg-gray-800 text-white rounded flex items-center justify-center text-lg hover:bg-gray-700 cursor-pointer"
                        >−</button>
                        <span className="text-xs text-gray-500 mt-1">1/10s</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2 text-center">Total: {(animationDuration / 1000).toFixed(1)}s</p>
                  </div>

                  {/* Dwell/Hold Duration */}
                  <div className="flex-1">
                    <label className="text-xs text-gray-400 mb-2 block text-center">Dwell/Hold</label>
                    <div className="flex gap-4 justify-center">
                      {/* Seconds */}
                      <div className="flex flex-col items-center">
                        <button
                          onClick={() => setDwellSeconds(Math.min(10, dwellSeconds + 1))}
                          className="w-8 h-8 bg-gray-800 text-white rounded flex items-center justify-center text-lg hover:bg-gray-700 cursor-pointer"
                        >+</button>
                        <input
                          type="number"
                          value={dwellSeconds}
                          onChange={(e) => setDwellSeconds(Math.max(0, Math.min(10, parseInt(e.target.value) || 0)))}
                          className="w-8 h-10 bg-black border-3 border-gray-800 text-white text-center my-1"
                          min="0"
                          max="10"
                        />
                        <button
                          onClick={() => setDwellSeconds(Math.max(0, dwellSeconds - 1))}
                          className="w-8 h-8 bg-gray-800 text-white rounded flex items-center justify-center text-lg hover:bg-gray-700 cursor-pointer"
                        >−</button>
                        <span className="text-xs text-gray-500 mt-1">s</span>
                      </div>
                      {/* Tenths */}
                      <div className="flex flex-col items-center">
                        <button
                          onClick={() => setDwellTenths(Math.min(9, dwellTenths + 1))}
                          className="w-8 h-8 bg-gray-800 text-white rounded flex items-center justify-center text-lg hover:bg-gray-700 cursor-pointer"
                        >+</button>
                        <input
                          type="number"
                          value={dwellTenths}
                          onChange={(e) => setDwellTenths(Math.max(0, Math.min(9, parseInt(e.target.value) || 0)))}
                          className="w-8 h-10 bg-black border-3 border-gray-800 text-white text-center my-1"
                          min="0"
                          max="9"
                          step="1"
                        />
                        <button
                          onClick={() => setDwellTenths(Math.max(0, dwellTenths - 1))}
                          className="w-8 h-8 bg-gray-800 text-white rounded flex items-center justify-center text-lg hover:bg-gray-700 cursor-pointer"
                        >−</button>
                        <span className="text-xs text-gray-500 mt-1">1/10s</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2 text-center">Total: {(dwellDuration / 1000).toFixed(1)}s</p>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Shadow */}
            <AccordionItem value="shadow" className="border border-cyan-500/30 rounded-md">
              <AccordionTrigger className="px-4 py-2 hover:bg-cyan-500/5">
                <span className="text-cyan-400 font-semibold">SHADOW</span>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={shadowEnabled} onCheckedChange={(c) => setShadowEnabled(!!c)} />
                  <span className="text-xs">Enable Shadow</span>
                </label>
                {shadowEnabled && (
                  <>
                    <div>
                      <Label className="text-xs text-gray-400">Blur: {shadowBlur}px</Label>
                      <Slider
                        value={[shadowBlur]}
                        onValueChange={([v]) => setShadowBlur(v)}
                        min={0}
                        max={50}
                        step={1}
                        className="mt-2"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-400">Strength: {shadowStrength}%</Label>
                      <Slider
                        value={[shadowStrength]}
                        onValueChange={([v]) => setShadowStrength(v)}
                        min={0}
                        max={200}
                        step={1}
                        className="mt-2"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-400">Offset X: {shadowOffsetX}px</Label>
                      <Slider
                        value={[shadowOffsetX]}
                        onValueChange={([v]) => setShadowOffsetX(v)}
                        min={-50}
                        max={50}
                        step={1}
                        className="mt-2"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-400">Offset Y: {shadowOffsetY}px</Label>
                      <Slider
                        value={[shadowOffsetY]}
                        onValueChange={([v]) => setShadowOffsetY(v)}
                        min={-50}
                        max={50}
                        step={1}
                        className="mt-2"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-400">Shadow Color</Label>
                      <Input
                        type="color"
                        value={shadowColor}
                        onChange={(e) => setShadowColor(e.target.value)}
                        className="h-10 mt-1"
                      />
                    </div>
                  </>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* Border */}
            <AccordionItem value="border" className="border border-cyan-500/30 rounded-md">
              <AccordionTrigger className="px-4 py-2 hover:bg-cyan-500/5">
                <span className="text-cyan-400 font-semibold">BORDER</span>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={borderEnabled} onCheckedChange={(c) => setBorderEnabled(!!c)} />
                  <span className="text-xs">Enable Border</span>
                </label>
                {borderEnabled && (
                  <>
                    <div>
                      <Label className="text-xs text-gray-400">Width: {borderWidth}px</Label>
                      <Slider
                        value={[borderWidth]}
                        onValueChange={([v]) => setBorderWidth(v)}
                        min={1}
                        max={20}
                        step={1}
                        className="mt-2"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-400">Border Color</Label>
                      <Input
                        type="color"
                        value={borderColor}
                        onChange={(e) => setBorderColor(e.target.value)}
                        className="h-10 mt-1"
                      />
                    </div>
                  </>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        {/* Center - Preview */}
        <div className="flex-1 flex flex-col p-6 overflow-y-auto min-h-0" style={{border: '1px solid rgba(0, 146, 184, 1)', background: 'unset'}}>
          {/* Preview Controls */}
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <h2 className="text-xl font-bold text-cyan-400">PREVIEW</h2>
            <Button
              onClick={() => setIsPreviewPlaying(!isPreviewPlaying)}
              className={`${
                isPreviewPlaying
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-cyan-500 hover:bg-cyan-600"
              } text-black font-bold`}
            >
              {isPreviewPlaying ? "Stop Preview" : "Play Preview"}
            </Button>
          </div>

          {/* Video Feeds Container — normal document flow, scrolls with the panel */}
          <div className="flex flex-col gap-10">
            {/* Feed 1: Color Canvas */}
            <div className="flex flex-col flex-shrink-0">
              <h3 className="text-sm font-semibold text-cyan-400 mb-2">FEED 1: COLOR OUTPUT</h3>
              {/* Outer border wrapper — keeps 16:9 ratio regardless of border width */}
              <div className="w-full aspect-video rounded-md" style={{ border: "5px solid #ffffff", boxSizing: "border-box" }}>
                {/* Inner fill — applies the checkerboard / solid background */}
                <div
                  className="w-full h-full overflow-hidden flex items-center justify-center"
                  style={getPreviewBgStyle(previewBg)}
                >
                  {/* Stack wrapper: color canvas + overlay canvas, perfectly aligned */}
                  <div
                    className="relative"
                    style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <canvas
                      ref={colorCanvasRef}
                      width={1920}
                      height={1080}
                      className="max-w-full max-h-full w-auto h-auto block"
                    />
                    {/* Overlay canvas: exactly the same CSS size as the color canvas above */}
                    <canvas
                      ref={overlayCanvasRef}
                      width={1920}
                      height={1080}
                      className="absolute max-w-full max-h-full w-auto h-auto block"
                      style={{
                        cursor: isDragging ? 'grabbing' : 'crosshair',
                        pointerEvents: isPreviewPlaying ? 'none' : 'auto',
                        userSelect: 'none',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                      }}
                    />
                  </div>
                </div>
              </div>
              {/* Drag hint + position readout */}
              <div className="mt-2 flex items-center justify-between flex-shrink-0">
                <p className="text-xs text-gray-500">
                  {isDragging
                    ? <span className="text-cyan-400">Dragging — X: {posX}  Y: {posY}</span>
                    : <span>Click &amp; drag text to reposition · snaps to guides</span>
                  }
                </p>
                {isDragging && (
                  <span className="text-xs text-cyan-400 font-mono">{posX}, {posY}</span>
                )}
              </div>

              {/* Background selector */}
              <div className="mt-3 flex-shrink-0">
                <p className="text-xs text-gray-500 mb-2 tracking-wider">PREVIEW BACKGROUND</p>
                <div className="flex gap-2 flex-wrap">
                  {PREVIEW_BG_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setPreviewBg(opt.id)}
                      title={opt.label}
                      className={`w-9 h-9 rounded border-2 transition-colors ${
                        previewBg === opt.id
                          ? "border-cyan-400 ring-1 ring-cyan-400"
                          : "border-cyan-500/30 hover:border-cyan-500/60"
                      }`}
                      style={opt.swatch}
                    />
                  ))}
                </div>
              </div>

              {/* Preview progress bar */}
              {isPreviewPlaying && (
                <div className="mt-2 flex-shrink-0">
                  <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-400 rounded-full transition-none"
                      style={{ width: `${previewProgress}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-xs text-gray-500 font-mono">
                      {(previewElapsedMs / 1000).toFixed(1)}s
                    </span>
                    <span className="text-xs text-gray-500 font-mono">
                      {(previewTotalMs / 1000).toFixed(1)}s total
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Feed 2: Alpha Canvas — hidden by default, shown when enabled in Settings */}
            {showFeed2Alpha && (
            <div className="flex flex-col flex-shrink-0 pt-6 border-t border-cyan-500/20">
              <h3 className="text-sm font-semibold text-cyan-400 mb-2">FEED 2: ALPHA MASK</h3>
              {/* Outer border wrapper — keeps 16:9 ratio */}
              <div className="w-full aspect-video rounded-md" style={{ border: "5px solid #ffffff", boxSizing: "border-box" }}>
                {/* Inner fill — always black for alpha matte */}
                <div className="w-full h-full overflow-hidden flex items-center justify-center bg-black">
                  <canvas
                    ref={alphaCanvasRef}
                    width={1920}
                    height={1080}
                    className="max-w-full max-h-full w-auto h-auto object-contain"
                  />
                </div>
              </div>
            </div>
            )}
            {/* Hidden alpha canvas (always rendered for background processing) */}
            {!showFeed2Alpha && (
              <canvas
                ref={alphaCanvasRef}
                width={1920}
                height={1080}
                className="hidden"
              />
            )}
          </div>
        </div>

        {/* Right Sidebar - Save Cue */}
        <div className="w-80 overflow-y-auto p-4" style={{borderStyle: 'none'}}>
          {/* Save Cue Section */}
          <div className="p-4 border border-cyan-500/30 rounded-md space-y-3">
            <Label className="text-cyan-400 font-semibold">SAVE CUE</Label>
            <Input
              value={cueName}
              onChange={(e) => setCueName(e.target.value)}
              placeholder="Enter cue name..."
              className="bg-black border-cyan-500/30 text-white"
            />
            <Button
              onClick={saveCue}
              className="w-full bg-cyan-500 hover:bg-cyan-600 text-black font-bold"
            >
              <Save className="w-4 h-4 mr-2" />
              {loadedCueId ? (hasUnsavedChanges ? "Save Changes" : "Update Cue") : "Save New Cue"}
            </Button>
            {hasUnsavedChanges && (
              <p className="text-xs text-yellow-500">⚠ Unsaved changes</p>
            )}
            <Button
              onClick={handleNewCue}
              variant="outline"
              className="w-full border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 hover:text-cyan-300 font-bold"
            >
              <PlusCircle className="w-4 h-4 mr-2" />
              New Cue
            </Button>
          </div>

          {/* Saved Cues List */}
          {cues.length > 0 && (
            <div className="mt-6 p-4 border border-cyan-500/30 rounded-md">
              <Label className="text-cyan-400 font-semibold mb-3 block">SAVED CUES</Label>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {cues.map(cue => (
                  <div
                    key={cue.id}
                    className={`flex items-center justify-between p-2 rounded border ${
                      loadedCueId === cue.id
                        ? "border-cyan-500 bg-cyan-500/10"
                        : "border-cyan-500/30 hover:border-cyan-500/50"
                    }`}
                  >
                    <button
                      onClick={() => loadCue(cue)}
                      className="flex-1 text-left text-sm"
                    >
                      <span className="text-cyan-400 font-mono mr-2">#{cue.cueNumber}</span>
                      {cue.name}
                    </button>
                    <Button
                      onClick={() => deleteCue(cue.id)}
                      variant="ghost"
                      size="sm"
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
