import type { Graphics } from "pixi.js";
import type { ShapeKind } from "@storia/schema";
import { clamp } from "./color.js";

/**
 * Remotion-inspired procedural vector shapes (`@remotion/shapes`) and progressive stroke reveal
 * (`@remotion/paths` `evolvePath`) implemented cleanly for PixiJS v8 Graphics.
 */

export interface Point2D {
  x: number;
  y: number;
}

export function makePolygonPoints(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  sides: number,
): Point2D[] {
  const n = Math.max(3, Math.round(sides));
  const pts: Point2D[] = [];
  for (let i = 0; i < n; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / n;
    pts.push({ x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry });
  }
  return pts;
}

export function makeStarPoints(
  cx: number,
  cy: number,
  outerRx: number,
  outerRy: number,
  innerRatio: number,
  points: number,
): Point2D[] {
  const n = Math.max(3, Math.round(points));
  const ir = clamp(innerRatio, 0.1, 0.95);
  const pts: Point2D[] = [];
  for (let i = 0; i < n * 2; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / n;
    const mult = i % 2 === 0 ? 1 : ir;
    pts.push({
      x: cx + Math.cos(angle) * outerRx * mult,
      y: cy + Math.sin(angle) * outerRy * mult,
    });
  }
  return pts;
}

export function makeSparkPoints(
  cx: number,
  cy: number,
  outerRx: number,
  outerRy: number,
  innerRatio: number,
  rays: number,
): Point2D[] {
  // Sharp 4-8 pointed sparkle star with pinched inner concave vertices
  const n = Math.max(4, Math.round(rays));
  const ir = clamp(innerRatio * 0.55, 0.08, 0.45);
  return makeStarPoints(cx, cy, outerRx, outerRy, ir, n);
}

export function makeTrianglePoints(ox: number, oy: number, w: number, h: number): Point2D[] {
  return [
    { x: ox + w * 0.5, y: oy },
    { x: ox + w, y: oy + h },
    { x: ox, y: oy + h },
  ];
}

export function makeArrowPoints(
  ox: number,
  oy: number,
  w: number,
  h: number,
  headSizeRatio = 0.32,
): Point2D[] {
  const headW = clamp(headSizeRatio, 0.15, 0.65) * w;
  const shaftEnd = ox + w - headW;
  const shaftTop = oy + h * 0.3;
  const shaftBot = oy + h * 0.7;
  return [
    { x: ox, y: shaftTop },
    { x: shaftEnd, y: shaftTop },
    { x: shaftEnd, y: oy },
    { x: ox + w, y: oy + h * 0.5 },
    { x: shaftEnd, y: oy + h },
    { x: shaftEnd, y: shaftBot },
    { x: ox, y: shaftBot },
  ];
}

export function makeHeartPoints(
  cx: number,
  cy: number,
  w: number,
  h: number,
  samples = 48,
): Point2D[] {
  const pts: Point2D[] = [];
  const sx = w / 34;
  const sy = h / 32;
  for (let i = 0; i < samples; i++) {
    const t = (i / samples) * Math.PI * 2;
    const hx = 16 * Math.pow(Math.sin(t), 3);
    const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    pts.push({ x: cx + hx * sx, y: cy + (hy - 1.5) * sy });
  }
  return pts;
}

export function makeCalloutPoints(
  ox: number,
  oy: number,
  w: number,
  h: number,
  tailDirection: "left" | "right" | "bottom" = "bottom",
): Point2D[] {
  const bodyH = h * 0.78;
  const r = Math.min(w * 0.12, bodyH * 0.28, 26);
  const tailTipY = oy + h;
  const pts: Point2D[] = [];

  // Approximate rounded corners for uniform polyline evolution (`evolvePolyline`)
  const arc = (acx: number, acy: number, startA: number, endA: number, steps = 4) => {
    for (let i = 0; i <= steps; i++) {
      const a = startA + ((endA - startA) * i) / steps;
      pts.push({ x: acx + Math.cos(a) * r, y: acy + Math.sin(a) * r });
    }
  };

  // Top-left -> Top-right -> Bottom-right
  arc(ox + r, oy + r, Math.PI, Math.PI * 1.5);
  arc(ox + w - r, oy + r, Math.PI * 1.5, Math.PI * 2);
  arc(ox + w - r, oy + bodyH - r, 0, Math.PI * 0.5);

  // Tail on bottom edge
  if (tailDirection === "right") {
    pts.push({ x: ox + w * 0.76, y: oy + bodyH });
    pts.push({ x: ox + w * 0.86, y: tailTipY });
    pts.push({ x: ox + w * 0.62, y: oy + bodyH });
  } else if (tailDirection === "left") {
    pts.push({ x: ox + w * 0.38, y: oy + bodyH });
    pts.push({ x: ox + w * 0.14, y: tailTipY });
    pts.push({ x: ox + w * 0.24, y: oy + bodyH });
  } else {
    pts.push({ x: ox + w * 0.57, y: oy + bodyH });
    pts.push({ x: ox + w * 0.48, y: tailTipY });
    pts.push({ x: ox + w * 0.41, y: oy + bodyH });
  }

  // Bottom-left
  arc(ox + r, oy + bodyH - r, Math.PI * 0.5, Math.PI);
  return pts;
}

export function makePiePoints(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  progress: number,
  steps = 48,
): Point2D[] {
  const p = clamp(progress, 0, 1);
  if (p <= 0.001) return [];
  const totalAngle = p * Math.PI * 2;
  const segs = Math.max(4, Math.ceil(steps * p));
  const pts: Point2D[] = [];
  if (p < 0.999) {
    pts.push({ x: cx, y: cy });
  }
  for (let i = 0; i <= segs; i++) {
    const a = -Math.PI / 2 + (totalAngle * i) / segs;
    pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  return pts;
}

export function makeCirclePoints(cx: number, cy: number, rx: number, ry: number, steps = 48): Point2D[] {
  const pts: Point2D[] = [];
  for (let i = 0; i < steps; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / steps;
    pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  return pts;
}

export function makeRoundedRectPoints(
  ox: number,
  oy: number,
  w: number,
  h: number,
  radius: number,
): Point2D[] {
  const r = clamp(radius, 0, Math.min(w, h) * 0.5);
  if (r <= 0.5) {
    return [
      { x: ox, y: oy },
      { x: ox + w, y: oy },
      { x: ox + w, y: oy + h },
      { x: ox, y: oy + h },
    ];
  }
  const pts: Point2D[] = [];
  const arc = (acx: number, acy: number, startA: number, endA: number, steps = 5) => {
    for (let i = 0; i <= steps; i++) {
      const a = startA + ((endA - startA) * i) / steps;
      pts.push({ x: acx + Math.cos(a) * r, y: acy + Math.sin(a) * r });
    }
  };
  arc(ox + r, oy + r, Math.PI, Math.PI * 1.5);
  arc(ox + w - r, oy + r, Math.PI * 1.5, Math.PI * 2);
  arc(ox + w - r, oy + h - r, 0, Math.PI * 0.5);
  arc(ox + r, oy + h - r, Math.PI * 0.5, Math.PI);
  return pts;
}

/**
 * Remotion `@remotion/paths` `evolvePath` equivalent for 2D polylines:
 * returns the exact sub-polyline from 0% to `progress` (0..1) along cumulative arc length.
 */
export function evolvePolyline(
  points: readonly Point2D[],
  progress: number,
  closed = true,
): Point2D[] {
  if (points.length < 2) return [...points];
  const p = clamp(progress, 0, 1);
  if (p <= 0) return [points[0]!];

  const seq = closed ? [...points, points[0]!] : [...points];
  if (p >= 1) return seq;

  const segLengths: number[] = [];
  let totalLen = 0;
  for (let i = 0; i < seq.length - 1; i++) {
    const dx = seq[i + 1]!.x - seq[i]!.x;
    const dy = seq[i + 1]!.y - seq[i]!.y;
    const len = Math.hypot(dx, dy);
    segLengths.push(len);
    totalLen += len;
  }

  if (totalLen <= 1e-6) return [seq[0]!];
  const targetLen = totalLen * p;
  const out: Point2D[] = [seq[0]!];
  let acc = 0;

  for (let i = 0; i < segLengths.length; i++) {
    const segLen = segLengths[i]!;
    const a = seq[i]!;
    const b = seq[i + 1]!;
    if (acc + segLen >= targetLen) {
      const rem = targetLen - acc;
      const frac = segLen > 1e-6 ? clamp(rem / segLen, 0, 1) : 1;
      out.push({
        x: a.x + (b.x - a.x) * frac,
        y: a.y + (b.y - a.y) * frac,
      });
      break;
    }
    out.push(b);
    acc += segLen;
  }

  return out;
}

export interface DrawProceduralShapeParams {
  g: Graphics;
  shape: ShapeKind;
  ox: number;
  oy: number;
  w: number;
  h: number;
  borderRadius: number;
  points?: number;
  innerRadiusRatio?: number;
  progress?: number;
  drawOn?: boolean;
  tailDirection?: "left" | "right" | "bottom";
  arrowHeadSize?: number;
  fillCol?: number;
  strokeCol?: number;
  strokeWidth: number;
}

function tracePolyline(g: Graphics, pts: readonly Point2D[], closePath: boolean): void {
  if (pts.length < 2) return;
  g.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) {
    g.lineTo(pts[i]!.x, pts[i]!.y);
  }
  if (closePath) g.closePath();
}

export function drawProceduralShape(params: DrawProceduralShapeParams): void {
  const {
    g,
    shape,
    ox,
    oy,
    w,
    h,
    borderRadius,
    points = 5,
    innerRadiusRatio = 0.45,
    progress = 1,
    drawOn = false,
    tailDirection = "bottom",
    arrowHeadSize = 0.32,
    fillCol,
    strokeCol,
    strokeWidth,
  } = params;

  const cx = ox + w * 0.5;
  const cy = oy + h * 0.5;
  const rx = Math.max(1, w * 0.5);
  const ry = Math.max(1, h * 0.5);
  const rad = Math.min(rx, ry);
  const p = clamp(progress, 0, 1);

  const isLine = shape === "line";
  const isRing = shape === "ring";

  let contour: Point2D[];
  switch (shape) {
    case "circle":
    case "ring":
      contour = makeCirclePoints(cx, cy, rad, rad, 56);
      break;
    case "line":
      contour = [
        { x: ox, y: cy },
        { x: ox + w, y: cy },
      ];
      break;
    case "polygon":
      contour = makePolygonPoints(cx, cy, rx, ry, points);
      break;
    case "star":
      contour = makeStarPoints(cx, cy, rx, ry, innerRadiusRatio, points);
      break;
    case "spark":
      contour = makeSparkPoints(cx, cy, rx, ry, innerRadiusRatio, points);
      break;
    case "triangle":
      contour = makeTrianglePoints(ox, oy, w, h);
      break;
    case "arrow":
      contour = makeArrowPoints(ox, oy, w, h, arrowHeadSize);
      break;
    case "callout":
      contour = makeCalloutPoints(ox, oy, w, h, tailDirection);
      break;
    case "heart":
      contour = makeHeartPoints(cx, cy, w, h, 48);
      break;
    case "pie":
      contour = makePiePoints(cx, cy, rad, rad, p, 56);
      break;
    case "rounded_rect":
      contour = makeRoundedRectPoints(ox, oy, w, h, borderRadius);
      break;
    case "rect":
    default:
      contour = makeRoundedRectPoints(ox, oy, w, h, 0);
      break;
  }

  if (contour.length < 2) return;

  // Fill pass (fade fill in nicely near the end of drawOn so stroke-draw reveals cleanly)
  if (fillCol !== undefined && !isLine && !isRing) {
    const fillAlpha = drawOn ? clamp((p - 0.55) / 0.45, 0, 1) : 1;
    if (fillAlpha > 0.01) {
      tracePolyline(g, contour, true);
      g.fill({ color: fillCol, alpha: fillAlpha });
    }
  }

  // Stroke pass (with progressive `evolvePolyline` when drawOn is enabled or line progress < 1)
  const effectiveStrokeCol = strokeCol ?? (drawOn || isLine || isRing ? fillCol ?? 0xffffff : undefined);
  const effectiveStrokeW = strokeWidth > 0 ? strokeWidth : drawOn || isLine || isRing ? 4 : 0;

  if (effectiveStrokeCol !== undefined && effectiveStrokeW > 0) {
    const shouldEvolve = drawOn || (isLine && p < 0.999) || (isRing && p < 0.999);
    const strokePts = shouldEvolve ? evolvePolyline(contour, p, !isLine) : contour;
    if (strokePts.length >= 2) {
      tracePolyline(g, strokePts, !isLine && !shouldEvolve);
      g.stroke({
        color: effectiveStrokeCol,
        width: effectiveStrokeW,
        cap: "round",
        join: "round",
      });
    }
  }
}
