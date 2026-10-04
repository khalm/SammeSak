// config.js — innebygd oppsett.
// Denne filen skrives på nytt automatisk når appen publiseres (se .github/workflows/pages.yml),
// med verdien fra repoets secret PROXY_URL. Appen virker også uten.
window.SAMMESAK_CONFIG = {
  proxy: '',   // fra secret PROXY_URL (Cloudflare-proxy, se worker.js)
};
