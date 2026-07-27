---
description: Configura a chave de acesso ao modelo externo de implementacao (executado no terminal do usuario) e verifica a conexao.
argument-hint: "(sem argumentos)"
allowed-tools: Bash(node:*), Read, mcp__jarbas__status
---

# Setup do modelo de implementacao

Objetivo: deixar o plugin pronto para delegar a implementacao ao modelo externo.

## 1. Verifique o estado atual

Chame `mcp__jarbas__status` e mostre: config em uso, modelo, URL efetiva e se a
chave ja esta configurada.

Se a chave ja estiver OK, informe e pergunte se o usuario quer trocar. Nao
prossiga sem necessidade.

## 2. Peca a chave — SEM captura-la no chat

**Nunca** solicite a chave como texto no chat, nunca a coloque em arquivo do
repositorio e nunca a passe em linha de comando. Instrua o usuario a rodar, no
proprio terminal dele:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs"
```

O script pede a chave com entrada oculta e grava em `~/.jarbas-ai/credentials.json`
(permissao 600), fora do repositorio.

Alternativas que o usuario pode preferir:

```bash
# a partir de uma variavel de ambiente ja existente
node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs" --from-env MINHA_VAR

# a partir de um cofre / gerenciador de segredos
meu-cofre ler chave | node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs" --stdin

# apenas variavel de ambiente da sessao, sem gravar em disco
$env:JARBAS_API_KEY = "<chave>"      # PowerShell
export JARBAS_API_KEY='<chave>'      # bash/zsh
```

Se o endpoint dele for diferente do padrao do repositorio:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs" --url https://meu-gateway/ --model meu-modelo
```

Isso grava um perfil pessoal em `~/.jarbas-ai/config.json`, que tem precedencia
sobre o `config.json` do repositorio — assim o usuario nunca precisa editar (nem
commitar) o arquivo publico.

## 3. Valide

Depois que o usuario confirmar que rodou o setup:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/doctor.mjs"
```

Interprete a saida. Em caso de falha, use a tabela de diagnostico da skill
`delegacao-de-implementacao`.

> Se o MCP `jarbas` tiver sido carregado antes da chave existir, peca ao usuario
> para reiniciar a sessao do Claude Code (ou `/mcp` reconectar) apos o setup.

## 4. Feche

Explique em 3 linhas: a partir de agora, `/jarbas-ai-plugin:implementar` delega a
escrita de codigo ao modelo externo; o modelo padrao do Claude Code continua
cuidando de planejamento, leitura do repositorio e revisao.

Avise tambem que a delegacao e imposta por hook: `Write`/`Edit`/`MultiEdit`/
`NotebookEdit` sao bloqueados enquanto nao houver uma chamada bem-sucedida a
`mcp__jarbas__implement` na sessao (arquivos `.md`/`.txt` sao excecao). Para
desativar, o proprio usuario define `JARBAS_ENFORCE=off` no ambiente.
