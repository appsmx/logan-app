"use client";

// Registra el service worker para habilitar la PWA (DEC-LOGAN-022, Fase 3.4).
// Se monta dentro del panel del cliente. Silencioso: si el navegador no soporta
// SW, no hace nada.

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registro fallido (p.ej. entorno sin HTTPS en local) — ignorar.
    });
  }, []);
  return null;
}
