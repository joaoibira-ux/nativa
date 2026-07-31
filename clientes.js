const colClientes = db.collection("clientes");
let clientesCache = {};
let clienteEditando = null;
let latAtual = null;
let lngAtual = null;

colClientes.orderBy("nome").onSnapshot(snap => {
  const clientes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  render(clientes);
});

function render(clientes) {
  const lista = document.getElementById("lista");
  clientesCache = {};

  if (clientes.length === 0) {
    lista.innerHTML = '<div class="empty">Nenhum cliente cadastrado</div>';
    return;
  }

  lista.innerHTML = clientes.map(c => {
    clientesCache[c.id] = c;
    let loc = "";
    if (c.latitude != null && c.longitude != null) {
      loc = `<a class="card-loc" target="_blank" onclick="event.stopPropagation()" href="https://www.google.com/maps?q=${c.latitude},${c.longitude}">📍 Ver localização no mapa</a>`;
    }
    return `
      <div class="card" style="cursor:pointer" onclick="visualizarCliente('${c.id}')">
        <div class="card-acoes">
          <button class="btn-edit" onclick="event.stopPropagation(); abrirFormulario('${c.id}')">✏️</button>
          <button class="btn-del" onclick="event.stopPropagation(); excluirCliente('${c.id}')">🗑️</button>
        </div>
        <div class="card-nome">${escHtml(c.nome)}</div>
        ${c.telefone ? `<div class="card-info">📞 ${escHtml(c.telefone)}</div>` : ""}
        ${c.endereco ? `<div class="card-info">🏠 ${escHtml(c.endereco)}</div>` : ""}
        ${loc}
        ${c.observacoes ? `<div class="card-obs">${escHtml(c.observacoes)}</div>` : ""}
      </div>
    `;
  }).join("");
}

function abrirFormulario(id) {
  clienteEditando = id || null;
  latAtual = null;
  lngAtual = null;
  document.getElementById("loc-status").textContent = "";
  document.getElementById("f-loc-link").value = "";

  if (clienteEditando) {
    const c = clientesCache[clienteEditando];
    document.getElementById("f-nome").value = c.nome || "";
    document.getElementById("f-telefone").value = c.telefone || "";
    document.getElementById("f-endereco").value = c.endereco || "";
    document.getElementById("f-obs").value = c.observacoes || "";
    if (c.latitude != null && c.longitude != null) {
      latAtual = c.latitude;
      lngAtual = c.longitude;
      document.getElementById("loc-status").textContent = "Localização salva: " + latAtual.toFixed(6) + ", " + lngAtual.toFixed(6);
    }
  } else {
    document.getElementById("form").reset();
  }

  definirModoFormulario(false);
  atualizarBotaoRemoverLocalizacao();
  document.getElementById("form-overlay").style.display = "flex";
}

// Tela só de observação — abre ao clicar no card (fora dos botões de editar/
// excluir). Mesmo layout do formulário, mas nada é editável; a localização
// vira um campo pra copiar e colar (ex: mandar pro motoboy no WhatsApp), com
// aviso de "não cadastrada" quando o cliente ainda não tem uma salva.
function visualizarCliente(id) {
  const c = clientesCache[id];
  if (!c) return;

  clienteEditando = id;
  latAtual = c.latitude != null ? c.latitude : null;
  lngAtual = c.longitude != null ? c.longitude : null;

  document.getElementById("f-nome").value = c.nome || "";
  document.getElementById("f-telefone").value = c.telefone || "";
  document.getElementById("f-endereco").value = c.endereco || "";
  document.getElementById("f-obs").value = c.observacoes || "";
  document.getElementById("f-loc-link").value = "";
  document.getElementById("loc-status").textContent = "";

  definirModoFormulario(true);

  const temLocalizacao = latAtual != null && lngAtual != null;
  document.getElementById("row-ver-localizacao").style.display = temLocalizacao ? "" : "none";
  document.getElementById("row-sem-localizacao").style.display = temLocalizacao ? "none" : "";
  if (temLocalizacao) {
    document.getElementById("ver-loc-texto").value = "https://www.google.com/maps?q=" + latAtual + "," + lngAtual;
  }

  document.getElementById("form-overlay").style.display = "flex";
}

function definirModoFormulario(visualizacao) {
  ["f-nome", "f-telefone", "f-endereco", "f-obs"].forEach(id => {
    document.getElementById(id).readOnly = visualizacao;
  });

  document.getElementById("row-colar-localizacao").style.display = visualizacao ? "none" : "";
  document.getElementById("row-editar-localizacao").style.display = visualizacao ? "none" : "";
  document.getElementById("acoes-edicao").style.display = visualizacao ? "none" : "";
  document.getElementById("acoes-visualizacao").style.display = visualizacao ? "" : "none";

  if (!visualizacao) {
    document.getElementById("row-ver-localizacao").style.display = "none";
    document.getElementById("row-sem-localizacao").style.display = "none";
  }
}

async function copiarLocalizacao(btn) {
  const texto = document.getElementById("ver-loc-texto").value;
  try {
    await navigator.clipboard.writeText(texto);
  } catch (e) {
    const input = document.getElementById("ver-loc-texto");
    input.removeAttribute("readonly");
    input.select();
    document.execCommand("copy");
    input.setAttribute("readonly", "readonly");
  }
  const original = btn.textContent;
  btn.textContent = "✅ Copiado!";
  setTimeout(() => { btn.textContent = original; }, 1500);
}

function atualizarBotaoRemoverLocalizacao() {
  const btn = document.getElementById("btn-remover-localizacao");
  btn.style.display = (latAtual != null && lngAtual != null) ? "" : "none";
}

function removerLocalizacao() {
  latAtual = null;
  lngAtual = null;
  document.getElementById("loc-status").textContent = "Localização removida";
  atualizarBotaoRemoverLocalizacao();
}

function fecharFormulario() {
  document.getElementById("form-overlay").style.display = "none";
}

// Extrai latitude/longitude do que o cliente manda pelo WhatsApp — o app de
// WhatsApp normalmente gera um link do Google Maps ao encaminhar/copiar uma
// localização (formatos "?q=lat,lng" ou "/@lat,lng,z"), mas também aceita as
// coordenadas coladas direto (ex: copiadas de dentro do próprio Maps).
// Links curtos (maps.app.goo.gl/...) não têm as coordenadas no texto do
// link — precisam ser abertos pra resolver, esse parser não cobre esse caso.
function extrairCoordenadas(texto) {
  texto = (texto || "").trim();
  if (!texto) return null;

  let m = texto.match(/[?&](?:q|query)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };

  m = texto.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };

  m = texto.match(/^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };

  return null;
}

function usarLinkLocalizacao() {
  const status = document.getElementById("loc-status");
  const texto = document.getElementById("f-loc-link").value;
  const coords = extrairCoordenadas(texto);

  if (!coords) {
    status.textContent = "Não consegui encontrar coordenadas nesse texto — cole o link do Maps ou \"latitude, longitude\".";
    return;
  }
  if (Math.abs(coords.lat) > 90 || Math.abs(coords.lng) > 180) {
    status.textContent = "Coordenadas fora do intervalo válido — confere se colou o texto certo.";
    return;
  }

  latAtual = coords.lat;
  lngAtual = coords.lng;
  status.textContent = "Localização capturada: " + latAtual.toFixed(6) + ", " + lngAtual.toFixed(6);
  atualizarBotaoRemoverLocalizacao();
}

async function salvarCliente() {
  const nome = document.getElementById("f-nome").value.trim();
  if (!nome) {
    alert("Informe o nome do cliente");
    return;
  }

  const payload = {
    nome,
    telefone: document.getElementById("f-telefone").value.trim(),
    endereco: document.getElementById("f-endereco").value.trim(),
    observacoes: document.getElementById("f-obs").value.trim(),
    latitude: latAtual,
    longitude: lngAtual
  };

  if (clienteEditando) {
    await colClientes.doc(clienteEditando).update(payload);
  } else {
    payload.criadoEm = firebase.firestore.FieldValue.serverTimestamp();
    await colClientes.add(payload);
  }

  fecharFormulario();
}

async function excluirCliente(id) {
  if (!confirm("Excluir este cliente?")) return;
  await colClientes.doc(id).delete();
}
