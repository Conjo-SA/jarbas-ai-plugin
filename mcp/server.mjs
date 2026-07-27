#!/usr/bin/env node
/**
 * Servidor MCP (stdio, JSON-RPC 2.0) do jarbas-ai-plugin.
 *
 * Expoe ao Claude Code as ferramentas que executam o modelo externo definido em
 * config.json. O modelo padrao do Claude Code continua orquestrando; a geracao
 * de codigo e delegada por aqui.
 *
 * Regras: nada alem de JSON-RPC vai para stdout. Logs vao para stderr.
 */
import { createInterface } from "node:readline";
import { callModel, describeSetup } from "../lib/endpoint.mjs";

const SERVER_NAME = "jarbas";
const SERVER_VERSION = "0.1.0";
const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const IMPLEMENT_SYSTEM = `Voce e o motor de implementacao de um agente de codigo.
Recebe uma tarefa ja analisada e o contexto relevante do repositorio.

Regras:
- Produza codigo pronto para uso, completo e coerente com o contexto recebido.
- Siga estritamente as convencoes, estilo e bibliotecas presentes no contexto.
- Nao invente APIs, arquivos ou dependencias que nao aparecam no contexto.
- Para cada arquivo, use o formato:

### FILE: caminho/relativo/do/arquivo.ext
\`\`\`<linguagem>
<conteudo completo do arquivo, ou apenas o trecho quando indicado>
\`\`\`

- Depois dos arquivos, escreva "### NOTES" com premissas, riscos e pendencias.
- Se faltar informacao critica, escreva "### BLOCKED" e liste o que falta em vez de adivinhar.
- Nao adicione funcionalidades alem do pedido.`;

const REVIEW_SYSTEM = `Voce e revisor de codigo senior. Analise o material recebido e responda em secoes:
### BLOCKERS (bugs, falhas de seguranca OWASP Top 10, quebra de contrato)
### RISCOS (efeitos colaterais, casos nao tratados)
### SUGESTOES (melhorias objetivas)
Cite arquivo e trecho. Se nada for encontrado em uma secao, escreva "nenhum".
Nao reescreva o codigo inteiro; aponte a correcao minima.`;

const TOOLS = [
    {
        name: "implement",
        title: "Implementar com o modelo externo",
        description:
            "Delega a ESCRITA de codigo ao modelo externo configurado em config.json. " +
            "Use sempre que for gerar ou alterar codigo. Envie a tarefa ja decomposta e o " +
            "contexto relevante (trechos de arquivos, convencoes, assinaturas). " +
            "Retorna os arquivos no formato '### FILE: <caminho>' para voce aplicar com Write/Edit.",
        inputSchema: {
            type: "object",
            properties: {
                task: {
                    type: "string",
                    description: "Descricao precisa e autocontida do que deve ser implementado.",
                },
                context: {
                    type: "string",
                    description:
                        "Contexto do repositorio: trechos de arquivos, interfaces, convencoes, " +
                        "erros de build/teste. Quanto mais especifico, melhor o resultado.",
                },
                constraints: {
                    type: "string",
                    description: "Restricoes obrigatorias: linguagem, framework, estilo, o que NAO fazer.",
                },
                max_tokens: { type: "integer", description: "Limite de tokens de saida (default 4096)." },
            },
            required: ["task"],
        },
    },
    {
        name: "review",
        title: "Revisar codigo com o modelo externo",
        description:
            "Envia codigo ou diff ao modelo externo para revisao (bugs, seguranca, riscos). " +
            "Use apos aplicar mudancas relevantes.",
        inputSchema: {
            type: "object",
            properties: {
                code: { type: "string", description: "Codigo ou diff a revisar." },
                goal: { type: "string", description: "O que a mudanca deveria alcancar." },
                max_tokens: { type: "integer" },
            },
            required: ["code"],
        },
    },
    {
        name: "status",
        title: "Status da configuracao",
        description:
            "Mostra qual config.json esta em uso, modelo, URL efetiva e a origem da chave " +
            "(sem revelar o segredo). Use para diagnosticar erros de autenticacao ou rota.",
        inputSchema: { type: "object", properties: {} },
    },
];

function send(message) {
    process.stdout.write(JSON.stringify(message) + "\n");
}

function reply(id, result) {
    if (id === undefined || id === null) return;
    send({ jsonrpc: "2.0", id, result });
}

function replyError(id, code, message) {
    if (id === undefined || id === null) return;
    send({ jsonrpc: "2.0", id, error: { code, message } });
}

function textResult(text, isError = false) {
    return { content: [{ type: "text", text }], isError };
}

async function runTool(name, args = {}) {
    if (name === "status") {
        const info = describeSetup();
        const lines = [
            `config.json : ${info.config ?? "(nao encontrado)"}`,
            `modelo      : ${info.model ?? "-"}`,
            `apiType     : ${info.apiType ?? "-"}`,
            `URL efetiva : ${info.url ?? "-"}`,
            `chave       : ${info.key ?? "NAO CONFIGURADA"}`,
        ];
        if (info.errors.length) lines.push("", "Problemas:", ...info.errors.map((e) => `- ${e}`));
        return textResult(lines.join("\n"), info.errors.length > 0);
    }

    if (name === "implement") {
        if (!args.task || typeof args.task !== "string") {
            return textResult("Parametro obrigatorio 'task' ausente.", true);
        }
        const parts = [`## TAREFA\n${args.task}`];
        if (args.constraints) parts.push(`## RESTRICOES\n${args.constraints}`);
        if (args.context) parts.push(`## CONTEXTO DO REPOSITORIO\n${args.context}`);
        const out = await callModel({
            system: IMPLEMENT_SYSTEM,
            user: parts.join("\n\n"),
            maxTokens: args.max_tokens,
            temperature: 0.2,
        });
        const footer = `\n\n---\n[${out.model} @ ${out.url}]`;
        return textResult((out.text || "(resposta vazia do modelo)") + footer);
    }

    if (name === "review") {
        if (!args.code || typeof args.code !== "string") {
            return textResult("Parametro obrigatorio 'code' ausente.", true);
        }
        const user = [args.goal ? `## OBJETIVO\n${args.goal}` : null, `## CODIGO\n${args.code}`]
            .filter(Boolean)
            .join("\n\n");
        const out = await callModel({
            system: REVIEW_SYSTEM,
            user,
            maxTokens: args.max_tokens,
            temperature: 0.1,
        });
        return textResult(out.text || "(resposta vazia do modelo)");
    }

    return textResult(`Ferramenta desconhecida: ${name}`, true);
}

async function handle(message) {
    const { id, method, params } = message;

    switch (method) {
        case "initialize": {
            const requested = params?.protocolVersion;
            const protocolVersion = SUPPORTED_PROTOCOLS.includes(requested)
                ? requested
                : SUPPORTED_PROTOCOLS[0];
            reply(id, {
                protocolVersion,
                capabilities: { tools: { listChanged: false } },
                serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
            });
            return;
        }
        case "notifications/initialized":
        case "notifications/cancelled":
            return;
        case "ping":
            reply(id, {});
            return;
        case "tools/list":
            reply(id, { tools: TOOLS });
            return;
        case "tools/call": {
            const name = params?.name;
            try {
                reply(id, await runTool(name, params?.arguments || {}));
            } catch (err) {
                reply(id, textResult(`Erro em '${name}': ${err.message}`, true));
            }
            return;
        }
        default:
            replyError(id, -32601, `Metodo nao suportado: ${method}`);
    }
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let message;
    try {
        message = JSON.parse(trimmed);
    } catch {
        send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON invalido" } });
        return;
    }
    handle(message).catch((err) => {
        process.stderr.write(`[jarbas] erro nao tratado: ${err?.stack || err}\n`);
        replyError(message?.id, -32603, String(err?.message || err));
    });
});

rl.on("close", () => process.exit(0));
