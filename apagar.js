const colContasPagar = db.collection("contasPagar");
const colCaixaAP = db.collection("caixaLancamentos");

colContasPagar.orderBy("criadoEm", "desc").onSnapshot(snap => {
  const contas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  render(contas);
});

function render(contas) {
  const lista = document.getElementById("lista");

  if (contas.length === 0) {
    lista.innerHTML = '<div class="empty">Nenhuma conta a pagar</div>';
    return;
  }

  lista.innerHTML = contas.map(c => `
    <div class="card">
      <div class="card-nome">
        ${escHtml(c.descricao)}
        <span class="badge-status ${c.status === "Pago" ? "entregue" : "pendente"}">${escHtml(c.status)}</span>
      </div>
      <div class="card-meta">
        <span>${fmtTimestampCurto(c.criadoEm)}</span>
        <span class="valor-saida">${fmtMoeda(c.valor)}</span>
      </div>
      ${c.status === "Pendente" ? `<button class="btn-baixa" onclick="darBaixa('${c.id}')">Dar baixa</button>` : ""}
    </div>
  `).join("");
}

async function darBaixa(id) {
  if (!confirm("Confirmar pagamento? O valor será lançado no Caixa.")) return;

  const ref = colContasPagar.doc(id);
  const snap = await ref.get();
  if (!snap.exists) return;
  const conta = snap.data();
  if (conta.status === "Pago") return;

  const batch = db.batch();
  batch.update(ref, { status: "Pago" });
  batch.set(colCaixaAP.doc(), {
    data: new Date().toISOString().slice(0, 10),
    descricao: `Pagamento: ${conta.descricao}`,
    tipo: "saida",
    valor: conta.valor,
    origem: "baixa_pagar",
    criadoEm: firebase.firestore.FieldValue.serverTimestamp()
  });
  await batch.commit();
}
