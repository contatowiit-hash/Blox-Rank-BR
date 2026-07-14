const LOCAL_SITE_URL = "http://localhost:5173";

export function getPublicSiteUrl(): URL {
  const configured = process.env.PUBLIC_SITE_URL?.trim();
  if (!configured) return new URL(LOCAL_SITE_URL);
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" && url.hostname !== "localhost") return new URL(LOCAL_SITE_URL);
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return new URL(LOCAL_SITE_URL);
  }
}
