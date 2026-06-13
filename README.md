# NATIVA

Sistema de gestão (Clientes, Matéria-Prima e Produtos) - PWA servida por um servidor local em Node.js.

## Como rodar

```
node server.js
```

O servidor inicia na porta 3000 e mostra no console os endereços de acesso:

- No próprio PC: `http://localhost:3000`
- Pela rede wifi (ex. iPhone): `http://<IP-do-PC>:3000`

No iPhone, abra o endereço de rede no Safari e use "Adicionar à Tela de Início" para instalar como app (PWA).

## Estrutura

- `server.js` - servidor HTTP (Node puro, sem dependências) + API REST + banco SQLite (`data/nativa.db`)
- `public/` - telas da PWA
  - `index.html` - tela de abertura (logo + botão Entrar)
  - `menu.html` - menu com acesso aos módulos
  - `clientes.html` / `clientes.js` - cadastro de clientes (com captura de localização)
  - `materiaprima.html`, `produtos.html` / `estoque.js` - cadastro de matéria-prima e produtos

## Logo da tela de abertura

Coloque o arquivo `logo.png` em `public/logo.png`.
