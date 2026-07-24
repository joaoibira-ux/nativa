# Sistema NATIVA — Regras para o Claude

## Versão obrigatória a cada alteração

A cada modificação em qualquer arquivo deste sistema:

1. **Atualizar a versão** em dois lugares:
   - `app.js`: `const VERSAO_NATIVA = "X.XX";`
   - Query string de `app.js` em todos os HTMLs que o incluem (`<script src="./app.js?v=XX">`)
   - `sw.js`: `const VERSION = "nativa-vXX";` (incrementar sempre) e atualizar a lista `ASSETS` com as novas versões
2. **Commitar e fazer push** das alterações
3. **Informar ao usuário** a nova versão no final da resposta: `Versão atual: vX.XX`

A versão atual está em `app.js` → `VERSAO_NATIVA`.

## Regras gerais

- Sempre commit + push após qualquer mudança, sem perguntar
- Firebase project: `sistema-nativa-ibira`
- GitHub repo: `joaoibira-ux/nativa` (GitHub Pages: `joaoibira-ux.github.io/nativa`)
- Hospedagem estática (GitHub Pages) + Firestore como banco de dados, no mesmo formato do Sistema IBIRÁ
- Arquivos do site ficam na raiz do repositório (index.html, app.js, etc.), como no IBIRÁ
- Firestore regras abertas (`allow read, write: if true`) — igual ao IBIRÁ
- Coleções Firestore: `clientes`, `materiaprima`, `produtos` (com `composicao` embutida), `pedidos` (com `itens` embutidos), `caixaLancamentos`, `contasReceber`, `contasPagar`
- `local-server/`: servidor Node.js + SQLite antigo, mantido apenas como referência local. Não é mais usado para hospedar o sistema.
