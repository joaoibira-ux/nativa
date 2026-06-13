const API_ESTOQUE = document.currentScript.dataset.api;
const TEM_PACOTE = API_ESTOQUE === "materiaprima";

let itensCache = {};
let itemEditando = null;

if (TEM_PACOTE) {
  document.getElementById("f-peso-pacote").addEventListener("input", recalcularValor);
  document.getElementById("f-preco-pacote").addEventListener("input", recalcularValor);
}

function recalcularValor() {
  const peso = parseFloat(document.getElementById("f-peso-pacote").value) || 0;
  const preco = parseMoeda(document.getElementById("f-preco-pacote").value);
  const valor = peso > 0 ? preco / peso : 0;
  document.getElementById("f-valor").value = valor.toFixed(2).replace(".", ",");
}

async function carregar() {
  const res = await fetch(`/api/${API_ESTOQUE}`);
  const itens = await res.json();
  render(itens);
}

function render(itens) {
  const lista = document.getElementById("lista");
  itensCache = {};

  if (itens.length === 0) {
    lista.innerHTML = '<div class="empty">Nenhum item cadastrado</div>';
    return;
  }

  lista.innerHTML = itens.map(i => {
    itensCache[i.id] = i;
    return `
      <div class="card">
        <div class="card-acoes">
          <button class="btn-edit" onclick="abrirFormulario(${i.id})">✏️</button>
          <button class="btn-del" onclick="excluirItem(${i.id})">🗑️</button>
        </div>
        <div class="card-nome">${escHtml(i.nome)}</div>
        <div class="card-meta">
          <span>UD: ${escHtml(i.ud || "-")}</span>
          <span>Valor: ${fmtMoeda(i.valor)}</span>
          <span>Estoque: ${i.estoque}</span>
        </div>
      </div>
    `;
  }).join("");
}

function abrirFormulario(id) {
  itemEditando = id || null;

  if (itemEditando) {
    const i = itensCache[itemEditando];
    document.getElementById("f-nome").value = i.nome || "";
    document.getElementById("f-ud").value = i.ud || "";
    document.getElementById("f-valor").value = String(i.valor ?? 0).replace(".", ",");
    document.getElementById("f-estoque").value = i.estoque ?? 0;
    if (TEM_PACOTE) {
      document.getElementById("f-pacote").value = i.pacote ?? "";
      document.getElementById("f-peso-pacote").value = i.peso_pacote ?? "";
      document.getElementById("f-preco-pacote").value = String(i.preco_pacote ?? 0).replace(".", ",");
    }
  } else {
    document.getElementById("form").reset();
  }

  document.getElementById("form-overlay").style.display = "flex";
}

function fecharFormulario() {
  document.getElementById("form-overlay").style.display = "none";
}

async function salvarItem() {
  const nome = document.getElementById("f-nome").value.trim();
  if (!nome) {
    alert("Informe o nome");
    return;
  }

  const payload = {
    nome,
    ud: document.getElementById("f-ud").value.trim(),
    valor: parseMoeda(document.getElementById("f-valor").value),
    estoque: parseFloat(document.getElementById("f-estoque").value) || 0
  };

  if (TEM_PACOTE) {
    payload.pacote = parseFloat(document.getElementById("f-pacote").value) || null;
    payload.peso_pacote = parseFloat(document.getElementById("f-peso-pacote").value) || null;
    payload.preco_pacote = parseMoeda(document.getElementById("f-preco-pacote").value);
  }

  const url = itemEditando ? `/api/${API_ESTOQUE}/${itemEditando}` : `/api/${API_ESTOQUE}`;
  const method = itemEditando ? "PUT" : "POST";

  await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  fecharFormulario();
  carregar();
}

async function excluirItem(id) {
  if (!confirm("Excluir este item?")) return;
  await fetch(`/api/${API_ESTOQUE}/${id}`, { method: "DELETE" });
  carregar();
}

carregar();
