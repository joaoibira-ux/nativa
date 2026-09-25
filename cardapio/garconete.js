// Garçonete de voz do cardápio — conversa por voz com o cliente e vai
// preenchendo o assistente de montagem já existente (não substitui as telas
// originais, só as opera por fora). O LLM roda numa Cloud Function do
// projeto Firebase do Sistema GW (agenteGarconeteNativa), que reaproveita a
// chave da Anthropic já configurada lá — por isso inicializamos aqui um
// segundo app do Firebase, só pra chamar essa function.
//
// Interface de propósito minimalista: nada de painel/chat na tela, só o
// robozinho flutuante mudando de estado (robô/microfone/cor) — enquanto ele
// está ativo, o cliente só acompanha as telas mudando sozinhas, sem clicar
// em mais nada além do próprio robozinho.
const GARCONETE_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBaqROPsywPgtKjQU7cs1ke1WaqDFhWwn0",
  authDomain: "sistema-gw-36566.firebaseapp.com",
  projectId: "sistema-gw-36566",
  storageBucket: "sistema-gw-36566.firebasestorage.app",
  messagingSenderId: "472820177992",
  appId: "1:472820177992:web:2e1b98c9f6ac3a823d0c7d"
};

let garconeteApp = null;
let garconeteFunctions = null;
let garconeteHistorico = [];
let garconeteReconhecimento = null;
let garconeteInputOculto = null;

let garconeteAtiva = false; // sessão em andamento (bloqueia cliques nas telas)
let garconeteOuvindo = false; // reconhecimento de voz nativo escutando de verdade
let garconeteProcessando = false; // esperando resposta da Cloud Function
let garconeteAguardandoToqueDitado = false; // iPhone: vez do cliente, precisa tocar pra abrir o teclado
let garconeteInterrompida = false; // cliente tocou pra falar antes dela terminar a fala

function inicializarGarconete() {
  if (garconeteApp) return;
  garconeteApp = firebase.initializeApp(GARCONETE_FIREBASE_CONFIG, "garconete");
  garconeteFunctions = garconeteApp.functions();
}

// Reconhecimento de voz via Web Speech API só existe em navegadores com
// motor Chromium (Chrome/Edge/Android WebView) — no iOS, TODO navegador usa
// o motor da Apple (WebKit) por baixo, que nunca implementou essa API pra
// páginas web (só apps nativos, como o app do Claude/ChatGPT, têm acesso ao
// ditado nativo da Apple). Por isso, no iPhone caímos pro teclado do
// próprio sistema: focar um campo (mesmo invisível) abre o teclado com o
// microfone de ditado nativo — funciona em qualquer navegador porque é um
// recurso do sistema, não da página.
function suportaReconhecimentoDeVoz() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function suportaFalaSintetizada() {
  return !!window.speechSynthesis;
}

// Resumo do cardápio + do que já está selecionado, mandado a cada chamada
// pro backend montar o system prompt (o Claude "vê" o cardápio por aqui).
function montarEstadoCardapioParaAssistente() {
  const categoriasResumo = categorias.map(c => ({
    id: c.id,
    nome: c.nome,
    precoBase: c.precoBase,
    grupos: (c.grupos || []).map(g => ({
      nome: g.nome,
      min: g.min,
      max: g.max,
      opcoes: g.opcoes,
      opcoesComPreco: g.opcoesComPreco
    })),
    especiais: c.especiais
  }));

  let montagemInfo = null;
  if (montagemAtual && montagemAtual.categoria.grupos[montagemAtual.passo]) {
    const grupoAtual = montagemAtual.categoria.grupos[montagemAtual.passo];
    montagemInfo = {
      categoriaNome: montagemAtual.categoria.nome,
      grupoNome: grupoAtual.nome,
      selecaoAtual: montagemAtual.selecoes[montagemAtual.passo] || []
    };
  }

  return {
    clienteNome: clienteNome ? clienteNome.split(" ")[0] : "",
    categorias: categoriasResumo,
    montagemAtual: montagemInfo,
    carrinho: carrinho.map(i => ({
      idItem: i.idItem,
      categoriaNome: i.categoriaNome,
      descricao: i.descricao,
      valorUnitario: i.valorUnitario,
      quantidade: i.quantidade
    }))
  };
}

// Executa uma tool pedida pelo Claude mexendo no estado real do wizard já
// existente — a garçonete não tem lógica de pedido própria, ela só aciona
// as mesmas funções que o cliente acionaria tocando na tela.
function executarToolGarconete(nome, input) {
  try {
    switch (nome) {
      case "abrir_categoria": {
        const cat = categorias.find(c => c.id === input.categoriaId);
        if (!cat) return { sucesso: false, erro: "categoria_nao_encontrada" };
        abrirMontagem(input.categoriaId);
        return { sucesso: true };
      }
      case "marcar_opcao": {
        if (!montagemAtual) return { sucesso: false, erro: "sem_montagem_em_andamento" };
        const sel = montagemAtual.selecoes[montagemAtual.passo];
        if (!sel.includes(input.nome)) toggleOpcaoPasso(input.nome);
        return { sucesso: true };
      }
      case "desmarcar_opcao": {
        if (!montagemAtual) return { sucesso: false, erro: "sem_montagem_em_andamento" };
        const sel = montagemAtual.selecoes[montagemAtual.passo];
        if (sel.includes(input.nome)) toggleOpcaoPasso(input.nome);
        return { sucesso: true };
      }
      case "avancar_etapa": {
        if (!montagemAtual) return { sucesso: false, erro: "sem_montagem_em_andamento" };
        const grupo = montagemAtual.categoria.grupos[montagemAtual.passo];
        const sel = montagemAtual.selecoes[montagemAtual.passo];
        if (sel.length < grupo.min) return { sucesso: false, erro: "minimo_nao_atingido", minimo: grupo.min };
        avancarPassoMontagem();
        return { sucesso: true };
      }
      case "voltar_etapa": {
        if (!montagemAtual) return { sucesso: false, erro: "sem_montagem_em_andamento" };
        voltarPassoMontagem();
        return { sucesso: true };
      }
      case "definir_quantidade": {
        if (!montagemAtual) return { sucesso: false, erro: "sem_montagem_em_andamento" };
        montagemAtual.quantidade = Math.max(1, parseInt(input.quantidade, 10) || 1);
        renderPassoMontagem();
        return { sucesso: true };
      }
      case "abrir_pratos_prontos": {
        if (!montagemAtual || !(montagemAtual.categoria.especiais || []).length) {
          return { sucesso: false, erro: "sem_pratos_prontos" };
        }
        abrirEspeciaisWizard();
        return { sucesso: true };
      }
      case "adicionar_prato_pronto": {
        if (!montagemAtual) return { sucesso: false, erro: "sem_montagem_em_andamento" };
        const especiais = montagemAtual.categoria.especiais || [];
        const idx = especiais.findIndex(e => e.nome === input.nome);
        if (idx < 0) return { sucesso: false, erro: "prato_nao_encontrado" };
        adicionarEspecialWizard(montagemAtual.categoria.id, idx);
        return { sucesso: true };
      }
      case "remover_item_carrinho": {
        if (!carrinho.some(i => i.idItem === input.idItem)) return { sucesso: false, erro: "item_nao_encontrado" };
        removerDoCarrinho(input.idItem);
        return { sucesso: true };
      }
      case "ver_carrinho": {
        abrirCarrinho();
        return { sucesso: true };
      }
      case "finalizar_pedido": {
        if (carrinho.length === 0) return { sucesso: false, erro: "carrinho_vazio" };
        abrirCarrinho();
        finalizarPedido();
        return { sucesso: true };
      }
      default:
        return { sucesso: false, erro: "ferramenta_desconhecida" };
    }
  } catch (e) {
    return { sucesso: false, erro: "excecao", mensagem: e.message };
  }
}

/* ---------------- UI: só o robozinho flutuante ---------------- */

// Enquanto ativa, ninguém clica em mais nada além do robozinho — o pedido
// segue só por voz, e o cliente usa as telas apenas pra acompanhar.
function definirBloqueioDeCliques(ativo) {
  document.body.classList.toggle("garconete-modo-assistente", ativo);
}

function atualizarFabGarconete() {
  const fab = document.getElementById("fab-garconete");
  if (!fab) return;
  fab.classList.remove("ativa", "ouvindo", "pensando");

  if (!garconeteAtiva) {
    fab.innerHTML = `<span class="fab-garconete-robo">🤖</span><span class="fab-garconete-laco">🎀</span>`;
    return;
  }
  if (garconeteProcessando) fab.classList.add("pensando");

  if (garconeteOuvindo || garconeteAguardandoToqueDitado) {
    fab.classList.add("ouvindo");
    fab.innerHTML = `<span class="fab-garconete-robo">🎤</span><span class="fab-garconete-laco">🎀</span>`;
  } else {
    fab.classList.add("ativa");
    fab.innerHTML = `<span class="fab-garconete-robo">🤖</span><span class="fab-garconete-laco">🎀</span>`;
  }
}

function abrirGarconete() {
  if (garconeteAtiva) return;
  inicializarGarconete();
  carregarVozGarconete();
  garconeteHistorico = [];
  garconeteAtiva = true;
  definirBloqueioDeCliques(true);
  atualizarFabGarconete();

  const saudacao = clienteNome
    ? `Oi, ${clienteNome.split(" ")[0]}! Sou a garçonete virtual da Nativa. O que você vai querer hoje?`
    : "Oi! Sou a garçonete virtual da Nativa. O que você vai querer hoje?";
  falarEDepoisOuvirGarconete(saudacao);
}

function fecharGarconete() {
  garconeteAtiva = false;
  garconeteAguardandoToqueDitado = false;
  garconeteInterrompida = false;
  pararEscutaGarconete();
  if (suportaFalaSintetizada()) window.speechSynthesis.cancel();
  definirBloqueioDeCliques(false);
  atualizarFabGarconete();
}

// Toque curto no robozinho — sempre significa "quero falar agora": inicia a
// sessão se ainda não começou, ou interrompe a fala dela e já abre o jeito
// do cliente responder (mic nativo ou teclado, dependendo do aparelho).
function tocarFabGarconete() {
  if (!garconeteAtiva) {
    abrirGarconete();
    return;
  }
  if (garconeteProcessando) return;

  if (suportaReconhecimentoDeVoz()) {
    if (garconeteOuvindo) {
      pararEscutaGarconete();
    } else {
      garconeteInterrompida = true;
      if (suportaFalaSintetizada()) window.speechSynthesis.cancel();
      iniciarEscutaGarconete();
    }
    return;
  }

  garconeteInterrompida = true;
  if (suportaFalaSintetizada()) window.speechSynthesis.cancel();
  garconeteAguardandoToqueDitado = true;
  atualizarFabGarconete();
  abrirTecladoDitadoGarconete();
}

// Pressionar e segurar encerra a garçonete a qualquer momento — é a única
// forma de sair, já que não existe mais um botão de fechar visível.
let garconeteToqueLongoTimer = null;
function iniciarDeteccaoToqueLongo() {
  garconeteToqueLongoTimer = setTimeout(() => {
    garconeteToqueLongoTimer = null;
    fecharGarconete();
  }, 550);
}
function finalizarToque() {
  if (garconeteToqueLongoTimer) {
    clearTimeout(garconeteToqueLongoTimer);
    garconeteToqueLongoTimer = null;
    tocarFabGarconete();
  }
}
function cancelarDeteccaoToqueLongo() {
  if (garconeteToqueLongoTimer) {
    clearTimeout(garconeteToqueLongoTimer);
    garconeteToqueLongoTimer = null;
  }
}

(function conectarFabGarconete() {
  const fab = document.getElementById("fab-garconete");
  if (!fab) return;
  fab.addEventListener("contextmenu", (e) => e.preventDefault());
  fab.addEventListener("pointerdown", iniciarDeteccaoToqueLongo);
  fab.addEventListener("pointerup", finalizarToque);
  fab.addEventListener("pointerleave", cancelarDeteccaoToqueLongo);
  fab.addEventListener("pointercancel", cancelarDeteccaoToqueLongo);
})();

/* ---------------- Reconhecimento de voz nativo (Android/Chrome) ---------------- */

function iniciarEscutaGarconete() {
  if (garconeteOuvindo) return;

  try {
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    garconeteReconhecimento = new SpeechRecognitionCtor();
    garconeteReconhecimento.lang = "pt-BR";
    garconeteReconhecimento.interimResults = false;
    garconeteReconhecimento.maxAlternatives = 1;

    garconeteReconhecimento.onstart = () => {
      garconeteOuvindo = true;
      atualizarFabGarconete();
    };

    garconeteReconhecimento.onresult = (event) => {
      processarFalaGarconete(event.results[0][0].transcript);
    };

    garconeteReconhecimento.onerror = () => {};

    garconeteReconhecimento.onend = () => {
      garconeteOuvindo = false;
      atualizarFabGarconete();
    };

    garconeteReconhecimento.start();
  } catch (e) {
    // O Chrome às vezes recusa iniciar um reconhecimento novo bem em cima
    // do anterior ter terminado ("already started"/InvalidStateError) --
    // isso fazia a religada automática falhar caladamente, deixando o
    // cliente preso precisando tocar de novo. Tenta de novo sozinho um
    // instante depois, sem exigir toque nenhum.
    garconeteOuvindo = false;
    atualizarFabGarconete();
    if (garconeteAtiva && !garconeteProcessando) {
      setTimeout(() => {
        if (garconeteAtiva && !garconeteOuvindo && !garconeteProcessando) iniciarEscutaGarconete();
      }, 350);
    }
  }
}

function pararEscutaGarconete() {
  if (!garconeteReconhecimento) return;
  try { garconeteReconhecimento.stop(); } catch (e) {}
}

/* ---------------- Teclado nativo do iPhone (sem Web Speech API) ---------------- */

// Input 100% invisível — existe só pra focar e abrir o teclado do sistema
// (com o microfone de ditado nativo). O cliente nunca vê essa caixa.
function obterInputOcultoGarconete() {
  if (garconeteInputOculto) return garconeteInputOculto;

  const input = document.createElement("input");
  input.type = "text";
  input.id = "garconete-input-oculto";
  input.className = "garconete-input-oculto";
  input.autocomplete = "off";
  document.body.appendChild(input);

  const processar = () => {
    const texto = input.value.trim();
    input.value = "";
    if (!garconeteAguardandoToqueDitado) return;
    garconeteAguardandoToqueDitado = false;
    atualizarFabGarconete();
    if (texto) processarFalaGarconete(texto);
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      processar();
      input.blur();
    }
  });
  input.addEventListener("blur", processar);

  garconeteInputOculto = input;
  return input;
}

function abrirTecladoDitadoGarconete() {
  obterInputOcultoGarconete().focus();
}

/* ---------------- Voz da garçonete (síntese de fala) ---------------- */

// Nomes de vozes em português conhecidas por soarem melhor que a voz
// robótica padrão de cada plataforma — em ordem de preferência. "Luciana" é
// a voz pt-BR do iOS/macOS (mesma usada pela Siri); as demais cobrem
// Chrome/Android e Windows. Se nenhuma bater, cai pra qualquer voz pt-BR
// disponível e, por último, qualquer voz pt.
const NOMES_VOZ_PREFERIDOS = [
  "luciana", "google português do brasil", "microsoft francisca", "microsoft maria", "joana"
];

let vozGarconeteEscolhida = null;
let vozGarconeteCarregada = false;

function escolherVozGarconete() {
  if (!suportaFalaSintetizada()) return null;
  const vozes = window.speechSynthesis.getVoices();
  if (!vozes.length) return null;

  for (const nomePreferido of NOMES_VOZ_PREFERIDOS) {
    const achou = vozes.find(v => v.name.toLowerCase().includes(nomePreferido));
    if (achou) return achou;
  }
  return vozes.find(v => /^pt-br$/i.test(v.lang)) || vozes.find(v => /^pt/i.test(v.lang)) || null;
}

// getVoices() às vezes retorna vazio na primeira chamada porque a lista
// carrega de forma assíncrona (mais comum no Chrome) — por isso escutamos
// "voiceschanged" também, além de tentar direto.
function carregarVozGarconete() {
  if (vozGarconeteCarregada || !suportaFalaSintetizada()) return;
  vozGarconeteEscolhida = escolherVozGarconete();
  if (vozGarconeteEscolhida) {
    vozGarconeteCarregada = true;
    return;
  }
  window.speechSynthesis.onvoiceschanged = () => {
    vozGarconeteEscolhida = escolherVozGarconete();
    vozGarconeteCarregada = true;
  };
}

function falarGarconete(texto) {
  return new Promise((resolve) => {
    if (!suportaFalaSintetizada()) { resolve(); return; }
    carregarVozGarconete();
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(texto);
    utter.lang = "pt-BR";
    if (vozGarconeteEscolhida) utter.voice = vozGarconeteEscolhida;
    utter.onend = resolve;
    utter.onerror = resolve;
    window.speechSynthesis.speak(utter);
  });
}

// Depois que a garçonete termina de falar, passa a vez pro cliente: no modo
// com reconhecimento nativo já liga o microfone sozinha; no iPhone só troca
// o ícone pra microfone (o cliente ainda precisa tocar uma vez pra abrir o
// teclado — a Apple não deixa abrir sozinho sem um toque direto).
async function falarEDepoisOuvirGarconete(texto) {
  await falarGarconete(texto);

  if (garconeteInterrompida) {
    garconeteInterrompida = false;
    return;
  }
  if (!garconeteAtiva) return;

  if (suportaReconhecimentoDeVoz()) {
    if (!garconeteOuvindo && !garconeteProcessando) iniciarEscutaGarconete();
  } else {
    garconeteAguardandoToqueDitado = true;
  }
  atualizarFabGarconete();
}

/* ---------------- Conversa com o backend ---------------- */

// Uma "fala do cliente" pode virar várias chamadas à Cloud Function em
// sequência quando o Claude pede tool_use — cada tool é executada aqui no
// navegador (mexendo no wizard de verdade) e o resultado volta como
// tool_result na rodada seguinte, até a resposta final em texto.
async function processarFalaGarconete(mensagemInicial) {
  garconeteProcessando = true;
  atualizarFabGarconete();

  let respostaTexto = "";
  let erro = false;

  try {
    let proximaEntrada = mensagemInicial;

    for (let rodada = 0; rodada < 5; rodada++) {
      const chamar = garconeteFunctions.httpsCallable("agenteGarconeteNativa");
      const resultado = await chamar({
        mensagem: proximaEntrada,
        historico: garconeteHistorico,
        estadoCardapio: montarEstadoCardapioParaAssistente()
      });

      const { content, stop_reason } = resultado.data || {};
      garconeteHistorico.push({ role: "user", content: proximaEntrada });
      garconeteHistorico.push({ role: "assistant", content });

      if (stop_reason === "tool_use") {
        proximaEntrada = (content || [])
          .filter(b => b.type === "tool_use")
          .map(b => ({
            type: "tool_result",
            tool_use_id: b.id,
            content: JSON.stringify(executarToolGarconete(b.name, b.input || {}))
          }));
        continue;
      }

      const textBlock = (content || []).find(b => b.type === "text");
      respostaTexto = textBlock ? textBlock.text : "";
      break;
    }
  } catch (e) {
    erro = true;
  } finally {
    garconeteProcessando = false;
  }

  if (!garconeteAtiva) return; // fechada enquanto processava

  if (erro) {
    await falarEDepoisOuvirGarconete("Desculpa, tive um probleminha aqui. Pode repetir?");
  } else if (respostaTexto) {
    await falarEDepoisOuvirGarconete(respostaTexto);
  } else {
    atualizarFabGarconete();
  }
}
