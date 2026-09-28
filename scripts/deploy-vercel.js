#!/usr/bin/env node
/* Deploy de produção na Vercel (build + deploy ou hook). */

const { spawnSync } = require("child_process");
const path = require("path");
const { loadEnv } = require("./load-env");

const raiz = path.join(__dirname, "..");
loadEnv(raiz);

function run(cmd, args, extraEnv = {}) {
  const r = spawnSync(cmd, args, {
    cwd: raiz,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
    shell: process.platform === "win32"
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

async function deployHook(url) {
  const res = await fetch(url, { method: "POST" });
  const body = await res.text();
  if (!res.ok) {
    console.error("Deploy hook falhou:", res.status, body.slice(0, 400));
    process.exit(1);
  }
  console.log("Deploy disparado via hook da Vercel.");
  try {
    const json = JSON.parse(body);
    if (json?.job?.url) console.log("Acompanhe:", json.job.url);
  } catch {
    /* resposta não-JSON */
  }
}

async function main() {
  console.log("▸ Build…");
  run("npm", ["run", "build"]);

  const hook = process.env.VERCEL_DEPLOY_HOOK?.trim();
  if (hook) {
    await deployHook(hook);
    return;
  }

  const token = process.env.VERCEL_TOKEN?.trim();
  const vercelArgs = ["vercel", "--prod", "--yes"];
  if (token) vercelArgs.splice(1, 0, "--token", token);

  const whoami = spawnSync("npx", ["vercel", "whoami"], {
    cwd: raiz,
    encoding: "utf8",
    env: { ...process.env, ...(token ? { VERCEL_TOKEN: token } : {}) }
  });

  const logado =
    whoami.status === 0 &&
    whoami.stdout &&
    !/logged out/i.test(whoami.stdout) &&
    !/not logged in/i.test(whoami.stderr || "");

  if (!logado && !token) {
    console.error(`
Não há sessão da Vercel CLI nesta máquina.

Opção 1 (recomendada): push no GitHub — o deploy automático já funciona:
  git push origin main

Opção 2: token no .env (https://vercel.com/account/tokens):
  VERCEL_TOKEN=...

Opção 3: hook de deploy (Vercel → Project → Settings → Git → Deploy Hooks):
  VERCEL_DEPLOY_HOOK=https://api.vercel.com/v1/integrations/deploy/...

Opção 4: login uma vez no Terminal (fora do agente):
  npx vercel login
  npm run deploy
`);
    process.exit(1);
  }

  console.log("▸ Deploy produção…");
  run("npx", vercelArgs);
  console.log("▸ Concluído.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
