const colPedidos = db.collection("pedidos");

let pedidosCache = {};
let selecionados = new Set();

colPedidos.orderBy("criadoEm", "desc").onSnapshot(snap => {
  const pedidos = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(p => p.status === "Pendente");
  render(pedidos);
});

function render(pedidos) {
  const lista = document.getElementById("lista");
  pedidosCache = {};
  selecionados = new Set([...selecionados].filter(id => pedidos.some(p => p.id === id)));

  if (pedidos.length === 0) {
    lista.innerHTML = '<div class="empty">Nenhum pedido pendente no momento.</div>';
    atualizarBarraSelecao();
    return;
  }

  lista.innerHTML = pedidos.map(p => {
    pedidosCache[p.id] = p;
    const marcado = selecionados.has(p.id);
    const itensHtml = (p.itens || []).map(i => `
      <div class="pedido-item-linha">
        <span>${escHtml(i.produtoNome)} x ${i.quantidade}</span>
        <span>${fmtMoeda(i.subtotal)}</span>
      </div>
    `).join("");

    return `
      <div class="card romaneio-card ${marcado ? "romaneio-marcado" : ""}" onclick="toggleSelecao('${p.id}')">
        <div class="romaneio-checkbox">${marcado ? "✓" : ""}</div>
        <div class="romaneio-card-corpo">
          <div class="card-nome">${escHtml(p.clienteNome)}</div>
          <div class="card-meta">${fmtTimestampComHora(p.criadoEm)}</div>
          <div class="pedido-itens">${itensHtml}</div>
          <div class="pedido-total">Total: ${fmtMoeda(p.total)}</div>
        </div>
      </div>
    `;
  }).join("");

  atualizarBarraSelecao();
}

function toggleSelecao(id) {
  if (selecionados.has(id)) selecionados.delete(id);
  else selecionados.add(id);
  render(Object.values(pedidosCache));
}

function atualizarBarraSelecao() {
  const barra = document.getElementById("barra-selecao");
  const contador = document.getElementById("romaneio-contador");
  if (selecionados.size === 0) {
    barra.style.display = "none";
    return;
  }
  barra.style.display = "flex";
  contador.textContent = `${selecionados.size} pedido${selecionados.size > 1 ? "s" : ""} selecionado${selecionados.size > 1 ? "s" : ""}`;
}

// "Marmitas Fit Congeladas — Carne de patinho grelhada + Arroz integral, Feijão macassar, Purê de batata doce"
// vira ["Carne de patinho grelhada", "Arroz integral", "Feijão macassar", "Purê de batata doce"].
// Itens sem essa estrutura (ex: brinde) ou sem composição (ex: "Wraps Congelados — Frango") caem no fallback:
// usa o nome inteiro (depois do "—", se houver) como componente único.
function extrairComponentes(produtoNome) {
  if (produtoNome.includes("(brinde")) return [produtoNome];
  const idx = produtoNome.indexOf(" — ");
  if (idx === -1) return [produtoNome];
  const resto = produtoNome.slice(idx + 3);
  const partes = resto.split(" + ").flatMap(parte => parte.split(",").map(s => s.trim())).filter(Boolean);
  return partes.length ? partes : [produtoNome];
}

function gerarRomaneio() {
  const totais = {};
  const componentes = {};
  let totalGeralUnidades = 0;

  selecionados.forEach(id => {
    const pedido = pedidosCache[id];
    if (!pedido) return;
    (pedido.itens || []).forEach(item => {
      const chave = item.produtoNome;
      if (!totais[chave]) totais[chave] = { nome: chave, quantidade: 0 };
      totais[chave].quantidade += item.quantidade;
      totalGeralUnidades += item.quantidade;

      extrairComponentes(item.produtoNome).forEach(comp => {
        if (!componentes[comp]) componentes[comp] = { nome: comp, quantidade: 0 };
        componentes[comp].quantidade += item.quantidade;
      });
    });
  });

  const linhas = Object.values(totais).sort((a, b) => b.quantidade - a.quantidade);
  const linhasComponentes = Object.values(componentes).sort((a, b) => b.quantidade - a.quantidade);

  document.getElementById("romaneio-resultado-meta").textContent =
    `${selecionados.size} pedido${selecionados.size > 1 ? "s" : ""} · ${totalGeralUnidades} itens no total`;

  const renderLinhas = arr => arr.map(l => `
    <div class="romaneio-total-linha">
      <span class="romaneio-total-qtd">${l.quantidade}×</span>
      <span class="romaneio-total-nome">${escHtml(l.nome)}</span>
    </div>
  `).join("");

  const listaEl = document.getElementById("romaneio-resultado-lista");
  if (linhas.length === 0) {
    listaEl.innerHTML = '<div class="empty">Nenhum item encontrado.</div>';
  } else {
    listaEl.innerHTML = `
      <div class="romaneio-secao-titulo">Pratos completos</div>
      ${renderLinhas(linhas)}
      <div class="romaneio-secao-titulo">Componentes (ingredientes)</div>
      ${renderLinhas(linhasComponentes)}
    `;
  }

  document.getElementById("resultado-overlay").style.display = "flex";
}

function fecharResultado() {
  document.getElementById("resultado-overlay").style.display = "none";
}
