const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { DatabaseSync } = require("node:sqlite");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const DB_PATH = path.join(__dirname, "data", "nativa.db");

const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    telefone TEXT,
    endereco TEXT,
    latitude REAL,
    longitude REAL,
    observacoes TEXT,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS materiaprima (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    ud TEXT,
    valor REAL DEFAULT 0,
    estoque REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    ud TEXT,
    valor REAL DEFAULT 0,
    estoque REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER,
    cliente_nome TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pendente',
    total REAL DEFAULT 0,
    observacoes TEXT,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pedido_itens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL,
    produto_id INTEGER,
    produto_nome TEXT NOT NULL,
    ud TEXT,
    valor_unitario REAL DEFAULT 0,
    quantidade REAL DEFAULT 0,
    subtotal REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS produto_composicao (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id INTEGER NOT NULL,
    materiaprima_id INTEGER,
    materiaprima_nome TEXT NOT NULL,
    ud TEXT,
    quantidade REAL DEFAULT 0
  );
`);

function garantirColuna(tabela, coluna, definicao) {
  const colunas = db.prepare(`PRAGMA table_info(${tabela})`).all();
  if (!colunas.some(c => c.name === coluna)) {
    db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`);
  }
}

garantirColuna("materiaprima", "pacote", "REAL");
garantirColuna("materiaprima", "peso_pacote", "REAL");
garantirColuna("materiaprima", "preco_pacote", "REAL");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function enviarJson(res, status, dados) {
  const corpo = JSON.stringify(dados);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(corpo);
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let dados = "";
    req.on("data", chunk => dados += chunk);
    req.on("end", () => {
      if (!dados) return resolve({});
      try {
        resolve(JSON.parse(dados));
      } catch {
        reject(new Error("JSON inválido"));
      }
    });
    req.on("error", reject);
  });
}

function servirArquivo(req, res) {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";

  const caminho = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (!caminho.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end("Proibido");
    return;
  }

  fs.readFile(caminho, (err, conteudo) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Não encontrado");
      return;
    }
    const ext = path.extname(caminho).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    res.end(conteudo);
  });
}

// ---------- Clientes ----------
function listarClientes(res) {
  const rows = db.prepare("SELECT * FROM clientes ORDER BY nome COLLATE NOCASE").all();
  enviarJson(res, 200, rows);
}

function criarCliente(res, body) {
  const { nome, telefone, endereco, latitude, longitude, observacoes } = body;
  if (!nome) return enviarJson(res, 400, { erro: "Nome é obrigatório" });
  const info = db.prepare(`
    INSERT INTO clientes (nome, telefone, endereco, latitude, longitude, observacoes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(nome, telefone || null, endereco || null, latitude ?? null, longitude ?? null, observacoes || null);
  const row = db.prepare("SELECT * FROM clientes WHERE id = ?").get(info.lastInsertRowid);
  enviarJson(res, 201, row);
}

function atualizarCliente(res, id, body) {
  const { nome, telefone, endereco, latitude, longitude, observacoes } = body;
  if (!nome) return enviarJson(res, 400, { erro: "Nome é obrigatório" });
  db.prepare(`
    UPDATE clientes SET nome = ?, telefone = ?, endereco = ?, latitude = ?, longitude = ?, observacoes = ?
    WHERE id = ?
  `).run(nome, telefone || null, endereco || null, latitude ?? null, longitude ?? null, observacoes || null, id);
  const row = db.prepare("SELECT * FROM clientes WHERE id = ?").get(id);
  if (!row) return enviarJson(res, 404, { erro: "Cliente não encontrado" });
  enviarJson(res, 200, row);
}

function excluirCliente(res, id) {
  db.prepare("DELETE FROM clientes WHERE id = ?").run(id);
  res.writeHead(204).end();
}

// ---------- Matéria-prima e Produtos (mesma estrutura) ----------
const TABELAS_ESTOQUE = new Set(["materiaprima", "produtos"]);

function carregarComposicao(produtoId) {
  return db.prepare("SELECT * FROM produto_composicao WHERE produto_id = ? ORDER BY id").all(produtoId);
}

function salvarComposicao(produtoId, composicao) {
  db.prepare("DELETE FROM produto_composicao WHERE produto_id = ?").run(produtoId);
  if (!Array.isArray(composicao)) return;
  const inserir = db.prepare(`
    INSERT INTO produto_composicao (produto_id, materiaprima_id, materiaprima_nome, ud, quantidade) VALUES (?, ?, ?, ?, ?)
  `);
  for (const item of composicao) {
    if (!item.materiaprima_id || !item.quantidade) continue;
    const mp = db.prepare("SELECT * FROM materiaprima WHERE id = ?").get(item.materiaprima_id);
    if (!mp) continue;
    inserir.run(produtoId, mp.id, mp.nome, mp.ud || null, item.quantidade);
  }
}

function listarEstoque(res, tabela) {
  const rows = db.prepare(`SELECT * FROM ${tabela} ORDER BY nome COLLATE NOCASE`).all();
  if (tabela === "produtos") {
    rows.forEach(row => { row.composicao = carregarComposicao(row.id); });
  }
  enviarJson(res, 200, rows);
}

function criarEstoque(res, tabela, body) {
  const { nome, ud, valor, estoque, pacote, peso_pacote, preco_pacote, composicao } = body;
  if (!nome) return enviarJson(res, 400, { erro: "Nome é obrigatório" });
  let info;
  if (tabela === "materiaprima") {
    info = db.prepare(`
      INSERT INTO materiaprima (nome, ud, valor, estoque, pacote, peso_pacote, preco_pacote) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(nome, ud || null, valor ?? 0, estoque ?? 0, pacote ?? null, peso_pacote ?? null, preco_pacote ?? null);
  } else {
    info = db.prepare(`
      INSERT INTO ${tabela} (nome, ud, valor, estoque) VALUES (?, ?, ?, ?)
    `).run(nome, ud || null, valor ?? 0, estoque ?? 0);
    salvarComposicao(info.lastInsertRowid, composicao);
  }
  const row = db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(info.lastInsertRowid);
  if (tabela === "produtos") row.composicao = carregarComposicao(row.id);
  enviarJson(res, 201, row);
}

function atualizarEstoque(res, tabela, id, body) {
  const { nome, ud, valor, estoque, pacote, peso_pacote, preco_pacote, composicao } = body;
  if (!nome) return enviarJson(res, 400, { erro: "Nome é obrigatório" });
  if (tabela === "materiaprima") {
    db.prepare(`
      UPDATE materiaprima SET nome = ?, ud = ?, valor = ?, estoque = ?, pacote = ?, peso_pacote = ?, preco_pacote = ? WHERE id = ?
    `).run(nome, ud || null, valor ?? 0, estoque ?? 0, pacote ?? null, peso_pacote ?? null, preco_pacote ?? null, id);
  } else {
    db.prepare(`
      UPDATE ${tabela} SET nome = ?, ud = ?, valor = ?, estoque = ? WHERE id = ?
    `).run(nome, ud || null, valor ?? 0, estoque ?? 0, id);
    salvarComposicao(id, composicao);
  }
  const row = db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(id);
  if (!row) return enviarJson(res, 404, { erro: "Registro não encontrado" });
  if (tabela === "produtos") row.composicao = carregarComposicao(row.id);
  enviarJson(res, 200, row);
}

function excluirEstoque(res, tabela, id) {
  if (tabela === "produtos") {
    db.prepare("DELETE FROM produto_composicao WHERE produto_id = ?").run(id);
  }
  db.prepare(`DELETE FROM ${tabela} WHERE id = ?`).run(id);
  res.writeHead(204).end();
}

// ---------- Pedidos ----------
function listarPedidos(res) {
  const pedidos = db.prepare("SELECT * FROM pedidos ORDER BY id DESC").all();
  const itensStmt = db.prepare("SELECT * FROM pedido_itens WHERE pedido_id = ?");
  pedidos.forEach(p => p.itens = itensStmt.all(p.id));
  enviarJson(res, 200, pedidos);
}

function criarPedido(res, body) {
  const { cliente_id, observacoes, itens } = body;
  if (!cliente_id) return enviarJson(res, 400, { erro: "Cliente é obrigatório" });
  if (!Array.isArray(itens) || itens.length === 0) {
    return enviarJson(res, 400, { erro: "Inclua ao menos um item" });
  }

  const cliente = db.prepare("SELECT * FROM clientes WHERE id = ?").get(cliente_id);
  if (!cliente) return enviarJson(res, 400, { erro: "Cliente não encontrado" });

  try {
    db.exec("BEGIN");

    let total = 0;
    const itensParaInserir = itens.map(item => {
      const produto = db.prepare("SELECT * FROM produtos WHERE id = ?").get(item.produto_id);
      if (!produto) throw new Error("Produto não encontrado");
      const quantidade = Number(item.quantidade) || 0;
      const subtotal = produto.valor * quantidade;
      total += subtotal;
      return {
        produto_id: produto.id,
        produto_nome: produto.nome,
        ud: produto.ud,
        valor_unitario: produto.valor,
        quantidade,
        subtotal
      };
    });

    const infoPedido = db.prepare(`
      INSERT INTO pedidos (cliente_id, cliente_nome, status, total, observacoes)
      VALUES (?, ?, 'Pendente', ?, ?)
    `).run(cliente_id, cliente.nome, total, observacoes || null);

    const pedidoId = infoPedido.lastInsertRowid;
    const inserirItem = db.prepare(`
      INSERT INTO pedido_itens (pedido_id, produto_id, produto_nome, ud, valor_unitario, quantidade, subtotal)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const baixarEstoque = db.prepare("UPDATE produtos SET estoque = estoque - ? WHERE id = ?");

    itensParaInserir.forEach(item => {
      inserirItem.run(pedidoId, item.produto_id, item.produto_nome, item.ud, item.valor_unitario, item.quantidade, item.subtotal);
      baixarEstoque.run(item.quantidade, item.produto_id);
    });

    db.exec("COMMIT");

    const pedido = db.prepare("SELECT * FROM pedidos WHERE id = ?").get(pedidoId);
    pedido.itens = db.prepare("SELECT * FROM pedido_itens WHERE pedido_id = ?").all(pedidoId);
    enviarJson(res, 201, pedido);
  } catch (e) {
    db.exec("ROLLBACK");
    enviarJson(res, 400, { erro: e.message });
  }
}

function atualizarStatusPedido(res, id, body) {
  const { status } = body;
  if (!status) return enviarJson(res, 400, { erro: "Status é obrigatório" });
  db.prepare("UPDATE pedidos SET status = ? WHERE id = ?").run(status, id);
  const row = db.prepare("SELECT * FROM pedidos WHERE id = ?").get(id);
  if (!row) return enviarJson(res, 404, { erro: "Pedido não encontrado" });
  row.itens = db.prepare("SELECT * FROM pedido_itens WHERE pedido_id = ?").all(id);
  enviarJson(res, 200, row);
}

function excluirPedido(res, id) {
  db.exec("BEGIN");
  const itens = db.prepare("SELECT * FROM pedido_itens WHERE pedido_id = ?").all(id);
  const devolverEstoque = db.prepare("UPDATE produtos SET estoque = estoque + ? WHERE id = ?");
  itens.forEach(item => devolverEstoque.run(item.quantidade, item.produto_id));
  db.prepare("DELETE FROM pedido_itens WHERE pedido_id = ?").run(id);
  db.prepare("DELETE FROM pedidos WHERE id = ?").run(id);
  db.exec("COMMIT");
  res.writeHead(204).end();
}

const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split("?")[0];
  const partes = urlPath.split("/").filter(Boolean); // ex: ["api", "clientes", "1"]

  if (partes[0] !== "api") {
    if (req.method === "GET") return servirArquivo(req, res);
    res.writeHead(405).end();
    return;
  }

  let body = {};
  if (req.method === "POST" || req.method === "PUT") {
    try {
      body = await lerCorpo(req);
    } catch {
      return enviarJson(res, 400, { erro: "JSON inválido" });
    }
  }

  const recurso = partes[1];
  const id = partes[2];

  if (recurso === "clientes") {
    if (req.method === "GET" && !id) return listarClientes(res);
    if (req.method === "POST" && !id) return criarCliente(res, body);
    if (req.method === "PUT" && id) return atualizarCliente(res, id, body);
    if (req.method === "DELETE" && id) return excluirCliente(res, id);
  }

  if (TABELAS_ESTOQUE.has(recurso)) {
    if (req.method === "GET" && !id) return listarEstoque(res, recurso);
    if (req.method === "POST" && !id) return criarEstoque(res, recurso, body);
    if (req.method === "PUT" && id) return atualizarEstoque(res, recurso, id, body);
    if (req.method === "DELETE" && id) return excluirEstoque(res, recurso, id);
  }

  if (recurso === "pedidos") {
    if (req.method === "GET" && !id) return listarPedidos(res);
    if (req.method === "POST" && !id) return criarPedido(res, body);
    if (req.method === "PUT" && id) return atualizarStatusPedido(res, id, body);
    if (req.method === "DELETE" && id) return excluirPedido(res, id);
  }

  enviarJson(res, 404, { erro: "Rota não encontrada" });
});

server.listen(PORT, "0.0.0.0", () => {
  const ips = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces || []) {
      if (iface.family === "IPv4" && !iface.internal) ips.push(iface.address);
    }
  }
  console.log(`NATIVA rodando na porta ${PORT}`);
  console.log(`  Local:  http://localhost:${PORT}`);
  ips.forEach(ip => console.log(`  Rede:   http://${ip}:${PORT}`));
});
