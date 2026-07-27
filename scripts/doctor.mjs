#!/usr/bin/env node
/**
 * Diagnostico: valida o config.json, mostra a configuracao efetiva e (opcional)
 * faz uma chamada real ao endpoint.
 *
 *   node scripts/doctor.mjs            # valida + testa conexao
 *   node scripts/doctor.mjs --offline  # so valida a estrutura
 */
import { callModel, describeSetup, loadConfig, selectModel } from "../lib/endpoint.mjs";

const VENDORS = new Set(["customendpoint", "openai", "azure", "anthropic", "google", "ollama"]);
const API_TYPES = new Set(["chat-completions", "responses", "messages"]);
const SECRET_REF = /^\$\{(input|env|command):[^}]+\}$/;
const LITERAL_KEY = /^(sk-|xai-|gsk_|AIza|ghp_|hf_)[A-Za-z0-9_-]{10,}$/;

function validate(provider) {
    const errors = [];
    const warnings = [];

    if (!provider.name) errors.push("provider.name ausente");
    if (!provider.vendor) errors.push("provider.vendor ausente");
    else if (!VENDORS.has(provider.vendor)) warnings.push(`vendor desconhecido: ${provider.vendor}`);

    if (!provider.apiType) errors.push("provider.apiType ausente");
    else if (!API_TYPES.has(provider.apiType))
        errors.push(`apiType invalido: ${provider.apiType} (use ${[...API_TYPES].join(", ")})`);

    const apiKey = String(provider.apiKey ?? "").trim();
    if (!apiKey) errors.push("provider.apiKey ausente");
    else if (LITERAL_KEY.test(apiKey))
        errors.push("provider.apiKey parece um SEGREDO LITERAL no arquivo — troque por ${env:...} e ROTACIONE a chave");
    else if (!SECRET_REF.test(apiKey))
        warnings.push("provider.apiKey nao usa ${env:...}/${input:...}; confirme que nao ha segredo em texto puro");

    const models = Array.isArray(provider.models) ? provider.models : [];
    if (!models.length) errors.push("provider.models vazio");

    const seen = new Set();
    models.forEach((model, i) => {
        const at = `models[${i}]`;
        for (const field of ["id", "name", "url"]) {
            if (!model?.[field]) errors.push(`${at}.${field} ausente`);
        }
        if (model?.url && !/^https?:\/\//.test(model.url)) errors.push(`${at}.url deve ser http(s)`);
        if (model?.url?.startsWith("http://")) warnings.push(`${at}.url sem TLS`);
        if (model?.id) {
            if (seen.has(model.id)) errors.push(`${at}.id duplicado: ${model.id}`);
            seen.add(model.id);
        }
        if (model?.maxOutputTokens && model?.maxInputTokens && model.maxOutputTokens > model.maxInputTokens)
            warnings.push(`${at}: maxOutputTokens > maxInputTokens`);
        if (!model?.maxInputTokens) warnings.push(`${at}: maxInputTokens nao declarado`);
    });

    return { errors, warnings };
}

async function main() {
    const offline = process.argv.includes("--offline");
    let provider;
    try {
        ({ provider } = loadConfig());
        selectModel(provider);
    } catch (err) {
        console.error(`ERRO: ${err.message}`);
        return 2;
    }

    const info = describeSetup();
    console.log("Configuracao efetiva");
    console.log(`  config      : ${info.config}`);
    console.log(`  modelo      : ${info.model}`);
    console.log(`  apiType     : ${info.apiType}`);
    console.log(`  URL efetiva : ${info.url}`);
    console.log(`  chave       : ${info.key ?? "NAO CONFIGURADA (rode scripts/setup.mjs)"}`);
    console.log("");

    const { errors, warnings } = validate(provider);
    errors.forEach((e) => console.log(`ERRO   ${e}`));
    warnings.forEach((w) => console.log(`AVISO  ${w}`));
    if (!errors.length && !warnings.length) console.log("Estrutura do config.json: OK");

    if (errors.length) return 1;
    if (offline) return 0;
    if (!info.key) {
        console.log("\nTeste de conexao pulado: nenhuma chave configurada.");
        return 1;
    }

    console.log("\nTestando conexao...");
    try {
        const out = await callModel({
            user: "Responda apenas com a palavra: pong",
            maxTokens: 32,
            temperature: 0,
            timeoutMs: 60000,
        });
        console.log(`OK — resposta: ${String(out.text).trim().slice(0, 200)}`);
        if (out.usage) console.log(`usage: ${JSON.stringify(out.usage)}`);
        return 0;
    } catch (err) {
        console.error(`FALHA: ${err.message}`);
        console.error(
            "\nDicas:\n" +
            "  HTTP 404      -> caminho errado; defina JARBAS_ENDPOINT_PATH=/v1/chat/completions\n" +
            "  HTTP 401/403  -> chave invalida ou apiType/header incorreto\n" +
                "  HTTP 429      -> gateway sem deployment disponivel ou rate limit; a chave esta OK,\n" +
                "                   aguarde alguns segundos e rode de novo\n" +
                "  model not found -> o 'id' do config nao existe no gateway\n" +
                "  timeout       -> gateway atras de VPN/proxy corporativo"
        );
        return 1;
    }
}

const exitCode = await main();
process.exitCode = exitCode;
