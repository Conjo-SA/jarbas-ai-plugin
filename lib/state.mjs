/**
 * Estado por sessao usado pelos hooks de enforcement.
 * Guarda "creditos de escrita" concedidos apos uma delegacao bem-sucedida.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { jarbasHome } from "./endpoint.mjs";

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Impede path traversal via session_id vindo do hook. */
function safeId(sessionId) {
    const id = String(sessionId || "default").replace(/[^A-Za-z0-9_-]/g, "");
    return id.slice(0, 128) || "default";
}

export function statePath(sessionId) {
    return join(jarbasHome(), "state", `${safeId(sessionId)}.json`);
}

export function readState(sessionId) {
    const path = statePath(sessionId);
    if (!existsSync(path)) return { credits: 0, allowedUntil: 0 };
    try {
        const state = JSON.parse(readFileSync(path, "utf8"));
        return { credits: Number(state.credits) || 0, allowedUntil: Number(state.allowedUntil) || 0 };
    } catch {
        return { credits: 0, allowedUntil: 0 };
    }
}

export function writeState(sessionId, state) {
    const dir = join(jarbasHome(), "state");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(statePath(sessionId), JSON.stringify(state), { mode: 0o600 });
}

/** Remove estados antigos para nao acumular lixo em ~/.jarbas-ai/state. */
export function pruneState() {
    const dir = join(jarbasHome(), "state");
    if (!existsSync(dir)) return;
    const limit = Date.now() - MAX_AGE_MS;
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        try {
            if (statSync(path).mtimeMs < limit) rmSync(path);
        } catch {
            /* ignora arquivos em uso */
        }
    }
}

/** Le o JSON que o Claude Code envia no stdin do hook. */
export function readHookInput() {
    return new Promise((resolve) => {
        let data = "";
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", (chunk) => (data += chunk));
        process.stdin.on("end", () => {
            try {
                resolve(JSON.parse(data || "{}"));
            } catch {
                resolve({});
            }
        });
    });
}
