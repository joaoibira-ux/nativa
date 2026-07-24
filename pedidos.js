const colPedidos = db.collection("pedidos");
const colClientes = db.collection("clientes");
const colProdutos = db.collection("produtos");
const colCaixa = db.collection("caixaLancamentos");
const colContasReceber = db.collection("contasReceber");

let clientesCache = [];
let produtosCache = [];
let pedidosCache = {};

colClientes.orderBy("nome").onSnapshot(snap => {
  clientesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
});

colProdutos.orderBy("nome").onSnapshot(snap => {
  produtosCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
  const cliente = clientesCache.find(c => c.id === clienteId);
  if (!cliente) {
    alert("Cliente não encontrado");
    return;
  }

  const itensInput = [];
  document.querySelectorAll("#itens-container .form-item-row").forEach(linha => {
    const produtoId = linha.querySelector(".item-produto").value;
    const quantidade = parseFloat(linha.querySelector(".item-qtd").value) || 0;
    if (produtoId && quantidade > 0) {
      itensInput.push({ produtoId, quantidade });
    }
  });

  if (itensInput.length === 0) {
    alert("Inclua ao menos um item com quantidade maior que zero");
    return;
  }

  const observacoes = document.getElementById("f-obs").value.trim();
  const novoPedidoRef = colPedidos.doc();

  try {
    await db.runTransaction(async t => {
      const produtoRefs = itensInput.map(it => colProdutos.doc(it.produtoId));
      const produtoSnaps = await Promise.all(produtoRefs.map(ref => t.get(ref)));

      let total = 0;
      const itens = produtoSnaps.map((snap, idx) => {
        if (!snap.exists) throw new Error("Produto não encontrado");
        const produto = snap.data();
        const quantidade = itensInput[idx].quantidade;
        const subtotal = (produto.valor || 0) * quantidade;
        total += subtotal;
        return {
          produtoId: snap.id,
          produtoNome: produto.nome,
          ud: produto.ud || "",
          valorUnitario: produto.valor || 0,
          quantidade,
          subtotal
        };
      });

      produtoSnaps.forEach((snap, idx) => {
        const novoEstoque = (snap.data().estoque || 0) - itensInput[idx].quantidade;
        t.update(produtoRefs[idx], { estoque: novoEstoque });
      });

      t.set(novoPedidoRef, {
        clienteId,
        clienteNome: cliente.nome,
        status: "Pendente",
        total,
        observacoes,
        pagamento: null,
        criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
        itens
      });
    });
  } catch (e) {
    alert(e.message || "Erro ao salvar pedido");
    return;
  }

  fecharFormulario();
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
