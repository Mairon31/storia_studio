import { z } from "zod";
import { getProjectDuration, Project } from "./project.js";
import { ProjectOperation } from "./patches.js";

export const EditSourceSchema = z.enum(["ui", "mcp", "api", "undo", "redo"]);
export type EditSource = z.infer<typeof EditSourceSchema>;

export const EditReceiptSchema = z.object({
  receiptId: z.string().min(1),
  projectId: z.string().min(1),
  source: EditSourceSchema,
  timestamp: z.string().datetime(),
  operationsCount: z.number().int().min(0),
  operationTypes: z.array(z.string()),
  touchedIds: z.array(z.string()),
  durationBeforeSec: z.number().min(0),
  durationAfterSec: z.number().min(0),
  snapshotId: z.string().optional(),
  summary: z.string(),
});
export type EditReceipt = z.infer<typeof EditReceiptSchema>;

export function createEditReceipt(params: {
  before: Project;
  after: Project;
  operations: readonly ProjectOperation[];
  source: EditSource;
  snapshotId?: string;
}): EditReceipt {
  const opTypes = Array.from(new Set(params.operations.map((o) => o.op)));
  const touched = new Set<string>();
  for (const op of params.operations) {
    if ("sceneId" in op && op.sceneId) touched.add(op.sceneId);
    if ("layerId" in op && op.layerId) touched.add(op.layerId);
    if ("cueId" in op && op.cueId) touched.add(op.cueId);
    if ("trackId" in op && op.trackId) touched.add(op.trackId);
    if ("assetId" in op && op.assetId) touched.add(op.assetId);
    if ("characterId" in op && op.characterId) touched.add(op.characterId);
    if ("scene" in op && op.scene?.id) touched.add(op.scene.id);
    if ("layer" in op && op.layer?.id) touched.add(op.layer.id);
    if ("cue" in op && op.cue?.id) touched.add(op.cue.id);
    if ("asset" in op && op.asset?.id) touched.add(op.asset.id);
    if ("character" in op && op.character?.id) touched.add(op.character.id);
    if ("effectClip" in op && op.effectClip?.id) touched.add(op.effectClip.id);
    if ("effectClipId" in op && op.effectClipId) touched.add(op.effectClipId);
  }

  const durationBeforeSec = Number(getProjectDuration(params.before).toFixed(3));
  const durationAfterSec = Number(getProjectDuration(params.after).toFixed(3));
  const receiptId = `rcpt_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 7)}`;

  const summary =
    opTypes.length === 1
      ? `${opTypes[0]} (${touched.size > 0 ? Array.from(touched).slice(0, 3).join(", ") : params.after.id})`
      : `${params.operations.length} ops: ${opTypes.slice(0, 3).join(", ")}${opTypes.length > 3 ? "…" : ""}`;

  return EditReceiptSchema.parse({
    receiptId,
    projectId: params.after.id,
    source: params.source,
    timestamp: new Date().toISOString(),
    operationsCount: params.operations.length,
    operationTypes: opTypes,
    touchedIds: Array.from(touched),
    durationBeforeSec,
    durationAfterSec,
    snapshotId: params.snapshotId,
    summary,
  });
}
