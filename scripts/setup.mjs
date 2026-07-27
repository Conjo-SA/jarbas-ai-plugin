#!/usr/bin/env node
/**
 * Setup interativo: guarda a chave de acesso ao modelo externo.
 *
 * Rode NO SEU TERMINAL (a chave nao deve passar pelo chat):
 *   node scripts/setup.mjs
 *
 * Opcoes:
 *   --from-env VAR   le a chave da variavel de ambiente VAR (sem digitar)
 *   --stdin          le a chave da entrada padrao (ex: pipe de um cofre)
 *   --url URL        sobrescreve a URL base do endpoint (perfil do usuario)
 *   --model ID       sobrescreve o id do modelo (perfil do usuario)
 *   --remove         apaga as credenciais salvas
 *   --no-test        nao faz a chamada de verificacao
 */
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { callModel, credentialsPath, describeSetup, jarbasHome, loadConfig } from "../lib/endpoint.mjs";

function parseArgs(argv) {
    const args = { test: true };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--from-env") args.fromEnv = argv[++i];
        else if (arg === "--stdin") args.stdin = true;
        else if (arg === "--url") args.url = argv[++i];
        else if (arg === "--model") args.model = argv[++i];
        else if (arg === "--remove") args.remove = true;
        else if (arg === "--no-test") args.test = false;
    }
    return args;
}

function askHidden(question) {
    return new Promise((resolve) => {
        const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
        let muted = false;
        rl._writeToOutput = function (chunk) {
            if (!muted) rl.output.write(chunk);
        };
        rl.question(question, (answer) => {
            rl.close();
            // Solta o stdin: sem isso o Node pode abortar no exit (libuv/Windows).
            if (process.stdin.isTTY && process.stdin.setRawMode) process.stdin.setRawMode(false);
            process.stdin.pause();
            process.stdin.unref();
            process.stdout.write("\n");
            resolve(answer);
        });
        muted = true;
    });
}

function readStdin() {
    return new Promise((resolve) => {
        let data = "";
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", (chunk) => (data += chunk));
        process.stdin.on("end", () => resolve(data));
    });
}

function saveCredentials(apiKey) {
    const home = jarbasHome();
    mkdirSync(home, { recursive: true, mode: 0o700 });
    const path = credentialsPath();
    writeFileSync(path, JSON.stringify({ apiKey, savedAt: new Date().toISOString() }, null, 2), {
        mode: 0o600,
    });
    try {
        chmodSync(path, 0o600);
    } catch {
        /* Windows ignora permissoes POSIX */
    }
    return path;
}

function saveProfileOverrides({ url, model }) {
    if (!url && !model) return null;
    const { provider } = loadConfig();
    const base = JSON.parse(JSON.stringify(provider));
    if (url) {
        base.name = url;
        base.models = base.models.map((m) => ({ ...m, url }));
    }
    if (model) {
        base.models = [{ ...base.models[0], id: model, name: model }];
    }
    base.apiKey = "${env:JARBAS_API_KEY}";
    const path = join(jarbasHome(), "config.json");
    mkdirSync(jarbasHome(), { recursive: true, mode: 0o700 });
    writeFileSync(path, JSON.stringify(base, null, 2));
    return path;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));

    if (args.remove) {
        const path = credentialsPath();
        if (existsSync(path)) {
            rmSync(path);
            console.log(`Credenciais removidas: ${path}`);
        } else {
            console.log("Nenhuma credencial salva.");
        }
        return 0;
    }

    const overridePath = saveProfileOverrides(args);
    if (overridePath) console.log(`Perfil do usuario gravado em ${overridePath}`);

    const info = describeSetup();
    console.log("");
    console.log("jarbas-ai-plugin — configuracao do modelo de implementacao");
    console.log(`  config : ${info.config ?? "(nao encontrado)"}`);
    console.log(`  modelo : ${info.model ?? "-"}`);
    console.log(`  URL    : ${info.url ?? "-"}`);
    console.log("");

    let apiKey;
    if (args.fromEnv) {
        apiKey = process.env[args.fromEnv];
        if (!apiKey) {
            console.error(`ERRO: variavel de ambiente ${args.fromEnv} vazia ou inexistente.`);
            return 2;
        }
    } else if (args.stdin || !process.stdin.isTTY) {
        apiKey = (await readStdin()).trim();
    } else {
        apiKey = (await askHidden("Cole a API key do endpoint (nao sera exibida): ")).trim();
    }

    if (!apiKey) {
        console.error("ERRO: nenhuma chave informada.");
        return 2;
    }

    const path = saveCredentials(apiKey);
    console.log(`Chave gravada em ${path} (permissao 600).`);
    console.log("Esse arquivo fica FORA do repositorio e nunca e commitado.");

    if (!args.test) return 0;

    console.log("\nTestando o endpoint...");
    try {
        const out = await callModel({
            user: "Responda apenas com a palavra: pong",
            maxTokens: 32,
            temperature: 0,
            timeoutMs: 60000,
        });
        console.log(`OK — ${out.model} respondeu: ${String(out.text).trim().slice(0, 120)}`);
        return 0;
    } catch (err) {
        console.error(`FALHA no teste: ${err.message}`);
        if (/HTTP 429|No deployments available/i.test(err.message)) {
            console.error(
                "\nIsso e indisponibilidade TEMPORARIA do gateway (modelo em cooldown ou rate limit),\n" +
                "nao um problema da chave: a autenticacao passou. Sua chave esta salva.\n" +
                "Aguarde alguns segundos e rode: node scripts/doctor.mjs"
            );
        } else {
            console.error("A chave foi salva. Rode 'node scripts/doctor.mjs' para diagnosticar.");
        }
        return 1;
    }
}

const exitCode = await main();
process.exitCode = exitCode;
