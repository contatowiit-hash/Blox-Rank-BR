"use client";

import { MessageCircle } from "lucide-react";
import { usePublicResource } from "./use-public-resource";

interface PublicConfig { discord_url: string | null; }

export function DiscordButton({ cta = false }: { cta?: boolean }) {
  const resource = usePublicResource<PublicConfig>("/api/public/config");
  const className = cta ? "button button-secondary" : "nav-discord";
  if (resource.status !== "success" || resource.data.discord_url === null) {
    return <span className={`${className} nav-discord-disabled`} aria-disabled="true"><MessageCircle aria-hidden="true" /> Entrar no Discord</span>;
  }
  return <a className={className} href={resource.data.discord_url} target="_blank" rel="noreferrer"><MessageCircle aria-hidden="true" /> Entrar no Discord</a>;
}
