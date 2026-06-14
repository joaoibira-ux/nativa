async function carregar() {
  const res = await fetch("/api/contas_receber");
  const contas = await res.json();
  render(contas);
}

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
        <span>${fmtDataSimples(c.criado_em)}</span>
        <span class="valor-entrada">${fmtMoeda(c.valor)}</span>
      </div>
      ${c.status === "Pendente" ? `<button class="btn-baixa" onclick="darBaixa(${c.id})">Dar baixa</button>` : ""}
    </div>
  `).join("");
}

async function darBaixa(id) {
  if (!confirm("Confirmar recebimento? O valor será lançado no Caixa.")) return;
  await fetch(`/api/contas_receber/${id}/baixa`, { method: "POST" });
  carregar();
}

carregar();
