import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renderiza o painel financeiro principal", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="pt-BR">/i);
  assert.match(html, /<title>NuBank — sua vida financeira<\/title>/i);
  assert.match(html, /Saldo em conta/);
  assert.match(html, /Área Pix e Transferir/);
  assert.match(html, /Editar/);
  assert.match(html, /Demonstração visual/);
});

test("entrega metadados sociais e controles acessíveis", async () => {
  const html = await (await render()).text();
  assert.match(html, /property="og:image" content="\/og.png"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /Perfil de João Silva/);
  assert.match(html, /aria-label="Atalhos"/);
});
