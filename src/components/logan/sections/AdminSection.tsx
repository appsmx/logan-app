"use client";

import * as React from "react";
import { useState, useEffect } from "react";

/**
 * Admin Section — Logan POS Tenant Management
 *
 * Calls the POS backend API directly (/api/admin/*) to manage tenants.
 * The POS backend CORS allows requests from loganos.com.
 */

const POS_API_URL = process.env.NEXT_PUBLIC_POS_API_URL || "https://restaurant-pos-api-0mx9.onrender.com/api";

type Tab = "dashboard" | "tenants" | "create";

interface Stats {
  tenants: { total: number; active: number; inactive: number };
  data: { orders: number; users: number; products: number };
  revenue: { monthlyRecurring: number; pendingSetups: number; totalSetupCollected: number; currency: string };
}

interface TenantItem {
  id: string;
  slug: string;
  name: string;
  businessType: string;
  plan: string;
  active: boolean;
  enabledModules: string[];
  setupPaid: boolean;
  monthlyRate: number;
  createdAt: string;
  _count: { users: number; orders: number; products: number };
}

// Token stored after admin login to POS
function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("logan_admin_pos_token");
}

function setAdminToken(token: string) {
  localStorage.setItem("logan_admin_pos_token", token);
}

async function posApi(endpoint: string, method = "GET", body?: any) {
  const token = getAdminToken();
  const res = await fetch(`${POS_API_URL}${endpoint}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || `Error ${res.status}`);
  return data;
}

export function AdminSection() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);

  // Check if we have a valid token
  useEffect(() => {
    const token = getAdminToken();
    if (token) {
      // Verify token by calling stats
      posApi("/admin/stats")
        .then(() => setAuthenticated(true))
        .catch(() => {
          localStorage.removeItem("logan_admin_pos_token");
          setAuthenticated(false);
        })
        .finally(() => setChecking(false));
    } else {
      setChecking(false);
    }
  }, []);

  if (checking) {
    return <div className="flex items-center justify-center py-12"><Spinner /></div>;
  }

  if (!authenticated) {
    return <AdminLogin onSuccess={() => setAuthenticated(true)} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">🏢 Logan Admin</h1>
          <p className="text-sm text-muted-foreground">Gestión de negocios multi-tenant</p>
        </div>
        <button
          onClick={() => { localStorage.removeItem("logan_admin_pos_token"); setAuthenticated(false); }}
          className="text-xs text-muted-foreground hover:text-destructive transition-colors"
        >
          Cerrar sesión admin
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
        {[
          { id: "dashboard" as Tab, label: "📊 Dashboard" },
          { id: "tenants" as Tab, label: "🏪 Negocios" },
          { id: "create" as Tab, label: "➕ Crear Negocio" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "dashboard" && <DashboardTab />}
      {tab === "tenants" && <TenantsTab />}
      {tab === "create" && <CreateTenantTab onCreated={() => setTab("tenants")} />}
    </div>
  );
}

// ==================== LOGIN ====================

function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await posApi("/auth/login", "POST", { username, password });
      setAdminToken(data.token);
      onSuccess();
    } catch (err: any) {
      setError(err.message || "Credenciales inválidas");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto mt-12 space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-bold">🔐 Admin POS</h2>
        <p className="text-sm text-muted-foreground mt-1">Ingresa tus credenciales de administrador del POS</p>
      </div>
      <form onSubmit={handleLogin} className="space-y-4">
        {error && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</p>}
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          className="w-full px-3 py-2 rounded-md border bg-background text-sm"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full px-3 py-2 rounded-md border bg-background text-sm"
        />
        <button
          type="submit"
          disabled={loading || !username || !password}
          className="w-full py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50"
        >
          {loading ? "Ingresando..." : "Ingresar"}
        </button>
      </form>
    </div>
  );
}

// ==================== DASHBOARD ====================

function DashboardTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    posApi("/admin/stats").then(setStats).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (!stats) return <p className="text-muted-foreground text-sm">No se pudieron cargar las estadísticas</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Negocios activos" value={stats.tenants.active} icon="🏪" />
        <StatCard label="Ingresos mensuales" value={`$${stats.revenue.monthlyRecurring.toLocaleString()}`} icon="💰" sub="MXN/mes" />
        <StatCard label="Órdenes totales" value={stats.data.orders.toLocaleString()} icon="🧾" />
        <StatCard label="Usuarios totales" value={stats.data.users} icon="👥" />
      </div>
      <div className="rounded-lg border p-4 space-y-2 text-sm">
        <h3 className="font-medium text-muted-foreground">Resumen</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <p>Tenants totales: <strong>{stats.tenants.total}</strong></p>
          <p>Inactivos: <strong className="text-destructive">{stats.tenants.inactive}</strong></p>
          <p>Setups pendientes: <strong className="text-yellow-500">{stats.revenue.pendingSetups}</strong></p>
          <p>Setup cobrado: <strong className="text-green-500">${stats.revenue.totalSetupCollected.toLocaleString()}</strong></p>
          <p>Productos totales: <strong>{stats.data.products}</strong></p>
        </div>
      </div>
    </div>
  );
}

// ==================== TENANTS LIST ====================

function TenantsTab() {
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    posApi("/admin/tenants").then((d) => setTenants(d.tenants || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const toggleActive = async (id: string, current: boolean) => {
    try {
      await posApi(`/admin/tenants/${id}`, "PATCH", { active: !current });
      setTenants((prev) => prev.map((t) => (t.id === id ? { ...t, active: !current } : t)));
    } catch { alert("Error al cambiar estado"); }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-3">
      {tenants.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No hay negocios registrados.</p>
      ) : (
        tenants.map((t) => (
          <div key={t.id} className="rounded-lg border p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold ${t.active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                {t.name[0]?.toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{t.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${t.active ? "bg-green-500/20 text-green-600" : "bg-red-500/20 text-red-500"}`}>
                    {t.active ? "Activo" : "Inactivo"}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-600">{t.plan}</span>
                </div>
                <p className="text-xs text-muted-foreground">{t.slug}.loganos.com · {t.businessType.toLowerCase()} · ${t.monthlyRate}/mes</p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>👥 {t._count.users}</span>
              <span>🧾 {t._count.orders}</span>
              <span>📋 {t._count.products}</span>
              <button
                onClick={() => toggleActive(t.id, t.active)}
                className={`px-3 py-1 rounded-md text-xs font-medium ${t.active ? "bg-red-500/10 text-red-500 hover:bg-red-500/20" : "bg-green-500/10 text-green-600 hover:bg-green-500/20"}`}
              >
                {t.active ? "Desactivar" : "Reactivar"}
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ==================== CREATE TENANT ====================

function CreateTenantTab({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({ slug: "", name: "", businessType: "RESTAURANT", plan: "STARTER", adminUsername: "", adminPassword: "", adminName: "", phone: "", address: "" });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    if (form.slug.length < 2) { setSlugAvailable(null); return; }
    const t = setTimeout(() => {
      posApi(`/admin/onboarding/check-slug/${form.slug}`).then((d) => setSlugAvailable(d.available)).catch(() => setSlugAvailable(null));
    }, 500);
    return () => clearTimeout(t);
  }, [form.slug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true); setError(""); setResult(null);
    try {
      const data = await posApi("/admin/tenants", "POST", form);
      setResult(data);
    } catch (err: any) { setError(err.message); }
    finally { setSubmitting(false); }
  };

  const update = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const handleNameChange = (name: string) => {
    update("name", name);
    update("slug", name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50));
  };

  if (result) {
    return (
      <div className="rounded-lg border p-8 text-center space-y-4">
        <div className="text-4xl">🎉</div>
        <h2 className="text-xl font-bold text-green-600">¡Negocio creado!</h2>
        <div className="text-sm space-y-1">
          <p><strong>Negocio:</strong> {result.tenant.name}</p>
          <p><strong>URL:</strong> <span className="text-primary">{result.accessUrl}</span></p>
          <p><strong>Admin:</strong> {result.adminUser.username}</p>
          <p><strong>Módulos:</strong> {result.tenant.enabledModules.join(", ")}</p>
        </div>
        <button onClick={onCreated} className="px-6 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium">
          Ver todos los negocios
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border p-6 space-y-5 max-w-2xl">
      <h2 className="text-lg font-medium">🧙 Nuevo Negocio</h2>
      {error && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Nombre del negocio *" value={form.name} onChange={(v) => handleNameChange(v)} placeholder="Barbería Mike" />
        <div>
          <Field label="Slug (URL) *" value={form.slug} onChange={(v) => update("slug", v)} placeholder="barberia-mike" />
          {form.slug.length >= 2 && (
            <p className={`text-xs mt-1 ${slugAvailable === true ? "text-green-600" : slugAvailable === false ? "text-destructive" : "text-muted-foreground"}`}>
              {slugAvailable === true && `✅ ${form.slug}.loganos.com disponible`}
              {slugAvailable === false && "❌ Slug en uso"}
              {slugAvailable === null && "Verificando..."}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Tipo de negocio *</label>
          <select value={form.businessType} onChange={(e) => update("businessType", e.target.value)} className="w-full px-3 py-2 rounded-md border bg-background text-sm">
            <option value="RESTAURANT">🍽️ Restaurante</option>
            <option value="BARBERSHOP">💈 Barbería</option>
            <option value="CAFE">☕ Cafetería</option>
            <option value="STORE">🏪 Tienda / Abarrotes</option>
            <option value="GENERAL">🏢 General</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Plan *</label>
          <select value={form.plan} onChange={(e) => update("plan", e.target.value)} className="w-full px-3 py-2 rounded-md border bg-background text-sm">
            <option value="STARTER">Starter — $500/mes</option>
            <option value="GROWTH">Growth — $1,000/mes</option>
            <option value="PRO">Pro — $1,500/mes</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Teléfono" value={form.phone} onChange={(v) => update("phone", v)} placeholder="6441234567" />
        <Field label="Dirección" value={form.address} onChange={(v) => update("address", v)} placeholder="Av. Principal #123" />
      </div>

      <div className="border-t pt-4">
        <h3 className="text-sm font-medium mb-3">👤 Usuario administrador</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Nombre *" value={form.adminName} onChange={(v) => update("adminName", v)} placeholder="Miguel" />
          <Field label="Username *" value={form.adminUsername} onChange={(v) => update("adminUsername", v)} placeholder="mike" />
          <Field label="Password *" value={form.adminPassword} onChange={(v) => update("adminPassword", v)} placeholder="••••••" type="password" />
        </div>
      </div>

      <button
        type="submit"
        disabled={submitting || !form.slug || !form.name || !form.adminUsername || !form.adminPassword || !form.adminName}
        className="w-full py-3 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50"
      >
        {submitting ? "Creando..." : "🚀 Crear Negocio"}
      </button>
    </form>
  );
}

// ==================== SHARED ====================

function StatCard({ label, value, icon, sub }: { label: string; value: string | number; icon: string; sub?: string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-2 mb-1">
        <span>{icon}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div>
      <label className="block text-xs text-muted-foreground mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full px-3 py-2 rounded-md border bg-background text-sm" />
    </div>
  );
}

function Spinner() {
  return <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
}
