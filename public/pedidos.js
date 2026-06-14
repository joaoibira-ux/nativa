let clientesCache = [];
let produtosCache = [];

async function carregar() {
  const [pedidos, clientes, produtos] = await Promise.all([
    fetch("/api/pedidos").then(r => r.json()),
    fetch("/api/clientes").then(r => r.json()),
    fetch("/api/produtos").then(r => r.json())
  ]);
  clientesCache = clientes;
  produtosCache = produtos;
  render(pedidos);
}

function fmtData(criadoEm) {
  if (!criadoEm) return "";
  const [data, hora] = criadoEm.split(" ");
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano} ${hora ? hora.substring(0, 5) : ""}`;
}

function render(pedidos) {
  const lista = document.getElementById("lista");

  if (pedidos.length === 0) {
    lista.innerHTML = '<div class="empty">Nenhum pedido cadastrado</div>';
    return;
  }

  lista.innerHTML = pedidos.map(p => {
    const statusClasse = p.status === "Entregue" ? "entregue" : "pendente";
    const itensHtml = p.itens.map(i => `
      <div class="pedido-item-linha">
        <span>${escHtml(i.produto_nome)} x ${i.quantidade}</span>
        <span>${fmtMoeda(i.subtotal)}</span>
      </div>
    `).join("");

    const pagamentoTexto = p.pagamento === "avista" ? "À vista" : p.pagamento === "receber" ? "A receber" : "";

    return `
      <div class="card">
        <div class="card-acoes">
          <button class="btn-del" onclick="excluirPedido(${p.id})">🗑️</button>
        </div>
        <div class="card-nome">
          ${escHtml(p.cliente_nome)}
          <button class="badge-status ${statusClasse}" onclick="toggleStatus(${p.id}, '${p.status}', ${p.pagamento ? `'${p.pagamento}'` : "null"})">${escHtml(p.status)}</button>
        </div>
        <div class="card-meta">${fmtData(p.criado_em)}${pagamentoTexto ? ` · ${pagamentoTexto}` : ""}</div>
        <div class="pedido-itens">${itensHtml}</div>
        <div class="pedido-total">Total: ${fmtMoeda(p.total)}</div>
        ${p.observacoes ? `<div class="card-obs">${escHtml(p.observacoes)}</div>` : ""}
      </div>
    `;
  }).join("");
}

function criarLinhaItem() {
  const opcoes = produtosCache.map(prod =>
    `<option value="${prod.id}" data-valor="${prod.valor}">${escHtml(prod.nome)} (${fmtMoeda(prod.valor)})</option>`
  ).join("");

  const linha = document.createElement("div");
  linha.className = "form-item-row";
  linha.innerHTML = `
    <select class="item-produto">${opcoes}</select>
    <input type="number" step="any" min="0" class="item-qtd" value="1" />
    <button type="button" class="btn-remove-item" onclick="removerItem(this)">✕</button>
  `;
  linha.querySelector(".item-produto").addEventListener("change", recalcularTotal);
  linha.querySelector(".item-qtd").addEventListener("input", recalcularTotal);
  return linha;
}

function adicionarItem() {
  document.getElementById("itens-container").appendChild(criarLinhaItem());
  recalcularTotal();
}

function removerItem(botao) {
  botao.closest(".form-item-row").remove();
  recalcularTotal();
}

function recalcularTotal() {
  let total = 0;
  document.querySelectorAll("#itens-container .form-item-row").forEach(linha => {
    const select = linha.querySelector(".item-produto");
    const opcao = select.options[select.selectedIndex];
    const valor = opcao ? parseFloat(opcao.dataset.valor) || 0 : 0;
    const qtd = parseFloat(linha.querySelector(".item-qtd").value) || 0;
    total += valor * qtd;
  });
  document.getElementById("form-total").textContent = "Total: " + fmtMoeda(total);
}

function abrirFormulario() {
  const select = document.getElementById("f-cliente");
  select.innerHTML = clientesCache.map(c => `<option value="${c.id}">${escHtml(c.nome)}</option>`).join("");

  const container = document.getElementById("itens-container");
  container.innerHTML = "";
  if (produtosCache.length > 0) container.appendChild(criarLinhaItem());

  document.getElementById("f-obs").value = "";
  recalcularTotal();
  document.getElementById("form-overlay").style.display = "flex";
}

function fecharFormulario() {
  document.getElementById("form-overlay").style.display = "none";
}

async function salvarPedido() {
  const clienteId = document.getElementById("f-cliente").value;
  if (!clienteId) {
    alert("Cadastre um cliente antes de criar um pedido");
    return;
  }

  const itens = [];
  document.querySelectorAll("#itens-container .form-item-row").forEach(linha => {
    const produtoId = linha.querySelector(".item-produto").value;
    const quantidade = parseFloat(linha.querySelector(".item-qtd").value) || 0;
    if (produtoId && quantidade > 0) {
      itens.push({ produto_id: Number(produtoId), quantidade });
    }
  });

  if (itens.length === 0) {
    alert("Inclua ao menos um item com quantidade maior que zero");
    return;
  }

  const res = await fetch("/api/pedidos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cliente_id: Number(clienteId),
      observacoes: document.getElementById("f-obs").value.trim(),
      itens
    })
  });

  if (!res.ok) {
    const erro = await res.json().catch(() => ({}));
    alert(erro.erro || "Erro ao salvar pedido");
    return;
  }

  fecharFormulario();
  carregar();
}

async function toggleStatus(id, statusAtual, pagamentoAtual) {
  const novoStatus = statusAtual === "Entregue" ? "Pendente" : "Entregue";
  const body = { status: novoStatus };

  if (novoStatus === "Entregue" && !pagamentoAtual) {
    body.pagamento = await perguntarEscolha("Pagamento do pedido", [
      { label: "À vista", value: "avista" },
      { label: "A receber", value: "receber" }
    ]);
  }

  await fetch(`/api/pedidos/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  carregar();
}

async function excluirPedido(id) {
  if (!confirm("Excluir este pedido? O estoque dos produtos será devolvido.")) return;
  await fetch(`/api/pedidos/${id}`, { method: "DELETE" });
  carregar();
}

carregar();
