"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { registrationInputSchema } from "@/app/lib/api/schemas";
import { fetchPublicData, PublicApiError } from "./public-types";

interface RegistrationResponse {
  id: string;
  tournament_id: string;
  roblox_username: string;
  status: "pending";
  created_at: string;
}

interface FormValues {
  roblox_username: string;
  discord_user_id: string;
  discord_username: string;
  level: string;
  bounty_honor: string;
  faction: "pirate" | "marine";
  platform: "pc" | "mobile" | "console";
  main_fruit: string;
}

const initialValues: FormValues = {
  roblox_username: "",
  discord_user_id: "",
  discord_username: "",
  level: "",
  bounty_honor: "",
  faction: "pirate",
  platform: "pc",
  main_fruit: "",
};

const fieldLabels: Record<keyof FormValues, string> = {
  roblox_username: "Nome no Roblox",
  discord_user_id: "ID do Discord",
  discord_username: "Nome no Discord",
  level: "Nível",
  bounty_honor: "Bounty ou Honor",
  faction: "Facção",
  platform: "Onde você joga",
  main_fruit: "Fruta principal",
};

const friendlyValidationMessages: Partial<Record<keyof FormValues, string>> = {
  discord_user_id: "Informe o ID numérico do Discord com 17 a 20 dígitos.",
  discord_username: "Informe seu nome atual no Discord.",
  level: "Informe um nível inteiro entre 1 e 10.000.",
  bounty_honor: "Informe um Bounty/Honor inteiro entre 0 e 1 bilhão.",
  main_fruit: "Informe sua fruta principal.",
};

function validationMessage(field: keyof FormValues, fallback: string) {
  return friendlyValidationMessages[field] ?? fallback;
}

export function RegistrationForm() {
  const [values, setValues] = useState<FormValues>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [registration, setRegistration] = useState<RegistrationResponse | null>(null);

  function update<K extends keyof FormValues>(field: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = registrationInputSchema.safeParse({
      roblox_username: values.roblox_username,
      discord_user_id: values.discord_user_id,
      discord_username: values.discord_username,
      level: Number(values.level),
      bounty_honor: Number(values.bounty_honor),
      faction: values.faction,
      platform: values.platform,
      main_fruit: values.main_fruit,
    });
    if (!parsed.success) {
      const nextErrors: Partial<Record<keyof FormValues, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof FormValues | undefined;
        if (field !== undefined && nextErrors[field] === undefined) {
          nextErrors[field] = validationMessage(field, issue.message);
        }
      }
      setErrors(nextErrors);
      setStatus("error");
      setMessage("Revise os campos destacados.");
      return;
    }

    setStatus("sending");
    setMessage("");
    try {
      const data = await fetchPublicData<RegistrationResponse>("/api/public/inscricoes", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      setRegistration(data);
      setStatus("success");
      setValues(initialValues);
    } catch (error: unknown) {
      setStatus("error");
      setMessage(error instanceof PublicApiError ? error.message : "Não foi possível enviar sua inscrição.");
      if (error instanceof PublicApiError) {
        const apiErrors: Partial<Record<keyof FormValues, string>> = {};
        for (const issue of error.issues) {
          const field = (issue.field ?? issue.path)?.split(".").at(-1) as keyof FormValues | undefined;
          if (field !== undefined && field in fieldLabels) {
            apiErrors[field] = validationMessage(field, issue.message);
          }
        }
        setErrors(apiErrors);
      }
    }
  }

  if (status === "success" && registration !== null) {
    return (
      <section className="registration-success" role="status" aria-live="polite">
        <CheckCircle2 aria-hidden="true" />
        <span className="eyebrow">Inscrição recebida</span>
        <h2>Agora é com a equipe.</h2>
        <p>Sua inscrição para <strong>{registration.roblox_username}</strong> está em análise.</p>
        <div className="registration-code"><span>Código da inscrição</span><code>{registration.id}</code></div>
        <button className="button button-secondary" type="button" onClick={() => { setRegistration(null); setStatus("idle"); }}>
          Enviar outra inscrição
        </button>
      </section>
    );
  }

  return (
    <form className="registration-form" onSubmit={submit} noValidate>
      <div className="form-section-heading">
        <span>01</span><div><h2>Seu jogador</h2><p>Conte como você joga Blox Fruits.</p></div>
      </div>
      <div className="form-grid">
        <Field label={fieldLabels.roblox_username} error={errors.roblox_username} hint="Exatamente como aparece no Roblox.">
          <input value={values.roblox_username} maxLength={20} autoComplete="off" onChange={(event) => update("roblox_username", event.target.value)} aria-invalid={Boolean(errors.roblox_username)} />
        </Field>
        <Field label={fieldLabels.level} error={errors.level}>
          <input type="number" min={1} max={10000} value={values.level} onChange={(event) => update("level", event.target.value)} aria-invalid={Boolean(errors.level)} />
        </Field>
        <Field label={fieldLabels.bounty_honor} error={errors.bounty_honor}>
          <input type="number" min={0} max={1000000000} value={values.bounty_honor} onChange={(event) => update("bounty_honor", event.target.value)} aria-invalid={Boolean(errors.bounty_honor)} />
        </Field>
        <Field label={fieldLabels.main_fruit} error={errors.main_fruit}>
          <input value={values.main_fruit} maxLength={80} autoComplete="off" onChange={(event) => update("main_fruit", event.target.value)} aria-invalid={Boolean(errors.main_fruit)} />
        </Field>
        <Field label={fieldLabels.faction}>
          <select value={values.faction} onChange={(event) => update("faction", event.target.value as FormValues["faction"])}>
            <option value="pirate">Pirata</option><option value="marine">Marinheiro</option>
          </select>
        </Field>
        <Field label={fieldLabels.platform}>
          <select value={values.platform} onChange={(event) => update("platform", event.target.value as FormValues["platform"])}>
            <option value="pc">PC</option><option value="mobile">Celular</option><option value="console">Console</option>
          </select>
        </Field>
      </div>

      <div className="form-section-heading form-section-second">
        <span>02</span><div><h2>Seu Discord</h2><p>É por lá que a equipe identifica os participantes.</p></div>
      </div>
      <div className="form-grid">
        <Field label={fieldLabels.discord_username} error={errors.discord_username} hint="Seu nome atual no Discord.">
          <input value={values.discord_username} maxLength={64} autoComplete="username" onChange={(event) => update("discord_username", event.target.value)} aria-invalid={Boolean(errors.discord_username)} />
        </Field>
        <Field label={fieldLabels.discord_user_id} error={errors.discord_user_id} hint="Somente números; não é sua senha.">
          <input inputMode="numeric" value={values.discord_user_id} minLength={17} maxLength={20} autoComplete="off" onChange={(event) => update("discord_user_id", event.target.value.replace(/\D/g, ""))} aria-invalid={Boolean(errors.discord_user_id)} />
        </Field>
      </div>

      {status === "error" && message && <p className="form-message form-message-error" role="alert">{message}</p>}
      <div className="form-submit-row">
        <p>Ao enviar, seus dados serão analisados pela equipe do torneio.</p>
        <button className="button button-primary" type="submit" disabled={status === "sending"}>
          <Send aria-hidden="true" />
          {status === "sending" ? "Enviando..." : "Enviar inscrição"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="form-field">
      <span>{label}</span>
      {children}
      {error ? <small className="field-error">{error}</small> : hint ? <small>{hint}</small> : null}
    </label>
  );
}
