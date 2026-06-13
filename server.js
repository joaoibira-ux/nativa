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
`);

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
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
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

function listarEstoque(res, tabela) {
  const rows = db.prepare(`SELECT * FROM ${tabela} ORDER BY nome COLLATE NOCASE`).all();
  enviarJson(res, 200, rows);
}

function criarEstoque(res, tabela, body) {
  const { nome, ud, valor, estoque } = body;
  if (!nome) return enviarJson(res, 400, { erro: "Nome é obrigatório" });
  const info = db.prepare(`
    INSERT INTO ${tabela} (nome, ud, valor, estoque) VALUES (?, ?, ?, ?)
  `).run(nome, ud || null, valor ?? 0, estoque ?? 0);
  const row = db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(info.lastInsertRowid);
  enviarJson(res, 201, row);
}

function atualizarEstoque(res, tabela, id, body) {
  const { nome, ud, valor, estoque } = body;
  if (!nome) return enviarJson(res, 400, { erro: "Nome é obrigatório" });
  db.prepare(`
    UPDATE ${tabela} SET nome = ?, ud = ?, valor = ?, estoque = ? WHERE id = ?
  `).run(nome, ud || null, valor ?? 0, estoque ?? 0, id);
  const row = db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(id);
  if (!row) return enviarJson(res, 404, { erro: "Registro não encontrado" });
  enviarJson(res, 200, row);
}

function excluirEstoque(res, tabela, id) {
  db.prepare(`DELETE FROM ${tabela} WHERE id = ?`).run(id);
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
