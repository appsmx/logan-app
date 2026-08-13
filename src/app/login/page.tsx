"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push("/");
    } else {
      setError("Contraseña incorrecta");
    }
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-serif text-3xl">
            L
          </div>
          <h1 className="font-serif text-2xl font-bold">LOGAN OS</h1>
          <p className="text-sm text-muted-foreground">Acceso restringido</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña"
            className="w-full rounded-lg border bg-background px-4 py-3 text-sm"
            autoFocus
            disabled={loading}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full rounded-lg bg-primary py-3 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Verificando..." : "Entrar"}
          </button>
        </form>

        <div className="text-center">
          <a href="/showcase" className="text-xs text-muted-foreground hover:underline">
            ← Volver al showcase
          </a>
        </div>
      </div>
    </div>
  );
}
