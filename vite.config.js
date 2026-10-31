import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  if (env.VITE_SUPABASE_PUBLISHABLE_KEY && !env.VITE_SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_')) {
    throw new Error('Use a Supabase publishable key (sb_publishable_...), never a secret or service-role key in the browser build.');
  }
  return {
    base: env.VITE_BASE_PATH || '/',
    server: {
      port: 5173,
      proxy: { '/api': 'http://127.0.0.1:3001' },
    },
  };
});