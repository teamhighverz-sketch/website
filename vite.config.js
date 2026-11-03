import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
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
