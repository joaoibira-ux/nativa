# NATIVA

Sistema de gestão (Clientes, Matéria-Prima, Produtos, Pedidos, Caixa, A Receber/Pagar) - PWA estática hospedada no GitHub Pages, usando Firebase Firestore como banco de dados (mesmo modelo do Sistema IBIRÁ).

- Site: https://joaoibira-ux.github.io/nativa/
- Firebase project: `sistema-nativa-ibira`

## Estrutura

- `index.html`, `menu.html`, `clientes.html`, `materiaprima.html`, `produtos.html`, `pedidos.html`, `caixa.html`, `areceber.html`, `apagar.html` - telas da PWA
- `app.js` - config do Firebase, versão do app e funções utilitárias
- `clientes.js`, `estoque.js`, `pedidos.js`, `caixa.js`, `areceber.js`, `apagar.js` - lógica de cada tela, direto no Firestore
- `firebase.json` / `firestore.rules` / `.firebaserc` - configuração do Firebase
- `sw.js` / `manifest.json` - service worker e manifest do PWA

## Coleções do Firestore

- `clientes`, `materiaprima`, `produtos` (com `composicao` embutida), `pedidos` (com `itens` embutidos), `caixaLancamentos`, `contasReceber`, `contasPagar`

## local-server/

Servidor Node.js + SQLite usado antes da migração para Firebase/GitHub Pages. Mantido só como referência local; não é mais necessário para rodar o sistema.
