---
description: Diagnostica a configuracao do plugin - config em uso, modelo, URL efetiva, origem da chave e conexao com o endpoint.
argument-hint: "[--offline]"
allowed-tools: Bash(node:*), Read, mcp__plugin_jarbas-ai-plugin_jarbas__status, mcp__jarbas__status
---

# Diagnostico

1. Chame a ferramenta `status` do MCP `jarbas` e mostre o resultado. O nome pode
   ser `mcp__plugin_jarbas-ai-plugin_jarbas__status` (plugin) ou
   `mcp__jarbas__status` (MCP direto) — use o que existir na sua lista.
2. Rode:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/doctor.mjs" $ARGUMENTS
   ```
3. Explique cada ERRO/AVISO e a correcao concreta:
   - chave ausente -> `/jarbas-ai-plugin:setup`
   - HTTP 404 -> definir `JARBAS_ENDPOINT_PATH` (ex: `/v1/chat/completions`)
   - HTTP 401/403 -> chave invalida ou `apiType` incorreto
   - `model not found` -> `id` do modelo divergente do gateway
   - segredo literal em `apiKey` -> trocar por `${env:...}` e **rotacionar a chave**
4. Informe o estado do enforcement: os hooks bloqueiam `Write`/`Edit` sem uma
   chamada previa a `mcp__jarbas__implement`, exceto para `.md`/`.txt`. Se
   `JARBAS_ENFORCE=off` estiver definido no ambiente, avise que a politica esta
   desativada.
5. Nunca peca, exiba ou grave o valor da chave.
