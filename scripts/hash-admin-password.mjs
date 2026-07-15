import { createHmac } from "node:crypto";

const MIN_PASSWORD_LENGTH = 10;

async function readHidden(label) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("Execute este comando em um terminal interativo.");
  }

  process.stdout.write(label);
  process.stdin.setEncoding("utf8");
  process.stdin.setRawMode(true);
  process.stdin.resume();

  return new Promise((resolve, reject) => {
    let value = "";
    const finish = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      process.stdout.write("\n");
      resolve(value);
    };
    const onData = (input) => {
      if (input === "\u0003") {
        process.stdin.setRawMode(false);
        process.stdout.write("\n");
        reject(new Error("Operação cancelada."));
        return;
      }
      if (input === "\r" || input === "\n") {
        finish();
        return;
      }
      if (input === "\u007f" || input === "\b") {
        if (value.length > 0) {
          value = value.slice(0, -1);
          process.stdout.write("\b \b");
        }
        return;
      }
      if (/^[^\u0000-\u001f\u007f]+$/.test(input)) {
        value += input;
        process.stdout.write("*".repeat([...input].length));
      }
    };
    process.stdin.on("data", onData);
  });
}

try {
  const password = await readHidden("Digite a senha administrativa: ");
  const confirmation = await readHidden("Confirme a senha: ");
  if (password !== confirmation) throw new Error("As senhas não coincidem.");
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Use uma senha com pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  const sessionSecret = await readHidden("Digite o SESSION_SECRET: ");
  if (sessionSecret.length < 32) {
    throw new Error("O SESSION_SECRET precisa ter pelo menos 32 caracteres.");
  }
  const hash = createHmac("sha256", sessionSecret).update(password, "utf8").digest("base64url");
  process.stdout.write(
    `ADMIN_PASSWORD_HASH=hmac-sha256$${hash}\n`,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : "Não foi possível gerar o hash.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
