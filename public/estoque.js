const API_ESTOQUE = document.currentScript.dataset.api;
const TEM_PACOTE = API_ESTOQUE === "materiaprima";
const TEM_COMPOSICAO = API_ESTOQUE === "produtos";

let itensCache = {};
let itemEditando = null;
let materiaPrimaCache = [];

if (TEM_PACOTE) {
  document.getElementById("f-pacote").addEventListener("input", recalcularValor);
  document.getElementById("f-peso-pacote").addEventListener("input", recalcularValor);
  document.getElementById("f-preco-pacote").addEventListener("input", recalcularValor);
  document.getElementById("f-ud").addEventListener("change", () => {
    atualizarCamposPacote();
    recalcularValor();
  });
}

function atualizarCamposPacote() {
  const ud = document.getElementById("f-ud").value;
  document.getElementById("grupo-peso-pacote").style.display = ud === "Ud" ? "none" : "";
}

function recalcularValor() {
  const ud = document.getElementById("f-ud").value;
  const pacote = parseFloat(document.getElementById("f-pacote").value) || 0;
  const peso = parseFloat(document.getElementById("f-peso-pacote").value) || 0;
  const preco = parseMoeda(document.getElementById("f-preco-pacote").value);
  const divisor = ud === "Ud" ? pacote : peso;
  const valor = divisor > 0 ? preco / divisor : 0;
  document.getElementById("f-valor").value = valor.toFixed(2).replace(".", ",");
}

async function carregar() {
  const res = await fetch(`/api/${API_ESTOQUE}`);
  const itens = await res.json();
  render(itens);
}

async function carregarMateriaPrima() {
  const res = await fetch("/api/materiaprima");
  materiaPrimaCache = await res.json();
}

function criarLinhaComposicao(item) {
  const opcoes = materiaPrimaCache.map(mp =>
    `<option value="${mp.id}">${escHtml(mp.nome)} (${escHtml(mp.ud || "-")})</option>`
  ).join("");

  const linha = document.createElement("div");
  linha.className = "form-item-row";
  linha.innerHTML = `
    <select class="comp-materiaprima">${opcoes}</select>
    <input type="number" step="any" min="0" class="comp-qtd" value="${item ? item.quantidade : 1}" />
    <button type="button" class="btn-remove-item" onclick="removerComposicaoItem(this)">✕</button>
  `;
  if (item) linha.querySelector(".comp-materiaprima").value = item.materiaprima_id;
  return linha;
}

function adicionarComposicaoItem(item) {
  if (materiaPrimaCache.length === 0) {
    alert("Cadastre matérias-primas antes de montar a composição.");
    return;
  }
  document.getElementById("composicao-container").appendChild(criarLinhaComposicao(item));
}

function removerComposicaoItem(botao) {
  botao.closest(".form-item-row").remove();
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

  if (TEM_PACOTE) atualizarCamposPacote();

  if (TEM_COMPOSICAO) {
    const container = document.getElementById("composicao-container");
    container.innerHTML = "";
    if (itemEditando) {
      (itensCache[itemEditando].composicao || []).forEach(item => {
        container.appendChild(criarLinhaComposicao(item));
      });
    }
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

  if (TEM_COMPOSICAO) {
    payload.composicao = [];
    document.querySelectorAll("#composicao-container .form-item-row").forEach(linha => {
      const materiaprimaId = Number(linha.querySelector(".comp-materiaprima").value);
      const quantidade = parseFloat(linha.querySelector(".comp-qtd").value) || 0;
      if (materiaprimaId && quantidade > 0) {
        payload.composicao.push({ materiaprima_id: materiaprimaId, quantidade });
      }
    });
  }

  if (TEM_PACOTE && !itemEditando && payload.preco_pacote > 0) {
    payload.pagamento = await perguntarEscolha("Pagamento da compra", [
      { label: "À vista", value: "avista" },
      { label: "A pagar", value: "apagar" }
    ]);
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

if (TEM_COMPOSICAO) carregarMateriaPrima().then(carregar);
else carregar();
