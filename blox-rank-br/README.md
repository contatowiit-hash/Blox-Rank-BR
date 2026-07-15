# Blox Rank BR

Backend central do Blox Rank BR, executado em Node.js 22. O mesmo processo mantém:

- a API REST Fastify usada pelo site;
- o bot `discord.js` conectado pelo Gateway;
- as regras de inscrições, aprovação, torneio, partidas e chaveamento;
- uma fila transacional para publicações e entrega do cargo no Discord.

Nenhum dado fictício é criado pelas migrations.

## Tecnologias

- Node.js 22
- TypeScript em modo `strict`
- Fastify 5
- discord.js 14
- PostgreSQL
- Zod
- Vitest

## Estrutura

```text
src/
  server.ts                   inicialização e encerramento seguro
  bot.ts                      cliente do Discord e dispatcher
  app.ts                      configuração do Fastify
  application-context.ts      composição de serviços e repositórios
  config/env.ts               validação das variáveis com Zod
  commands/                   comandos, handlers e embeds
  database/                   pool, transações e migrations
  repositories/               consultas PostgreSQL parametrizadas
  routes/                     rotas REST
  services/                   regras de negócio e worker do Discord
  utils/                      validação, sanitização e chaveamento
scripts/
  register-commands.ts        registro dos guild commands
  manage-tournament.ts        criação e fechamento operacional
tests/                        regras, API e schema PostgreSQL embutido
```

## Garantias importantes

- O header administrativo é comparado em tempo constante.
- `x-api-key`, `authorization`, cookies e `set-cookie` são redigidos nos logs.
- A criação pública tem limite de requisições próprio.
- CORS usa igualdade exata contra uma lista de origens.
- Discord IDs permanecem como texto; nunca são convertidos para número.
- Cada inscrição pertence a um torneio; duplicidade de Discord e nick Roblox é barrada por edição, inclusive sob concorrência.
- Aprovação, auditoria e fila do Discord são gravadas na mesma transação.
- Geração e resultado usam locks e constraints para impedir chave duplicada ou avanço duplo.
- As 15 partidas são criadas de uma vez e possuem posição estável no chaveamento.
- A fila do Discord usa `FOR UPDATE SKIP LOCKED`, idempotência e retentativas.
- O cliente do Discord usa somente o intent `Guilds`; Message Content Intent não é necessário.
- Menções do Discord ficam desativadas por padrão.

## Pré-requisitos

- Node.js `22.x`
- PostgreSQL 15 ou mais recente
- aplicação e bot criados no Discord Developer Portal
- servidor de testes do Discord

O bot precisa conseguir:

- ver e enviar mensagens nos canais configurados;
- inserir embeds;
- gerenciar o cargo de participante;
- ter seu cargo acima do cargo de participante na hierarquia.

O cargo de participante não pode ter permissões administrativas, de moderação, gerenciamento ou menção geral; o bot recusa iniciar se detectar uma configuração perigosa.

## Configuração local

1. Entre na pasta do backend:

   ```bash
   cd blox-rank-br
   ```

2. Instale exatamente as versões do lockfile:

   ```bash
   npm ci
   ```

3. Copie `.env.example` para `.env` e substitua todos os valores de exemplo.

4. Gere um segredo administrativo aleatório com pelo menos 32 caracteres. Nunca reutilize o token do bot.

5. Execute as migrations:

   ```bash
   npm run db:migrate
   ```

6. Registre os comandos no servidor de testes:

   ```bash
   npm run register:commands
   ```

7. Inicie API e bot:

   ```bash
   npm run dev
   ```

Em produção, use `npm run build` e `npm start`.

## Variáveis de ambiente

| Variável | Uso |
| --- | --- |
| `DATABASE_URL` | conexão privada com PostgreSQL |
| `DATABASE_SSL` | ativa TLS na conexão com o banco |
| `DATABASE_POOL_MAX` | máximo de conexões do processo |
| `DATABASE_*_TIMEOUT_MS` | limites de consulta, statement, lock e transação ociosa |
| `API_SECRET` | autentica rotas administrativas |
| `CORS_ORIGINS` | origens permitidas, separadas por vírgula |
| `TRUST_PROXY` | `false`, número de saltos ou lista de IPs/CIDRs confiáveis; `true` é rejeitado |
| `DISCORD_BOT_TOKEN` | token privado do bot |
| `DISCORD_APPLICATION_ID` | ID da aplicação |
| `DISCORD_GUILD_ID` | ID do servidor de testes |
| `DISCORD_STAFF_ROLE_ID` | único cargo aceito como staff |
| `DISCORD_PARTICIPANT_ROLE_ID` | cargo entregue após aprovação |
| `DISCORD_INSCRICOES_CHANNEL_ID` | canal das novas inscrições |
| `DISCORD_LOGS_CHANNEL_ID` | canal das ações administrativas |

Consulte [`.env.example`](./.env.example) para a lista completa. Não versione `.env`.

Não coloque `ssl`, `sslmode` ou outros parâmetros SSL em `DATABASE_URL`: eles são rejeitados para impedir que a URL sobrescreva `DATABASE_SSL` e desative TLS silenciosamente.
Quando `NODE_ENV=production`, tanto a migration quanto o servidor exigem `DATABASE_SSL=true`.

## Ciclo de um torneio

As migrations não inserem torneio automaticamente. Crie uma edição real informando o Discord ID do responsável:

```bash
npm run tournament:create -- --name "Nome da edição" --actor 123456789012345678
```

Esse comando cria um torneio de 16 vagas com inscrições abertas e registra auditoria. Depois de aprovar exatamente 16 pessoas, feche as inscrições:

```bash
npm run tournament:close -- --id UUID_DO_TORNEIO --actor 123456789012345678
```

Se a edição tiver sido fechada cedo demais, reabra antes de gerar qualquer partida:

```bash
npm run tournament:reopen -- --id UUID_DO_TORNEIO --actor 123456789012345678
```

Esse comando usa lock, registra auditoria e recusa a reabertura se o chaveamento já existir.

O backend pode então gerar a chave pela rota administrativa. O lançamento da final marca o campeão e encerra o torneio automaticamente.

Enquanto não houver uma nova edição aberta, o torneio recém-finalizado continua sendo o “atual” para que o resultado da final permaneça visível no site e no Discord.

Cada inscrição recebe automaticamente o `tournament_id` da edição com inscrições abertas. Os índices de duplicidade e a contagem dos 16 aprovados são isolados por torneio, portanto novas edições podem reutilizar jogadores sem apagar o histórico anterior.

## API REST

Todas as respostas usam JSON. Erros têm formato estável e não incluem stack trace, SQL ou configuração:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Confira os dados informados.",
    "requestId": "id-da-requisicao"
  }
}
```

### Rotas públicas

| Método | Rota | Finalidade |
| --- | --- | --- |
| `POST` | `/api/inscricoes` | criar inscrição enquanto estiverem abertas |
| `GET` | `/api/torneios/atual` | ver o torneio atual |
| `GET` | `/api/torneios/atual/chaveamento` | ver chave e resultados públicos |
| `GET` | `/health` | verificar API e banco |

Exemplo de inscrição:

```json
{
  "roblox_username": "Jogador_BR",
  "discord_user_id": "123456789012345678",
  "discord_username": "Jogador Legal",
  "level": 2550,
  "bounty_honor": 30000000,
  "faction": "pirate",
  "platform": "pc",
  "main_fruit": "Dragon"
}
```

### Rotas administrativas

| Método | Rota | Finalidade |
| --- | --- | --- |
| `GET` | `/api/inscricoes?page=1&limit=25&status=pending&tournament_id=<uuid>` | listar inscrições com paginação e filtro opcional por edição |
| `GET` | `/api/inscricoes/:id` | ver uma inscrição |
| `PATCH` | `/api/inscricoes/:id/status` | aprovar ou recusar |
| `POST` | `/api/torneios/:id/gerar-chaveamento` | criar a chave de 16 participantes |
| `POST` | `/api/partidas/:id/resultado` | registrar placar e avançar vencedor |

Todas exigem `X-API-Key`. As três rotas que alteram dados também exigem `X-Discord-User-Id` com o ID do responsável autenticado pelo sistema que faz a chamada.

Aprovação:

```json
{ "status": "approved" }
```

Recusa:

```json
{ "status": "rejected", "rejection_reason": "Motivo explicado para a equipe" }
```

Resultado:

```json
{ "player_one_score": 3, "player_two_score": 1 }
```

Empates, placares negativos, campos desconhecidos, UUIDs inválidos e alterações de estado conflitantes são rejeitados. Repetir uma aprovação já concluída não muda o cadastro; apenas solicita nova tentativa de entregar o cargo.

### Integração com Base44

`API_SECRET` nunca pode estar no JavaScript, em variável pública ou em qualquer tela do Base44. CORS não protege um segredo exposto.

- O navegador pode chamar somente as rotas públicas.
- Rotas administrativas devem passar por uma função/backend seguro do Base44.
- Essa função deve autenticar o membro da equipe, conferir a autorização e só então enviar `X-API-Key` e `X-Discord-User-Id` ao backend.
- `X-Discord-User-Id` é uma informação de auditoria confiada ao backend do Base44; nunca aceite esse valor diretamente do navegador.
- Nunca retorne esses headers ao navegador.

O formulário público não prova sozinho que a pessoa controla o Discord ou o nick Roblox informado. A equipe deve confirmar a identidade antes de aprovar. Uma inscrição recusada libera novamente aquele Discord/nick na mesma edição. Para eliminar essa verificação manual, integre Discord OAuth e uma verificação oficial do Roblox antes de remover a etapa humana.

## Chaveamento

Para gerar a chave, o torneio precisa estar com inscrições fechadas e ter exatamente 16 aprovados. A ordenação é por Bounty/Honor decrescente, seguida por data e UUID para desempate determinístico.

A primeira rodada usa esta distribuição:

```text
1×16, 8×9, 4×13, 5×12, 2×15, 7×10, 3×14, 6×11
```

Assim, os maiores seeds ficam separados e os seeds 1 e 2 só podem se encontrar na final. Gerar novamente retorna conflito. Registrar o mesmo placar novamente é idempotente; tentar substituir por outro placar retorna conflito.

## Comandos do Discord

- `/inscricoes` — lista até 100 pendentes em mensagens privadas; somente staff.
- `/inscrever jogador:@usuário faccao:<opção> plataforma:<opção>` — abre um formulário para nick Roblox, level, Bounty/Honor e fruta. O Bounty/Honor aceita o número completo ou milhões abreviados, como `5m`, `20m` e `2,5m`. Ao enviar, o backend grava uma inscrição `pending` no PostgreSQL, registra o responsável em `audit_logs` e publica o card de análise pelo outbox; somente staff.
- `/aprovar` e `/recusar` — a equipe pode marcar `jogador:@usuário` ou pesquisar `inscricao` pelo nick Roblox/nome Discord; o UUID fica somente como valor interno do autocomplete. Apenas inscrições pendentes do torneio atual aparecem e a decisão revalida o estado no banco. Os botões da nova inscrição executam as mesmas regras e a recusa por botão usa modal.
- `/resultado` — oferece somente partidas pendentes/jogáveis no autocomplete, registra o placar e avança o vencedor; somente staff; resposta privada.
- `/torneio` — resume status, limite e totais de inscrições por situação.
- `/abrir-inscricoes`, `/fechar-inscricoes` e `/gerar-chaveamento` — atuam sempre no torneio atual; somente staff.
- `/participantes` e `/chaveamento` — publicam os dados do torneio atual sem pedir códigos técnicos.
- `/ping` — mostra latência do bot e disponibilidade do sistema.

A autorização usa exclusivamente `DISCORD_STAFF_ROLE_ID`. Nome do cargo, nome do usuário e permissão genérica de administrador não substituem esse ID.

O comando de registro usa um `PUT` na coleção de guild commands e substitui os comandos dessa aplicação no servidor configurado. Use uma aplicação dedicada ao Blox Rank BR.

## Fila do Discord

Uma mutação no banco não é desfeita quando o Discord está temporariamente indisponível. Publicações e entrega de cargo são persistidas em `discord_outbox`, processadas pelo bot e repetidas com backoff por até 100 tentativas.

O banco é a fonte de verdade. Se o cargo demorar, a aprovação continua registrada e a fila tentará novamente. Mensagens usam nonce estável para reduzir duplicações, cargos são idempotentes e o payload da fila é apagado ao concluir ou esgotar as tentativas. Os logs nunca armazenam token ou payload bruto de interação.

## Docker

O container compila em uma etapa separada, executa como usuário sem privilégios, aplica migrations antes de iniciar e possui health check.

```bash
docker build -t blox-rank-br .
docker run --env-file .env -e NODE_ENV=production -p 3000:3000 blox-rank-br
```

O PostgreSQL deve estar em serviço próprio e acessível pela `DATABASE_URL` do container.

Os CLIs também são compilados na imagem, sem `tsx` ou dependências de desenvolvimento. Em um container em execução, use os scripts com sufixo `:prod`:

```bash
docker exec NOME_DO_CONTAINER npm run tournament:create:prod -- --name "Nome da edição" --actor 123456789012345678
docker exec NOME_DO_CONTAINER npm run tournament:close:prod -- --id UUID_DO_TORNEIO --actor 123456789012345678
docker exec NOME_DO_CONTAINER npm run tournament:reopen:prod -- --id UUID_DO_TORNEIO --actor 123456789012345678
```

## Validação

```bash
npm run typecheck
npm test
npm run build
npm audit
```

Os testes não precisam de credenciais nem conexão com o Discord. A migration e suas constraints também são executadas por um PostgreSQL real em WebAssembly durante a suíte. Ainda valide o deploy em um PostgreSQL de homologação, com a mesma versão e configuração da produção.

## Operação segura

- Rotacione imediatamente qualquer segredo que apareça em log, commit ou frontend.
- Dê ao usuário do banco apenas os privilégios necessários neste schema.
- Mantenha `TRUST_PROXY=false` até conhecer o proxy. Depois informe apenas a quantidade de saltos controlados ou os IPs/CIDRs confiáveis; nunca use `true`.
- Monitore mensagens `discord_outbox` em estado `failed`.
- O rate limit padrão é local ao processo. Antes de usar várias réplicas, configure um store compartilhado compatível com `@fastify/rate-limit`.
- Não altere uma migration que já tenha sido aplicada; o runner verifica checksum.
- Faça backup antes de evoluções de schema.
