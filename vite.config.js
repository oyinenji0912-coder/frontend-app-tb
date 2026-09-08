import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  base: "/kawal-tb",
  server: {
    host: "0.0.0.0",
    // port: 5173,
    proxy: {
      "/api": {
        target: "http://10.15.102.73:8766",
        changeOrigin: true,
      },
    },
  },
});
