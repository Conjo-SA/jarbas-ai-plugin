/**
 * Nucleo compartilhado: carrega o config.json do endpoint, resolve credenciais
 * e chama o modelo externo. Sem dependencias externas (Node 18+).
 *
 * A chave NUNCA e logada, retornada ou gravada em disco por este modulo.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ENDPOINT_PATHS = {
    "chat-completions": "/v1/chat/completions",
    responses: "/v1/responses",
    messages: "/v1/messages",
};

export function pluginRoot() {
    if (process.env.JARBAS_PLUGIN_ROOT) return process.env.JARBAS_PLUGIN_ROOT;
    return dirname(dirname(fileURLToPath(import.meta.url)));
}

export function jarbasHome() {
    return process.env.JARBAS_HOME || join(homedir(), ".jarbas-ai");
}

export function credentialsPath() {
    return join(jarbasHome(), "credentials.json");
}

function readJson(path) {
    return JSON.parse(readFileSync(path, "utf8"));
}

/** Ordem: $JARBAS_CONFIG > ~/.jarbas-ai/config.json > <plugin>/config.json */
export function loadConfig() {
    const candidates = [
        process.env.JARBAS_CONFIG,
        join(jarbasHome(), "config.json"),
        join(pluginRoot(), "config.json"),
    ].filter(Boolean);

    for (const path of candidates) {
        if (!existsSync(path)) continue;
        let raw;
        try {
            raw = readJson(path);
        } catch (err) {
            throw new Error(`config.json invalido em ${path}: ${err.message}`);
        }
        const providers = Array.isArray(raw) ? raw : [raw];
        const provider = providers.find((p) => p && Array.isArray(p.models) && p.models.length);
        if (!provider) throw new Error(`Nenhum provider com 'models' em ${path}`);
        return { provider, source: path };
    }
    throw new Error(
        `Nenhum config.json encontrado. Procurado em:\n  - ${candidates.join("\n  - ")}`
    );
}

export function selectModel(provider, wantedId) {
    const id = wantedId || process.env.JARBAS_MODEL;
    const models = provider.models.filter((m) => m && m.id);
    const model = id ? models.find((m) => m.id === id) : models[0];
    if (!model) {
        throw new Error(
            `Modelo ${id ?? "(default)"} nao encontrado. Disponiveis: ${models.map((m) => m.id).join(", ")}`
        );
    }
    return model;
}

function envVarFromRef(apiKeyField) {
    const match = /^\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(String(apiKeyField ?? "").trim());
    return match ? match[1] : null;
}

/**
 * Ordem: variavel de ambiente referenciada no config > JARBAS_API_KEY >
 * ~/.jarbas-ai/credentials.json
 */
export function resolveApiKey(provider) {
    const named = envVarFromRef(provider.apiKey);
    if (named && process.env[named]) return { key: process.env[named], origin: `env:${named}` };
    if (process.env.JARBAS_API_KEY) return { key: process.env.JARBAS_API_KEY, origin: "env:JARBAS_API_KEY" };

    const path = credentialsPath();
    if (existsSync(path)) {
        try {
            const creds = readJson(path);
            if (creds && typeof creds.apiKey === "string" && creds.apiKey.trim()) {
                return { key: creds.apiKey.trim(), origin: "credentials.json" };
            }
        } catch {
            throw new Error(`credentials.json ilegivel em ${path}. Rode o setup novamente.`);
        }
    }

    throw new Error(
        "Chave de API nao configurada.\n" +
        "Rode no seu terminal:  node <plugin>/scripts/setup.mjs\n" +
        `Ou defina a variavel de ambiente ${named || "JARBAS_API_KEY"}.`
    );
}

export function resolveUrl(baseUrl, apiType, override) {
    let parsed;
    try {
        parsed = new URL(baseUrl);
    } catch {
        throw new Error(`URL invalida no config: ${baseUrl}`);
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new Error(`Protocolo nao suportado: ${parsed.protocol}`);
    }

    const suffix = override || ENDPOINT_PATHS[apiType];
    if (!suffix) throw new Error(`apiType desconhecido: ${apiType}`);

    const path = parsed.pathname.replace(/\/+$/, "");
    const tail = suffix.replace(/^\/v1/, "");
    let finalPath;
    if (path.endsWith(tail)) finalPath = path;
    else if (path.endsWith("/v1")) finalPath = path + tail;
    else finalPath = path + suffix;

    parsed.pathname = finalPath;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
}

function buildPayload(apiType, model, { system, user, maxTokens, temperature }) {
    const cap = model.maxOutputTokens || 8192;
    const max = Math.min(maxTokens || 4096, cap);

    if (apiType === "messages") {
        const payload = {
            model: model.id,
            max_tokens: max,
            messages: [{ role: "user", content: user }],
        };
        if (system) payload.system = system;
        if (temperature != null) payload.temperature = temperature;
        return payload;
    }

    if (apiType === "responses") {
        const payload = { model: model.id, input: user, max_output_tokens: max };
        if (system) payload.instructions = system;
        if (temperature != null) payload.temperature = temperature;
        return payload;
    }

    const messages = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: user });
    const payload = { model: model.id, messages, max_tokens: max, stream: false };
    if (temperature != null) payload.temperature = temperature;
    return payload;
}

function buildHeaders(apiType, apiKey) {
    const headers = { "content-type": "application/json", accept: "application/json" };
    if (apiType === "messages") {
        headers["x-api-key"] = apiKey;
        headers["anthropic-version"] = "2023-06-01";
    } else {
        headers.authorization = `Bearer ${apiKey}`;
    }
    return headers;
}

function extractText(body, apiType) {
    try {
        if (apiType === "messages") {
            return (body.content || [])
                .filter((b) => b.type === "text")
                .map((b) => b.text)
                .join("");
        }
        if (apiType === "responses") {
            if (typeof body.output_text === "string") return body.output_text;
            return (body.output || [])
                .flatMap((item) => item.content || [])
                .map((block) => block.text)
                .filter((t) => typeof t === "string")
                .join("");
        }
        return body?.choices?.[0]?.message?.content ?? "";
    } catch {
        return "";
    }
}

/** Remove qualquer eco de credencial de mensagens de erro do gateway. */
function scrub(text, apiKey) {
    if (!apiKey) return text;
    return text.split(apiKey).join("***");
}

export async function callModel({
    system,
    user,
    maxTokens,
    temperature,
    modelId,
    timeoutMs = 300000,
}) {
    const { provider, source } = loadConfig();
    const model = selectModel(provider, modelId);
    const apiType = provider.apiType || "chat-completions";
    const { key: apiKey, origin } = resolveApiKey(provider);
    const url = resolveUrl(model.url || provider.name, apiType, process.env.JARBAS_ENDPOINT_PATH);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
        response = await fetch(url, {
            method: "POST",
            headers: buildHeaders(apiType, apiKey),
            body: JSON.stringify(buildPayload(apiType, model, { system, user, maxTokens, temperature })),
            signal: controller.signal,
        });
    } catch (err) {
        clearTimeout(timer);
        if (err.name === "AbortError") throw new Error(`Timeout apos ${timeoutMs} ms em ${url}`);
        throw new Error(`Falha de rede ao chamar ${url}: ${err.message}`);
    }
    clearTimeout(timer);

    const raw = await response.text();
    if (!response.ok) {
        throw new Error(
            `HTTP ${response.status} em ${url}\n${scrub(raw, apiKey).slice(0, 1500)}`
        );
    }

    let body;
    try {
        body = JSON.parse(raw);
    } catch {
        throw new Error(`Resposta nao-JSON de ${url}:\n${scrub(raw, apiKey).slice(0, 1000)}`);
    }

    return {
        text: extractText(body, apiType),
        usage: body.usage ?? null,
        model: model.id,
        url,
        configSource: source,
        keyOrigin: origin,
    };
}

export function describeSetup() {
    const info = { config: null, model: null, apiType: null, url: null, key: null, errors: [] };
    try {
        const { provider, source } = loadConfig();
        info.config = source;
        info.apiType = provider.apiType || "chat-completions";
        const model = selectModel(provider);
        info.model = model.id;
        info.url = resolveUrl(model.url || provider.name, info.apiType, process.env.JARBAS_ENDPOINT_PATH);
        try {
            info.key = resolveApiKey(provider).origin;
        } catch (err) {
            info.errors.push(err.message);
        }
    } catch (err) {
        info.errors.push(err.message);
    }
    return info;
}
