import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // GitHub Pages serves this project from /Hackyeah/, while the dev server
  // stays at the root so local links keep working.
  base: command === 'build' ? '/Hackyeah/' : '/',
}));
