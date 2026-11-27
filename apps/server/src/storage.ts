import fs from "node:fs/promises";
import path from "node:path";
import {
  applyProjectOperations,
  createEditReceipt,
  EditReceipt,
  EditSource,
  getProjectDuration,
  IdSchema,
  Project,
  ProjectOperation,
  ProjectSchema,
} from "@storia/schema";

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  aspectRatio: string;
  resolution: string;
  fps: number;
  sceneCount: number;
  durationSec: number;
  updatedAt: string;
}

export class ProjectStorage {
  constructor(public readonly rootDir: string) {}

  private resolveProjectDir(projectId: string): string {
    const safeId = IdSchema.parse(projectId);
    const full = path.resolve(this.rootDir, safeId);
    const rootResolved = path.resolve(this.rootDir);
    if (!full.startsWith(rootResolved + path.sep)) {
      throw new Error("Invalid project path");
    }
    return full;
  }

  private resolveProjectFile(projectId: string): string {
    return path.join(this.resolveProjectDir(projectId), "project.json");
  }

  async ensureRoot(): Promise<void> {
    await fs.mkdir(this.rootDir, { recursive: true });
  }

  async list(): Promise<ProjectSummary[]> {
    await this.ensureRoot();
    const entries = await fs.readdir(this.rootDir, { withFileTypes: true });
    const summaries: ProjectSummary[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const pFile = path.join(this.rootDir, entry.name, "project.json");
      try {
        const raw = await fs.readFile(pFile, "utf8");
        const project = ProjectSchema.parse(JSON.parse(raw));
        summaries.push({
          id: project.id,
          name: project.name,
          description: project.description,
          aspectRatio: project.canvas.aspectRatio,
          resolution: project.canvas.resolution,
          fps: project.canvas.fps,
          sceneCount: project.scenes.length,
          durationSec: Number(getProjectDuration(project).toFixed(2)),
          updatedAt: project.updatedAt,
        });
      } catch {
        // Ignore non-project or incomplete folders
      }
    }

    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(projectId: string): Promise<Project | null> {
    const pFile = this.resolveProjectFile(projectId);
    try {
      const raw = await fs.readFile(pFile, "utf8");
      return ProjectSchema.parse(JSON.parse(raw));
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null;
      throw err;
    }
  }

  async save(projectInput: Project): Promise<Project> {
    const project = ProjectSchema.parse(projectInput);
    const dir = this.resolveProjectDir(project.id);
    await fs.mkdir(path.join(dir, "assets"), { recursive: true });
    await fs.mkdir(path.join(dir, "exports"), { recursive: true });

    const pFile = path.join(dir, "project.json");
    const tmpFile = path.join(dir, `.project.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);
    await fs.writeFile(tmpFile, JSON.stringify(project, null, 2) + "\n", "utf8");
    await fs.rename(tmpFile, pFile);
    return project;
  }

  async saveSnapshot(project: Project): Promise<string> {
    const dir = this.resolveProjectDir(project.id);
    const histDir = path.join(dir, ".history");
    await fs.mkdir(histDir, { recursive: true });
    const snapshotId = `snap_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 6)}`;
    await fs.writeFile(path.join(histDir, `${snapshotId}.json`), JSON.stringify(project, null, 2) + "\n", "utf8");

    // Keep last 12 rolling snapshots so disk stays clean
    const files = (await fs.readdir(histDir))
      .filter((f) => f.endsWith(".json"))
      .sort();
    while (files.length > 12) {
      const oldest = files.shift();
      if (oldest) {
        await fs.rm(path.join(histDir, oldest), { force: true }).catch(() => {});
      }
    }
    return snapshotId;
  }

  async listSnapshots(
    projectId: string,
  ): Promise<{ snapshotId: string; modifiedAt: string; sizeBytes: number }[]> {
    const dir = this.resolveProjectDir(projectId);
    const histDir = path.join(dir, ".history");
    try {
      const files = (await fs.readdir(histDir)).filter((f) => f.endsWith(".json")).sort().reverse();
      const out: { snapshotId: string; modifiedAt: string; sizeBytes: number }[] = [];
      for (const f of files) {
        const st = await fs.stat(path.join(histDir, f)).catch(() => null);
        if (!st) continue;
        out.push({
          snapshotId: f.replace(/\.json$/, ""),
          modifiedAt: st.mtime.toISOString(),
          sizeBytes: st.size,
        });
      }
      return out;
    } catch {
      return [];
    }
  }

  async restoreSnapshot(projectId: string, snapshotId: string): Promise<Project | null> {
    const safeSnap = IdSchema.parse(snapshotId);
    const dir = this.resolveProjectDir(projectId);
    const snapFile = path.join(dir, ".history", `${safeSnap}.json`);
    try {
      const raw = await fs.readFile(snapFile, "utf8");
      const parsed = ProjectSchema.parse(JSON.parse(raw));
      parsed.updatedAt = new Date().toISOString();
      return this.save(parsed);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null;
      throw err;
    }
  }

  async applyOperations(
    projectId: string,
    ops: readonly ProjectOperation[],
    source: EditSource = "api",
  ): Promise<{ project: Project; receipt: EditReceipt }> {
    const current = await this.get(projectId);
    if (!current) {
      throw Object.assign(new Error(`Project '${projectId}' not found`), { statusCode: 404 });
    }
    const snapshotId = await this.saveSnapshot(current);
    const updated = applyProjectOperations(current, ops);
    const saved = await this.save(updated);
    const receipt = createEditReceipt({
      before: current,
      after: saved,
      operations: ops,
      source,
      snapshotId,
    });
    return { project: saved, receipt };
  }

  async delete(projectId: string): Promise<boolean> {
    const dir = this.resolveProjectDir(projectId);
    try {
      await fs.access(dir);
      await fs.rm(dir, { recursive: true, force: true });
      return true;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return false;
      throw err;
    }
  }
}
