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
- GitHub repo: `joaoibira-ux/nativa` (GitHub Pages com domínio próprio: `nativa.gwrevestimentos.com.br`, configurado via arquivo `CNAME` na raiz + registro DNS CNAME no Registro.br apontando pra `joaoibira-ux.github.io`)
- Hospedagem estática (GitHub Pages) + Firestore como banco de dados, no mesmo formato do Sistema IBIRÁ
- Arquivos do site ficam na raiz do repositório (index.html, app.js, etc.), como no IBIRÁ
- Firestore regras abertas (`allow read, write: if true`) — igual ao IBIRÁ
- Coleções Firestore: `clientes`, `materiaprima`, `produtos` (com `composicao` embutida), `pedidos` (com `itens` embutidos), `caixaLancamentos`, `contasReceber`, `contasPagar`, `cardapioCategorias`, `desenvolvimento`
- `local-server/`: servidor Node.js + SQLite antigo, mantido apenas como referência local. Não é mais usado para hospedar o sistema.

## Pendências de desenvolvimento (lembrete obrigatório)

O sistema tem uma tela própria de backlog em `desenvolvimento/` (coleção Firestore `desenvolvimento`, campos `texto`/`status`/`criadoEm`/`concluidoEm`/`notaConclusao`) — é a lista de pendências que o João vai preenchendo com o que quer que seja mudado no sistema (ERP ou cardápio). Acessível pelo botão "🛠️ Desenvolvimento" no menu principal.

**No início de qualquer conversa cujo assunto seja o Sistema NATIVA**, consulte essa coleção (via Firestore REST) e veja se há itens com `status: "aberto"`. Se houver, avise o João logo no começo da conversa (não espere ele perguntar) e pergunte se quer resolver algum agora. Ao concluir um item, marque com `status: "concluido"`, `concluidoEm` e um `notaConclusao` curto descrevendo o que foi feito e a versão.

Essa tela é a ÚNICA fonte de pendências agora — o padrão veio do Sistema GW, que já tinha migrado esse mesmo fluxo pra dentro do próprio sistema por achar o Obsidian pouco prático. A nota `03 - Nosso/Sistema Nativa/Idèias.md` no vault Obsidian foi arquivada em 2026-09-12 (movida pra `00 - Sistema/Arquivo morto/`). Não reviva esse fluxo nem sugira usar o Obsidian pra pendências do NATIVA de novo.
