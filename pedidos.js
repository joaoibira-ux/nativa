const colPedidos = db.collection("pedidos");
const colClientes = db.collection("clientes");
const colProdutos = db.collection("produtos");
const colCaixa = db.collection("caixaLancamentos");
const colContasReceber = db.collection("contasReceber");

let clientesCache = [];
let pedidosCache = {};

colClientes.orderBy("nome").onSnapshot(snap => {
  clientesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
});

colPedidos.orderBy("criadoEm", "desc").onSnapshot(snap => {
  const pedidos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  render(pedidos);
});

function render(pedidos) {
  const lista = document.getElementById("lista");
  pedidosCache = {};

  if (pedidos.length === 0) {
    lista.innerHTML = '<div class="empty">Nenhum pedido cadastrado</div>';
    return;
  }

  lista.innerHTML = pedidos.map(p => {
    pedidosCache[p.id] = p;
    const statusClasse = p.status === "Entregue" ? "entregue" : "pendente";
    const itensHtml = (p.itens || []).map(i => `
      <div class="pedido-item-linha">
        <span>${escHtml(i.produtoNome)} x ${i.quantidade}</span>
        <span>${fmtMoeda(i.subtotal)}</span>
      </div>
    `).join("");

    const pagamentoTexto = p.pagamento === "avista" ? "À vista" : p.pagamento === "receber" ? "A receber" : "";

    return `
      <div class="card">
        <div class="card-acoes">
          <button class="btn-del" onclick="excluirPedido('${p.id}')">🗑️</button>
        </div>
        <div class="card-nome">
          ${escHtml(p.clienteNome)}
          <button class="badge-status ${statusClasse}" onclick="toggleStatus('${p.id}')">${escHtml(p.status)}</button>
        </div>
        <div class="card-meta">${fmtTimestampComHora(p.criadoEm)}${pagamentoTexto ? ` · ${pagamentoTexto}` : ""}</div>
        <div class="pedido-itens">${itensHtml}</div>
        <div class="pedido-total">Total: ${fmtMoeda(p.total)}</div>
        ${p.observacoes ? `<div class="card-obs">${escHtml(p.observacoes)}</div>` : ""}
      </div>
    `;
  }).join("");
}

function abrirFormulario() {
  const lista = document.getElementById("lista-clientes-pedido");

  if (clientesCache.length === 0) {
    lista.innerHTML = '<div class="empty">Cadastre um cliente antes de criar um pedido</div>';
  } else {
    lista.innerHTML = clientesCache.map(c => `
      <div class="card" style="cursor:pointer" onclick="selecionarClientePedido('${c.id}')">
        <div class="card-nome">${escHtml(c.nome)}</div>
        ${c.telefone ? `<div class="card-info">📞 ${escHtml(c.telefone)}</div>` : ""}
      </div>
    `).join("");
  }

  document.getElementById("form-overlay").style.display = "flex";
}

function selecionarClientePedido(clienteId) {
  window.open("./cardapio/?cliente=" + clienteId, "_blank");
  fecharFormulario();
}

function fecharFormulario() {
  document.getElementById("form-overlay").style.display = "none";
}

async function toggleStatus(id) {
  const pedido = pedidosCache[id];
  if (!pedido) return;

  const novoStatus = pedido.status === "Entregue" ? "Pendente" : "Entregue";
  const dados = { status: novoStatus };
  let pagamentoEscolhido = pedido.pagamento;

  if (novoStatus === "Entregue" && !pedido.pagamento) {
    pagamentoEscolhido = await perguntarEscolha("Pagamento do pedido", [
      { label: "À vista", value: "avista" },
      { label: "A receber", value: "receber" }
    ]);
    dados.pagamento = pagamentoEscolhido;
  }

  const batch = db.batch();
  batch.update(colPedidos.doc(id), dados);

  if (novoStatus === "Entregue" && !pedido.pagamento) {
    const descricao = `Pedido: ${pedido.clienteNome}`;
    if (pagamentoEscolhido === "avista") {
      batch.set(colCaixa.doc(), {
        data: new Date().toISOString().slice(0, 10),
        descricao,
        tipo: "entrada",
        valor: pedido.total,
        origem: "pedido",
        criadoEm: firebase.firestore.FieldValue.serverTimestamp()
      });
    } else if (pagamentoEscolhido === "receber") {
      batch.set(colContasReceber.doc(), {
        pedidoId: id,
        descricao,
        valor: pedido.total,
        status: "Pendente",
        criadoEm: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
  }

  await batch.commit();
}

async function excluirPedido(id) {
  if (!confirm("Excluir este pedido? O estoque dos produtos será devolvido.")) return;

  await db.runTransaction(async t => {
    const pedidoRef = colPedidos.doc(id);
    const pedidoSnap = await t.get(pedidoRef);
    if (!pedidoSnap.exists) return;
    const pedido = pedidoSnap.data();
    const itens = pedido.itens || [];

    const produtoRefs = itens.filter(i => i.produtoId).map(i => colProdutos.doc(i.produtoId));
    const produtoSnaps = await Promise.all(produtoRefs.map(ref => t.get(ref)));

    produtoSnaps.forEach((snap, idx) => {
      if (!snap.exists) return;
      const item = itens.filter(i => i.produtoId)[idx];
      const novoEstoque = (snap.data().estoque || 0) + item.quantidade;
      t.update(produtoRefs[idx], { estoque: novoEstoque });
    });

    t.delete(pedidoRef);
  });
}
