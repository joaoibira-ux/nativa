const VERSAO_CARDAPIO = "1.01";

const PIX_CHAVE = "062.911.904-00";
const PIX_FAVORECIDO = "Fernanda Souza";

const firebaseConfig = {
  apiKey: "AIzaSyBlZJnj8zFz3vuIpvRIjPA62gAda21EmCc",
  authDomain: "sistema-nativa-ibira.firebaseapp.com",
  projectId: "sistema-nativa-ibira",
  storageBucket: "sistema-nativa-ibira.firebasestorage.app",
  messagingSenderId: "34313083428",
  appId: "1:34313083428:web:86d2edbd67a38c3f8b96b1"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const CARRINHO_KEY = "nativa_cardapio_carrinho";

let clienteId = null;
let clienteNome = "";
let categorias = [];
let carrinho = [];

const appEl = document.getElementById("app");

document.addEventListener("DOMContentLoaded", () => {
  const versaoEl = document.getElementById("footer-versao");
  if (versaoEl) versaoEl.textContent = "Cardápio · v" + VERSAO_CARDAPIO;
  carrinho = carregarCarrinho();
  init();
});

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtMoeda(v) {
  return "R$ " + Number(v || 0).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function iconeCategoria(nome) {
  const mapa = {
    "Iogurte Natural Artesanal": "🍶",
    "Marmitas Fit Congeladas": "🍱",
    "Marmita Fit de Camarão": "🍤",
    "Salada Proteica no Copo": "🥗",
    "Wraps Congelados": "🌯"
  };
  return mapa[nome] || "🌿";
}

function iconeGrupo(nome) {
  if (/prote[íi]na|tipo|camar[ãa]o/i.test(nome)) return "🍗";
  if (/acompanhamento/i.test(nome)) return "🥗";
  if (/geleia/i.test(nome)) return "🍇";
  if (/ingrediente/i.test(nome)) return "🥬";
  if (/molho/i.test(nome)) return "🥣";
  return "🌿";
}

function carregarCarrinho() {
  try {
    const raw = sessionStorage.getItem(CARRINHO_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function salvarCarrinho() {
  try {
    sessionStorage.setItem(CARRINHO_KEY, JSON.stringify(carrinho));
  } catch (e) {}
}

async function init() {
  renderLoading();

  clienteId = new URLSearchParams(window.location.search).get("cliente");
  if (!clienteId) {
    renderErro(
      "Link inválido",
      "Este link não tem um cliente associado. Peça ao vendedor um link personalizado do cardápio."
    );
    return;
  }

  let clienteSnap;
  try {
    clienteSnap = await db.collection("clientes").doc(clienteId).get();
  } catch (e) {
    renderErro("Erro ao carregar", "Não foi possível conectar. Verifique sua internet e tente novamente.");
    return;
  }

  if (!clienteSnap.exists) {
    renderErro("Cliente não encontrado", "Este link não é mais válido. Peça um novo link ao vendedor.");
    return;
  }

  clienteNome = clienteSnap.data().nome || "";
  const headerCliente = document.getElementById("header-cliente");
  if (headerCliente) headerCliente.textContent = "Pedido para\n" + clienteNome;

  try {
    const snap = await db.collection("cardapioCategorias").orderBy("ordem").get();
    categorias = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    renderErro("Erro ao carregar cardápio", "Não foi possível carregar os produtos. Tente novamente em instantes.");
    return;
  }

  if (categorias.length === 0) {
    renderErro("Cardápio vazio", "Nenhum produto disponível no momento.");
    return;
  }

  renderCardapio();
}

function renderLoading() {
  appEl.innerHTML = `
    <div class="tela-central">
      <div class="icone">🌱</div>
      <h2>Carregando cardápio...</h2>
    </div>
  `;
}

function renderErro(titulo, msg) {
  appEl.innerHTML = `
    <div class="tela-central">
      <div class="icone">⚠️</div>
      <h2 class="serif">${escHtml(titulo)}</h2>
      <p>${escHtml(msg)}</p>
    </div>
  `;
}

/* ---------------- Tela principal do cardápio ---------------- */

function renderCardapio() {
  appEl.innerHTML = `
    <div class="conteudo">
      <div class="intro">
        <div class="leaf">🌿</div>
        <div class="marca-grande serif">CARDÁPIO</div>
        <div class="separador"><span class="diamante"></span></div>
        <div class="marca-sub">VIDA SAUDÁVEL, SE ALIMENTE LEVE</div>
        <div class="frase">Toque em um item para montar do seu jeito.</div>
      </div>
      <div id="lista-categorias"></div>
    </div>
    ${renderFabCarrinho()}
  `;

  const lista = document.getElementById("lista-categorias");
  lista.innerHTML = categorias.map(cat => `
    <div class="categoria-card">
      <div class="categoria-topo">
        <div class="icone-circulo">${iconeCategoria(cat.nome)}</div>
        <div class="categoria-nome">${escHtml(cat.nome)}</div>
      </div>
      ${cat.subtitulo ? `<div class="categoria-sub">${escHtml(cat.subtitulo)}</div>` : ""}
      <div class="categoria-meta">
        ${cat.tamanho ? `<span>⚖️ ${escHtml(cat.tamanho)}</span>` : ""}
        ${cat.validade ? `<span>❄️ ${escHtml(cat.validade)}</span>` : ""}
      </div>
      ${cat.precoBase != null ? `<div class="categoria-preco serif">${fmtMoeda(cat.precoBase)} <span>a partir de</span></div>` : ""}
      <button class="btn-montar" onclick="abrirMontagem('${cat.id}')">Montar pedido</button>
    </div>
  `).join("");

  atualizarFabCarrinho();
}

function renderFabCarrinho() {
  return `<button class="fab-carrinho" id="fab-carrinho" onclick="abrirCarrinho()" style="display:none">
    <span><span class="badge" id="fab-badge">0</span>Ver carrinho</span>
    <span id="fab-total">R$ 0,00</span>
  </button>`;
}

function atualizarFabCarrinho() {
  const fab = document.getElementById("fab-carrinho");
  if (!fab) return;
  const totalItens = carrinho.reduce((s, i) => s + i.quantidade, 0);
  if (totalItens === 0) {
    fab.style.display = "none";
    return;
  }
  const resumo = calcularResumoCarrinho();
  fab.style.display = "flex";
  document.getElementById("fab-badge").textContent = totalItens;
  document.getElementById("fab-total").textContent = fmtMoeda(resumo.total);
}

/* ---------------- Montagem de item ---------------- */

let montagemAtual = null; // { categoria, selecoes: [[]], quantidade }

function abrirMontagem(categoriaId) {
  const categoria = categorias.find(c => c.id === categoriaId);
  if (!categoria) return;

  montagemAtual = {
    categoria,
    selecoes: (categoria.grupos || []).map(() => []),
    quantidade: 1
  };

  renderMontagem();
}

function renderMontagem() {
  const { categoria } = montagemAtual;

  const gruposHtml = (categoria.grupos || []).map((grupo, gi) => {
    const sel = montagemAtual.selecoes[gi];
    const completo = sel.length >= grupo.min;
    const rotuloContador = grupo.max === grupo.min
      ? `${sel.length}/${grupo.max} selecionado${grupo.max > 1 ? "s" : ""}`
      : `${sel.length}${grupo.max < 99 ? "/" + grupo.max : ""} selecionado${sel.length === 1 ? "" : "s"}${grupo.min > 0 ? " · mín. " + grupo.min : ""}`;

    const opcoesArr = grupo.opcoesComPreco
      ? grupo.opcoesComPreco.map(o => o.nome)
      : grupo.opcoes;

    const itensHtml = opcoesArr.map(nome => {
      const marcado = sel.includes(nome);
      const atingiuMax = sel.length >= grupo.max && !marcado;
      const precoOpt = grupo.opcoesComPreco ? grupo.opcoesComPreco.find(o => o.nome === nome) : null;
      const quadrado = grupo.max > 1 ? "1" : "0";
      return `
        <div class="opcao-item ${marcado ? "selecionado" : ""} ${atingiuMax ? "desabilitado" : ""}" data-quadrado="${quadrado}" onclick="toggleOpcao(${gi}, '${escHtml(nome).replace(/'/g, "\\'")}')">
          <span class="opcao-marca">${marcado ? "✓" : ""}</span>
          <span class="opcao-nome">${escHtml(nome)}</span>
          ${precoOpt ? `<span class="opcao-preco">${grupo.defineBasePreco ? fmtMoeda(precoOpt.preco) : "+" + fmtMoeda(precoOpt.preco)}</span>` : (grupo.precoPorItem ? `<span class="opcao-preco">+${fmtMoeda(grupo.precoPorItem)}</span>` : "")}
        </div>
      `;
    }).join("");

    return `
      <div class="grupo-bloco">
        <div class="grupo-cabecalho">
          <div class="icone-circulo pequeno">${iconeGrupo(grupo.nome)}</div>
          <span class="grupo-titulo">${escHtml(grupo.nome)}</span>
          <span class="grupo-contador ${completo ? "completo" : ""}">${rotuloContador}</span>
        </div>
        <div class="opcoes-lista">${itensHtml}</div>
      </div>
    `;
  }).join("");

  const especiaisHtml = (categoria.especiais && categoria.especiais.length) ? `
    <div class="especiais-titulo">
      <div class="icone-circulo pequeno">⭐</div>
      <span>Opções especiais (prontas)</span>
    </div>
    <div class="especiais-grid">
      ${categoria.especiais.map((esp, ei) => `
        <div class="especial-card">
          <div class="icone-circulo">🍽️</div>
          <div class="especial-nome">${escHtml(esp.nome)}</div>
          <div class="especial-preco">${fmtMoeda(esp.preco)}</div>
          <button class="btn-add-especial" onclick="adicionarEspecialDireto('${categoria.id}', ${ei})">Adicionar</button>
        </div>
      `).join("")}
    </div>
  ` : "";

  const precoAtual = calcularPrecoItem(categoria, montagemAtual.selecoes);
  const podeAdicionar = validarSelecaoCompleta(categoria, montagemAtual.selecoes);

  appEl.innerHTML = `
    <div class="overlay">
      <div class="overlay-header">
        <span class="titulo">${escHtml(categoria.nome)}</span>
        <button class="btn-fechar" onclick="fecharMontagem()">✕</button>
      </div>
      <div class="overlay-scroll">
        ${categoria.subtitulo ? `<p style="font-size:0.82rem;color:#7a6440;margin-bottom:16px;">${escHtml(categoria.subtitulo)}</p>` : ""}
        ${gruposHtml}
        ${especiaisHtml}
      </div>
      <div class="overlay-footer">
        <div class="qtd-stepper">
          <button onclick="alterarQtdMontagem(-1)">−</button>
          <span>${montagemAtual.quantidade}</span>
          <button onclick="alterarQtdMontagem(1)">+</button>
        </div>
        <button class="btn-confirmar-item" ${podeAdicionar ? "" : "disabled"} onclick="confirmarMontagem()">
          Adicionar · ${fmtMoeda(precoAtual * montagemAtual.quantidade)}
        </button>
      </div>
    </div>
  `;
}

function toggleOpcao(grupoIndex, nome) {
  const categoria = montagemAtual.categoria;
  const grupo = categoria.grupos[grupoIndex];
  const sel = montagemAtual.selecoes[grupoIndex];
  const idx = sel.indexOf(nome);

  if (idx >= 0) {
    sel.splice(idx, 1);
  } else {
    if (grupo.max === 1) {
      montagemAtual.selecoes[grupoIndex] = [nome];
    } else if (sel.length < grupo.max) {
      sel.push(nome);
    } else {
      return;
    }
  }
  renderMontagem();
}

function alterarQtdMontagem(delta) {
  const nova = montagemAtual.quantidade + delta;
  if (nova < 1) return;
  montagemAtual.quantidade = nova;
  renderMontagem();
}

function calcularPrecoItem(categoria, selecoes) {
  let preco = categoria.precoBase || 0;
  (categoria.grupos || []).forEach((grupo, i) => {
    const sel = selecoes[i] || [];
    if (grupo.opcoesComPreco) {
      sel.forEach(nome => {
        const opt = grupo.opcoesComPreco.find(o => o.nome === nome);
        if (!opt) return;
        if (grupo.defineBasePreco) preco = opt.preco;
        else preco += opt.preco;
      });
    } else if (grupo.precoPorItem) {
      preco += grupo.precoPorItem * sel.length;
    }
  });
  return preco;
}

function validarSelecaoCompleta(categoria, selecoes) {
  return (categoria.grupos || []).every((grupo, i) => (selecoes[i] || []).length >= grupo.min);
}

function montarDescricaoItem(categoria, selecoes) {
  return (categoria.grupos || [])
    .map(sel => sel)
    .map((_, i) => (selecoes[i] || []).join(", "))
    .filter(Boolean)
    .join(" + ");
}

function confirmarMontagem() {
  const { categoria, selecoes, quantidade } = montagemAtual;
  if (!validarSelecaoCompleta(categoria, selecoes)) return;

  const valorUnitario = calcularPrecoItem(categoria, selecoes);
  const descricao = montarDescricaoItem(categoria, selecoes);

  carrinho.push({
    idItem: "it_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
    categoriaId: categoria.id,
    categoriaNome: categoria.nome,
    descricao,
    valorUnitario,
    quantidade
  });
  salvarCarrinho();
  montagemAtual = null;
  renderCardapio();
}

function fecharMontagem() {
  montagemAtual = null;
  renderCardapio();
}

function adicionarEspecialDireto(categoriaId, especialIndex) {
  const categoria = categorias.find(c => c.id === categoriaId);
  if (!categoria) return;
  const esp = categoria.especiais[especialIndex];
  if (!esp) return;

  const existente = carrinho.find(i => i.categoriaId === categoriaId && i.descricao === esp.nome && i.especial);
  if (existente) {
    existente.quantidade += 1;
  } else {
    carrinho.push({
      idItem: "it_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      categoriaId: categoria.id,
      categoriaNome: categoria.nome,
      descricao: esp.nome,
      valorUnitario: esp.preco,
      quantidade: 1,
      especial: true
    });
  }
  salvarCarrinho();
  renderMontagem();
  atualizarFabCarrinhoSeVisivel();
}

function atualizarFabCarrinhoSeVisivel() {
  const fab = document.getElementById("fab-carrinho");
  if (fab) atualizarFabCarrinho();
}

/* ---------------- Carrinho ---------------- */

function calcularResumoCarrinho() {
  const porCategoria = {};
  carrinho.forEach(item => {
    if (!porCategoria[item.categoriaId]) {
      porCategoria[item.categoriaId] = { qtd: 0, subtotal: 0, nome: item.categoriaNome };
    }
    porCategoria[item.categoriaId].qtd += item.quantidade;
    porCategoria[item.categoriaId].subtotal += item.valorUnitario * item.quantidade;
  });

  let subtotalBruto = 0;
  let descontoCombo = 0;
  const avisosCombo = [];

  Object.entries(porCategoria).forEach(([catId, info]) => {
    subtotalBruto += info.subtotal;
    const categoria = categorias.find(c => c.id === catId);
    if (categoria && categoria.combos && categoria.combos.length) {
      const combo = categoria.combos.find(c => c.qtd === info.qtd);
      if (combo && combo.preco < info.subtotal) {
        const desconto = info.subtotal - combo.preco;
        descontoCombo += desconto;
        avisosCombo.push(`Combo ${info.qtd}un. de ${info.nome} aplicado: economia de ${fmtMoeda(desconto)}`);
      }
    }
  });

  return {
    subtotalBruto,
    descontoCombo,
    total: subtotalBruto - descontoCombo,
    avisosCombo
  };
}

function abrirCarrinho() {
  renderCarrinho();
}

function renderCarrinho() {
  const resumo = calcularResumoCarrinho();

  const itensHtml = carrinho.length === 0
    ? `<div class="empty-carrinho">Seu carrinho está vazio.</div>`
    : carrinho.map(item => `
      <div class="carrinho-item">
        <div class="carrinho-item-topo">
          <div class="carrinho-item-nome">${escHtml(item.categoriaNome)}</div>
          <button class="btn-remover-carrinho" onclick="removerDoCarrinho('${item.idItem}')">🗑️</button>
        </div>
        ${item.descricao ? `<div class="carrinho-item-desc">${escHtml(item.descricao)}</div>` : ""}
        <div class="carrinho-item-rodape">
          <span class="carrinho-item-qtd">Qtd: ${item.quantidade} × ${fmtMoeda(item.valorUnitario)}</span>
          <span class="carrinho-item-valor">${fmtMoeda(item.valorUnitario * item.quantidade)}</span>
        </div>
      </div>
    `).join("");

  const avisosHtml = resumo.avisosCombo.map(a => `<div class="combo-aviso">🎉 ${escHtml(a)}</div>`).join("");

  appEl.innerHTML = `
    <div class="overlay">
      <div class="overlay-header">
        <span class="titulo">Seu carrinho</span>
        <button class="btn-fechar" onclick="renderCardapio()">✕</button>
      </div>
      <div class="overlay-scroll">
        ${itensHtml}
        ${avisosHtml}
        ${carrinho.length > 0 ? `
          <textarea class="obs-input" id="obs-pedido" placeholder="Observações (opcional) — ex: ponto de referência, preferências..."></textarea>
          <div class="carrinho-resumo">
            <div class="carrinho-resumo-linha"><span>Subtotal</span><span>${fmtMoeda(resumo.subtotalBruto)}</span></div>
            ${resumo.descontoCombo > 0 ? `<div class="carrinho-resumo-linha desconto"><span>Desconto combo</span><span>-${fmtMoeda(resumo.descontoCombo)}</span></div>` : ""}
            <div class="carrinho-resumo-linha total"><span>Total</span><span>${fmtMoeda(resumo.total)}</span></div>
          </div>
        ` : ""}
      </div>
      ${carrinho.length > 0 ? `
        <div class="overlay-footer">
          <button class="btn-confirmar-item" onclick="finalizarPedido()">Finalizar pedido</button>
        </div>
      ` : ""}
    </div>
  `;
}

function removerDoCarrinho(idItem) {
  carrinho = carrinho.filter(i => i.idItem !== idItem);
  salvarCarrinho();
  renderCarrinho();
}

async function finalizarPedido() {
  if (carrinho.length === 0) return;

  const btn = document.querySelector(".btn-confirmar-item");
  if (btn) { btn.disabled = true; btn.textContent = "Enviando..."; }

  const resumo = calcularResumoCarrinho();
  const obsEl = document.getElementById("obs-pedido");
  const observacoes = obsEl ? obsEl.value.trim() : "";

  const itens = carrinho.map(item => ({
    produtoId: null,
    produtoNome: item.categoriaNome + (item.descricao ? " — " + item.descricao : ""),
    ud: "Ud",
    valorUnitario: item.valorUnitario,
    quantidade: item.quantidade,
    subtotal: item.valorUnitario * item.quantidade
  }));

  try {
    await db.collection("pedidos").add({
      clienteId,
      clienteNome,
      status: "Pendente",
      pagamento: null,
      origem: "cardapio",
      observacoes,
      itens,
      subtotalBruto: resumo.subtotalBruto,
      descontoCombo: resumo.descontoCombo,
      total: resumo.total,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = "Finalizar pedido"; }
    alert("Não foi possível enviar o pedido. Verifique sua internet e tente novamente.");
    return;
  }

  carrinho = [];
  sessionStorage.removeItem(CARRINHO_KEY);
  renderSucesso(resumo.total);
}

function renderSucesso(total) {
  appEl.innerHTML = `
    <div class="tela-central">
      <div class="sucesso-icone">✅</div>
      <h2 class="serif">Pedido enviado!</h2>
      <p>Seu pedido foi registrado. Para confirmar e entrar em produção, realize o pagamento via PIX abaixo.</p>
      <div class="pix-box">
        <div class="pix-label">Chave PIX (CPF)</div>
        <div class="pix-chave" id="pix-chave-valor">${escHtml(PIX_CHAVE)}</div>
        <div class="pix-favorecido">Favorecido: ${escHtml(PIX_FAVORECIDO)}</div>
        <div class="pix-label">Valor a pagar</div>
        <div class="pix-valor">${fmtMoeda(total)}</div>
        <button class="btn-copiar-pix" onclick="copiarChavePix()">Copiar chave PIX</button>
      </div>
      <p style="margin-top:14px;font-size:0.76rem;">Após o pagamento, seu pedido é confirmado e entra em produção. Prazo de entrega: até 5 dias úteis.</p>
      <button class="btn-voltar-cardapio" onclick="renderCardapio()">Voltar ao cardápio</button>
    </div>
  `;
}

async function copiarChavePix() {
  const chave = PIX_CHAVE.replace(/\D/g, "");
  try {
    await navigator.clipboard.writeText(chave);
  } catch (e) {
    const el = document.getElementById("pix-chave-valor");
    const range = document.createRange();
    range.selectNode(el);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    document.execCommand("copy");
    window.getSelection().removeAllRanges();
  }
  const btn = document.querySelector(".btn-copiar-pix");
  if (btn) {
    const original = btn.textContent;
    btn.textContent = "✅ Copiado!";
    setTimeout(() => { btn.textContent = original; }, 1500);
  }
}
