import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

/** Strip Vite dev-server origins from CSP when building for production. */
function jarvisCspProdPlugin() {
  return {
    name: 'jarvis-csp-prod',
    transformIndexHtml(html, ctx) {
      if (ctx.server) return html;
      return html
        .replace(/\s*http:\/\/127\.0\.0\.1:5173/g, '')
        .replace(/\s*ws:\/\/127\.0\.0\.1:5173/g, '')
        .replace(/\s*http:\/\/localhost:5173/g, '')
        .replace(/\s*ws:\/\/localhost:5173/g, '');
    },
  };
}

export default defineConfig({
  plugins: [react(), jarvisCspProdPlugin()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    minify: 'esbuild',
    reportCompressedSize: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) return 'react-vendor';
          if (id.includes('framer-motion')) return 'motion';
          if (id.includes('lucide-react')) return 'icons';
          if (id.includes('@dnd-kit')) return 'dnd';
          return undefined;
        },
      },
    },
  },
});
