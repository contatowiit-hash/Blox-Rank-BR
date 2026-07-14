import type { MetadataRoute } from "next";
import { getPublicSiteUrl } from "./lib/site";

const routes = [
  "",
  "/como-funciona",
  "/torneio",
  "/chaveamento",
  "/participantes",
  "/regras",
  "/parceiros",
  "/faq",
  "/inscricao",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getPublicSiteUrl();
  return routes.map((path) => ({
    url: new URL(path || "/", base).toString(),
    changeFrequency: path === "/chaveamento" || path === "/torneio" ? "daily" : "weekly",
    priority: path === "" ? 1 : path === "/inscricao" ? 0.9 : 0.7,
  }));
}
