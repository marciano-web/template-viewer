const $ = (sel) => document.querySelector(sel);

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3500);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) {
    const detail = json?.detail || json?.error || text || `HTTP ${res.status}`;
    throw new Error(detail);
  }
  return json;
}

function setActive(navId) {
  ["nav-templates","nav-help"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle("active", id === navId);
  });
}

function route() {
  const hash = location.hash || "#/";
  const parts = hash.replace(/^#\//, "").split("/").filter(Boolean);

  if (parts.length === 0) return renderTemplates();
  if (parts[0] === "template" && parts[1]) return renderTemplateFields(parts[1]);
  if (parts[0] === "help") return renderHelp();
  return renderTemplates();
}

async function renderTemplates() {
  setActive("nav-templates");
  const view = $("#view");
  view.innerHTML = `
    <div class="card">
      <h1>Templates</h1>
      <div class="muted">Faça upload do Excel (.xlsx). Depois, clique em <b>Mapear campos</b> para cadastrar entradas por célula (<code>B5</code>) ou intervalo (<code>C10:C29</code>).</div>
      <div style="height:12px"></div>
      <div class="row">
        <div>
          <label>Arquivo (.xlsx)</label>
          <input type="file" id="fileInput" accept=".xlsx" />
        </div>
        <button class="btn2" id="btnUpload">Enviar template</button>
      </div>
      <div style="height:14px"></div>
      <h2>Lista</h2>
      <div class="muted">Os templates ficam armazenados no banco. (MVP sem multi-tenant ainda.)</div>
      <table>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Arquivo</th>
            <th>Tamanho</th>
            <th>Data</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody id="tplBody">
          <tr><td colspan="5" class="muted">Carregando...</td></tr>
        </tbody>
      </table>
    </div>
  `;

  $("#btnUpload").onclick = async () => {
    const file = $("#fileInput").files[0];
    if (!file) return toast("Selecione um arquivo .xlsx");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/templates", { method: "POST", body: fd });
      const txt = await res.text();
      if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);
      toast("Template enviado com sucesso.");
      await loadTemplates();
    } catch (e) {
      toast("Falha no upload: " + e.message);
    }
  };

  await loadTemplates();

  async function loadTemplates() {
    const tbody = $("#tplBody");
    tbody.innerHTML = `<tr><td colspan="5" class="muted">Carregando...</td></tr>`;
    try {
      const data = await api("/api/templates", { method: "GET", headers: {} });
      if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="muted">Nenhum template cadastrado ainda.</td></tr>`;
        return;
      }
      tbody.innerHTML = "";
      for (const t of data) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(t.name || "")} <span class="pill">ID ${String(t.id).slice(0,8)}…</span></td>
          <td class="muted">${escapeHtml(t.original_name || "")}</td>
          <td class="muted">${formatBytes(t.size_bytes)}</td>
          <td class="muted">${new Date(t.created_at).toLocaleString()}</td>
          <td>
            <button class="btn" data-map="${t.id}">Mapear campos</button>
          </td>
        `;
        tbody.appendChild(tr);
      }
      tbody.querySelectorAll("button[data-map]").forEach(btn => {
        btn.onclick = () => location.hash = `#/template/${btn.getAttribute("data-map")}`;
      });
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="5" class="muted">Erro: ${escapeHtml(e.message)}</td></tr>`;
    }
  }
}

async function renderTemplateFields(templateId) {
  setActive("nav-templates");
  const view = $("#view");
  view.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between; align-items:center;">
        <div>
          <h1>Mapeamento de campos</h1>
          <div class="muted">Template ID: <code>${escapeHtml(templateId)}</code></div>
        </div>
        <button class="btn" id="btnBack">← Voltar</button>
      </div>

      <div style="height:12px"></div>

      <div class="split">
        <div class="card" style="padding:14px;">
          <h2>Campos cadastrados</h2>
          <div class="muted">Campos <b>single</b> = 1 célula (ex. <code>B5</code>). Campos <b>range</b> = intervalo 1D (ex. <code>C10:C29</code>).</div>
          <table>
            <thead>
              <tr>
                <th>Rótulo</th>
                <th>Tipo</th>
                <th>Ref</th>
                <th>Obrig.</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="fieldsBody">
              <tr><td colspan="5" class="muted">Carregando...</td></tr>
            </tbody>
          </table>
        </div>

        <div class="card" style="padding:14px;">
          <h2>Adicionar campo</h2>

          <div class="row">
            <div style="flex:1; min-width: 240px;">
              <label>Rótulo (ex.: Peso comprimido)</label>
              <input id="fLabel" placeholder="Ex.: Peso dos 20 comprimidos" style="width:100%;" />
            </div>
          </div>

          <div class="row" style="margin-top:10px;">
            <div>
              <label>Tipo</label>
              <select id="fType">
                <option value="number">number</option>
                <option value="text">text</option>
                <option value="date">date</option>
              </select>
            </div>

            <div>
              <label>Modo</label>
              <select id="fKind">
                <option value="single">single (1 célula)</option>
                <option value="range">range (intervalo)</option>
              </select>
            </div>

            <div>
              <label>Obrigatório</label>
              <select id="fReq">
                <option value="true">Sim</option>
                <option value="false">Não</option>
              </select>
            </div>
          </div>

          <div class="row" style="margin-top:10px;">
            <div id="singleBox">
              <label>Célula (A1)</label>
              <input id="fCell" placeholder="Ex.: B5" />
            </div>

            <div id="rangeBox" style="display:none;">
              <label>Intervalo 1D (A1:A20)</label>
              <input id="fRange" placeholder="Ex.: C10:C29" />
            </div>
          </div>

          <div class="row" style="margin-top:10px;">
            <div>
              <label>Mínimo (opcional)</label>
              <input id="fMin" placeholder="Ex.: 0" />
            </div>
            <div>
              <label>Máximo (opcional)</label>
              <input id="fMax" placeholder="Ex.: 999" />
            </div>
            <div id="expCountBox" style="display:none;">
              <label>expected_count (opcional)</label>
              <input id="fExp" placeholder="Ex.: 20" />
            </div>
          </div>

          <div class="row" style="margin-top:12px;">
            <button class="btn2" id="btnAdd">Salvar campo</button>
          </div>

          <div class="muted" style="margin-top:10px;">
            Dica: para 20 comprimidos, use intervalo <code>C10:C29</code> e (opcional) <code>expected_count=20</code>.
          </div>
        </div>
      </div>
    </div>
  `;

  $("#btnBack").onclick = () => (location.hash = "#/");

  const kindSel = $("#fKind");
  kindSel.onchange = () => {
    const k = kindSel.value;
    $("#singleBox").style.display = (k === "single") ? "" : "none";
    $("#rangeBox").style.display = (k === "range") ? "" : "none";
    $("#expCountBox").style.display = (k === "range") ? "" : "none";
  };

  $("#btnAdd").onclick = async () => {
    const label = $("#fLabel").value.trim();
    const field_type = $("#fType").value;
    const kind = $("#fKind").value;
    const required = $("#fReq").value === "true";
    const cell_ref = $("#fCell").value.trim().toUpperCase();
    const range_ref = $("#fRange").value.trim().toUpperCase();

    const min = $("#fMin").value.trim();
    const max = $("#fMax").value.trim();
    const exp = $("#fExp").value.trim();

    const validation_json = {};
    if (min !== "") validation_json.min = Number(min);
    if (max !== "") validation_json.max = Number(max);
    if (exp !== "") validation_json.expected_count = Number(exp);

    try {
      await api(`/api/templates/${templateId}/fields`, {
        method: "POST",
        body: JSON.stringify({ kind, label, field_type, required, cell_ref, range_ref, validation_json }),
      });
      toast("Campo salvo.");
      $("#fLabel").value = "";
      $("#fCell").value = "";
      $("#fRange").value = "";
      $("#fMin").value = "";
      $("#fMax").value = "";
      $("#fExp").value = "";
      await loadFields();
    } catch (e) {
      toast("Erro: " + e.message);
    }
  };

  await loadFields();

  async function loadFields() {
    const body = $("#fieldsBody");
    body.innerHTML = `<tr><td colspan="5" class="muted">Carregando...</td></tr>`;
    try {
      const fields = await api(`/api/templates/${templateId}/fields`, { method: "GET", headers: {} });
      if (!fields || fields.length === 0) {
        body.innerHTML = `<tr><td colspan="5" class="muted">Nenhum campo mapeado ainda.</td></tr>`;
        return;
      }
      body.innerHTML = "";
      for (const f of fields) {
        const ref = f.kind === "single" ? f.cell_ref : f.range_ref;
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(f.label)} <span class="pill">${escapeHtml(f.kind)}</span></td>
          <td class="muted">${escapeHtml(f.field_type)}</td>
          <td><code>${escapeHtml(ref || "")}</code></td>
          <td class="muted">${f.required ? "Sim" : "Não"}</td>
          <td><button class="danger" data-del="${f.id}">Excluir</button></td>
        `;
        body.appendChild(tr);
      }
      body.querySelectorAll("button[data-del]").forEach(btn => {
        btn.onclick = async () => {
          const id = btn.getAttribute("data-del");
          if (!confirm("Excluir este campo?")) return;
          try {
            await api(`/api/templates/${templateId}/fields/${id}`, { method: "DELETE" });
            toast("Campo removido.");
            await loadFields();
          } catch (e) {
            toast("Erro: " + e.message);
          }
        };
      });
    } catch (e) {
      body.innerHTML = `<tr><td colspan="5" class="muted">Erro: ${escapeHtml(e.message)}</td></tr>`;
    }
  }
}

function renderHelp() {
  setActive("nav-help");
  $("#view").innerHTML = `
    <div class="card">
      <h1>Ajuda</h1>
      <div class="muted">
        Este MVP implementa:
        <ul>
          <li>Upload e listagem de templates Excel</li>
          <li>Mapeamento de campos por <b>célula</b> (single) e por <b>intervalo 1D</b> (range)</li>
        </ul>
        Próximas etapas (para Part 11 / multi-tenant):
        <ul>
          <li>Login + perfis (Admin Master, Admin, Operador)</li>
          <li>Empresas (tenants) + isolamento por company_id</li>
          <li>Runs (execução) + trilha de auditoria + assinaturas (executor/revisor/aprovador)</li>
          <li>Geração de PDF + hash</li>
        </ul>

        <p><b>SQL necessário:</b> execute o arquivo <code>server/schema.sql</code> no seu Postgres do Railway para criar a tabela <code>template_fields</code>.</p>
      </div>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[c]));
}

function formatBytes(n) {
  if (!Number.isFinite(n)) return "";
  const units = ["B","KB","MB","GB"];
  let i = 0; let v = n;
  while (v >= 1024 && i < units.length-1) { v /= 1024; i++; }
  return `${v.toFixed(i===0?0:1)} ${units[i]}`;
}

window.addEventListener("hashchange", route);
route();
