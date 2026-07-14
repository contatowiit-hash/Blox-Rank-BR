"use client";

import { usePublicResource } from "./use-public-resource";

interface PublicConfig {
  discord_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
}

export function CommunityLinks() {
  const resource = usePublicResource<PublicConfig>("/api/public/config");
  if (resource.status !== "success") return null;

  const links = [
    { href: resource.data.discord_url, label: "Discord" },
    { href: resource.data.tiktok_url, label: "TikTok" },
    { href: resource.data.youtube_url, label: "YouTube" },
  ].filter((link): link is { href: string; label: string } => link.href !== null);

  if (links.length === 0) return null;
  return (
    <div className="community-links" aria-label="Canais oficiais">
      {links.map((link) => (
        <a key={link.label} href={link.href} target="_blank" rel="noreferrer">{link.label}</a>
      ))}
    </div>
  );
}
