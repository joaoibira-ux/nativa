# NATIVA

Sistema de gestão (Clientes, Matéria-Prima e Produtos) - PWA servida por um servidor local em Node.js.

## Como rodar

```
node server.js
```

Ou dê dois cliques em `iniciar-servidor.bat`.

O servidor inicia na porta 3000 e mostra no console os endereços de acesso:

- No próprio PC: `http://localhost:3000`
- Pela rede wifi (ex. iPhone): `http://<IP-do-PC>:3000`

No iPhone, abra o endereço de rede no Safari e use "Adicionar à Tela de Início" para instalar como app (PWA).

## Instalar em outro computador (servidor)

Requisitos: [Node.js](https://nodejs.org) versão 22 ou superior instalado no computador.

1. Copie esta pasta inteira (`C:\NATIVA`) para o computador que vai funcionar como servidor.
2. Clique com o botão direito em `instalar.bat` → **"Executar como administrador"**.
   - Verifica se o Node.js está instalado.
   - Cria a regra do Firewall do Windows liberando a porta 3000.
   - Pergunta se o servidor deve iniciar automaticamente ao ligar o Windows (cria uma tarefa agendada).
3. Para iniciar manualmente, execute `iniciar-servidor.bat`.

**Atenção:** se o computador tiver um antivírus com firewall próprio (AVG, McAfee, Norton, etc.), também é preciso liberar o `node.exe` (geralmente em `C:\Program Files\nodejs\node.exe`) para conexões de entrada na porta 3000 nas configurações do firewall do antivírus — o Firewall do Windows sozinho pode não ser suficiente.

## Estrutura

- `server.js` - servidor HTTP (Node puro, sem dependências) + API REST + banco SQLite (`data/nativa.db`)
- `public/` - telas da PWA
  - `index.html` - tela de abertura (logo + botão Entrar)
  - `menu.html` - menu com acesso aos módulos
  - `clientes.html` / `clientes.js` - cadastro de clientes (com captura de localização)
  - `materiaprima.html`, `produtos.html` / `estoque.js` - cadastro de matéria-prima e produtos
  - `pedidos.html` / `pedidos.js` - pedidos (cliente + itens + status), debita/devolve estoque de produtos

## Logo da tela de abertura

`public/logonativa.png` (ícone do app e imagem da tela de abertura).
