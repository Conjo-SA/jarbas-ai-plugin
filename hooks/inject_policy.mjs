#!/usr/bin/env node
/**
 * UserPromptSubmit hook: injeta a politica de delegacao em todo turno.
 *
 * Isso e o que faz o plugin ser invocado NATIVAMENTE: o usuario escreve
 * "crie uma pagina de vendas" e o Claude Code ja sabe que deve esclarecer,
 * planejar e delegar ao modelo externo, sem digitar /jarbas-ai-plugin:implementar.
 *
 * Desligar: JARBAS_ENFORCE=off
 */
import { describeSetup } from "../lib/endpoint.mjs";
import { readHookInput } from "../lib/state.mjs";

function emit(context) {
    process.stdout.write(
        JSON.stringify({
            hookSpecificOutput: {
                hookEventName: "UserPromptSubmit",
                additionalContext: context,
            },
        })
    );
    process.exit(0);
}

await readHookInput();

if (String(process.env.JARBAS_ENFORCE || "").toLowerCase() === "off") process.exit(0);

const info = describeSetup();

const lines = [
    "[jarbas-ai-plugin] Politica de implementacao ativa nesta sessao.",
    "",
    "Se o pedido do usuario implicar escrever, alterar ou refatorar codigo:",
    "1. ESCLARECA primeiro. Se o pedido for vago (ex: 'crie uma pagina de vendas'),",
    "   faca ate 3 perguntas objetivas sobre stack, escopo, dados e criterio de pronto.",
    "   Nao invente requisitos nem tecnologias que o repositorio nao usa.",
    "2. LEIA o repositorio e planeje: divida em unidades independentes e testaveis.",
    "3. DELEGUE cada unidade ao subagent 'implementer' (via Task), com prompt",
    "   autocontido. Ele chama a ferramenta 'implement' do MCP jarbas, que executa o",
    "   modelo externo, e aplica os blocos '### FILE:' retornados.",
    "4. INTEGRE, rode build/testes e reporte.",
    "",
    "Voce (modelo padrao) NAO escreve o codigo, nem 'so uma linha'. Write/Edit/",
    "MultiEdit/NotebookEdit estao BLOQUEADOS por hook ate haver uma chamada bem-",
    "sucedida a 'implement' nesta sessao (.md/.txt sao excecao). Contornar via Bash",
    "e violacao da politica.",
    "",
    "Nao ha necessidade de o usuario digitar /jarbas-ai-plugin:implementar.",
    "Isto nao se aplica a perguntas, explicacoes, leitura de codigo ou comandos.",
];

if (info.errors.length || !info.key) {
    lines.push(
        "",
        "ATENCAO: o modelo externo NAO esta pronto (" +
        (info.errors[0] || "chave nao configurada").split("\n")[0] +
        "). Antes de prometer implementacao, peca ao usuario rodar /jarbas-ai-plugin:setup."
    );
} else {
    lines.push("", `Modelo externo: ${info.model} (${info.apiType}).`);
}

emit(lines.join("\n"));
