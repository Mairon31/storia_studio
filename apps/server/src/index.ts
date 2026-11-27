import { buildServer } from "./app.js";
import { ConnectivityManager, readBootstrapBindSettings } from "./connectivity.js";
import {
  resolveDefaultConnectivityConfigPath,
  resolveDefaultLibrariesConfigPath,
  resolveDefaultModelsRootDir,
  resolveDefaultOAuthStorePath,
  resolveDefaultOnboardingConfigPath,
  resolveDefaultProjectsDir,
  resolveDefaultStudioDistDir,
  resolveDefaultTtsModelsDir,
} from "./dataPaths.js";

const connectivityConfigPath = resolveDefaultConnectivityConfigPath();
const boot = await readBootstrapBindSettings(connectivityConfigPath);
const port = boot.port;
const host = boot.host;
const projectsDir = resolveDefaultProjectsDir();
const modelsDir = resolveDefaultModelsRootDir();
const studioDistDir = resolveDefaultStudioDistDir();
const ttsModelsDir = resolveDefaultTtsModelsDir();
const librariesConfigPath = resolveDefaultLibrariesConfigPath();
const oauthStorePath = resolveDefaultOAuthStorePath();
const onboardingConfigPath = resolveDefaultOnboardingConfigPath();

const app = await buildServer({
  projectsDir,
  modelsDir,
  studioDistDir,
  ttsModelsDir,
  connectivityConfigPath,
  librariesConfigPath,
  oauthStorePath,
  onboardingConfigPath,
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
