#!/usr/bin/env node
/**
 * PostToolUse hook: apos uma chamada a mcp__jarbas__implement, concede creditos
 * de escrita para que o resultado do modelo externo possa ser aplicado nos
 * arquivos pelo Write/Edit.
 */
import { pruneState, readHookInput, readState, writeState } from "../lib/state.mjs";

const CREDITS = 50;
const WINDOW_MS = 60 * 60 * 1000;

const input = await readHookInput();
const sessionId = input.session_id;

// Nao concede credito se a ferramenta retornou erro.
const response = input.tool_response;
const isError =
    response && typeof response === "object" && (response.isError === true || response.is_error === true);

if (!isError) {
    const state = readState(sessionId);
    writeState(sessionId, {
        credits: Math.max(state.credits, 0) + CREDITS,
        allowedUntil: Date.now() + WINDOW_MS,
    });
}

try {
    pruneState();
} catch {
    /* limpeza e best-effort */
}

process.exit(0);
