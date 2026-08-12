import { defineConfig } from 'vite';

// Works whether you deploy at the domain root or under a subpath.
// For GitHub Pages project sites (https://user.github.io/repo/), set base to '/repo/'.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/ws': { target: 'ws://localhost:8080', ws: true },
    },
  },
});