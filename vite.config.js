import { defineConfig } from 'vite';
import { resolve } from 'path';

const cleanPages = new Set([
  'work', 'campaigns', 'team', 'why-us',
  'creator-niv0ne', 'creator-umarpnj', 'movie-runner', 'movie-kingofkings',
]);

export default defineConfig({
  plugins: [{
    name: 'local-clean-page-urls',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost');
        if (url.pathname === '/index.html' && req.headers.accept?.includes('text/html')) {
          res.statusCode = 308;
          res.setHeader('Location', `/${url.search}`);
          res.end();
          return;
        }
        const page = url.pathname.slice(1).replace(/\.html$/, '');
        if (!cleanPages.has(page)) return next();
        if (url.pathname.endsWith('.html') && req.headers.accept?.includes('text/html')) {
          res.statusCode = 308;
          res.setHeader('Location', `/${page}${url.search}`);
          res.end();
          return;
        }
        if (url.pathname === `/${page}`) req.url = `/${page}.html${url.search}`;
        next();
      });
    },
  }],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        work: resolve(__dirname, 'work.html'),
        creatorNiv0ne: resolve(__dirname, 'creator-niv0ne.html'),
        creatorUmarpnj: resolve(__dirname, 'creator-umarpnj.html'),
        movieRunner: resolve(__dirname, 'movie-runner.html'),
        movieKingOfKings: resolve(__dirname, 'movie-kingofkings.html'),
        team: resolve(__dirname, 'team.html'),
        whyUs: resolve(__dirname, 'why-us.html'),
        campaigns: resolve(__dirname, 'campaigns.html'),
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) {
            return 'vendor-three';
          }
          if (id.includes('node_modules/gsap')) {
            return 'vendor-gsap';
          }
          if (id.includes('node_modules/lenis')) {
            return 'vendor-lenis';
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    open: false,
    // This workspace emits repeated filesystem events for these root files
    // even when their contents are unchanged. Avoid restarting Vite on those
    // noise events; restart the dev server manually after editing config/env.
    watch: {
      ignored: [
        resolve(__dirname, 'vite.config.js'),
        resolve(__dirname, '.env'),
        // Public video files are large, immutable media; watching every reel
        // adds startup work and can trigger spurious reloads on sync events.
        resolve(__dirname, 'public/assets/**/*.mp4'),
      ],
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true
      }
    }
  },
});
