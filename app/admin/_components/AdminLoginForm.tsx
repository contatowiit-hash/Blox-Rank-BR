"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

export function AdminLoginForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: form.get("password"),
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!response.ok) {
        setError(payload?.error?.message ?? "Não foi possível entrar. Confira os dados e tente novamente.");
        return;
      }
      window.location.assign("/admin");
    } catch {
      setError("O servidor está iniciando ou indisponível. Aguarde alguns segundos e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="admin-login-page">
      <section className="admin-login-card" aria-labelledby="admin-login-title">
        <Link className="admin-brand" href="/">
          <span className="admin-brand-mark" aria-hidden="true">BRB</span>
          Blox Rank BR
        </Link>
        <p className="admin-eyebrow">Área restrita</p>
        <h1 id="admin-login-title">Acesso da organização</h1>
        <p className="admin-muted">Digite a senha administrativa para continuar.</p>
        <form className="admin-form" onSubmit={submit}>
          <label className="admin-label">
            Senha administrativa
            <input className="admin-input" name="password" type="password" minLength={10} maxLength={256} autoComplete="current-password" required />
          </label>
          {error && <p className="admin-notice error" role="alert">{error}</p>}
          <button className="admin-button" type="submit" disabled={loading}>{loading ? "Entrando…" : "Entrar com segurança"}</button>
        </form>
      </section>
    </main>
  );
}
