import { defineConfig } from 'vite';

// GitHub Pages remains unchanged unless a verified HTTPS authentication service
// is supplied through the repository's DELTOS_AUTH_BACKEND_URL variable.
export default defineConfig({
  base: './',
  build: { outDir: 'dist' },
  plugins: [{
    name: 'deltos-auth-backend-config',
    transformIndexHtml(html) {
      const raw = process.env.DELTOS_AUTH_BACKEND_URL?.trim();
      if (!raw) return html;
      const url = new URL(raw);
      if (url.protocol !== 'https:' || url.username || url.password)
        throw new Error('DELTOS_AUTH_BACKEND_URL must be a secure HTTPS origin');
      return html.replace(
        /(<meta name="deltos-auth-backend" content=")[^"]*(" \/>)/,
        (_match, prefix: string, suffix: string) => prefix + url.origin + suffix
      );
    }
  }]
});
