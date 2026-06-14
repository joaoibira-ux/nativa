const VERSAO_NATIVA = "1.19";

document.addEventListener("DOMContentLoaded", () => {
  const el = document.getElementById("versao-app");
  if (el) el.textContent = "Versão: " + VERSAO_NATIVA;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).catch(() => {});
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload());
}

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtMoeda(v) {
  return "R$ " + Number(v || 0).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function parseMoeda(s) {
  const v = parseFloat(String(s ?? "").replace(/[^\d,.-]/g, "").replace(",", "."));
  return isNaN(v) ? 0 : v;
}

function fmtDataSimples(data) {
  if (!data) return "";
  const [ano, mes, dia] = data.substring(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

function perguntarEscolha(titulo, opcoes) {
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.className = "choice-overlay";
    overlay.innerHTML = `
      <div class="choice-box">
        <div class="choice-titulo">${escHtml(titulo)}</div>
        <div class="choice-botoes">
          ${opcoes.map((o, i) => `<button type="button" class="btn-choice${i > 0 ? " secundario" : ""}" data-i="${i}">${escHtml(o.label)}</button>`).join("")}
        </div>
      </div>
    `;
    overlay.querySelectorAll(".btn-choice").forEach(btn => {
      btn.addEventListener("click", () => {
        const opcao = opcoes[Number(btn.dataset.i)];
        overlay.remove();
        resolve(opcao.value);
      });
    });
    document.body.appendChild(overlay);
  });
}
