import { AdminConfigurationError } from "./config";
import { AdminRequestError } from "./policy";

const COMMON_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
} as const;

export function adminJson(
  body: unknown,
  status = 200,
  headers: HeadersInit = {},
): Response {
  return Response.json(body, {
    status,
    headers: { ...COMMON_HEADERS, ...Object.fromEntries(new Headers(headers)) },
  });
}

export async function readJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (contentType !== "application/json") {
    throw new AdminRequestError(415, "JSON_REQUIRED", "Envie os dados no formato JSON.");
  }
  const maximumBytes = 32 * 1_024;
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new AdminRequestError(413, "PAYLOAD_TOO_LARGE", "Os dados enviados são muito grandes.");
  }
  try {
    if (request.body === null) {
      throw new Error("empty body");
    }
    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    let total = 0;
    let text = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      total += chunk.value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new AdminRequestError(
          413,
          "PAYLOAD_TOO_LARGE",
          "Os dados enviados são muito grandes.",
        );
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof AdminRequestError) {
      throw error;
    }
    throw new AdminRequestError(400, "INVALID_JSON", "Não foi possível entender os dados enviados.");
  }
}

export function adminErrorResponse(error: unknown): Response {
  if (error instanceof AdminRequestError) {
    return adminJson({ error: { code: error.code, message: error.message } }, error.status);
  }
  if (error instanceof AdminConfigurationError) {
    return adminJson(
      { error: { code: "ADMIN_UNAVAILABLE", message: "Área administrativa indisponível." } },
      503,
    );
  }
  return adminJson(
    { error: { code: "ADMIN_INTERNAL_ERROR", message: "Não foi possível concluir a ação." } },
    500,
  );
}

export function unauthorizedResponse(): Response {
  return adminJson(
    { error: { code: "ADMIN_UNAUTHORIZED", message: "Entre novamente para continuar." } },
    401,
  );
}
