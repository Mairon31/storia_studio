import { describe, expect, it } from "vitest";
import { Graphics } from "pixi.js";
import { ShapeKindSchema } from "@storia/schema";
import {
  drawProceduralShape,
  evolvePolyline,
  makeArrowPoints,
  makeCalloutPoints,
  makeHeartPoints,
  makePiePoints,
  makePolygonPoints,
  makeSparkPoints,
  makeStarPoints,
  makeTrianglePoints,
} from "../index.js";

describe("@storia/renderer — Remotion Procedural Shapes & Draw-On Paths", () => {
  it("generates accurate vertex geometry for star, polygon, spark, triangle, arrow, callout, heart, and pie", () => {
    expect(makePolygonPoints(0, 0, 50, 50, 6)).toHaveLength(6);
    expect(makeStarPoints(0, 0, 50, 50, 0.45, 5)).toHaveLength(10);
    expect(makeSparkPoints(0, 0, 50, 50, 0.4, 4)).toHaveLength(8);
    expect(makeTrianglePoints(0, 0, 100, 100)).toHaveLength(3);
    expect(makeArrowPoints(0, 0, 120, 60, 0.35)).toHaveLength(7);
    expect(makeCalloutPoints(0, 0, 160, 100, "left").length).toBeGreaterThan(10);
    expect(makeHeartPoints(0, 0, 100, 100, 32)).toHaveLength(32);

    const halfPie = makePiePoints(0, 0, 50, 50, 0.5, 40);
    expect(halfPie[0]).toEqual({ x: 0, y: 0 });
    expect(halfPie.length).toBeGreaterThan(10);
    expect(makePiePoints(0, 0, 50, 50, 0)).toHaveLength(0);
  });

  it("evolves polylines progressively by exact arc length (`evolvePolyline`)", () => {
    const line = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    const p0 = evolvePolyline(line, 0, false);
    expect(p0).toHaveLength(1);

    const p25 = evolvePolyline(line, 0.25, false);
    expect(p25[p25.length - 1]!.x).toBeCloseTo(50, 3);
    expect(p25[p25.length - 1]!.y).toBeCloseTo(0, 3);

    const p75 = evolvePolyline(line, 0.75, false);
    expect(p75[p75.length - 1]!.x).toBeCloseTo(100, 3);
    expect(p75[p75.length - 1]!.y).toBeCloseTo(50, 3);

    const p100 = evolvePolyline(line, 1, false);
    expect(p100).toEqual(line);
  });

  it("draws every ShapeKind (all 13 shapes) cleanly into PixiJS Graphics with and without drawOn", () => {
    expect(ShapeKindSchema.options.length).toBe(13);
    for (const shape of ShapeKindSchema.options) {
      const g = new Graphics();
      drawProceduralShape({
        g,
        shape,
        ox: -60,
        oy: -40,
        w: 120,
        h: 80,
        borderRadius: 14,
        points: 5,
        innerRadiusRatio: 0.45,
        progress: 0.65,
        drawOn: true,
        tailDirection: "right",
        arrowHeadSize: 0.32,
        fillCol: 0x4ce6c8,
        strokeCol: 0xffffff,
        strokeWidth: 4,
      });
      expect(g.destroyed).toBe(false);
    }
  });
});
