#!/usr/bin/env node
/**
 * PreToolUse hook: bloqueia Write/Edit/MultiEdit/NotebookEdit que nao venham de
 * uma delegacao ao modelo externo.
 *
 * Permite a escrita quando ha "credito" concedido por uma chamada recente a
 * mcp__jarbas__implement (ver hooks/record_delegation.mjs).
 *
 * Desligar: JARBAS_ENFORCE=off
 */
import { readHookInput, readState, writeState } from "../lib/state.mjs";

// Arquivos que nao sao codigo: liberados sempre.
const DOC_EXT = new Set([".md", ".markdown", ".txt", ".rst", ".adoc"]);

function allow() {
    process.exit(0);
}

function deny(reason) {
    process.stdout.write(
        JSON.stringify({
            hookSpecificOutput: {
                hookEventName: "PreToolUse",
                permissionDecision: "deny",
                permissionDecisionReason: reason,
            },
        })
    );
    process.exit(0);
}

function extensionOf(path) {
    const match = /(\.[A-Za-z0-9]+)$/.exec(String(path || ""));
    return match ? match[1].toLowerCase() : "";
}

const input = await readHookInput();

if (String(process.env.JARBAS_ENFORCE || "").toLowerCase() === "off") allow();

const toolInput = input.tool_input || {};
const target = toolInput.file_path || toolInput.notebook_path || toolInput.path || "";
if (DOC_EXT.has(extensionOf(target))) allow();

const sessionId = input.session_id;
const state = readState(sessionId);

if (state.credits > 0 && Date.now() < state.allowedUntil) {
    writeState(sessionId, { ...state, credits: state.credits - 1 });
    allow();
}

deny(
    "Politica jarbas-ai-plugin: a escrita de codigo deve vir do modelo externo.\n" +
    "Chame mcp__jarbas__implement (ou delegue ao subagent 'implementer') com a tarefa " +
    "e o contexto do repositorio, e aplique os blocos '### FILE:' retornados.\n" +
    "Se a chave nao estiver configurada, rode /jarbas-ai-plugin:setup.\n" +
    "Para desativar esta politica nesta sessao, o USUARIO deve definir JARBAS_ENFORCE=off."
);
