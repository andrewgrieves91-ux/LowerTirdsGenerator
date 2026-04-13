/*
Live Page: Load and play out saved lower thirds cues
- Cue selector
- Playback controls (Animate In, Animate Out, Reset)
- Feed 1 and Feed 2 outputs
- Pop-out window support
*/

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, StopCircle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";
import { TimecodeGenerator } from "@/utils/timecode";
import { FrameLimiter } from "@/utils/frameLimiter";
import { useTimecode } from "@/contexts/TimecodeContext";
import gsap from "gsap";
import { GSAPAnimationController, AnimationValues } from "@/utils/gsapAnimationController";
import { useAppSettings } from "@/contexts/AppSettingsContext";
import { useCompanion } from "@/hooks/useCompanion";

type AnimationState = "idle" | "animatingIn" | "visible" | "animatingOut";

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

interface Cue {
  id: string;
  cueNumber: number;
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
    borderEnabled?: boolean;
    borderWidth?: number;
    borderColor?: string;
    logoDataUrl?: string;
    logoPosition?: "before" | "after";
  };
}

export default function Live() {
  // Timecode genlock for frame synchronization
  const { timecode, frameNumber, isRunning: timecodeRunning, startTimecode } = useTimecode();
  const { showFilter1 } = useAppSettings();
  
  const [cues, setCues] = useState<Cue[]>([]);
  const [selectedCueId, setSelectedCueId] = useState<string>(() => {
    // Restore last selected cue from localStorage so Companion's play command
    // works even after a page reload without requiring manual cue selection.
    return localStorage.getItem("lower-thirds-selectedCueId") || "";
  });
  const [currentCue, setCurrentCue] = useState<Cue | null>(null);
  // Stable ref for currentCue — used inside render loop to avoid useEffect re-runs on cue object reference changes
  const currentCueRef = useRef<Cue | null>(null);
  const [playedCues, setPlayedCues] = useState<Set<string>>(new Set());
  
  // Animation state
  const [animationState, _setAnimationState] = useState<AnimationState>("idle");
  // Wrapper: update the ref SYNCHRONOUSLY before the React re-render so effects
  // that read animationStateRef.current never see a stale value.
  const setAnimationState = (state: AnimationState) => {
    animationStateRef.current = state;
    _setAnimationState(state);
  };
  const [animationProgress, setAnimationProgress] = useState(0);
  const [currentFps, setCurrentFps] = useState(0);
  const [remainingTime, setRemainingTime] = useState(0); // Countdown timer in milliseconds
  
  // Timing controls (separate seconds and milliseconds) - persisted in localStorage
  const [animateSeconds, setAnimateSeconds] = useState(() => {
    const saved = localStorage.getItem('playbackSpeed_animateSeconds');
    return saved ? parseInt(saved) : 1;
  });
  const [animateTenths, setAnimateTenths] = useState(() => {
    const saved = localStorage.getItem('playbackSpeed_animateTenths');
    return saved ? parseInt(saved) : 0;
  });
  const [dwellSeconds, setDwellSeconds] = useState(() => {
    const saved = localStorage.getItem('playbackSpeed_dwellSeconds');
    return saved ? parseInt(saved) : 3;
  });
  const [dwellTenths, setDwellTenths] = useState(() => {
    const saved = localStorage.getItem('playbackSpeed_dwellTenths');
    return saved ? parseInt(saved) : 0;
  });
  const [overrideSpeed, setOverrideSpeed] = useState(() => {
    const saved = localStorage.getItem('playbackSpeed_overrideSpeed');
    return saved ? saved === 'true' : false;
  });
  
  // Calculate total time in ms
  const animateTime = animateSeconds * 1000 + animateTenths * 100;
  const dwellTime = dwellSeconds * 1000 + dwellTenths * 100;

  const colorCanvasRef = useRef<HTMLCanvasElement>(null);
  const alphaCanvasRef = useRef<HTMLCanvasElement>(null);
  const logoImageRef = useRef<HTMLImageElement | null>(null);

  // Load logo image whenever the current cue changes
  useEffect(() => {
    const logoUrl = currentCue?.config?.logoDataUrl;
    if (!logoUrl) {
      logoImageRef.current = null;
      return;
    }
    const img = new Image();
    img.onload = () => { logoImageRef.current = img; };
    img.src = logoUrl;
  }, [currentCue]);
  // Create pre-rendered offscreen canvases for Meta animation
  // Called whenever the cue changes — renders text at MAX scale (1.121x) once
  const createMetaOffscreenCanvases = (cue: Cue, logoImg: HTMLImageElement | null) => {
    const RENDER_SCALE = 4.0;
    const baseNameFontSize = cue.config.fontSize;
    const baseEyebrowFontSize = cue.config.fontSize * ((cue.config.eyebrowFontSizePercent || 40) / 100);
    const baseTitleFontSize = cue.config.fontSize * ((cue.config.titleFontSizePercent || 75) / 100);
    const maxNameFontSize    = baseNameFontSize    * RENDER_SCALE;
    const maxEyebrowFontSize = baseEyebrowFontSize * RENDER_SCALE;
    const maxTitleFontSize   = baseTitleFontSize   * RENDER_SCALE;
    const eyebrowGap = (cue.config as any).eyebrowGap ?? 8;
    const titleGap   = (cue.config as any).titleGap   ?? 10;
    const fontWeight = cue.config.bold ? '700' : (cue.config.fontWeight || 'normal');
    const fontStyle  = cue.config.italic ? 'italic' : 'normal';
    const titleFontWeight = (cue.config as any).titleFontWeight || fontWeight;
    const eyebrow = cue.config.eyebrow || '';

    // Measure text widths at max scale using a temp canvas
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = 1920; tmpCanvas.height = 200;
    const tmpCtx = tmpCanvas.getContext('2d')!;
    tmpCtx.textBaseline = 'top';

    tmpCtx.font = `${fontStyle} ${fontWeight} ${maxEyebrowFontSize}px "${cue.config.font}", sans-serif`;
    const eyebrowTextW = eyebrow ? tmpCtx.measureText(eyebrow).width : 0;
    const logoH = maxEyebrowFontSize;
    const logoW = logoImg ? Math.round((logoImg.naturalWidth / logoImg.naturalHeight) * logoH) : 0;
    const logoGap = logoImg ? Math.round(maxEyebrowFontSize * 0.3) : 0;
    const eyebrowTotalW = Math.ceil(eyebrowTextW + logoW + logoGap) + 4;
    const eyebrowH = Math.ceil(maxEyebrowFontSize) + 4;

    tmpCtx.font = `${fontStyle} ${fontWeight} ${maxNameFontSize}px "${cue.config.font}", sans-serif`;
    const nameW = Math.ceil(tmpCtx.measureText(cue.config.name).width) + 4;
    const nameH = Math.ceil(maxNameFontSize) + 4;

    tmpCtx.font = `${fontStyle} ${titleFontWeight} ${maxTitleFontSize}px "${cue.config.font}", sans-serif`;
    const titleW = Math.ceil(tmpCtx.measureText(cue.config.title).width) + 4;
    const titleH = Math.ceil(maxTitleFontSize) + 4;

    // Three separate padding constants — each controls a different concern:
    //   TEXT_PAD   : fixed inset for text draw origin — NEVER changes
    //   STROKE_PAD : extra canvas space for stroke overflow (half lineWidth)
    //   SHADOW_PAD : extra canvas space for shadow blur + offset overflow
    // Text draw origins use only DRAW_PAD = TEXT_PAD + STROKE_PAD.
    // Canvas/region sizes use REGION_PAD = DRAW_PAD + SHADOW_PAD.
    const TEXT_PAD = 4;
    const bw = cue.config.borderEnabled ? (cue.config.borderWidth || 2) : 0;
    const STROKE_PAD = bw > 0 ? Math.ceil(bw / 2) + 2 : 0;
    const shadowEnabled = cue.config.shadowEnabled ?? false;
    const shadowBlur     = cue.config.shadowBlur    ?? 0;
    const shadowOffX    = cue.config.shadowOffsetX  ?? 0;
    const shadowOffY    = cue.config.shadowOffsetY  ?? 0;
    const shadowColor   = cue.config.shadowColor    ?? 'rgba(0,0,0,0.8)';
    // Shadow is drawn on main canvas — REGION_PAD only needs TEXT+STROKE padding
    const DRAW_PAD   = TEXT_PAD + STROKE_PAD;
    const REGION_PAD = DRAW_PAD;
    const eyebrowH2 = eyebrowH + REGION_PAD * 2;
    const nameH2    = nameH    + REGION_PAD * 2;
    const titleH2   = titleH   + REGION_PAD * 2;
    const offW = Math.max(eyebrowTotalW, nameW, titleW) + REGION_PAD * 4;
    const eyebrowRegion = { x: REGION_PAD, y: REGION_PAD,                                            w: eyebrowTotalW + REGION_PAD * 2, h: eyebrowH2 };
    const nameRegion    = { x: REGION_PAD, y: REGION_PAD + eyebrowH2 + REGION_PAD,                   w: nameW    + REGION_PAD * 2, h: nameH2 };
    const titleRegion   = { x: REGION_PAD, y: REGION_PAD + eyebrowH2 + REGION_PAD + nameH2 + REGION_PAD, w: titleW + REGION_PAD * 2, h: titleH2 };
    const offH = titleRegion.y + titleH2 + REGION_PAD;
    // Text draw origins: DRAW_PAD from region origin — stable regardless of shadow settings
    const eyebrowDrawX = eyebrowRegion.x + DRAW_PAD;
    const eyebrowDrawY = eyebrowRegion.y + DRAW_PAD;
    const nameDrawOriginX = nameRegion.x + DRAW_PAD;
    const nameDrawOriginY = nameRegion.y + DRAW_PAD;
    const titleDrawOriginX = titleRegion.x + DRAW_PAD;
    const titleDrawOriginY = titleRegion.y + DRAW_PAD;

    // NOTE: Shadow is NOT applied to offscreen canvas — it is applied on the main canvas
    // in a separate pass so it can extend freely without being clipped by region boundaries.
    // Create color offscreen canvas
    const colorOff = document.createElement('canvas');
    colorOff.width = offW; colorOff.height = offH;
    const colorOffCtx = colorOff.getContext('2d')!;
    colorOffCtx.textBaseline = 'top';
    colorOffCtx.lineJoin = 'round';
    colorOffCtx.lineCap  = 'round';
    colorOffCtx.clearRect(0, 0, offW, offH);
    // Apply shadow to color canvas only (alpha/matte canvas must not have shadow)
    // Shadow applied on main canvas — not here

    // Create alpha offscreen canvas
    const alphaOff = document.createElement('canvas');
    alphaOff.width = offW; alphaOff.height = offH;
    const alphaOffCtx = alphaOff.getContext('2d')!;
    alphaOffCtx.textBaseline = 'top';
    alphaOffCtx.lineJoin = 'round';
    alphaOffCtx.lineCap  = 'round';
    alphaOffCtx.clearRect(0, 0, offW, offH);
    // Alpha/matte canvas: no shadow — shadow is a color-only effect

    // Compute logo/eyebrow text positions once (used in both stroke and fill passes)
    const logoPos = cue.config.logoPosition ?? 'before';
    let eyebrowTextX = eyebrowDrawX;
    let eyebrowLogoX = eyebrowDrawX;
    if (logoImg) {
      if (logoPos === 'before') { eyebrowLogoX = eyebrowDrawX; eyebrowTextX = eyebrowDrawX + logoW + logoGap; }
      else { eyebrowTextX = eyebrowDrawX; eyebrowLogoX = eyebrowDrawX + eyebrowTextW + logoGap; }
    }

    // ── PASS 1: All strokes (drawn first so fills always sit on top) ──────────
    if (cue.config.borderEnabled) {
      const strokeColor = cue.config.borderColor || '#000000';
      const strokeW = cue.config.borderWidth || 2;
      // Eyebrow stroke
      if (eyebrow) {
        colorOffCtx.font = `${fontStyle} ${fontWeight} ${maxEyebrowFontSize}px "${cue.config.font}", sans-serif`;
        alphaOffCtx.font  = `${fontStyle} ${fontWeight} ${maxEyebrowFontSize}px "${cue.config.font}", sans-serif`;
        colorOffCtx.strokeStyle = strokeColor; colorOffCtx.lineWidth = strokeW;
        colorOffCtx.strokeText(eyebrow, eyebrowTextX, eyebrowDrawY);
        alphaOffCtx.strokeStyle = '#FFFFFF'; alphaOffCtx.lineWidth = strokeW;
        alphaOffCtx.strokeText(eyebrow, eyebrowTextX, eyebrowDrawY);
      }
      // Name stroke
      colorOffCtx.font = `${fontStyle} ${fontWeight} ${maxNameFontSize}px "${cue.config.font}", sans-serif`;
      alphaOffCtx.font  = `${fontStyle} ${fontWeight} ${maxNameFontSize}px "${cue.config.font}", sans-serif`;
      colorOffCtx.strokeStyle = strokeColor; colorOffCtx.lineWidth = strokeW;
      colorOffCtx.strokeText(cue.config.name, nameDrawOriginX, nameDrawOriginY);
      alphaOffCtx.strokeStyle = '#FFFFFF'; alphaOffCtx.lineWidth = strokeW;
      alphaOffCtx.strokeText(cue.config.name, nameDrawOriginX, nameDrawOriginY);
      // Title stroke
      colorOffCtx.font = `${fontStyle} ${titleFontWeight} ${maxTitleFontSize}px "${cue.config.font}", sans-serif`;
      alphaOffCtx.font  = `${fontStyle} ${titleFontWeight} ${maxTitleFontSize}px "${cue.config.font}", sans-serif`;
      colorOffCtx.strokeStyle = strokeColor; colorOffCtx.lineWidth = strokeW;
      colorOffCtx.strokeText(cue.config.title, titleDrawOriginX, titleDrawOriginY);
      alphaOffCtx.strokeStyle = '#FFFFFF'; alphaOffCtx.lineWidth = strokeW;
      alphaOffCtx.strokeText(cue.config.title, titleDrawOriginX, titleDrawOriginY);
    }

    // ── PASS 2: All fills (always on top of strokes) ──────────────────────────
    // Eyebrow fill + logo
    if (eyebrow || logoImg) {
      colorOffCtx.font = `${fontStyle} ${fontWeight} ${maxEyebrowFontSize}px "${cue.config.font}", sans-serif`;
      alphaOffCtx.font  = `${fontStyle} ${fontWeight} ${maxEyebrowFontSize}px "${cue.config.font}", sans-serif`;
      colorOffCtx.fillStyle = cue.config.color;
      alphaOffCtx.fillStyle  = '#FFFFFF';
      if (logoImg) {
        colorOffCtx.drawImage(logoImg, eyebrowLogoX, eyebrowDrawY, logoW, logoH);
        alphaOffCtx.save();
        alphaOffCtx.drawImage(logoImg, eyebrowLogoX, eyebrowDrawY, logoW, logoH);
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
    colorOffCtx.font = `${fontStyle} ${fontWeight} ${maxNameFontSize}px "${cue.config.font}", sans-serif`;
    alphaOffCtx.font  = `${fontStyle} ${fontWeight} ${maxNameFontSize}px "${cue.config.font}", sans-serif`;
    colorOffCtx.fillStyle = cue.config.color; alphaOffCtx.fillStyle = '#FFFFFF';
    colorOffCtx.fillText(cue.config.name, nameDrawOriginX, nameDrawOriginY);
    alphaOffCtx.fillText(cue.config.name, nameDrawOriginX, nameDrawOriginY);
    // Title fill
    colorOffCtx.font = `${fontStyle} ${titleFontWeight} ${maxTitleFontSize}px "${cue.config.font}", sans-serif`;
    alphaOffCtx.font  = `${fontStyle} ${titleFontWeight} ${maxTitleFontSize}px "${cue.config.font}", sans-serif`;
    colorOffCtx.fillStyle = cue.config.color; alphaOffCtx.fillStyle = '#FFFFFF';
    colorOffCtx.fillText(cue.config.title, titleDrawOriginX, titleDrawOriginY);
    alphaOffCtx.fillText(cue.config.title, titleDrawOriginX, titleDrawOriginY);

    metaOffscreenRef.current = {
      colorCanvas: colorOff,
      alphaCanvas: alphaOff,
      eyebrow: eyebrowRegion,
      name: nameRegion,
      title: titleRegion,
      maxScale: RENDER_SCALE,
      cueId: cue.id,
      regionPad: REGION_PAD,
      drawPad: DRAW_PAD,  // shadow-stable offset for drawImage destination
      nameContentW: nameW,
      nameContentH: nameH,
      titleContentW: titleW,
      titleContentH: titleH,
      eyebrowContentW: eyebrowTotalW,
      eyebrowContentH: eyebrowH,
    };
  };

  // Invalidate offscreen canvases when cue changes
  useEffect(() => {
    if (currentCue?.config?.animationType === 'meta') {
      // Wait for logo to load if present, then create offscreen canvases
      if (currentCue.config.logoDataUrl) {
        const img = new Image();
        img.onload = () => createMetaOffscreenCanvases(currentCue, img);
        img.src = currentCue.config.logoDataUrl;
      } else {
        createMetaOffscreenCanvases(currentCue, null);
      }
    } else {
      metaOffscreenRef.current = null;
    }
  }, [currentCue]);

  const video1Ref = useRef<HTMLVideoElement>(null);
  const filter1VideoRef = useRef<HTMLVideoElement>(null);
  const [channel] = useState(() => new BroadcastChannel("lower-thirds-sync"));
  const animationFrameRef = useRef<number | null>(null);
  const gsapControllerRef = useRef<GSAPAnimationController>(new GSAPAnimationController());
  const [gsapValues, setGsapValues] = useState<AnimationValues>({
    eyebrow: { x: 0, y: 0, opacity: 0, scale: 1 },
    name: { x: 0, y: 0, opacity: 0, scale: 1 },
    title: { x: 0, y: 0, opacity: 0, scale: 1 }
  });
  
  // Pop-out window management
  const feed1WindowRef = useRef<Window | null>(null);
  const filter1WindowRef = useRef<Window | null>(null);
  const [availableScreens, setAvailableScreens] = useState<any[]>([]);
  const [selectedFeed1Screen, setSelectedFeed1Screen] = useState<number>(0);
  const [selectedFilter1Screen, setSelectedFilter1Screen] = useState<number>(0);
  const [hasOpenPopouts, setHasOpenPopouts] = useState(false);
  const [isFeed1Open, setIsFeed1Open] = useState(false);
  const [isFilter1Open, setIsFilter1Open] = useState(false);
  
  // Timecode display toggle
  const [showTimecode, setShowTimecode] = useState(false);
  
  // Motion blur settings
  const [motionBlurEnabled, setMotionBlurEnabled] = useState(false);
  const [motionBlurIntensity, setMotionBlurIntensity] = useState(0.3); // 0.0 to 1.0

  // Background colour for Video 1 canvas (handled by animation engine)
  const [bgColor, setBgColor] = useState<string>(() => localStorage.getItem('live-bgColor') || '#000000');
  const bgColorRef = useRef<string>('#000000'); // Ref for access inside rAF loop without re-mount
  // Sync bgColor to ref whenever state changes, and keep window object in sync for pop-out
  useEffect(() => {
    bgColorRef.current = bgColor;
    localStorage.setItem('live-bgColor', bgColor);
    // Keep window object in sync so pop-out can always read the latest value
    (window as any).feed1BgColor = bgColor;
  }, [bgColor]);
  const animationStartTimeRef = useRef<number | null>(null);
  const phaseStartTimeRef = useRef<number | null>(null); // For tracking individual phase timing (fade-in/fade-out)

  // Pre-rendered offscreen canvases for Meta animation (eliminates font rasterization stepping)
  // Each line is rendered at MAX scale (1.121x) once, then drawImage() scales smoothly each frame
  const metaOffscreenRef = useRef<{
    colorCanvas: HTMLCanvasElement;
    alphaCanvas: HTMLCanvasElement;
    // Per-line regions in the offscreen canvas (at max scale)
    eyebrow: { x: number; y: number; w: number; h: number };
    name:    { x: number; y: number; w: number; h: number };
    title:   { x: number; y: number; w: number; h: number };
    maxScale: number;
    cueId: string; // invalidate when cue changes
    // Padding on each side of every region — drawImage must compensate to keep text position stable
    regionPad: number;  // total canvas padding (TEXT + STROKE + SHADOW)
    drawPad: number;    // text-only padding (TEXT + STROKE) — use for drawImage destination offset
    nameContentW: number; nameContentH: number;
    titleContentW: number; titleContentH: number;
    eyebrowContentW: number; eyebrowContentH: number;
  } | null>(null);
  const animationStateRef = useRef<AnimationState>("idle");

  // Stable ref to handlePlayCue so useCompanion's mount-only closure always
  // calls the latest version of the function (with current overrideSpeed,
  // animateTime, dwellTime, etc.) instead of the stale closure from mount.
  const handlePlayCueRef = useRef<() => void>(() => {});
  const handleResetRef = useRef<() => void>(() => {});
  
  // Store timeout IDs for clearing on early termination
  const timeoutIdsRef = useRef<number[]>([]);
  const countdownIntervalRef = useRef<number | null>(null);
  
  // Master timecode generator for genlock synchronization (50fps)
  const timecodeRef = useRef<TimecodeGenerator>(new TimecodeGenerator(50));
  const [currentTimecode, setCurrentTimecode] = useState("00:00:00:00");
    // Frame limiter to lock all rendering to 50fps
  const frameLimiterRef = useRef<FrameLimiter>(new FrameLimiter(50));
  
  // Detect available screens on mount
  useEffect(() => {
    const detectScreens = async () => {
      try {
        // @ts-ignore - Window Management API
        if ('getScreenDetails' in window) {
          // @ts-ignore
          const screenDetails = await window.getScreenDetails();
          setAvailableScreens(screenDetails.screens);
        } else {
          // Fallback: single screen
          setAvailableScreens([{ label: 'Primary Display', left: 0, top: 0, width: 1920, height: 1080 }]);
        }
      } catch (err) {
        // Window Management API not available — single screen mode
        setAvailableScreens([{ label: 'Primary Display', left: 0, top: 0, width: 1920, height: 1080 }]);
      }
    };
    
    detectScreens();
  }, []);

  // Load cues from localStorage — runs once on mount only
  useEffect(() => {
    const loadCues = (isInitial = false) => {
      const saved = localStorage.getItem("lower-thirds-cues");
      if (saved) {
        try {
          const loadedCues = JSON.parse(saved);
          setCues(loadedCues);
          // On initial load: if we have a persisted selectedCueId from localStorage,
          // verify it still exists in the loaded cues; fall back to first cue if not.
          if (isInitial && loadedCues.length > 0) {
            setSelectedCueId(prev => {
              if (prev && loadedCues.some((c: Cue) => c.id === prev)) {
                return prev; // Persisted selection is still valid
              }
              return loadedCues[0].id; // Fall back to first cue
            });
          }
        } catch (e) {
          console.error("Failed to load cues:", e);
        }
      }
    };

    loadCues(true);
    
    // Start timecode generator for frame synchronization
    if (!timecodeRunning) {
      startTimecode();
    }
    
    // Listen for storage changes (when cues are saved in Edit page)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "lower-thirds-cues") {
        loadCues(false);
      }
    };
    
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Mount-only — do NOT add selectedCueId here, it causes a reload loop

  // Load selected cue — only reset animation if not currently playing
  useEffect(() => {
    if (selectedCueId) {
      const cue = cues.find(c => c.id === selectedCueId);
      if (cue) {
        setCurrentCue(cue);
        currentCueRef.current = cue; // Keep ref in sync for render loop
        // Only reset animation state when truly idle (don't interrupt a running animation)
        if (animationStateRef.current === "idle") {
          setAnimationState("idle");
          setAnimationProgress(0);
        }
      }
    }
  }, [selectedCueId, cues]);

  // Persist selected cue ID so it survives page reloads (needed for Companion play command)
  useEffect(() => {
    if (selectedCueId) {
      localStorage.setItem("lower-thirds-selectedCueId", selectedCueId);
    }
  }, [selectedCueId]);

  // Save playback speed settings to localStorage
  useEffect(() => {
    localStorage.setItem('playbackSpeed_animateSeconds', animateSeconds.toString());
  }, [animateSeconds]);

  useEffect(() => {
    localStorage.setItem('playbackSpeed_animateTenths', animateTenths.toString());
  }, [animateTenths]);

  useEffect(() => {
    localStorage.setItem('playbackSpeed_dwellSeconds', dwellSeconds.toString());
  }, [dwellSeconds]);

  useEffect(() => {
    localStorage.setItem('playbackSpeed_dwellTenths', dwellTenths.toString());
  }, [dwellTenths]);

  useEffect(() => {
    localStorage.setItem('playbackSpeed_overrideSpeed', overrideSpeed.toString());
  }, [overrideSpeed]);

  // Master timecode loop - runs continuously at 50fps for genlock
  useEffect(() => {
    let rafId: number;
    let lastFrameTime = performance.now();
    const frameInterval = 1000 / 50; // 20ms for 50fps
    
    const updateTimecode = () => {
      const now = performance.now();
      const timeSinceLastFrame = now - lastFrameTime;
      
      // Only update if enough time has passed for 50fps
      if (timeSinceLastFrame >= frameInterval) {
        lastFrameTime = now - (timeSinceLastFrame % frameInterval);
        
        const tc = timecodeRef.current.getCurrentTimecodeString();
        setCurrentTimecode(tc);
      }
      
      rafId = requestAnimationFrame(updateTimecode);
    };
    
    rafId = requestAnimationFrame(updateTimecode);
    
    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, []);
  
  // Cleanup
  useEffect(() => {
    return () => {
      channel.close();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [channel]);

  // Poll every 500ms to keep pop-out open states in sync with actual window closed state
  useEffect(() => {
    const interval = setInterval(() => {
      const feed1Open = !!(feed1WindowRef.current && !feed1WindowRef.current.closed);
      const filter1Open = !!(filter1WindowRef.current && !filter1WindowRef.current.closed);
      setIsFeed1Open(feed1Open);
      setIsFilter1Open(filter1Open);
      setHasOpenPopouts(feed1Open || filter1Open);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case ' ': // Spacebar - Play selected cue
          e.preventDefault();
          if (currentCue && animationState === "idle") {
            handlePlayCue();
          }
          break;
        
        case 'r': // R - Reset animation
          e.preventDefault();
          if (animationState !== "idle") {
            handleReset();
          }
          break;
        
        case 'escape': // Escape - Reset played status
          e.preventDefault();
          // Only allow reset when not playing
          if (animationState === "idle") {
            setPlayedCues(new Set());
          }
          break;
        
        case 'arrowup': // Up arrow - Select previous cue
          e.preventDefault();
          // Disable cue navigation during playback
          if (animationState === "idle" && cues.length > 0) {
            const currentIndex = cues.findIndex(c => c.id === selectedCueId);
            const prevIndex = currentIndex > 0 ? currentIndex - 1 : cues.length - 1;
            setSelectedCueId(cues[prevIndex].id);
          }
          break;
        
        case 'arrowdown': // Down arrow - Select next cue
          e.preventDefault();
          // Disable cue navigation during playback
          if (animationState === "idle" && cues.length > 0) {
            const currentIndex = cues.findIndex(c => c.id === selectedCueId);
            const nextIndex = currentIndex < cues.length - 1 ? currentIndex + 1 : 0;
            setSelectedCueId(cues[nextIndex].id);
          }
          break;
        
        default:
          // Number keys (1-9, 0) - Select cue by cue number
          if (animationState === "idle" && /^[0-9]$/.test(e.key)) {
            e.preventDefault();
            const cueNumber = parseInt(e.key);
            const targetCue = cues.find(c => c.cueNumber === cueNumber);
            if (targetCue) {
              setSelectedCueId(targetCue.id);
            }
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cues, selectedCueId, currentCue, animationState]);

  // Clear animation start time only when entering idle state
  // Keep it running during visible state for continuous drift/scale
  useEffect(() => {
    if (animationState === "idle") {
      animationStartTimeRef.current = null;
    }
  }, [animationState]);

  // Note: Pop-out windows connect via BroadcastChannel and do not need reconnection on mount

  // Animation loop - UNRESTRICTED for maximum smoothness
  useEffect(() => {
    if (animationState === "animatingIn" || animationState === "animatingOut") {
      let frameCount = 0;
      let fpsLastTime = performance.now();
      
      // Only set start time for animatingIn, preserve it for animatingOut
      if (animationState === "animatingIn") {
        animationStartTimeRef.current = performance.now();
        phaseStartTimeRef.current = performance.now();
      }
      // phaseStartTimeRef for animatingOut is set in state transition handlers
      
      const animate = () => {
        const now = performance.now();
        
        // UNRESTRICTED: Render every frame for maximum smoothness
        // Use phaseStartTimeRef for accurate phase timing
        const phaseStart = phaseStartTimeRef.current || performance.now();
        const elapsed = now - phaseStart;
        const duration = currentCue?.config.animationDuration || 1000;
        let progress = Math.min(elapsed / duration, 1);
        
        setAnimationProgress(progress);
        
        // Calculate actual FPS
        frameCount++;
        if (now - fpsLastTime >= 1000) {
          setCurrentFps(frameCount);
          frameCount = 0;
          fpsLastTime = now;
        }
        
        if (progress >= 1) {
          if (animationState === "animatingIn") {
            setAnimationState("visible");
          } else {
            setAnimationState("idle");
          }
          // Don't clear animationStartTimeRef here - let render loop use it until state updates
          setAnimationProgress(0);
          return;
        }
        
        animationFrameRef.current = requestAnimationFrame(animate);
      };
      
      animationFrameRef.current = requestAnimationFrame(animate);
      
      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        setCurrentFps(0);
      };
    }
  }, [animationState, currentCue]);

  // Calculate animation transform
  const getAnimationTransform = () => {
    if (!currentCue) return { offsetX: 0, offsetY: 0, opacity: 0 };
    
    if (animationState === "idle") {
      return { offsetX: 0, offsetY: 0, opacity: 0 };
    }
    if (animationState === "visible") {
      return { offsetX: 0, offsetY: 0, opacity: 1 };
    }
    
    const progress = animationState === "animatingIn" ? animationProgress : 1 - animationProgress;
    const easeProgress = easeOutCubic(progress);
    
    let offsetX = 0;
    let offsetY = 0;
    let opacity = 1;
    
    switch (currentCue.config.animationType) {
      case "slideLeft":
        offsetX = (1 - easeProgress) * -1920;
        break;
      case "slideRight":
        offsetX = (1 - easeProgress) * 1920;
        break;
      case "slideUp":
        offsetY = (1 - easeProgress) * 1080;
        break;
      case "slideDown":
        offsetY = (1 - easeProgress) * -1080;
        break;
      case "fade":
        opacity = easeProgress;
        break;
      case "fadeScale":
        opacity = easeProgress;
        // Scale is handled by continuousScale in render loop
        break;
      default:
        break;
    }
    
    return { offsetX, offsetY, opacity };
  };

  // Easing functions for smooth animations
  const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
  const easeInOutQuart = (t: number) => t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
  const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);

  // Dedicated canvas rendering loop - UNRESTRICTED for maximum performance
  // Renders to BOTH color and alpha canvases simultaneously for frame-perfect sync
  useEffect(() => {
    const colorCanvas = colorCanvasRef.current;
    const alphaCanvas = alphaCanvasRef.current;
    if (!colorCanvas || !alphaCanvas) return;

    // Initialize both canvases to Full HD
    colorCanvas.width = 1920;
    colorCanvas.height = 1080;
    alphaCanvas.width = 1920;
    alphaCanvas.height = 1080;

    // Enable hardware acceleration with optimal settings for both canvases
    const colorCtx = colorCanvas.getContext("2d", { 
      alpha: false,              // No transparency = faster compositing
      desynchronized: true,      // Allow async rendering for lower latency
      willReadFrequently: false  // Optimize for write-heavy operations
    });
    const alphaCtx = alphaCanvas.getContext("2d", { 
      alpha: false,              // No transparency = faster compositing
      desynchronized: true,      // Allow async rendering for lower latency
      willReadFrequently: false  // Optimize for write-heavy operations
    });
    if (!colorCtx || !alphaCtx) return;

    // Smooth stroke joins — prevents miter spikes on letter corners
    colorCtx.lineJoin = 'round';
    colorCtx.lineCap  = 'round';
    alphaCtx.lineJoin = 'round';
    alphaCtx.lineCap  = 'round';

    // Motion blur: Create offscreen buffer canvas for frame accumulation
    const blurBuffer = document.createElement('canvas');
    blurBuffer.width = 1920;
    blurBuffer.height = 1080;
    const blurCtx = blurBuffer.getContext('2d', { alpha: false });
    if (!blurCtx) return;
    
    // Pre-load all custom fonts so the canvas can use them immediately
    // The browser only makes fonts available to canvas after they have been loaded
    const CANVAS_FONTS_TO_PRELOAD = [
      '500 48px "Optimistic Display"',
      '700 48px "Optimistic Display"',
    ];
    Promise.all(CANVAS_FONTS_TO_PRELOAD.map(f => document.fonts.load(f))).catch(() => {
      // Non-fatal: canvas will fall back to system font if preload fails
    });

    let renderFrameCount = 0;
    const renderFrameStartTime = performance.now();
    const renderFrame = () => {
      const now = performance.now();
      renderFrameCount++;
      // Use ref instead of state to avoid closure stale captures and useEffect re-runs
      const currentCue = currentCueRef.current;
      // Log opacity every 100 frames (approx every 2s at 50fps)
      if (renderFrameCount % 100 === 0) {
        const gsapVals = gsapControllerRef.current.getValues();
        const elapsed = now - renderFrameStartTime;
        console.log('[RENDER] frame=' + renderFrameCount + ' t=' + elapsed.toFixed(0) + 'ms eyebrow.opacity=' + gsapVals.eyebrow.opacity.toFixed(3) + ' hasCue=' + !!currentCue);
      }
      
      if (!currentCue) {
        // Clear both canvases when no cue — use selected background colour
        colorCtx.fillStyle = bgColorRef.current;
        colorCtx.fillRect(0, 0, 1920, 1080);
        alphaCtx.fillStyle = "#000000";
        alphaCtx.fillRect(0, 0, 1920, 1080);
      } else {
        // Use GSAP-calculated animation values (smooth interpolation)
        // GSAP handles all easing, timing, and interpolation
        const values = gsapControllerRef.current.getValues();
        
        // Build base font sizes
        const effectiveFontWeight = currentCue.config.bold ? "700" : (currentCue.config.fontWeight || "normal");
        const fontStyle = currentCue.config.italic ? "italic" : "normal";
        const baseEyebrowFontSize = currentCue.config.fontSize * ((currentCue.config.eyebrowFontSizePercent || 40) / 100);
        const baseNameFontSize = currentCue.config.fontSize;
        const baseTitleFontSize = currentCue.config.fontSize * ((currentCue.config.titleFontSizePercent || 75) / 100);

        // Apply GSAP values for animation
        const eyebrowValues = values.eyebrow;
        const nameValues = values.name;
        const titleValues = values.title;

        const isMetaAnim = currentCue.config.animationType === 'meta';
        // For Meta: NEVER bake scale into font size — use ctx.scale() transform instead.
        // Font sizes are always BASE values. The canvas GPU handles scaling (perfectly smooth).
        // scaledXxx vars used only for underline thickness and logo sizing (non-text elements).
        const metaGroupScale = isMetaAnim ? nameValues.scale : 1;  // single shared scale from GSAP
        const metaGroupDriftX = isMetaAnim ? nameValues.x : 0;     // single shared drift from GSAP
        const scaledEyebrowFontSize = baseEyebrowFontSize; // always base — no font-size scaling
        const scaledNameFontSize    = baseNameFontSize;
        const scaledTitleFontSize   = baseTitleFontSize;

        const effectiveTitleFontWeight = (isMetaAnim && (currentCue.config as any).titleFontWeight)
          ? (currentCue.config as any).titleFontWeight
          : effectiveFontWeight;
        const eyebrowFontString = `${fontStyle} ${effectiveFontWeight} ${scaledEyebrowFontSize}px "${currentCue.config.font}", sans-serif`;
        const fontString = `${fontStyle} ${effectiveFontWeight} ${scaledNameFontSize}px "${currentCue.config.font}", sans-serif`;
        const titleFontString = `${fontStyle} ${effectiveTitleFontWeight} ${scaledTitleFontSize}px "${currentCue.config.font}", sans-serif`;

        const eyebrow = currentCue.config.eyebrow || "";
        const eyebrowGap = (currentCue.config as any).eyebrowGap ?? 8;
        const titleGap = (currentCue.config as any).titleGap ?? 10;
        // Y positions: always textBaseline='top', always base font sizes.
        const baseEyebrowY = (eyebrow || logoImageRef.current) ? currentCue.config.posY - baseEyebrowFontSize - eyebrowGap : 0;
        const baseNameY = currentCue.config.posY;
        const baseTitleY = currentCue.config.posY + baseNameFontSize + titleGap;
        const eyebrowY = Math.round(baseEyebrowY);
        const nameY    = Math.round(baseNameY);
        const titleY   = Math.round(baseTitleY);
        
        // Render to BOTH canvases simultaneously for frame-perfect sync
        // COLOR CANVAS: Colored text on black
        // ALPHA CANVAS: White text on black (alpha mask)
        
        // Check if this is sync test mode
        if (currentCue.config.animationType === "syncTest" && values.syncTestColor) {
          // Sync test: fill entire canvas with current color
          colorCtx.fillStyle = values.syncTestColor;
          colorCtx.fillRect(0, 0, 1920, 1080);
          // Alpha canvas: white for sync test
          alphaCtx.fillStyle = "#FFFFFF";
          alphaCtx.fillRect(0, 0, 1920, 1080);
        } else {
          // Normal mode: use selected background colour on color canvas, black on alpha canvas
          colorCtx.fillStyle = bgColorRef.current;
          colorCtx.fillRect(0, 0, 1920, 1080);
          alphaCtx.fillStyle = "#000000";
          alphaCtx.fillRect(0, 0, 1920, 1080);
        }
        
        // Skip text rendering for sync test mode
        if (currentCue.config.animationType === "syncTest") {
          // Sync test mode: only color fill, no text
          colorCtx.restore();
        } else {
          // Normal text rendering mode - render to BOTH canvases
          colorCtx.save();
          alphaCtx.save();
          
          // Hardware acceleration optimizations for both canvases
          colorCtx.imageSmoothingEnabled = true;
          colorCtx.imageSmoothingQuality = 'high';
          alphaCtx.imageSmoothingEnabled = true;
          alphaCtx.imageSmoothingQuality = 'high';
        
        // Always top-baseline. Meta uses fixed Y positions (no adjustment as font grows).
        colorCtx.textBaseline = 'top';
        colorCtx.fillStyle = currentCue.config.color;
        alphaCtx.textBaseline = 'top';
        alphaCtx.fillStyle = "#FFFFFF";  // Alpha canvas always uses white

        const textX = currentCue.config.posX;
        // Y positions: add per-line y offset for non-Meta animations.
        const eyebrowYPos  = eyebrowY + (isMetaAnim ? 0 : eyebrowValues.y);
        const nameYPos     = nameY    + (isMetaAnim ? 0 : nameValues.y);
        const titleYPos    = titleY   + (isMetaAnim ? 0 : titleValues.y);

        // X positions: for non-Meta, each line has its own drift.
        // For Meta, drift is applied via ctx.translate() in the transform block below.
        const eyebrowDrawX = isMetaAnim ? textX : textX + eyebrowValues.x;
        const nameDrawX    = isMetaAnim ? textX : textX + nameValues.x;
        const titleDrawX   = isMetaAnim ? textX : textX + titleValues.x;

        // For Meta: use pre-rendered offscreen canvases + drawImage() for perfectly smooth scaling.
        // Text is rasterized once at MAX scale; drawImage() GPU-scales it each frame (no stepping).
        if (isMetaAnim && metaOffscreenRef.current) {
          const off = metaOffscreenRef.current;
          const s = metaGroupScale / off.maxScale; // scale factor relative to max
          const dstX = textX + metaGroupDriftX;
          const eyebrowGapPx = (currentCue.config as any).eyebrowGap ?? 8;
          const titleGapPx   = (currentCue.config as any).titleGap   ?? 10;

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
          const dstNameY    = currentCue.config.posY;
          const dstTitleY   = dstNameY + dstNameH + titleGapPx;
          const dstEyebrowY = dstNameY - dstEyebrowH - eyebrowGapPx;

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
            drawScaled(colorCtx, off.colorCanvas, off.eyebrow, dstX - pad * s, dstEyebrowY - pad * s, eyebrowValues.opacity);
            drawScaled(alphaCtx, off.alphaCanvas, off.eyebrow, dstX - pad * s, dstEyebrowY - pad * s, eyebrowValues.opacity);
          }
          drawScaled(colorCtx, off.colorCanvas, off.name, dstX - pad * s, dstNameY - pad * s, nameValues.opacity);
          drawScaled(alphaCtx, off.alphaCanvas, off.name, dstX - pad * s, dstNameY - pad * s, nameValues.opacity);
          drawScaled(colorCtx, off.colorCanvas, off.title, dstX - pad * s, dstTitleY - pad * s, titleValues.opacity);
          drawScaled(alphaCtx, off.alphaCanvas, off.title, dstX - pad * s, dstTitleY - pad * s, titleValues.opacity);


          // ── SHADOW PASS (after text, source-over so it's visible over the background) ──────────────────────────────────────────────────────────────────────────────────────
          // 1. Build glyph mask from alpha canvas.
          // 2. Cast shadow from mask using shadowBlur.
          // 3. Erase glyph pixels from shadowC — shadow halo only.
          // 4. Paint shadow with source-over at reduced opacity, then redraw text on top.
          const _shadowEnabled = currentCue.config.shadowEnabled ?? false;
          if (_shadowEnabled) {
            const _shadowBlur  = currentCue.config.shadowBlur ?? 10;
            const _shadowOffX  = currentCue.config.shadowOffsetX ?? 0;
            const _shadowOffY  = currentCue.config.shadowOffsetY ?? 0;
            const _shadowColor = currentCue.config.shadowColor ?? 'rgba(0,0,0,0.8)';
            const _shadowStrength = (currentCue.config as any).shadowStrength ?? 100;
            const W = colorCanvas.width;
            const H = colorCanvas.height;
            // Step 1: glyph mask
            const tmpC = document.createElement('canvas');
            tmpC.width = W; tmpC.height = H;
            const tmpCtx = tmpC.getContext('2d')!;
            if (off.eyebrowContentW > 0) {
              drawScaled(tmpCtx, off.alphaCanvas, off.eyebrow, dstX - pad * s, dstEyebrowY - pad * s, eyebrowValues.opacity);
            }
            drawScaled(tmpCtx, off.alphaCanvas, off.name, dstX - pad * s, dstNameY - pad * s, nameValues.opacity);
            drawScaled(tmpCtx, off.alphaCanvas, off.title, dstX - pad * s, dstTitleY - pad * s, titleValues.opacity);
            // Step 2: shadow canvas
            const shadowC = document.createElement('canvas');
            shadowC.width = W; shadowC.height = H;
            const shadowCtx = shadowC.getContext('2d')!;
            shadowCtx.shadowBlur    = _shadowBlur;
            shadowCtx.shadowOffsetX = _shadowOffX;
            shadowCtx.shadowOffsetY = _shadowOffY;
            shadowCtx.shadowColor   = _shadowColor;
            shadowCtx.drawImage(tmpC, 0, 0);
            // Step 3: erase glyph pixels — shadow halo only
            shadowCtx.globalCompositeOperation = 'destination-out';
            shadowCtx.drawImage(tmpC, 0, 0);
            // Step 4: paint shadow with source-over, then redraw text on top
            colorCtx.save();
            colorCtx.globalAlpha = Math.min(_shadowStrength / 100, 1);
            colorCtx.drawImage(shadowC, 0, 0);
            if (_shadowStrength > 100) {
              colorCtx.globalAlpha = (_shadowStrength - 100) / 100;
              colorCtx.drawImage(shadowC, 0, 0);
            }
            colorCtx.restore();
            // Redraw text on top of shadow
            if (off.eyebrowContentW > 0) {
              drawScaled(colorCtx, off.colorCanvas, off.eyebrow, dstX - pad * s, dstEyebrowY - pad * s, eyebrowValues.opacity);
            }
            drawScaled(colorCtx, off.colorCanvas, off.name, dstX - pad * s, dstNameY - pad * s, nameValues.opacity);
            drawScaled(colorCtx, off.colorCanvas, off.title, dstX - pad * s, dstTitleY - pad * s, titleValues.opacity);
          }

          // Reset alpha and skip the rest of the text rendering block
          colorCtx.globalAlpha = 1;
          alphaCtx.globalAlpha = 1;
          colorCtx.restore();
          alphaCtx.restore();
          // Skip to underline/motion-blur section
          // (underlines are handled below, outside this if block)
        } else if (!isMetaAnim) {
        
        // Shadow is applied AFTER text is drawn (see shadow pass below).
        // Do NOT set shadowBlur on colorCtx here — inner save/restore calls would clear it.

        // Check if using letter-by-letter animation
        const useLetterAnimation = eyebrowValues.letterOpacities || nameValues.letterOpacities || titleValues.letterOpacities;
        
        if (useLetterAnimation) {
          // Letter-by-letter rendering for Meta P3 style
          
          // Draw eyebrow letters on BOTH canvases
          if (eyebrow && eyebrowValues.letterOpacities) {
            colorCtx.font = eyebrowFontString;
            alphaCtx.font = eyebrowFontString;
            let currentX = eyebrowDrawX;
            
            eyebrow.split('').forEach((letter, i) => {
              const letterOpacity = eyebrowValues.letterOpacities![i] || 0;
              colorCtx.globalAlpha = letterOpacity;
              alphaCtx.globalAlpha = letterOpacity;
              
              if (currentCue.config.borderEnabled && letterOpacity > 0) {
                colorCtx.strokeStyle = currentCue.config.borderColor || "#000000";
                colorCtx.lineWidth = currentCue.config.borderWidth || 2;
                colorCtx.strokeText(letter, currentX, eyebrowYPos);
              }
              
              if (letterOpacity > 0) {
                colorCtx.fillText(letter, currentX, eyebrowYPos);
                alphaCtx.fillText(letter, currentX, eyebrowYPos);
              }
              
              currentX += colorCtx.measureText(letter).width;
            });
          }
          
          // Draw name letters on BOTH canvases
          if (nameValues.letterOpacities) {
            colorCtx.font = fontString;
            alphaCtx.font = fontString;
            let currentX = nameDrawX;
            
            currentCue.config.name.split('').forEach((letter, i) => {
              const letterOpacity = nameValues.letterOpacities![i] || 0;
              colorCtx.globalAlpha = letterOpacity;
              alphaCtx.globalAlpha = letterOpacity;
              
              if (currentCue.config.borderEnabled && letterOpacity > 0) {
                colorCtx.strokeStyle = currentCue.config.borderColor || "#000000";
                colorCtx.lineWidth = currentCue.config.borderWidth || 2;
                colorCtx.strokeText(letter, currentX, nameYPos);
              }
              
              if (letterOpacity > 0) {
                colorCtx.fillText(letter, currentX, nameYPos);
                alphaCtx.fillText(letter, currentX, nameYPos);
              }
              
              currentX += colorCtx.measureText(letter).width;
            });
          }
          
          // Draw title letters on BOTH canvases
          if (titleValues.letterOpacities) {
            colorCtx.font = titleFontString;
            alphaCtx.font = titleFontString;
            let currentX = titleDrawX;
            
            currentCue.config.title.split('').forEach((letter, i) => {
              const letterOpacity = titleValues.letterOpacities![i] || 0;
              colorCtx.globalAlpha = letterOpacity;
              alphaCtx.globalAlpha = letterOpacity;
              
              if (currentCue.config.borderEnabled && letterOpacity > 0) {
                colorCtx.strokeStyle = currentCue.config.borderColor || "#000000";
                colorCtx.lineWidth = currentCue.config.borderWidth || 2;
                colorCtx.strokeText(letter, currentX, titleYPos);
              }
              
              if (letterOpacity > 0) {
                colorCtx.fillText(letter, currentX, titleYPos);
                alphaCtx.fillText(letter, currentX, titleYPos);
              }
              
              currentX += colorCtx.measureText(letter).width;
            });
          }
          
        } else {
          // Standard whole-text rendering with individual line opacities on BOTH canvases
          
          // Draw eyebrow text + optional logo
          if (eyebrow || logoImageRef.current) {
            colorCtx.font = eyebrowFontString;
            alphaCtx.font = eyebrowFontString;
            colorCtx.globalAlpha = eyebrowValues.opacity;
            alphaCtx.globalAlpha = eyebrowValues.opacity;

            const logoImg = logoImageRef.current;
          // drawImage uses top-left Y anchor — same as textBaseline='top'.
          const logoH = scaledEyebrowFontSize;
          const logoW = logoImg ? Math.round((logoImg.naturalWidth / logoImg.naturalHeight) * logoH) : 0;
          const logoGap = logoImg ? Math.round(scaledEyebrowFontSize * 0.3) : 0;
          // logoTopY = eyebrowYPos since textBaseline='top' for all animations.
            const textW = eyebrow ? colorCtx.measureText(eyebrow).width : 0;
            const logoPos = currentCue.config.logoPosition ?? "before";

            let textDrawX = eyebrowDrawX;
            let logoDrawX = eyebrowDrawX;
            if (logoImg) {
              if (logoPos === "before") {
                logoDrawX = eyebrowDrawX;
                textDrawX = eyebrowDrawX + logoW + logoGap;
              } else {
                textDrawX = eyebrowDrawX;
                logoDrawX = eyebrowDrawX + textW + logoGap;
              }
            }

            if (logoImg) {
              colorCtx.drawImage(logoImg, logoDrawX, eyebrowYPos, logoW, logoH);
              alphaCtx.save();
              alphaCtx.globalCompositeOperation = "source-over";
              alphaCtx.drawImage(logoImg, logoDrawX, eyebrowYPos, logoW, logoH);
              alphaCtx.globalCompositeOperation = "source-atop";
              alphaCtx.fillStyle = "#FFFFFF";
              alphaCtx.fillRect(logoDrawX, eyebrowYPos, logoW, logoH);
              alphaCtx.restore();
            }

            if (eyebrow) {
              if (currentCue.config.borderEnabled) {
                colorCtx.strokeStyle = currentCue.config.borderColor || "#000000";
                colorCtx.lineWidth = currentCue.config.borderWidth || 2;
                colorCtx.strokeText(eyebrow, textDrawX, eyebrowYPos);
                alphaCtx.strokeStyle = "#FFFFFF";
                alphaCtx.lineWidth = currentCue.config.borderWidth || 2;
                alphaCtx.strokeText(eyebrow, textDrawX, eyebrowYPos);
              }
              colorCtx.fillText(eyebrow, textDrawX, eyebrowYPos);
              alphaCtx.fillText(eyebrow, textDrawX, eyebrowYPos);
            }
          }
          
          // Draw name text
          colorCtx.font = fontString;
          alphaCtx.font = fontString;
          colorCtx.globalAlpha = nameValues.opacity;
          alphaCtx.globalAlpha = nameValues.opacity;
          
          if (currentCue.config.borderEnabled) {
            colorCtx.strokeStyle = currentCue.config.borderColor || "#000000";
            colorCtx.lineWidth = currentCue.config.borderWidth || 2;
            colorCtx.strokeText(currentCue.config.name, nameDrawX, nameYPos);
            alphaCtx.strokeStyle = "#FFFFFF";
            alphaCtx.lineWidth = currentCue.config.borderWidth || 2;
            alphaCtx.strokeText(currentCue.config.name, nameDrawX, nameYPos);
          }
          
          colorCtx.fillText(currentCue.config.name, nameDrawX, nameYPos);
          alphaCtx.fillText(currentCue.config.name, nameDrawX, nameYPos);
          
          // Draw title text
          colorCtx.font = titleFontString;
          alphaCtx.font = titleFontString;
          colorCtx.globalAlpha = titleValues.opacity;
          alphaCtx.globalAlpha = titleValues.opacity;
          
          if (currentCue.config.borderEnabled) {
            colorCtx.strokeStyle = currentCue.config.borderColor || "#000000";
            colorCtx.lineWidth = currentCue.config.borderWidth || 2;
            colorCtx.strokeText(currentCue.config.title, titleDrawX, titleYPos);
            alphaCtx.strokeStyle = "#FFFFFF";
            alphaCtx.lineWidth = currentCue.config.borderWidth || 2;
            alphaCtx.strokeText(currentCue.config.title, titleDrawX, titleYPos);
          }
          
          colorCtx.fillText(currentCue.config.title, titleDrawX, titleYPos);
          alphaCtx.fillText(currentCue.config.title, titleDrawX, titleYPos);
        }
        
        // ── NON-META SHADOW PASS ────────────────────────────────────────────────
        // Draw glyphs onto a fresh transparent canvas, cast shadow, erase glyphs,
        // composite shadow before text. Works with any bgColor including transparent.
        if (currentCue.config.shadowEnabled) {
          const W = colorCanvas.width;
          const H = colorCanvas.height;
          const _shadowStrength = (currentCue.config as any).shadowStrength ?? 100;

          // Step 1: draw glyphs onto a transparent canvas (white fill — only alpha matters)
          const glyphC = document.createElement('canvas');
          glyphC.width = W; glyphC.height = H;
          const glyphCtx = glyphC.getContext('2d')!;
          glyphCtx.textBaseline = 'top';
          glyphCtx.fillStyle = '#ffffff';
          // Eyebrow
          if (eyebrow) {
            glyphCtx.font = eyebrowFontString;
            glyphCtx.globalAlpha = eyebrowValues.opacity;
            glyphCtx.fillText(eyebrow, eyebrowDrawX, eyebrowYPos);
          }
          // Name
          glyphCtx.font = fontString;
          glyphCtx.globalAlpha = nameValues.opacity;
          glyphCtx.fillText(currentCue.config.name, nameDrawX, nameYPos);
          // Title
          glyphCtx.font = titleFontString;
          glyphCtx.globalAlpha = titleValues.opacity;
          glyphCtx.fillText(currentCue.config.title, titleDrawX, titleYPos);
          glyphCtx.globalAlpha = 1;

          // Step 2: cast shadow from glyph mask
          const shadowC = document.createElement('canvas');
          shadowC.width = W; shadowC.height = H;
          const shadowCtx = shadowC.getContext('2d')!;
          shadowCtx.shadowBlur    = currentCue.config.shadowBlur ?? 10;
          shadowCtx.shadowOffsetX = currentCue.config.shadowOffsetX ?? 3;
          shadowCtx.shadowOffsetY = currentCue.config.shadowOffsetY ?? 3;
          shadowCtx.shadowColor   = currentCue.config.shadowColor || '#000000';
          shadowCtx.drawImage(glyphC, 0, 0);

          // Step 3: erase glyph pixels from shadow canvas — halo only
          shadowCtx.globalCompositeOperation = 'destination-out';
          shadowCtx.drawImage(glyphC, 0, 0);

          // Step 4: composite shadow onto colorCanvas with source-over (shadow sits behind text)
          colorCtx.save();
          colorCtx.globalCompositeOperation = 'source-over';
          colorCtx.globalAlpha = Math.min(_shadowStrength / 100, 1);
          colorCtx.drawImage(shadowC, 0, 0);
          if (_shadowStrength > 100) {
            colorCtx.globalAlpha = (_shadowStrength - 100) / 100;
            colorCtx.drawImage(shadowC, 0, 0);
          }
          colorCtx.globalAlpha = 1;
          colorCtx.restore();
        }

        // Add underline if enabled on BOTH canvases
        if (currentCue.config.underline) {
          // Measure text widths for underlines
          colorCtx.font = fontString;
          const nameWidth = colorCtx.measureText(currentCue.config.name).width;
          colorCtx.font = titleFontString;
          const titleWidth = colorCtx.measureText(currentCue.config.title).width;
          
          // Shadow already cleared — underlines draw clean
          colorCtx.shadowBlur = 0;
          colorCtx.shadowOffsetX = 0;
          colorCtx.shadowOffsetY = 0;
          
          // Draw underlines on color canvas.
          // Underline goes below the text (textBaseline='top' + font size + 2px gap).
          colorCtx.strokeStyle = currentCue.config.color;
          colorCtx.lineWidth = Math.max(2, scaledNameFontSize / 24);
          colorCtx.beginPath();
          const underlineNameY  = nameYPos  + scaledNameFontSize  + 2;
          const underlineTitleY = titleYPos + scaledTitleFontSize + 2;
          colorCtx.moveTo(textX, underlineNameY);
          colorCtx.lineTo(textX + nameWidth, underlineNameY);
          colorCtx.moveTo(textX, underlineTitleY);
          colorCtx.lineTo(textX + titleWidth, underlineTitleY);
          colorCtx.stroke();
          
          // Draw underlines on alpha canvas (white)
          alphaCtx.strokeStyle = "#FFFFFF";
          alphaCtx.lineWidth = Math.max(2, scaledNameFontSize / 24);
          alphaCtx.beginPath();
          alphaCtx.moveTo(textX, underlineNameY);
          alphaCtx.lineTo(textX + nameWidth, underlineNameY);
          alphaCtx.moveTo(textX, underlineTitleY);
          alphaCtx.lineTo(textX + titleWidth, underlineTitleY);
          alphaCtx.stroke();
        }
        
        colorCtx.restore();
        alphaCtx.restore();
        } // End of normal text rendering mode
      } // End of else (normal text rendering)
      } // End of else (currentCue exists)
      
      // Apply motion blur if enabled
      if (motionBlurEnabled && currentCue) {
        // Copy current frame to blur buffer with reduced opacity for accumulation
        blurCtx.globalAlpha = 1.0 - motionBlurIntensity;
        blurCtx.drawImage(blurBuffer, 0, 0);
        
        // Draw current sharp frame on top
        blurCtx.globalAlpha = motionBlurIntensity;
        blurCtx.drawImage(colorCanvas, 0, 0);
        
        // Copy blurred result back to main canvas
        blurCtx.globalAlpha = 1.0;
        colorCtx.drawImage(blurBuffer, 0, 0);
      } else if (!currentCue) {
        // Clear blur buffer when idle
        blurCtx.fillStyle = "#000000";
        blurCtx.fillRect(0, 0, 1920, 1080);
      }
      
      // Broadcast rendered frames to pop-out windows with timecode
      try {
        const currentTC = timecodeRef.current.getCurrentTimecode();
        const feed1ImageData = colorCtx.getImageData(0, 0, 1920, 1080);
        
        channel.postMessage({
          type: 'frame',
          feed1: feed1ImageData,
          timecode: currentTC,
          timecodeString: TimecodeGenerator.format(currentTC),
          bgColor: bgColorRef.current,
        });
      } catch (e) {
        // Ignore errors during frame broadcast
      }
      
      // No self-scheduling — gsap.ticker drives the loop below.
    };
    
    // Drive the canvas render from GSAP's own ticker so the draw always
    // happens immediately after GSAP has computed values for this frame.
    // This eliminates the frame-phase mismatch that caused jitter.
    gsap.ticker.add(renderFrame);
    renderFrame(); // immediate first draw
    
    return () => {
      gsap.ticker.remove(renderFrame);
    };
  // NOTE: currentCue intentionally omitted — we use currentCueRef.current inside renderFrame
  // to avoid re-mounting (and clearing) the canvas every time the cue object reference changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, motionBlurEnabled, motionBlurIntensity]);

  // Capture canvas streams and pipe to Video 1 and Filter 1 video elements
  // Both videos play at 50fps in full HD (1920x1080) with strict 16:9 aspect ratio
  useEffect(() => {
    const colorCanvas = colorCanvasRef.current;
    const alphaCanvas = alphaCanvasRef.current;
    const video1 = video1Ref.current;
    const filter1Video = filter1VideoRef.current;
    
    if (!colorCanvas || !alphaCanvas || !video1) return;
    
    try {
      // Capture canvas streams at 50fps (matches canvas rendering frame rate)
      // Stream resolution: 1920x1080 (Full HD)
      // Create 2 shared streams: color and alpha
      // Both main page and pop-out windows share the same MediaStream objects
      const stream1 = colorCanvas.captureStream(50);  // Shared color stream for VIDEO 1 and Pop-out Video 1
      const stream2 = alphaCanvas.captureStream(50);  // Shared alpha stream for FILTER 1 and Pop-out Filter 1
      
      // Set video source to shared canvas streams
      video1.srcObject = stream1;
      if (filter1Video) {
        filter1Video.srcObject = stream2;
      }
      
      // Expose same streams to window object for pop-out windows (shared, not copies)
      (window as any).feed1Stream = stream1;  // Pop-out Video 1 shares color stream
      (window as any).filter1Stream = stream2;  // Pop-out Filter 1 shares alpha stream
      
      // Play both videos
      video1.play().catch(err => {
        console.error('Failed to play Video 1:', err);
      });
      if (filter1Video) {
        filter1Video.play().catch(err => {
          console.error('Failed to play Filter 1 video:', err);
        });
      }
    } catch (err) {
      console.error('Failed to capture canvas stream:', err);
    }
    
    return () => {
      // Clean up streams when component unmounts
      if (video1.srcObject) {
        video1.srcObject = null;
      }
      if (filter1Video && filter1Video.srcObject) {
        const stream = filter1Video.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        filter1Video.srcObject = null;
      }
    };
  }, []);

  const handlePlayCue = () => {
    // Use currentCueRef.current so this function always reads the latest cue,
    // even when called from the useCompanion hook's stale closure.
    const activeCue = currentCueRef.current;
    if (!activeCue) {
      toast.error("Please select a cue first");
      return;
    }
    
    // If cue is already animating out, do a hard cut to idle
    if (animationStateRef.current === "animatingOut") {
      gsapControllerRef.current.stop();
      gsapControllerRef.current.reset();
      setAnimationState("idle");
      setRemainingTime(0);
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      timeoutIdsRef.current.forEach(id => clearTimeout(id));
      timeoutIdsRef.current = [];
      return;
    }

    // If cue is animating in or visible, trigger graceful animate-out
    if (animationStateRef.current === "animatingIn" || animationStateRef.current === "visible") {
      const animateTimeMs = overrideSpeed ? animateTime : (activeCue.config.animationDuration || 1000);
      const dwellTimeMs = overrideSpeed ? dwellTime : (activeCue.config.dwellDuration ?? 3000);
      // Seek GSAP timeline to the animate-out phase
      gsapControllerRef.current.triggerAnimateOut(animateTimeMs, dwellTimeMs);
      setAnimationState("animatingOut");
      // Update countdown to show only the animate-out duration
      setRemainingTime(animateTimeMs);
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
      const outStart = performance.now();
      countdownIntervalRef.current = window.setInterval(() => {
        const elapsed = performance.now() - outStart;
        const remaining = Math.max(0, animateTimeMs - elapsed);
        setRemainingTime(remaining);
        if (remaining <= 0) {
          clearInterval(countdownIntervalRef.current!);
          countdownIntervalRef.current = null;
        }
      }, 100);
      // Clear any existing timeouts and set a new one for after animate-out completes
      timeoutIdsRef.current.forEach(id => clearTimeout(id));
      timeoutIdsRef.current = [];
      const tid = window.setTimeout(() => {
        setAnimationState("idle");
        gsapControllerRef.current.reset();
        setRemainingTime(0);
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
      }, animateTimeMs);
      timeoutIdsRef.current.push(tid);
      return;
    }
    
    // Mark cue as played
    setPlayedCues(prev => new Set(prev).add(activeCue.id));
    
    // Use override speed if enabled, otherwise use cue's saved settings
    const animateTimeMs = overrideSpeed ? animateTime : (activeCue.config.animationDuration || 1000);
    const dwellTimeMs = overrideSpeed ? dwellTime : (activeCue.config.dwellDuration ?? 3000);
    
    // Start GSAP animation (RAF loop will read values directly)
    gsapControllerRef.current.playAnimation(activeCue, animateTimeMs, dwellTimeMs);
    setAnimationState("animatingIn");
    
    // Start countdown timer
    const totalTime = animateTimeMs * 2 + dwellTimeMs;
    setRemainingTime(totalTime);
    const startTime = performance.now();
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    countdownIntervalRef.current = window.setInterval(() => {
      const elapsed = performance.now() - startTime;
      const remaining = Math.max(0, totalTime - elapsed);
      setRemainingTime(remaining);
      if (remaining <= 0) {
        clearInterval(countdownIntervalRef.current!);
        countdownIntervalRef.current = null;
      }
    }, 100);
    
    // Set timeout to return to idle after full animation
    setTimeout(() => {
      setAnimationState("idle");
      gsapControllerRef.current.reset();
      setRemainingTime(0);
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    }, totalTime);
  };

  const handleAnimateIn = () => {
    if (!currentCue) {
      toast.error("Please select a cue first");
      return;
    }
    animationStartTimeRef.current = null;
    setAnimationProgress(0);
    setAnimationState("animatingIn");
    // Mark cue as played
    if (currentCue) {
      setPlayedCues(prev => new Set(prev).add(currentCue.id));
    }
  };

  const handleAnimateOut = () => {
    setAnimationProgress(0);
    phaseStartTimeRef.current = performance.now();
    setAnimationState("animatingOut");
  };

  const handleReset = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    animationStartTimeRef.current = null;
    setAnimationProgress(0);
    setAnimationState("idle");
    setRemainingTime(0);
  };

  // Keep the play/reset refs pointing to the latest function versions so
  // useCompanion's mount-only closure always invokes the current implementation.
  handlePlayCueRef.current = handlePlayCue;
  handleResetRef.current = handleReset;

  // ── Companion / Stream Deck integration ─────────────────────────────────
  const { isConnected: companionConnected } = useCompanion({
    cues,
    selectedCueId,
    animationState,
    playedCues,
    onSelectCue: setSelectedCueId,
    onPlay: () => handlePlayCueRef.current(),
    onReset: () => handleResetRef.current(),
    // Clear the played-cues status list — mirrors the "Reset Status" button
    onClearStatus: () => setPlayedCues(new Set()),
    currentCueRef, // Pass ref so select_and_play can update it synchronously
  });

  const handleResetTimingValues = () => {
    setAnimateSeconds(1);
    setAnimateTenths(0);
    setDwellSeconds(3);
    setDwellTenths(0);
    toast.success("Timing values reset to defaults (1.0s / 3.0s)");
  };

  const handleCloseAllPopouts = () => {
    let closedCount = 0;
    
    if (feed1WindowRef.current && !feed1WindowRef.current.closed) {
      feed1WindowRef.current.close();
      feed1WindowRef.current = null;
      closedCount++;
    }
    
    if (filter1WindowRef.current && !filter1WindowRef.current.closed) {
      filter1WindowRef.current.close();
      filter1WindowRef.current = null;
      closedCount++;
    }
    
    if (closedCount > 0) {
      toast.success(`Closed ${closedCount} pop-out window${closedCount > 1 ? 's' : ''}`);
    } else {
      toast.info("No pop-out windows are currently open");
    }
  };

  const handlePopOutFeed1 = async () => {
    const url = "/feed1";
    const screen = availableScreens[selectedFeed1Screen];
    
    if (!screen) {
      toast.error("Selected screen not available");
      return;
    }
    
    const features = `left=${screen.left},top=${screen.top},width=${screen.width},height=${screen.height}`;
    const newWindow = window.open(url, 'feed1', features);
    
    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
      toast.error("Pop-up blocked!", {
        description: "Please allow pop-ups for this site.",
        duration: 5000,
      });
    } else {
      feed1WindowRef.current = newWindow;
      setHasOpenPopouts(true);
      setIsFeed1Open(true);
      // Expose current bgColor to pop-out window
      (window as any).feed1BgColor = bgColorRef.current;
      toast.success('Feed 1 opened', {
        description: `Opening on ${screen.label || 'selected display'}. Will auto-fullscreen.`,
        duration: 3000,
      });
    }
  };

  const handlePopOutFilter1 = async () => {
    const url = "/filter1";
    const screen = availableScreens[selectedFilter1Screen];
    
    if (!screen) {
      toast.error("Selected screen not available");
      return;
    }
    
    const features = `left=${screen.left},top=${screen.top},width=${screen.width},height=${screen.height}`;
    const newWindow = window.open(url, 'filter1', features);
    
    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
      toast.error("Pop-up blocked!", {
        description: "Please allow pop-ups for this site.",
        duration: 5000,
      });
    } else {
      filter1WindowRef.current = newWindow;
      setHasOpenPopouts(true);
      setIsFilter1Open(true);
      toast.success('Filter 1 opened', {
        description: `Opening on ${screen.label || 'selected display'}. Will auto-fullscreen.`,
        duration: 3000,
      });
    }
  };

  return (
    <div className="h-screen bg-black text-white font-mono flex flex-col overflow-hidden">
      {/* Top Navigation - Fixed at top */}
      <div className="border-b border-cyan-500/30 px-3 flex items-center justify-between flex-shrink-0 gap-2 min-w-0 h-9">
        <div className="flex items-center gap-2 min-w-0 shrink">
          <Link href="/" className="text-xs font-bold tracking-wider whitespace-nowrap hidden md:block text-white hover:text-cyan-400 transition-colors">LOWER THIRDS GENERATOR</Link>
          <nav className="flex gap-2 items-center">
            <Link href="/live" className="text-xs font-bold flex items-center gap-1 whitespace-nowrap" style={{color: '#ff0000'}}>
              <span className="w-1.5 h-1.5 rounded-full bg-red-600 flex-shrink-0"></span>
              LIVE
            </Link>
            <Link href="/edit" className="text-xs hover:text-cyan-400 transition-colors whitespace-nowrap" style={{color: 'oklch(0.609 0.126 221.723)'}}>
              EDIT
            </Link>
            <Link href="/export" className="text-xs text-gray-400 hover:text-cyan-400 transition-colors whitespace-nowrap">
              EXPORT
            </Link>
            <Link href="/settings" className="text-xs text-gray-400 hover:text-cyan-400 transition-colors whitespace-nowrap">
              SETTINGS
            </Link>
            {/* Companion connection status badge */}
            <Link
              href="/settings?tab=companion"
              title={companionConnected ? "Companion connected" : "Companion not connected — click to configure"}
              className={`flex items-center gap-1 text-xs whitespace-nowrap transition-colors ${
                companionConnected
                  ? "text-green-400 hover:text-green-300"
                  : "text-gray-600 hover:text-gray-400"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                companionConnected ? "bg-green-400" : "bg-gray-600"
              }`} />
              <span className="hidden lg:inline">COMPANION</span>
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <p className="text-xs text-gray-500 whitespace-nowrap hidden 2xl:block">1920×1080</p>
          {hasOpenPopouts && (
            <Button
              onClick={handleCloseAllPopouts}
              size="sm"
              variant="outline"
              className="border-red-500 text-red-400 hover:bg-red-500/10 h-6 text-xs px-2 whitespace-nowrap"
            >
              <span className="hidden lg:inline">Close All </span>Pop-outs
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Controls */}
        <div className="w-56 sm:w-64 lg:w-72 xl:w-80 border-r border-cyan-500/30 flex-shrink-0 flex flex-col">
          {/* Play Cue Button - Fixed at top */}
          <div className="p-3 sm:p-4 lg:p-6 pb-3 flex-shrink-0">
            <button
              onClick={handlePlayCue}
              className={`w-full font-bold transition-colors rounded-md px-4 py-3 flex items-center justify-center gap-2 ${
                animationState !== "idle" 
                  ? "bg-red-600 hover:bg-red-700 text-white" 
                  : "bg-cyan-500 hover:bg-cyan-600 text-black"
              }`}
              disabled={!currentCue}
            >
              <Play className="w-4 h-4" />
              {animationState !== "idle" && remainingTime > 0 ? (
                <span>{(remainingTime / 1000).toFixed(1)}s</span>
              ) : (
                "Play Cue"
              )}
            </button>
            <div className="text-xs text-gray-500 text-center mt-2">
              Status: <span className="text-cyan-400">{animationState}</span>
            </div>
          </div>
          
          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto px-3 sm:px-4 lg:px-6 pb-4 space-y-4 lg:space-y-6">
          {/* Cue Table */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-cyan-400 tracking-wider">CUE LIST</h2>
              <Button
                onClick={() => setPlayedCues(new Set())}
                size="sm"
                variant="outline"
                className="border-cyan-500 text-cyan-400 hover:bg-cyan-500/10"
                disabled={playedCues.size === 0}
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Reset Status
              </Button>
            </div>
            {cues.length === 0 ? (
              <div className="text-xs text-gray-500 text-center py-4">
                No cues available. Go to <Link href="/edit" className="text-cyan-400 hover:underline">Edit</Link> to create cues.
              </div>
            ) : (
              <div className="border border-gray-800 rounded overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-900 text-gray-400">
                      <th className="text-left p-2 border-b border-gray-800">Cue #</th>
                      <th className="text-left p-2 border-b border-gray-800">Name</th>
                      <th className="text-left p-2 border-b border-gray-800">Animation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cues.map((cue) => {
                      const isSelected = cue.id === selectedCueId;
                      const isActive = isSelected && (animationState === "animatingIn" || animationState === "visible");
                      const hasBeenPlayed = playedCues.has(cue.id);
                      
                      let bgColor = "bg-gray-900/60"; // Default background
                      let hasStatusColor = false;
                      if (isActive) {
                        bgColor = "bg-red-600/80";
                        hasStatusColor = true;
                      } else if (isSelected) {
                        bgColor = "bg-green-600/80";
                        hasStatusColor = true;
                      } else if (hasBeenPlayed) {
                        bgColor = "bg-yellow-500/80";
                        hasStatusColor = true;
                      }
                      
                      const isFrozen = animationState !== "idle";
                      
                      // Different hover effects for default vs status-colored rows
                      const hoverEffect = hasStatusColor ? "hover:brightness-125" : "hover:bg-gray-700/80";
                      
                      return (
                        <tr
                          key={cue.id}
                          onClick={() => {
                            // Disable cue selection during playback
                            if (!isFrozen) {
                              setSelectedCueId(cue.id);
                            }
                          }}
                          className={`${
                            isFrozen
                              ? "cursor-not-allowed" 
                              : `cursor-pointer ${hoverEffect}`
                          } border-b border-gray-800 transition-colors ${bgColor} ${isFrozen ? "opacity-50 pointer-events-none" : ""}`}
                        >
                          <td className="p-2">
                            <div className="flex items-center gap-1.5">
                              {/* Tally dot */}
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                isActive
                                  ? "bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.8)]"
                                  : isSelected
                                  ? "bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.8)]"
                                  : hasBeenPlayed
                                  ? "bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.8)]"
                                  : "bg-gray-700"
                              }`} />
                              {cue.cueNumber}
                            </div>
                          </td>
                          <td className="p-2">{cue.config.name}</td>
                          <td className="p-2">{ANIMATION_TYPES.find(a => a.value === cue.config.animationType)?.label || cue.config.animationType}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Playback Controls */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-cyan-400 tracking-wider">PLAYBACK SPEED</h2>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={overrideSpeed}
                  onChange={(e) => setOverrideSpeed(e.target.checked)}
                  className="w-4 h-4 cursor-pointer"
                />
                <span className="text-xs text-gray-400">Override Cue Settings</span>
              </label>
            </div>
            <div className="space-y-3">
              {/* Timing Controls */}
              <div className="flex gap-8">
                {/* Animation In/Out Duration */}
                <div className="flex-1">
                  <label className={`text-xs text-gray-400 mb-2 block text-center ${
                    !overrideSpeed ? 'opacity-30' : ''
                  }`}>Animate In/Out</label>
                  <div className="flex gap-4 justify-center">
                    {/* Seconds */}
                    <div className="flex flex-col items-center">
                      <button
                        onClick={() => setAnimateSeconds(Math.min(10, animateSeconds + 1))}
                        disabled={!overrideSpeed}
                        className={`w-8 h-8 bg-gray-800 text-white rounded flex items-center justify-center text-lg ${
                          overrideSpeed ? 'hover:bg-gray-700 cursor-pointer' : 'opacity-30 cursor-not-allowed'
                        }`}
                      >
                        +
                      </button>
                      <input
                        type="number"
                        value={animateSeconds}
                        onChange={(e) => setAnimateSeconds(Math.max(0, Math.min(10, parseInt(e.target.value) || 0)))}
                        disabled={!overrideSpeed}
                        className={`w-8 h-10 bg-black border-3 border-gray-800 text-white text-center my-1 ${
                          !overrideSpeed ? 'opacity-30 cursor-not-allowed' : ''
                        }`}
                        min="0"
                        max="10"
                      />
                      <button
                        onClick={() => setAnimateSeconds(Math.max(0, animateSeconds - 1))}
                        disabled={!overrideSpeed}
                        className={`w-8 h-8 bg-gray-800 text-white rounded flex items-center justify-center text-lg ${
                          overrideSpeed ? 'hover:bg-gray-700 cursor-pointer' : 'opacity-30 cursor-not-allowed'
                        }`}
                      >
                        −
                      </button>
                      <span className={`text-xs text-gray-500 mt-1 ${
                        !overrideSpeed ? 'opacity-30' : ''
                      }`}>s</span>
                    </div>

                    {/* Tenths */}
                    <div className="flex flex-col items-center">
                      <button
                        onClick={() => setAnimateTenths(Math.min(9, animateTenths + 1))}
                        disabled={!overrideSpeed}
                        className={`w-8 h-8 bg-gray-800 text-white rounded flex items-center justify-center text-lg ${
                          overrideSpeed ? 'hover:bg-gray-700 cursor-pointer' : 'opacity-30 cursor-not-allowed'
                        }`}
                      >
                        +
                      </button>
                      <input
                        type="number"
                        value={animateTenths}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          setAnimateTenths(Math.max(0, Math.min(9, val)));
                        }}
                        disabled={!overrideSpeed}
                        className={`w-8 h-10 bg-black border-3 border-gray-800 text-white text-center my-1 ${
                          !overrideSpeed ? 'opacity-30 cursor-not-allowed' : ''
                        }`}
                        min="0"
                        max="9"
                        step="1"
                      />
                      <button
                        onClick={() => setAnimateTenths(Math.max(0, animateTenths - 1))}
                        disabled={!overrideSpeed}
                        className={`w-8 h-8 bg-gray-800 text-white rounded flex items-center justify-center text-lg ${
                          overrideSpeed ? 'hover:bg-gray-700 cursor-pointer' : 'opacity-30 cursor-not-allowed'
                        }`}
                      >
                        −
                      </button>
                      <span className={`text-xs text-gray-500 mt-1 ${
                        !overrideSpeed ? 'opacity-30' : ''
                      }`}>1/10s</span>
                    </div>
                  </div>
                  <p className={`text-xs text-gray-500 mt-2 text-center ${
                    !overrideSpeed ? 'opacity-30' : ''
                  }`}>Total: {(animateTime / 1000).toFixed(1)}s</p>
                </div>

                {/* Dwell/Hold Duration */}
                <div className="flex-1">
                  <label className={`text-xs text-gray-400 mb-2 block text-center ${
                    !overrideSpeed ? 'opacity-30' : ''
                  }`}>Dwell/Hold</label>
                  <div className="flex gap-4 justify-center">
                    {/* Seconds */}
                    <div className="flex flex-col items-center">
                      <button
                        onClick={() => setDwellSeconds(Math.min(10, dwellSeconds + 1))}
                        disabled={!overrideSpeed}
                        className={`w-8 h-8 bg-gray-800 text-white rounded flex items-center justify-center text-lg ${
                          overrideSpeed ? 'hover:bg-gray-700 cursor-pointer' : 'opacity-30 cursor-not-allowed'
                        }`}
                      >
                        +
                      </button>
                      <input
                        type="number"
                        value={dwellSeconds}
                        onChange={(e) => setDwellSeconds(Math.max(0, Math.min(10, parseInt(e.target.value) || 0)))}
                        disabled={!overrideSpeed}
                        className={`w-8 h-10 bg-black border-3 border-gray-800 text-white text-center my-1 ${
                          !overrideSpeed ? 'opacity-30 cursor-not-allowed' : ''
                        }`}
                        min="0"
                        max="10"
                      />
                      <button
                        onClick={() => setDwellSeconds(Math.max(0, dwellSeconds - 1))}
                        disabled={!overrideSpeed}
                        className={`w-8 h-8 bg-gray-800 text-white rounded flex items-center justify-center text-lg ${
                          overrideSpeed ? 'hover:bg-gray-700 cursor-pointer' : 'opacity-30 cursor-not-allowed'
                        }`}
                      >
                        −
                      </button>
                      <span className={`text-xs text-gray-500 mt-1 ${
                        !overrideSpeed ? 'opacity-30' : ''
                      }`}>s</span>
                    </div>

                    {/* Tenths */}
                    <div className="flex flex-col items-center">
                      <button
                        onClick={() => setDwellTenths(Math.min(9, dwellTenths + 1))}
                        disabled={!overrideSpeed}
                        className={`w-8 h-8 bg-gray-800 text-white rounded flex items-center justify-center text-lg ${
                          overrideSpeed ? 'hover:bg-gray-700 cursor-pointer' : 'opacity-30 cursor-not-allowed'
                        }`}
                      >
                        +
                      </button>
                      <input
                        type="number"
                        value={dwellTenths}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          setDwellTenths(Math.max(0, Math.min(9, val)));
                        }}
                        disabled={!overrideSpeed}
                        className={`w-8 h-10 bg-black border-3 border-gray-800 text-white text-center my-1 ${
                          !overrideSpeed ? 'opacity-30 cursor-not-allowed' : ''
                        }`}
                        min="0"
                        max="9"
                        step="1"
                      />
                      <button
                        onClick={() => setDwellTenths(Math.max(0, dwellTenths - 1))}
                        disabled={!overrideSpeed}
                        className={`w-8 h-8 bg-gray-800 text-white rounded flex items-center justify-center text-lg ${
                          overrideSpeed ? 'hover:bg-gray-700 cursor-pointer' : 'opacity-30 cursor-not-allowed'
                        }`}
                      >
                        −
                      </button>
                      <span className={`text-xs text-gray-500 mt-1 ${
                        !overrideSpeed ? 'opacity-30' : ''
                      }`}>1/10s</span>
                    </div>
                  </div>
                  <p className={`text-xs text-gray-500 mt-2 text-center ${
                    !overrideSpeed ? 'opacity-30' : ''
                  }`}>Total: {(dwellTime / 1000).toFixed(1)}s</p>
                </div>
              </div>
              
              <Button
                onClick={handleResetTimingValues}
                variant="outline"
                className="w-full border-cyan-500 text-cyan-400 hover:bg-cyan-500/10"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Default Time
              </Button>
              
              {/* Background Colour Selector */}
              <div className="mt-4 pt-4 border-t border-gray-800">
                <h3 className="text-xs font-bold text-cyan-400 mb-3">BACKGROUND COLOUR</h3>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setBgColor('#000000')}
                    className={`flex flex-col items-center gap-1.5 p-2 rounded border transition-all ${
                      bgColor === '#000000'
                        ? 'border-cyan-400 bg-cyan-500/10'
                        : 'border-gray-700 hover:border-gray-500'
                    }`}
                  >
                    <div className="w-8 h-8 rounded border border-gray-600" style={{ backgroundColor: '#000000' }} />
                    <span className="text-xs text-gray-300">Black</span>
                  </button>
                  <button
                    onClick={() => setBgColor('#00B140')}
                    className={`flex flex-col items-center gap-1.5 p-2 rounded border transition-all ${
                      bgColor === '#00B140'
                        ? 'border-cyan-400 bg-cyan-500/10'
                        : 'border-gray-700 hover:border-gray-500'
                    }`}
                  >
                    <div className="w-8 h-8 rounded border border-gray-600" style={{ backgroundColor: '#00B140' }} />
                    <span className="text-xs text-gray-300">Green</span>
                  </button>
                  <button
                    onClick={() => setBgColor('#0047AB')}
                    className={`flex flex-col items-center gap-1.5 p-2 rounded border transition-all ${
                      bgColor === '#0047AB'
                        ? 'border-cyan-400 bg-cyan-500/10'
                        : 'border-gray-700 hover:border-gray-500'
                    }`}
                  >
                    <div className="w-8 h-8 rounded border border-gray-600" style={{ backgroundColor: '#0047AB' }} />
                    <span className="text-xs text-gray-300">Blue</span>
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {bgColor === '#00B140' ? 'Broadcast standard chroma green (ITU-R BT.601)' :
                   bgColor === '#0047AB' ? 'Broadcast standard chroma blue' :
                   'Black background'}
                </p>
              </div>

              {/* Motion Blur Controls */}
              <div className="mt-4 pt-4 border-t border-gray-800">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-cyan-400">MOTION BLUR</h3>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={motionBlurEnabled}
                      onChange={(e) => setMotionBlurEnabled(e.target.checked)}
                      className="w-3 h-3"
                    />
                    <span className="text-xs text-gray-400">Enable</span>
                  </label>
                </div>
                {motionBlurEnabled && (
                  <div className="space-y-2">
                    <label className="text-xs text-gray-400">Intensity</label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={motionBlurIntensity}
                      onChange={(e) => setMotionBlurIntensity(parseFloat(e.target.value))}
                      className="w-full"
                    />
                    <p className="text-xs text-gray-500 text-center">{(motionBlurIntensity * 100).toFixed(0)}%</p>
                  </div>
                )}
              </div>
              
              {/* Keyboard Shortcuts Help */}
              <div className="mt-4 pt-4 border-t border-gray-800">
                <h3 className="text-xs font-bold text-gray-400 mb-2">KEYBOARD SHORTCUTS</h3>
                <div className="text-xs text-gray-500 space-y-1">
                  <div><kbd className="bg-gray-800 px-1 rounded">Space</kbd> Play Cue</div>
                  <div><kbd className="bg-gray-800 px-1 rounded">R</kbd> Reset</div>
                  <div><kbd className="bg-gray-800 px-1 rounded">1-9</kbd> Select Cue by Number</div>
                  <div><kbd className="bg-gray-800 px-1 rounded">↑↓</kbd> Navigate Cues</div>
                  <div><kbd className="bg-gray-800 px-1 rounded">Esc</kbd> Reset Status</div>
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>

        {/* Hidden Canvases - Run in background but not visible */}
        {/* Color Canvas: Colored text on black */}
        <canvas
          ref={colorCanvasRef}
          width={1920}
          height={1080}
          className="hidden"
        />
        {/* Alpha Canvas: White text on black (alpha mask) */}
        <canvas
          ref={alphaCanvasRef}
          width={1920}
          height={1080}
          className="hidden"
        />

        {/* Right Area - Video Feeds - Fixed in place, fills remaining space */}
        <div className="flex-1 p-6 flex flex-col gap-6 overflow-hidden" style={{paddingTop: '5px', paddingRight: '5px', paddingBottom: '5px', paddingLeft: '5px'}}>
          {/* Video 1 (replaces Feed 1 display) */}
          <div className="border border-cyan-500/30 rounded flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-cyan-500/30 gap-2 flex-wrap">
              <div className="min-w-0">
                <h3 className="text-xs font-bold tracking-wider truncate">VIDEO 1: LIVE OUTPUT</h3>
                <p className="text-xs text-gray-500 truncate hidden sm:block">Real-time video from Feed 1 canvas</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  onClick={() => setShowTimecode(!showTimecode)}
                  size="sm"
                  variant={showTimecode ? "default" : "outline"}
                  className="h-7 text-xs px-2"
                >
                  TC
                </Button>
                <Select value={selectedFeed1Screen.toString()} onValueChange={(v) => setSelectedFeed1Screen(parseInt(v))}>
                  <SelectTrigger className="w-[140px] h-7 text-xs border-cyan-500/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableScreens.map((screen, idx) => (
                      <SelectItem key={idx} value={idx.toString()}>
                        {screen.label || `Display ${idx + 1}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => handlePopOutFeed1()}
                  size="sm"
                  variant="outline"
                  className={`h-7 text-xs px-2 transition-colors ${
                    isFeed1Open
                      ? 'border-green-500 text-green-400 hover:bg-green-500/10'
                      : 'border-cyan-500 text-cyan-400 hover:bg-cyan-500/10'
                  }`}
                >
                  Pop Out
                </Button>
              </div>
            </div>
            <div className="p-4 bg-black flex-1 flex items-center justify-center relative" style={{backgroundColor: '#ffffff', paddingTop: '5px', paddingRight: '5px', paddingBottom: '5px', paddingLeft: '5px'}}>
              <video
                ref={video1Ref}
                width={1920}
                height={1080}
                autoPlay
                muted
                playsInline
                className="w-full h-full border border-gray-800 object-contain"
                style={{ willChange: 'transform', transform: 'translateZ(0)', aspectRatio: "16/9", maxHeight: "100%", maxWidth: "100%", backgroundColor: '#fafafa', borderColor: '#ffffff' }}
              />
              {/* Timecode Overlay */}
              {showTimecode && (
                <div className="absolute bottom-8 right-8 bg-black/90 text-green-400 px-4 py-2 rounded font-mono text-xl font-bold border border-green-500/50">
                  {timecode}
                </div>
              )}
            </div>
          </div>

          {/* Filter 1 — hidden by default, shown when enabled in Settings */}
          {showFilter1 && (
          <div className="border border-cyan-500/30 rounded flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-cyan-500/30 gap-2 flex-wrap">
              <div className="min-w-0">
                <h3 className="text-xs font-bold tracking-wider truncate">FILTER 1: LIVE VIDEO</h3>
                <p className="text-xs text-gray-500 truncate hidden sm:block">Real-time video output from Feed 1</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Select value={selectedFilter1Screen.toString()} onValueChange={(v) => setSelectedFilter1Screen(parseInt(v))}>
                  <SelectTrigger className="w-[140px] h-7 text-xs border-cyan-500/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableScreens.map((screen, idx) => (
                      <SelectItem key={idx} value={idx.toString()}>
                        {screen.label || `Display ${idx + 1}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => handlePopOutFilter1()}
                  size="sm"
                  variant="outline"
                  className={`h-7 text-xs px-2 transition-colors ${
                    isFilter1Open
                      ? 'border-green-500 text-green-400 hover:bg-green-500/10'
                      : 'border-cyan-500 text-cyan-400 hover:bg-cyan-500/10'
                  }`}
                >
                  Pop Out
                </Button>
              </div>
            </div>
            <div className="p-4 bg-black flex-1 flex items-center justify-center relative" style={{backgroundColor: '#ffffff', paddingTop: '5px', paddingRight: '5px', paddingBottom: '5px', paddingLeft: '5px'}}>
              <video
                ref={filter1VideoRef}
                width={1920}
                height={1080}
                autoPlay
                muted
                playsInline
                className="w-full h-full border border-gray-800 object-contain"
                style={{ willChange: 'transform', transform: 'translateZ(0)', aspectRatio: "16/9", maxHeight: "100%", maxWidth: "100%", backgroundColor: '#fafafa', borderColor: '#ffffff' }}
              />
              {/* Timecode Overlay */}
              {showTimecode && (
                <div className="absolute bottom-8 right-8 bg-black/90 text-green-400 px-4 py-2 rounded font-mono text-xl font-bold border border-green-500/50">
                  {timecode}
                </div>
              )}
            </div>
          </div>
          )}

        </div>
      </div>
    </div>
  );
}
