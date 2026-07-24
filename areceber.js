const colContasReceber = db.collection("contasReceber");
const colCaixaAR = db.collection("caixaLancamentos");

colContasReceber.orderBy("criadoEm", "desc").onSnapshot(snap => {
  const contas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  render(contas);
});

function render(contas) {
  const lista = document.getElementById("lista");

  if (contas.length === 0) {
    lista.innerHTML = '<div class="empty">Nenhuma conta a receber</div>';
    return;
  }

  lista.innerHTML = contas.map(c => `
    <div class="card">
      <div class="card-nome">
        ${escHtml(c.descricao)}
        <span class="badge-status ${c.status === "Recebido" ? "entregue" : "pendente"}">${escHtml(c.status)}</span>
      </div>
      <div class="card-meta">
        <span>${fmtTimestampCurto(c.criadoEm)}</span>
        <span class="valor-entrada">${fmtMoeda(c.valor)}</span>
      </div>
      ${c.status === "Pendente" ? `<button class="btn-baixa" onclick="darBaixa('${c.id}')">Dar baixa</button>` : ""}
    </div>
  `).join("");
}

async function darBaixa(id) {
  if (!confirm("Confirmar recebimento? O valor será lançado no Caixa.")) return;

  const ref = colContasReceber.doc(id);
  const snap = await ref.get();
  if (!snap.exists) return;
  const conta = snap.data();
  if (conta.status === "Recebido") return;

  const batch = db.batch();
  batch.update(ref, { status: "Recebido" });
  batch.set(colCaixaAR.doc(), {
    data: new Date().toISOString().slice(0, 10),
    descricao: `Recebimento: ${conta.descricao}`,
    tipo: "entrada",
    valor: conta.valor,
    origem: "baixa_receber",
    criadoEm: firebase.firestore.FieldValue.serverTimestamp()
  });
  await batch.commit();
}
