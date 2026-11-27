import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDemoProject } from "@storia/schema";
import { ProjectStorage } from "./storage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectsDir = process.env.STORIA_PROJECTS_DIR ?? path.resolve(__dirname, "../../../projects");

const storage = new ProjectStorage(projectsDir);
const demo = createDemoProject("demo_episodum_paradox");
const saved = await storage.save(demo);
console.log(`Seeded demo project '${saved.id}' -> ${path.join(projectsDir, saved.id, "project.json")}`);
