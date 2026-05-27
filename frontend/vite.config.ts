import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "..", "");
  const webPort = env.WEB_PORT || "52841";
  const devPort = Number(env.FRONTEND_PORT || 61294);

  return {
    plugins: [react()],
    envDir: "..",
    server: {
      port: devPort,
      proxy: {
        "/api": {
          target: `http://127.0.0.1:${webPort}`,
          changeOrigin: true,
        },
      },
    },
  };
});
