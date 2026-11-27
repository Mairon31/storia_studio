import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildServer } from "./app.js";
import { ConnectivityManager, readBootstrapBindSettings } from "./connectivity.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultProjectsDir = path.resolve(__dirname, "../../../projects");

const boot = await readBootstrapBindSettings();
const port = boot.port;
const host = boot.host;
const projectsDir = process.env.STORIA_PROJECTS_DIR ?? defaultProjectsDir;

const app = await buildServer({
  projectsDir,
  listeningHost: host,
  listeningPort: port,
  logger: true,
});

try {
  await app.listen({ port, host });
  app.log.info(`Storia Studio server listening on ${host}:${port} (projects: ${projectsDir})`);

  if (boot.autoStartTunnel) {
    const cm = (app as typeof app & { connectivityManager?: ConnectivityManager }).connectivityManager;
    if (cm) {
      cm.startTunnel({ targetPort: port })
        .then((st) => {
          if (st.publicUrl) {
            app.log.info(`Auto-started ${st.provider} tunnel: ${st.publicUrl} (MCP: ${st.mcpUrl})`);
          } else if (st.error) {
            app.log.warn(`Auto-start tunnel failed: ${st.error}`);
          }
        })
        .catch((err) => {
          app.log.warn(`Auto-start tunnel error: ${err instanceof Error ? err.message : String(err)}`);
        });
    }
  }
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
