const VERSAO_NATIVA = "2.00";

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
db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

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

function fmtTimestampCurto(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${d.getFullYear()}`;
}

function fmtTimestampComHora(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${dia}/${mes}/${d.getFullYear()} ${hh}:${mm}`;
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
