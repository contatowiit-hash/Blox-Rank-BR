# Blox Rank BR — site oficial

Frontend público e painel administrativo da liga comunitária Blox Rank BR. O site roda como aplicação full-stack no Cloudflare Worker por meio de vinext: o navegador conversa somente com rotas do próprio site, e essas rotas validam e encaminham os dados para a API Fastify.

> O Blox Rank BR é uma liga comunitária criada por fãs e não possui vínculo oficial com Roblox ou Blox Fruits.

## Arquitetura

```text
Navegador
  ├─ páginas públicas e formulário
  └─ painel administrativo (cookie HttpOnly)
        ↓ mesma origem
Cloudflare Worker / vinext
  ├─ /api/public/*  → cliente público e resposta sanitizada
  ├─ /api/admin/*   → sessão assinada + API_ADMIN_TOKEN server-side
  └─ filtros que removem Discord ID da lista pública
        ↓ HTTPS
API Fastify no Render
        ↓
PostgreSQL no Neon + bot do Discord
```

O backend permanece independente em `blox-rank-br/`. O site usa a estrutura web já existente na raiz porque ela já fornece React, TypeScript, Tailwind, vinext e execução em Cloudflare. Não foi necessário criar `blox-rank-web/`.

Diretórios principais:

- `app/`: páginas, componentes e route handlers.
- `app/lib/api/`: schemas Zod, clientes da API, erros e sanitização.
- `app/lib/auth/`: PBKDF2, sessão HMAC, cookies, rate limit e políticas administrativas.
- `app/api/public/`: proxy público e projeção segura de participantes.
- `app/api/admin/`: login, sessão e proxy administrativo protegido.
- `worker/`: entrada do Cloudflare Worker e cabeçalhos de segurança.
- `tests/`: testes unitários e de interface com mocks; nunca chamam produção.
- `public/`: favicon, cartão social e espaço para a logo.

## Rotas do site

Públicas:

- `/`
- `/como-funciona`
- `/torneio`
- `/chaveamento`
- `/participantes`
- `/regras`
- `/parceiros`
- `/faq`
- `/inscricao`

Administrativas:

- `/admin/login`
- `/admin`
- `/admin/inscricoes`
- `/admin/torneios`
- `/admin/chaveamento`
- `/admin/partidas`
- `/admin/parceiros`
- `/admin/configuracoes`

As telas de parceiros e configurações informam quando a API não oferece uma ação. O frontend não simula abrir/fechar inscrições, logs ou cadastro de parceiros.

## Contratos reais utilizados

Backend padrão: `https://blox-rank-br-2.onrender.com`.

| Método | Backend | Uso no site |
| --- | --- | --- |
| `GET` | `/health` | disponibilidade |
| `POST` | `/api/inscricoes` | criar inscrição |
| `GET` | `/api/inscricoes` | lista administrativa e projeção pública aprovada |
| `GET` | `/api/inscricoes/:id` | detalhe administrativo |
| `PATCH` | `/api/inscricoes/:id/status` | aprovar/recusar |
| `GET` | `/api/torneios/atual` | torneio atual |
| `GET` | `/api/torneios/atual/chaveamento` | chaveamento e resultados |
| `POST` | `/api/torneios/:id/gerar-chaveamento` | gerar chaveamento |
| `POST` | `/api/partidas/:id/resultado` | registrar placar |

Chamadas administrativas recebem `X-API-Key` e `X-Discord-User-Id` somente no Worker. A listagem pública de participantes consulta apenas aprovados e devolve uma whitelist sem qualquer campo do Discord.

## Variáveis de ambiente

Copie `.env.example` para `.env.local` durante o desenvolvimento:

```powershell
Copy-Item .env.example .env.local
```

| Variável | Obrigatória | Finalidade |
| --- | --- | --- |
| `API_BASE_URL` | sim | origem HTTPS do backend, sem caminho ou barra adicional |
| `API_ADMIN_TOKEN` | sim | mesmo segredo configurado como `API_SECRET` no backend |
| `ADMIN_PASSWORD_HASH` | sim | HMAC da senha do painel, vinculada ao `SESSION_SECRET` |
| `ADMIN_DISCORD_ID` | sim | ID do Discord usado internamente nos registros de auditoria |
| `SESSION_SECRET` | sim | assinatura de sessão; mínimo de 32 caracteres aleatórios |
| `PUBLIC_SITE_URL` | produção | origem canônica final do site |
| `PUBLIC_DISCORD_URL` | não | convite oficial HTTPS |
| `PUBLIC_TIKTOK_URL` | não | perfil oficial HTTPS |
| `PUBLIC_YOUTUBE_URL` | não | canal oficial HTTPS |

Nunca use o token do backend, a senha ou o segredo de sessão em variáveis `NEXT_PUBLIC_*`. Não coloque valores reais no repositório.

Gere o hash da senha sem mostrá-la no terminal:

```powershell
npm run admin:hash
```

O comando solicita e confirma a senha e também solicita o `SESSION_SECRET`, sempre de forma mascarada. Copie apenas o resultado `ADMIN_PASSWORD_HASH` para o ambiente do Worker. Alterar o `SESSION_SECRET` exige gerar novamente esse hash.

## Instalação e execução local

Requisitos: Node.js 22.13 ou superior.

```powershell
npm ci
npm run dev
```

Abra a URL exibida pelo servidor, normalmente `http://localhost:5173`.

Validação completa:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm audit
```

## Painel administrativo

1. Configure as cinco variáveis privadas (`API_BASE_URL`, `API_ADMIN_TOKEN`, `ADMIN_PASSWORD_HASH`, `ADMIN_DISCORD_ID` e `SESSION_SECRET`).
2. Abra `/admin/login`.
3. Informe somente a senha; o Discord ID usado na auditoria vem de `ADMIN_DISCORD_ID` no servidor.
4. O servidor valida a senha e cria uma sessão assinada de 8 horas em cookie `HttpOnly`, `SameSite=Strict` e `Secure` em produção.
5. Todas as mutações usam o Discord ID fixado na sessão para auditoria no backend.

O rate limit de login é uma proteção local por instância do Worker. Para uma operação maior, complemente com Cloudflare WAF/Rate Limiting na rota `/api/admin/login`.

## Logo, parceiros e links sociais

Adicione a logo oficial em:

```text
public/logo-brb.png
```

Enquanto o arquivo não existir, o cabeçalho mostra o placeholder textual `BRB`. Prefira PNG com fundo transparente e área segura quadrada.

Parceiros ficam em `app/content/partners.ts`. A lista começa vazia para não inventar pessoas ou marcas. Adicione somente parceiros confirmados.

Links sociais são configurados pelas variáveis `PUBLIC_*`; não exigem rebuild quando definidos no ambiente de execução.

## CORS no backend Render

O navegador atual usa o proxy de mesma origem, portanto a chave administrativa nunca depende de CORS. Ainda assim, mantenha no backend somente origens conhecidas.

Desenvolvimento:

```env
CORS_ORIGINS=http://localhost:5173
```

Produção:

```env
CORS_ORIGINS=https://SEU-DOMINIO-FINAL
```

Durante uma migração, as duas origens podem ser separadas por vírgula. Nunca configure `*`. Após conhecer o domínio Cloudflare final, substitua `SEU-DOMINIO-FINAL` pela origem exata, sem caminho e sem barra final.

## Publicação no Cloudflare

O projeto contém `.openai/hosting.json`, `vite.config.ts` com o plugin Sites e `worker/index.ts`. Para publicar:

1. Execute localmente todas as validações.
2. Configure as variáveis no ambiente secreto do projeto Cloudflare/Sites, nunca no bundle.
3. Defina `PUBLIC_SITE_URL` com o domínio final HTTPS.
4. Gere uma build com `npm run build`.
5. Publique usando o fluxo de hosting/Sites conectado a este workspace ou conecte o repositório ao projeto Worker correspondente.
6. Confirme `/`, `/api/public/health`, `/admin/login`, `robots.txt` e `sitemap.xml` no domínio final.
7. Atualize `CORS_ORIGINS` no Render para o domínio final e faça novo deploy do backend apenas se a configuração mudou.

Não publique como site estático: autenticação, cookies e proxies dependem do Worker server-side.

## Backend no Render

O backend não precisa ser modificado para o site. Mantenha `https://blox-rank-br-2.onrender.com` saudável, `API_SECRET` igual ao `API_ADMIN_TOKEN` do Worker e `DATABASE_SSL=true` para o Neon.

Há um cuidado operacional: como inscrições passam pelo proxy, o backend pode enxergar um IP de saída compartilhado do Worker. O limite de inscrições do Fastify pode, em alto tráfego, ser compartilhado entre visitantes. Não confie em `X-Forwarded-For` enviado pelo navegador; alinhe um cabeçalho assinado entre proxies ou aplique rate limit por visitante na borda antes de aumentar o tráfego.

## Segurança

- Nenhum segredo é enviado ao JavaScript público ou salvo em `localStorage`.
- Respostas administrativas usam `no-store`.
- Mutações exigem sessão válida e origem igual para reduzir CSRF.
- A senha é verificada com PBKDF2-SHA-256 e comparação em tempo constante.
- Sessões são assinadas por HMAC e expiram em 8 horas.
- Conteúdo de entrada é validado e normalizado com Zod.
- Discord IDs nunca aparecem na listagem pública.
- Cabeçalhos bloqueiam framing, sniffing e permissões desnecessárias.

## API suspensa no Render

Se o backend estiver despertando, as páginas mantêm o conteúdo estrutural, mostram que o servidor pode levar alguns segundos e oferecem nova tentativa. Nenhuma tela fica vazia ou expõe stack trace.
