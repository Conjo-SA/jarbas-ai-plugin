---
description: Planeja com o modelo padrao do Claude Code e delega a escrita do codigo ao modelo externo, via subagents implementer.
argument-hint: "<o que deve ser implementado>"
allowed-tools: Read, Grep, Glob, Bash, Task, mcp__plugin_jarbas-ai-plugin_jarbas__status, mcp__jarbas__status
---

# Implementar delegando ao modelo externo

Pedido do usuario: $ARGUMENTS

Voce (modelo padrao do Claude Code) **orquestra**. Voce **nao escreve o codigo**:
cada unidade de implementacao vai para um subagent `implementer`, que chama o
modelo externo configurado.

## Passos

1. **Pre-checagem**
   Chame a ferramenta `status` do MCP `jarbas` (`mcp__plugin_jarbas-ai-plugin_jarbas__status`
   quando instalado como plugin, ou `mcp__jarbas__status` quando o MCP e direto).
   Se a chave nao estiver configurada, pare e oriente
   o usuario a rodar `/jarbas-ai-plugin:setup`.

2. **Entender o repositorio** (voce faz, com Read/Grep/Glob)
   Linguagem, framework, estrutura, convencoes, comandos de build e teste.
   Nao leia o repositorio inteiro: foque no que a tarefa toca.

3. **Planejar**
   Quebre o pedido em unidades de implementacao independentes e testaveis.
   Cada unidade precisa de: objetivo, arquivos afetados, contratos/assinaturas
   envolvidos e criterio de pronto.

4. **Delegar**
   Para cada unidade, dispare um subagent `implementer` com a tarefa **autocontida**
   (ele nao ve esta conversa). Inclua no prompt:
   - objetivo e criterio de aceite
   - caminhos dos arquivos e trechos-chave ja identificados
   - convencoes obrigatorias e o que nao deve ser alterado
   - comandos de build/teste a rodar

   Unidades independentes podem ir em paralelo; unidades com dependencia entre si
   devem ser sequenciais, passando o resultado da anterior no prompt da seguinte.

5. **Integrar**
   - Revise os relatorios dos subagents.
   - Rode build/testes do projeto de ponta a ponta.
   - Resolva conflitos entre unidades despachando um novo `implementer` com o
     contexto do conflito — nao corrija escrevendo codigo voce mesmo.

6. **Relatorio**
   Tabela final: unidade, arquivos alterados, status de teste, pendencias.
   Cite o modelo externo usado e o que ficou como `### NOTES`/`### BLOCKED`.

## Limites

- Nao gere codigo diretamente, mesmo que pareca trivial. Um hook `PreToolUse`
  **nega** `Write`/`Edit`/`MultiEdit`/`NotebookEdit` sem delegacao previa; se voce
  for bloqueado, delegue em vez de tentar contornar (inclusive via `Bash`).
- Arquivos `.md`/`.txt` sao a unica excecao liberada pelo hook.
- Excecao unica: o usuario autorizar fallback explicitamente, ou o endpoint estar
  indisponivel **e** o usuario pedir para prosseguir sem ele (nesse caso ele mesmo
  precisa definir `JARBAS_ENFORCE=off`). Registre isso no relatorio.
- Nao invente credenciais, URLs ou nomes de modelo.
