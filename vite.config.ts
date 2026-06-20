import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },

  server: {
    // Локальная разработка:
    // Vite Dev Server (порт 5173) проксирует /proxy/* → Express (порт 3000)
    // Так запросы к Supabase идут через твой сервер даже локально
    proxy: {
      '/proxy/supabase-auth': {
        target:       'http://localhost:3000',
        changeOrigin: true,
      },
      '/proxy/supabase': {
        target:       'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});