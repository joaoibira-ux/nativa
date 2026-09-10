const VERSAO_CARDAPIO = "1.07";

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
const CLIENTE_KEY = "nativa_cardapio_cliente";

let clienteId = null;
let clienteNome = "";
let clienteDados = null; // { nome, telefone, endereco }
let categorias = [];
let carrinho = [];
let todosClientes = [];
let categoriaPendente = null;

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

function fotoCategoria(nome) {
  const mapa = {
    "Iogurte Natural Artesanal": "./img/foto_iogurte.jpg",
    "Marmitas Fit Congeladas": "./img/foto_marmita_fit.jpg",
    "Marmita Fit de Camarão": "./img/foto_camarao.jpg",
    "Salada Proteica no Copo": "./img/foto_salada.jpg",
    "Wraps Congelados": "./img/foto_wraps.jpg"
  };
  return mapa[nome] || null;
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

  // Link personalizado (veio dos botões do ERP) já identifica o cliente.
  const clienteIdUrl = new URLSearchParams(window.location.search).get("cliente");
  if (clienteIdUrl) {
    try {
      const clienteSnap = await db.collection("clientes").doc(clienteIdUrl).get();
      if (clienteSnap.exists) {
        definirClienteIdentificado(clienteIdUrl, clienteSnap.data());
      }
    } catch (e) {
      // Sem conexão pra validar agora — segue sem identificar, tenta de novo ao montar.
    }
  }

  // Link encaminhado sem passar pelo sistema (ou sem cliente reconhecido):
  // tenta recuperar identificação salva nessa sessão.
  if (!clienteId) {
    try {
      const salvo = JSON.parse(sessionStorage.getItem(CLIENTE_KEY) || "null");
      if (salvo && salvo.id && salvo.dados) definirClienteIdentificado(salvo.id, salvo.dados);
    } catch (e) {}
  }

  renderCardapio();
}

function definirClienteIdentificado(id, dados) {
  clienteId = id;
  clienteDados = dados || {};
  clienteNome = clienteDados.nome || "";
  try {
    sessionStorage.setItem(CLIENTE_KEY, JSON.stringify({ id, dados: clienteDados }));
  } catch (e) {}
  const headerCliente = document.getElementById("header-cliente");
  if (headerCliente) headerCliente.textContent = "Pedido para\n" + clienteNome;
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
  lista.innerHTML = categorias.map(cat => {
    const foto = fotoCategoria(cat.nome);
    return `
    <div class="categoria-card" onclick="abrirMontagem('${cat.id}')">
      ${foto ? `<img class="categoria-foto" src="${foto}" alt="${escHtml(cat.nome)}" loading="lazy" />` : ""}
      <div class="categoria-corpo">
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
      </div>
    </div>
  `;
  }).join("");

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

/* ---------------- Montagem de item (assistente passo a passo) ---------------- */

let montagemAtual = null; // { categoria, selecoes: [[]], passo, quantidade }

function abrirMontagem(categoriaId) {
  if (!clienteId) {
    categoriaPendente = categoriaId;
    abrirIdentificacaoCliente();
    return;
  }

  const categoria = categorias.find(c => c.id === categoriaId);
  if (!categoria) return;

  montagemAtual = {
    categoria,
    selecoes: (categoria.grupos || []).map(() => []),
    passo: 0,
    quantidade: 1
  };

  renderPassoMontagem();
}

function renderPassoMontagem() {
  const { categoria, passo } = montagemAtual;
  const grupos = categoria.grupos || [];

  if (passo >= grupos.length) {
    finalizarItemMontagem();
    return;
  }

  const grupo = grupos[passo];
  const sel = montagemAtual.selecoes[passo];
  const totalPassos = grupos.length;
  const ultimoPasso = passo === totalPassos - 1;
  const podeAvancar = sel.length >= grupo.min;

  const rotuloContador = grupo.max === grupo.min
    ? `${sel.length}/${grupo.max} selecionado${grupo.max > 1 ? "s" : ""}`
    : `${sel.length}${grupo.max < 99 ? "/" + grupo.max : ""} selecionado${sel.length === 1 ? "" : "s"}${grupo.min > 0 ? " · mín. " + grupo.min : " · opcional"}`;

  const opcoesArr = grupo.opcoesComPreco ? grupo.opcoesComPreco.map(o => o.nome) : grupo.opcoes;

  const itensHtml = opcoesArr.map(nome => {
    const marcado = sel.includes(nome);
    const atingiuMax = grupo.max > 1 && sel.length >= grupo.max && !marcado;
    const precoOpt = grupo.opcoesComPreco ? grupo.opcoesComPreco.find(o => o.nome === nome) : null;
    const quadrado = grupo.max > 1 ? "1" : "0";
    return `
      <div class="opcao-item ${marcado ? "selecionado" : ""} ${atingiuMax ? "desabilitado" : ""}" data-quadrado="${quadrado}" onclick="toggleOpcaoPasso('${escHtml(nome).replace(/'/g, "\\'")}')">
        <span class="opcao-marca">${marcado ? "✓" : ""}</span>
        <span class="opcao-nome">${escHtml(nome)}</span>
        ${precoOpt ? `<span class="opcao-preco">${grupo.defineBasePreco ? fmtMoeda(precoOpt.preco) : "+" + fmtMoeda(precoOpt.preco)}</span>` : (grupo.precoPorItem ? `<span class="opcao-preco">+${fmtMoeda(grupo.precoPorItem)}</span>` : "")}
      </div>
    `;
  }).join("");

  const especiaisBtn = (passo === 0 && categoria.especiais && categoria.especiais.length) ? `
    <button class="link-especiais" onclick="abrirEspeciaisWizard()">🍽️ Prefere um prato já pronto? Ver opções especiais</button>
  ` : "";

  const precoAtual = calcularPrecoItem(categoria, montagemAtual.selecoes);

  appEl.innerHTML = `
    <div class="overlay overlay-fixo">
      <div class="overlay-header">
        <button class="btn-fechar" onclick="voltarPassoMontagem()">${passo === 0 ? "✕" : "←"}</button>
        <span class="titulo">${escHtml(categoria.nome)}</span>
        <span class="passo-indicador">${passo + 1}/${totalPassos}</span>
      </div>
      <div class="passo-corpo">
        <div class="grupo-cabecalho-grande">
          <div class="icone-circulo">${iconeGrupo(grupo.nome)}</div>
          <div>
            <div class="grupo-titulo-grande serif">${escHtml(grupo.nome)}</div>
            <div class="grupo-contador ${sel.length >= grupo.min ? "completo" : ""}">${rotuloContador}</div>
          </div>
        </div>
        <div class="opcoes-grid">${itensHtml}</div>
        ${especiaisBtn}
      </div>
      <div class="overlay-footer coluna-footer">
        ${ultimoPasso ? `
          <div class="qtd-stepper">
            <button onclick="alterarQtdMontagem(-1)">−</button>
            <span>${montagemAtual.quantidade}</span>
            <button onclick="alterarQtdMontagem(1)">+</button>
          </div>
        ` : ""}
        <button class="btn-confirmar-item" ${podeAvancar ? "" : "disabled"} onclick="avancarPassoMontagem()">
          ${ultimoPasso ? `Ir para o carrinho · ${fmtMoeda(precoAtual * montagemAtual.quantidade)}` : "Avançar"}
        </button>
      </div>
    </div>
  `;
}

function toggleOpcaoPasso(nome) {
  const { categoria, passo } = montagemAtual;
  const grupo = categoria.grupos[passo];
  const sel = montagemAtual.selecoes[passo];
  const idx = sel.indexOf(nome);

  if (idx >= 0) {
    sel.splice(idx, 1);
    renderPassoMontagem();
    return;
  }

  if (grupo.max === 1) {
    montagemAtual.selecoes[passo] = [nome];
    renderPassoMontagem();
    setTimeout(avancarPassoMontagem, 220);
    return;
  }

  if (sel.length < grupo.max) {
    sel.push(nome);
    renderPassoMontagem();
    if (sel.length === grupo.max) setTimeout(avancarPassoMontagem, 220);
    return;
  }
}

function avancarPassoMontagem() {
  if (!montagemAtual) return;
  const grupo = montagemAtual.categoria.grupos[montagemAtual.passo];
  const sel = montagemAtual.selecoes[montagemAtual.passo];
  if (sel.length < grupo.min) return;
  montagemAtual.passo++;
  renderPassoMontagem();
}

function voltarPassoMontagem() {
  if (montagemAtual.passo === 0) {
    fecharMontagem();
    return;
  }
  montagemAtual.passo--;
  renderPassoMontagem();
}

function alterarQtdMontagem(delta) {
  const nova = montagemAtual.quantidade + delta;
  if (nova < 1) return;
  montagemAtual.quantidade = nova;
  renderPassoMontagem();
}

function finalizarItemMontagem() {
  const { categoria, selecoes, quantidade, editandoIdItem } = montagemAtual;

  const valorUnitario = calcularPrecoItem(categoria, selecoes);
  const descricao = montarDescricaoItem(categoria, selecoes);

  const item = {
    idItem: editandoIdItem || ("it_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7)),
    categoriaId: categoria.id,
    categoriaNome: categoria.nome,
    descricao,
    valorUnitario,
    quantidade,
    selecoes: selecoes.map(s => s.slice())
  };

  if (editandoIdItem) {
    const idx = carrinho.findIndex(i => i.idItem === editandoIdItem);
    if (idx >= 0) carrinho[idx] = item;
    else carrinho.push(item);
  } else {
    carrinho.push(item);
  }

  salvarCarrinho();
  montagemAtual = null;
  renderCarrinho();
}

function editarItemCarrinho(idItem) {
  const item = carrinho.find(i => i.idItem === idItem);
  if (!item || item.especial) return;
  const categoria = categorias.find(c => c.id === item.categoriaId);
  if (!categoria) return;

  montagemAtual = {
    categoria,
    selecoes: (item.selecoes || (categoria.grupos || []).map(() => [])).map(s => s.slice()),
    passo: 0,
    quantidade: item.quantidade,
    editandoIdItem: idItem
  };
  renderPassoMontagem();
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
  const editando = montagemAtual && montagemAtual.editandoIdItem;
  montagemAtual = null;
  categoriaPendente = null;
  if (editando) renderCarrinho();
  else renderCardapio();
}

/* ---------------- Identificação / cadastro de cliente ---------------- */

async function abrirIdentificacaoCliente() {
  if (todosClientes.length === 0) {
    appEl.innerHTML = `
      <div class="tela-central">
        <div class="icone">🌱</div>
        <h2 class="serif">Um instante...</h2>
      </div>
    `;
    try {
      const snap = await db.collection("clientes").orderBy("nome").get();
      todosClientes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
      todosClientes = [];
    }
  }
  renderIdentificacaoCliente("");
}

function renderIdentificacaoCliente(termoBusca) {
  const termo = termoBusca.trim().toLowerCase();
  const resultados = termo.length >= 2
    ? todosClientes.filter(c => (c.nome || "").toLowerCase().includes(termo)).slice(0, 8)
    : [];

  appEl.innerHTML = `
    <div class="overlay">
      <div class="overlay-header">
        <span class="titulo">Identifique-se</span>
        <button class="btn-fechar" onclick="cancelarIdentificacao()">✕</button>
      </div>
      <div class="overlay-scroll">
        <p style="font-size:0.85rem;color:#6b5638;margin-bottom:16px;">
          Antes de montar seu pedido, digite seu nome para localizarmos seu cadastro.
        </p>
        <div class="grupo-bloco">
          <input type="text" class="obs-input" id="busca-cliente-input" placeholder="Digite seu nome completo..."
            value="${escHtml(termoBusca)}" oninput="onBuscaClienteInput(this.value)" autofocus />
        </div>
        <div id="resultados-busca-cliente">
          ${renderResultadosBusca(termo, resultados)}
        </div>
      </div>
    </div>
  `;
  const input = document.getElementById("busca-cliente-input");
  if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
}

function renderResultadosBusca(termo, resultados) {
  if (termo.length < 2) return "";

  const listaHtml = resultados.length > 0 ? `
    <div class="opcoes-lista" style="margin-bottom:14px;">
      ${resultados.map(c => `
        <div class="opcao-item" onclick="selecionarClienteExistente('${c.id}')">
          <span class="opcao-marca"></span>
          <span class="opcao-nome">${escHtml(c.nome)}${c.telefone ? ` <span style="color:#a3823f;font-size:0.78rem;">· ${escHtml(c.telefone)}</span>` : ""}</span>
        </div>
      `).join("")}
    </div>
  ` : `<p style="font-size:0.82rem;color:#a3823f;margin-bottom:14px;">Nenhum cadastro encontrado com esse nome.</p>`;

  return `
    ${listaHtml}
    <button class="btn-confirmar-item" style="width:100%;" onclick="abrirCadastroNovoCliente()">
      Não me encontrei — quero me cadastrar
    </button>
  `;
}

function onBuscaClienteInput(valor) {
  const termo = valor.trim().toLowerCase();
  document.getElementById("resultados-busca-cliente").innerHTML = renderResultadosBusca(
    termo,
    termo.length >= 2 ? todosClientes.filter(c => (c.nome || "").toLowerCase().includes(termo)).slice(0, 8) : []
  );
}

function cancelarIdentificacao() {
  categoriaPendente = null;
  renderCardapio();
}

function selecionarClienteExistente(id) {
  const c = todosClientes.find(x => x.id === id);
  if (!c) return;
  definirClienteIdentificado(id, c);
  retomarAposIdentificacao();
}

function abrirCadastroNovoCliente() {
  const inputBusca = document.getElementById("busca-cliente-input");
  const nomeSugerido = inputBusca ? inputBusca.value.trim() : "";
  appEl.innerHTML = `
    <div class="overlay">
      <div class="overlay-header">
        <span class="titulo">Novo cadastro</span>
        <button class="btn-fechar" onclick="cancelarIdentificacao()">✕</button>
      </div>
      <div class="overlay-scroll">
        <div class="grupo-bloco">
          <div class="grupo-titulo" style="margin-bottom:8px;">Nome completo *</div>
          <input type="text" class="obs-input" id="novo-cliente-nome" placeholder="Seu nome completo" value="${escHtml(nomeSugerido || "")}" />
        </div>
        <div class="grupo-bloco">
          <div class="grupo-titulo" style="margin-bottom:8px;">Telefone</div>
          <input type="tel" class="obs-input" id="novo-cliente-telefone" placeholder="(00) 00000-0000" />
        </div>
        <div class="grupo-bloco">
          <div class="grupo-titulo" style="margin-bottom:8px;">Endereço</div>
          <input type="text" class="obs-input" id="novo-cliente-endereco" placeholder="Rua, número, bairro, cidade" />
        </div>
      </div>
      <div class="overlay-footer">
        <button class="btn-confirmar-item" onclick="salvarNovoClienteCardapio()">Salvar e continuar</button>
      </div>
    </div>
  `;
  document.getElementById("novo-cliente-nome").focus();
}

async function salvarNovoClienteCardapio() {
  const nome = document.getElementById("novo-cliente-nome").value.trim();
  if (!nome) {
    alert("Informe seu nome completo.");
    return;
  }
  const telefone = document.getElementById("novo-cliente-telefone").value.trim();
  const endereco = document.getElementById("novo-cliente-endereco").value.trim();

  const btn = document.querySelector(".btn-confirmar-item");
  if (btn) { btn.disabled = true; btn.textContent = "Salvando..."; }

  try {
    const ref = await db.collection("clientes").add({
      nome,
      telefone,
      endereco,
      observacoes: "",
      latitude: null,
      longitude: null,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });
    const novoCliente = { id: ref.id, nome, telefone, endereco };
    todosClientes.push(novoCliente);
    definirClienteIdentificado(ref.id, novoCliente);
    retomarAposIdentificacao();
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = "Salvar e continuar"; }
    alert("Não foi possível salvar seu cadastro. Verifique sua internet e tente novamente.");
  }
}

function retomarAposIdentificacao() {
  if (categoriaPendente) {
    const cat = categoriaPendente;
    categoriaPendente = null;
    abrirMontagem(cat);
  } else {
    renderCardapio();
  }
}

function abrirEspeciaisWizard() {
  const categoria = montagemAtual.categoria;
  appEl.innerHTML = `
    <div class="overlay overlay-fixo">
      <div class="overlay-header">
        <button class="btn-fechar" onclick="renderPassoMontagem()">←</button>
        <span class="titulo">${escHtml(categoria.nome)}</span>
      </div>
      <div class="passo-corpo">
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
              <button class="btn-add-especial" onclick="adicionarEspecialWizard('${categoria.id}', ${ei})">Adicionar</button>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

function adicionarEspecialWizard(categoriaId, especialIndex) {
  const categoria = categorias.find(c => c.id === categoriaId);
  if (!categoria) return;
  const esp = categoria.especiais[especialIndex];
  if (!esp) return;

  carrinho.push({
    idItem: "it_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
    categoriaId: categoria.id,
    categoriaNome: categoria.nome,
    descricao: esp.nome,
    valorUnitario: esp.preco,
    quantidade: 1,
    especial: true
  });
  salvarCarrinho();
  montagemAtual = null;
  renderCarrinho();
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
  const promocoesFaltando = [];

  Object.entries(porCategoria).forEach(([catId, info]) => {
    subtotalBruto += info.subtotal;
    const categoria = categorias.find(c => c.id === catId);
    if (!categoria || !categoria.combos || !categoria.combos.length) return;

    const combo = categoria.combos.find(c => c.qtd === info.qtd);
    if (combo && combo.preco < info.subtotal) {
      const desconto = info.subtotal - combo.preco;
      descontoCombo += desconto;
      avisosCombo.push(`Combo ${info.qtd} un. de ${info.nome} aplicado: você economiza ${fmtMoeda(desconto)}!`);
      return;
    }

    const proximo = categoria.combos
      .filter(c => c.qtd > info.qtd)
      .sort((a, b) => a.qtd - b.qtd)[0];
    if (proximo) {
      const precoMedioUnidade = info.qtd > 0 ? info.subtotal / info.qtd : (categoria.precoBase || 0);
      const economiaEstimada = Math.max(0, precoMedioUnidade * proximo.qtd - proximo.preco);
      promocoesFaltando.push({
        nome: info.nome,
        faltam: proximo.qtd - info.qtd,
        proximoQtd: proximo.qtd,
        precoCombo: proximo.preco,
        economiaEstimada
      });
    }
  });

  return {
    subtotalBruto,
    descontoCombo,
    total: subtotalBruto - descontoCombo,
    avisosCombo,
    promocoesFaltando
  };
}

function abrirCarrinho() {
  renderCarrinho();
}

function renderCarrinho() {
  const resumo = calcularResumoCarrinho();

  const itensHtml = carrinho.length === 0
    ? `<div class="empty-carrinho">Seu pedido está vazio.</div>`
    : carrinho.map(item => `
      <div class="carrinho-item">
        <div class="carrinho-item-topo">
          <div class="carrinho-item-nome">${escHtml(item.categoriaNome)}</div>
          <div class="carrinho-item-acoes">
            ${!item.especial ? `<button class="btn-editar-carrinho" onclick="editarItemCarrinho('${item.idItem}')">✏️</button>` : ""}
            <button class="btn-remover-carrinho" onclick="removerDoCarrinho('${item.idItem}')">🗑️</button>
          </div>
        </div>
        ${item.descricao ? `<div class="carrinho-item-desc">${escHtml(item.descricao)}</div>` : ""}
        <div class="carrinho-item-rodape">
          <span class="carrinho-item-qtd">Qtd: ${item.quantidade} × ${fmtMoeda(item.valorUnitario)}</span>
          <span class="carrinho-item-valor">${fmtMoeda(item.valorUnitario * item.quantidade)}</span>
        </div>
      </div>
    `).join("");

  const avisosHtml = resumo.avisosCombo.map(a => `<div class="combo-aviso">🎉 ${escHtml(a)}</div>`).join("");
  const faltandoHtml = resumo.promocoesFaltando.map(p => `
    <div class="promo-aviso">
      🎯 Faltam <strong>${p.faltam}</strong> ${escHtml(p.nome)} para o combo de ${p.proximoQtd} un. por ${fmtMoeda(p.precoCombo)}
      ${p.economiaEstimada > 0 ? ` (economize ~${fmtMoeda(p.economiaEstimada)})` : ""}!
    </div>
  `).join("");

  const c = clienteDados || {};

  appEl.innerHTML = `
    <div class="overlay">
      <div class="overlay-header">
        <span class="titulo">Pedido</span>
        <button class="btn-fechar" onclick="renderCardapio()">✕</button>
      </div>
      <div class="overlay-scroll">
        <div class="cliente-info-box">
          <div class="cliente-info-nome">${escHtml(c.nome || clienteNome)}</div>
          ${c.telefone ? `<div class="cliente-info-linha">📞 ${escHtml(c.telefone)}</div>` : ""}
          ${c.endereco ? `<div class="cliente-info-linha">🏠 ${escHtml(c.endereco)}</div>` : ""}
        </div>
        ${itensHtml}
        ${avisosHtml}
        ${faltandoHtml}
        ${carrinho.length > 0 ? `
          <textarea class="obs-input" id="obs-pedido" placeholder="Observações (opcional) — ex: ponto de referência, preferências..."></textarea>
          <div class="carrinho-resumo">
            <div class="carrinho-resumo-linha"><span>Subtotal</span><span>${fmtMoeda(resumo.subtotalBruto)}</span></div>
            ${resumo.descontoCombo > 0 ? `<div class="carrinho-resumo-linha desconto"><span>Desconto combo</span><span>-${fmtMoeda(resumo.descontoCombo)}</span></div>` : ""}
            <div class="carrinho-resumo-linha total"><span>Total</span><span>${fmtMoeda(resumo.total)}</span></div>
          </div>
        ` : ""}
      </div>
      <div class="overlay-footer coluna-footer">
        <button class="btn-cancel-carrinho" onclick="renderCardapio()">+ Adicionar itens</button>
        ${carrinho.length > 0 ? `<button class="btn-confirmar-item" onclick="finalizarPedido()">Finalizar pedido</button>` : ""}
      </div>
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

  let pedidoRef;
  try {
    pedidoRef = await db.collection("pedidos").add({
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
  renderSucesso(resumo.total, pedidoRef.id, resumo.promocoesFaltando);
}

/* ---------------- PIX (payload EMV / Copia e Cola + QR Code) ---------------- */

function emvCampo(id, valor) {
  const tamanho = String(valor.length).padStart(2, "0");
  return id + tamanho + valor;
}

function crc16Pix(payload) {
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

const MAPA_ACENTOS_PIX = {
  "á": "a", "à": "a", "â": "a", "ã": "a", "ä": "a",
  "é": "e", "è": "e", "ê": "e", "ë": "e",
  "í": "i", "ì": "i", "î": "i", "ï": "i",
  "ó": "o", "ò": "o", "ô": "o", "õ": "o", "ö": "o",
  "ú": "u", "ù": "u", "û": "u", "ü": "u",
  "ç": "c", "ñ": "n",
  "Á": "A", "À": "A", "Â": "A", "Ã": "A", "Ä": "A",
  "É": "E", "È": "E", "Ê": "E", "Ë": "E",
  "Í": "I", "Ì": "I", "Î": "I", "Ï": "I",
  "Ó": "O", "Ò": "O", "Ô": "O", "Õ": "O", "Ö": "O",
  "Ú": "U", "Ù": "U", "Û": "U", "Ü": "U",
  "Ç": "C", "Ñ": "N"
};

function normalizarTextoPix(s) {
  const semAcento = String(s || "").split("").map(ch => MAPA_ACENTOS_PIX[ch] || ch).join("");
  return semAcento.replace(/[^a-zA-Z0-9 ]/g, "").trim();
}

function gerarPayloadPix({ chave, nome, cidade, valor, txid }) {
  const chaveDigits = String(chave).replace(/\D/g, "");
  const nomeLimpo = normalizarTextoPix(nome).slice(0, 25) || "NATIVA COZINHA LEVE";
  const cidadeLimpo = normalizarTextoPix(cidade).slice(0, 15) || "RECIFE";
  const txidLimpo = String(txid || "***").replace(/[^a-zA-Z0-9]/g, "").slice(0, 25) || "***";

  const merchantAccountInfo = emvCampo("00", "BR.GOV.BCB.PIX") + emvCampo("01", chaveDigits);
  const additionalData = emvCampo("05", txidLimpo);

  let payload =
    emvCampo("00", "01") +
    emvCampo("26", merchantAccountInfo) +
    emvCampo("52", "0000") +
    emvCampo("53", "986") +
    (valor > 0 ? emvCampo("54", Number(valor).toFixed(2)) : "") +
    emvCampo("58", "BR") +
    emvCampo("59", nomeLimpo) +
    emvCampo("60", cidadeLimpo) +
    emvCampo("62", additionalData);

  payload += "6304";
  payload += crc16Pix(payload);
  return payload;
}

function renderSucesso(total, pedidoId, promocoesFaltando) {
  const txid = (pedidoId || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 25);
  const payloadPix = gerarPayloadPix({
    chave: PIX_CHAVE,
    nome: PIX_FAVORECIDO,
    cidade: "RECIFE",
    valor: total,
    txid
  });

  const promoHtml = (promocoesFaltando || []).map(p => `
    <div class="promo-aviso">
      🎯 No próximo pedido, peça mais <strong>${p.faltam}</strong> ${escHtml(p.nome)} e desbloqueie o combo de ${p.proximoQtd} un. por ${fmtMoeda(p.precoCombo)}
      ${p.economiaEstimada > 0 ? ` (economize ~${fmtMoeda(p.economiaEstimada)})` : ""}!
    </div>
  `).join("");

  appEl.innerHTML = `
    <div class="tela-central">
      <div class="sucesso-icone">✅</div>
      <h2 class="serif">Pedido enviado!</h2>
      <p>Seu pedido foi registrado. Para confirmar e entrar em produção, realize o pagamento via PIX abaixo.</p>
      ${promoHtml}
      <div class="pix-box">
        <div class="pix-qrcode-wrap" id="pix-qrcode"></div>
        <div class="pix-label" style="text-align:center;margin-top:8px;">Aponte a câmera do app do banco</div>
        <div class="pix-label" style="margin-top:14px;">Pedido de</div>
        <div class="pix-chave" style="font-size:0.95rem;">${escHtml(clienteNome)}</div>
        <div class="pix-label">Chave PIX (CPF)</div>
        <div class="pix-chave" id="pix-chave-valor">${escHtml(PIX_CHAVE)}</div>
        <div class="pix-favorecido">Favorecido: ${escHtml(PIX_FAVORECIDO)}</div>
        <div class="pix-label">Valor a pagar</div>
        <div class="pix-valor">${fmtMoeda(total)}</div>
        <button class="btn-copiar-pix" onclick="copiarChavePix()">Copiar código Pix Copia e Cola</button>
      </div>
      <p style="margin-top:14px;font-size:0.76rem;">Após o pagamento, seu pedido é confirmado e entra em produção. Prazo de entrega: até 5 dias úteis.</p>
      <button class="btn-voltar-cardapio" onclick="renderCardapio()">Voltar ao cardápio</button>
    </div>
  `;

  window.pixPayloadAtual = payloadPix;
  const wrapQr = document.getElementById("pix-qrcode");
  if (wrapQr && window.qrcode) {
    try {
      const qr = qrcode(0, "M");
      qr.addData(payloadPix);
      qr.make();
      wrapQr.innerHTML = qr.createImgTag(5, 8);
    } catch (e) {
      wrapQr.innerHTML = '<p style="font-size:0.78rem;color:#a3823f;">Não foi possível gerar o QR Code — use o código copia e cola abaixo.</p>';
    }
  }
}

async function copiarChavePix() {
  const texto = window.pixPayloadAtual || PIX_CHAVE.replace(/\D/g, "");
  try {
    await navigator.clipboard.writeText(texto);
  } catch (e) {
    const input = document.createElement("textarea");
    input.value = texto;
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    document.body.removeChild(input);
  }
  const btn = document.querySelector(".btn-copiar-pix");
  if (btn) {
    const original = btn.textContent;
    btn.textContent = "✅ Copiado!";
    setTimeout(() => { btn.textContent = original; }, 1500);
  }
}
