// Garçonete de voz do cardápio — conversa por voz com o cliente e vai
// preenchendo o assistente de montagem já existente (não substitui as telas
// originais, só as opera por fora). O LLM roda numa Cloud Function do
// projeto Firebase do Sistema GW (agenteGarconeteNativa), que reaproveita a
// chave da Anthropic já configurada lá — por isso inicializamos aqui um
// segundo app do Firebase, só pra chamar essa function.
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
let garconeteOuvindo = false;
let garconeteProcessando = false;

function inicializarGarconete() {
  if (garconeteApp) return;
  garconeteApp = firebase.initializeApp(GARCONETE_FIREBASE_CONFIG, "garconete");
  garconeteFunctions = garconeteApp.functions();
}

// Reconhecimento de voz via Web Speech API só existe em navegadores com
// motor Chromium (Chrome/Edge/Android WebView) — no iOS, TODO navegador usa
// o motor da Apple (WebKit) por baixo, que nunca implementou essa API pra
// páginas web (só apps nativos, como o app do Claude/ChatGPT, têm acesso ao
// ditado nativo da Apple). Por isso, no iPhone caímos pro modo de texto:
// o cliente digita ou usa o microfone do PRÓPRIO teclado do iOS (o ícone ao
// lado da barra de espaço), que dita direto no campo — funciona em
// qualquer navegador porque é um recurso do sistema, não da página.
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

/* ---------------- UI da garçonete (overlay flutuante por cima do wizard) ---------------- */

function abrirGarconete() {
  inicializarGarconete();
  carregarVozGarconete();
  garconeteHistorico = [];
  renderGarconeteOverlay();
}

function fecharGarconete() {
  pararEscutaGarconete();
  if (suportaFalaSintetizada()) window.speechSynthesis.cancel();
  const overlay = document.getElementById("garconete-overlay");
  if (overlay) overlay.remove();
}

function renderGarconeteOverlay() {
  if (document.getElementById("garconete-overlay")) return;
  const comReconhecimentoNativo = suportaReconhecimentoDeVoz();

  const div = document.createElement("div");
  div.id = "garconete-overlay";
  div.className = "garconete-overlay";
  div.innerHTML = `
    <div class="garconete-header">
      <span class="garconete-titulo">🎙️ Garçonete Nativa</span>
      <button class="garconete-fechar" onclick="fecharGarconete()">✕</button>
    </div>
    <div class="garconete-transcript" id="garconete-transcript"></div>
    <div class="garconete-status" id="garconete-status">${comReconhecimentoNativo ? "Toque no microfone e fale seu pedido" : "Toque no 🎤 do teclado e fale, ou digite seu pedido"}</div>
    ${comReconhecimentoNativo ? `
      <button class="garconete-mic" id="garconete-mic-btn" onclick="alternarEscutaGarconete()">🎤</button>
    ` : `
      <div class="garconete-input-linha">
        <input type="text" id="garconete-input-texto" class="garconete-input-texto" placeholder="Toque aqui e use o microfone do teclado..." autocomplete="off" />
        <button class="garconete-btn-enviar" id="garconete-btn-enviar" onclick="enviarTextoGarconete()">➤</button>
      </div>
    `}
  `;
  document.body.appendChild(div);

  const saudacao = clienteNome
    ? `Oi, ${clienteNome.split(" ")[0]}! Sou a garçonete virtual da Nativa. O que você vai querer hoje?`
    : "Oi! Sou a garçonete virtual da Nativa. O que você vai querer hoje?";
  adicionarFalaTranscript("garconete", saudacao);
  falarGarconete(saudacao);

  if (!comReconhecimentoNativo) {
    const input = document.getElementById("garconete-input-texto");
    if (input) {
      input.focus();
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") enviarTextoGarconete();
      });
    }
  }
}

function enviarTextoGarconete() {
  if (garconeteProcessando) return;
  const input = document.getElementById("garconete-input-texto");
  if (!input) return;
  const texto = input.value.trim();
  if (!texto) return;
  input.value = "";
  adicionarFalaTranscript("cliente", texto);
  processarFalaGarconete(texto);
}

function adicionarFalaTranscript(quem, texto) {
  const wrap = document.getElementById("garconete-transcript");
  if (!wrap) return;
  const bolha = document.createElement("div");
  bolha.className = "garconete-bolha garconete-bolha-" + quem;
  bolha.textContent = texto;
  wrap.appendChild(bolha);
  wrap.scrollTop = wrap.scrollHeight;
}

function atualizarStatusGarconete(texto) {
  const el = document.getElementById("garconete-status");
  if (el) el.textContent = texto;
}

function alternarEscutaGarconete() {
  if (garconeteProcessando) return;
  if (garconeteOuvindo) pararEscutaGarconete();
  else iniciarEscutaGarconete();
}

function iniciarEscutaGarconete() {
  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  garconeteReconhecimento = new SpeechRecognitionCtor();
  garconeteReconhecimento.lang = "pt-BR";
  garconeteReconhecimento.interimResults = false;
  garconeteReconhecimento.maxAlternatives = 1;

  garconeteReconhecimento.onstart = () => {
    garconeteOuvindo = true;
    const btn = document.getElementById("garconete-mic-btn");
    if (btn) btn.classList.add("ouvindo");
    atualizarStatusGarconete("Ouvindo...");
  };

  garconeteReconhecimento.onresult = (event) => {
    const texto = event.results[0][0].transcript;
    adicionarFalaTranscript("cliente", texto);
    processarFalaGarconete(texto);
  };

  garconeteReconhecimento.onerror = () => {
    atualizarStatusGarconete("Não entendi — toque no microfone pra tentar de novo.");
  };

  garconeteReconhecimento.onend = () => {
    garconeteOuvindo = false;
    const btn = document.getElementById("garconete-mic-btn");
    if (btn) btn.classList.remove("ouvindo");
  };

  garconeteReconhecimento.start();
}

function pararEscutaGarconete() {
  if (garconeteReconhecimento) garconeteReconhecimento.stop();
}

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

// Desabilita/reabilita o controle de entrada certo (botão de microfone ou
// campo de texto + botão enviar), dependendo de qual modo está ativo.
function definirControlesGarconeteHabilitados(habilitado) {
  const micBtn = document.getElementById("garconete-mic-btn");
  if (micBtn) micBtn.disabled = !habilitado;
  const input = document.getElementById("garconete-input-texto");
  if (input) input.disabled = !habilitado;
  const enviarBtn = document.getElementById("garconete-btn-enviar");
  if (enviarBtn) enviarBtn.disabled = !habilitado;
  if (habilitado && input) input.focus();
}

// Uma "fala do cliente" pode virar várias chamadas à Cloud Function em
// sequência quando o Claude pede tool_use — cada tool é executada aqui no
// navegador (mexendo no wizard de verdade) e o resultado volta como
// tool_result na rodada seguinte, até a resposta final em texto.
async function processarFalaGarconete(mensagemInicial) {
  garconeteProcessando = true;
  atualizarStatusGarconete("Pensando...");
  definirControlesGarconeteHabilitados(false);

  try {
    let proximaEntrada = mensagemInicial;
    let respostaTexto = "";

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
        const toolResults = (content || [])
          .filter(b => b.type === "tool_use")
          .map(b => ({
            type: "tool_result",
            tool_use_id: b.id,
            content: JSON.stringify(executarToolGarconete(b.name, b.input || {}))
          }));
        proximaEntrada = toolResults;
        continue;
      }

      const textBlock = (content || []).find(b => b.type === "text");
      respostaTexto = textBlock ? textBlock.text : "";
      break;
    }

    const statusPronto = suportaReconhecimentoDeVoz() ? "Toque no microfone pra responder" : "Digite ou dite sua resposta";
    if (respostaTexto) {
      adicionarFalaTranscript("garconete", respostaTexto);
      atualizarStatusGarconete(statusPronto);
      await falarGarconete(respostaTexto);
    } else {
      atualizarStatusGarconete(statusPronto);
    }
  } catch (e) {
    adicionarFalaTranscript("garconete", "Desculpa, tive um probleminha aqui. Pode repetir?");
    atualizarStatusGarconete(suportaReconhecimentoDeVoz() ? "Toque no microfone pra tentar de novo" : "Tente digitar de novo");
  } finally {
    garconeteProcessando = false;
    definirControlesGarconeteHabilitados(true);
  }
}
