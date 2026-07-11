declare interface Fetcher {
  fetch(input: Request | string | URL, init?: RequestInit): Promise<Response>;
}

// Runtime type supplied by Cloudflare; kept broad so local TypeScript can build.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare type D1Database = any;

declare module "cloudflare:workers" {
  export const env: { DB: D1Database };
}
