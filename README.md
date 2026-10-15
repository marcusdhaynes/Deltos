# Deltos

The current visual/behavioral baseline is preserved in `index.html` (a prebuilt React application). Vite serves and packages it without changing its layout. TypeScript tooling and Tauri 2 native wrappers are present, but the minified legacy application **has not been converted into TypeScript source**. Native Gmail OAuth and storage behavior require device testing.

## Run
`npm install` then `npm run dev` for web, `npm run build` for deployable `dist/`, `npm run icons && npm run desktop:build` for Windows, and `npm run icons && npm run android:init && npm run android:build` for Android (with Rust, Windows build prerequisites or Android SDK/NDK configured).

GitHub Pages: enable Settings → Pages → Build and deployment → **GitHub Actions**. The Pages workflow publishes the Vite build at `/Deltos/`. A direct `index.html` on main also supports branch-based Pages publishing.

Native builds and behavior have not yet been verified. Do not treat CI configuration as proof of successful builds. The source HTML is intentionally preserved to avoid untested UI changes.

Deployment triggered after GitHub Pages was enabled.
