// LOGAN — Service Worker (DEC-LOGAN-022, Fase 3.4).
// Mínimo: habilita la instalabilidad de la PWA. NO cachea las llamadas a la API
// (para que el panel siempre traiga datos frescos del handoff); solo pasa las
// peticiones a la red. Un cacheo más agresivo se puede añadir después si se
// necesita soporte offline real.

self.addEventListener("install", () => {
  // Activar de inmediato la nueva versión del SW.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Estrategia network-first simple: siempre intentar la red.
  // No interceptamos /api/ para no cachear respuestas dinámicas del handoff.
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) {
    return; // deja pasar a la red normalmente
  }
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
