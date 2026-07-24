const colCaixa = db.collection("caixaLancamentos");

colCaixa.orderBy("criadoEm", "desc").onSnapshot(snap => {
  const lancamentos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  let saldo = 0;
  for (const l of lancamentos) saldo += l.tipo === "entrada" ? l.valor : -l.valor;
  render(saldo, lancamentos);
});

function render(saldo, lancamentos) {
  const saldoEl = document.getElementById("saldo-valor");
  saldoEl.textContent = fmtMoeda(saldo);
  saldoEl.classList.toggle("negativo", saldo < 0);

  const lista = document.getElementById("lista");
  if (lancamentos.length === 0) {
    lista.innerHTML = '<div class="empty">Nenhum lançamento registrado</div>';
    return;
  }

  lista.innerHTML = lancamentos.map(l => `
    <div class="card">
      <div class="card-acoes">
        <button class="btn-del" onclick="excluirLancamento('${l.id}')">🗑️</button>
      </div>
      <div class="card-nome">${escHtml(l.descricao)}</div>
      <div class="card-meta">
        <span>${fmtDataSimples(l.data)}</span>
        <span class="${l.tipo === "entrada" ? "valor-entrada" : "valor-saida"}">${l.tipo === "entrada" ? "+ " : "- "}${fmtMoeda(l.valor)}</span>
      </div>
    </div>
  `).join("");
}

function abrirFormulario() {
  document.getElementById("form").reset();
  document.getElementById("f-data").value = new Date().toISOString().slice(0, 10);
  document.getElementById("f-tipo").value = "entrada";
  document.getElementById("form-overlay").style.display = "flex";
}

function fecharFormulario() {
  document.getElementById("form-overlay").style.display = "none";
}

async function salvarLancamento() {
  const descricao = document.getElementById("f-descricao").value.trim();
  const valor = parseMoeda(document.getElementById("f-valor").value);

  if (!descricao) {
    alert("Informe a descrição");
    return;
  }
  if (valor <= 0) {
    alert("Informe um valor maior que zero");
    return;
  }

  await colCaixa.add({
    data: document.getElementById("f-data").value,
    tipo: document.getElementById("f-tipo").value,
    descricao,
    valor,
    origem: "manual",
    criadoEm: firebase.firestore.FieldValue.serverTimestamp()
  });

  fecharFormulario();
}

async function excluirLancamento(id) {
  if (!confirm("Excluir este lançamento?")) return;
  await colCaixa.doc(id).delete();
}
