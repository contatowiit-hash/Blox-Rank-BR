# Autenticação administrativa

Esta camada roda somente no servidor. Configure:

- `ADMIN_PASSWORD_HASH`: `hmac-sha256$<hmac-base64url>`; gerado com a senha e o `SESSION_SECRET`, sem guardar a senha em texto puro.
- `ADMIN_DISCORD_ID`: ID fixo do responsável, usado somente no servidor para auditoria.
- `SESSION_SECRET`: segredo aleatório exclusivo, com pelo menos 32 caracteres.
- `API_BASE_URL`: origem HTTPS do backend, sem caminho, query ou credenciais. HTTP só é aceito em localhost.
- `API_ADMIN_TOKEN`: valor enviado pelo servidor no header `X-API-Key`; nunca use uma variável `NEXT_PUBLIC_*`.

Gere o hash pelo comando `npm run admin:hash`. Ele lê a senha sem exibi-la e usa PBKDF2-HMAC-SHA-256 com 310.000 iterações.

O login recebe somente `password`. O Discord ID configurado no servidor fica dentro da sessão assinada e é a única fonte usada para `X-Discord-User-Id`; valores enviados em payloads posteriores são descartados. Alterar o `SESSION_SECRET` exige gerar novamente o `ADMIN_PASSWORD_HASH`.

A sessão é stateless e expira em oito horas. Logout remove o cookie do navegador, mas não revoga uma cópia roubada antes da expiração. Para revogação imediata ou várias réplicas com rate limit centralizado, use um armazenamento compartilhado de sessões/tentativas.
