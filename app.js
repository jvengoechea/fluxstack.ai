const state = {
  tools: [],
  categories: ["All"],
  activeCategory: "All",
  query: "",
  adminToken: sessionStorage.getItem("fluxstack.adminToken") || "",
};

const toolGrid = document.getElementById("toolGrid");
const categoryFilters = document.getElementById("categoryFilters");
const searchInput = document.getElementById("searchInput");
const clearSearch = document.getElementById("clearSearch");
const resultCount = document.getElementById("resultCount");
const assistantInput = document.getElementById("assistantInput");
const askAssistant = document.getElementById("askAssistant");
const assistantOutput = document.getElementById("assistantOutput");
const openSubmit = document.getElementById("openSubmit");
const closeSubmit = document.getElementById("closeSubmit");
const submitDialog = document.getElementById("submitDialog");
const submitForm = document.getElementById("submitForm");
const autoFillSubmit = document.getElementById("autoFillSubmit");
const adminPanel = document.getElementById("adminPanel");
const toggleAdmin = document.getElementById("toggleAdmin");
const pendingList = document.getElementById("pendingList");
const openAdminAdd = document.getElementById("openAdminAdd");
const closeAdminAdd = document.getElementById("closeAdminAdd");
const adminAddDialog = document.getElementById("adminAddDialog");
const adminAddForm = document.getElementById("adminAddForm");
const autoFillAdmin = document.getElementById("autoFillAdmin");
const toolDetailDialog = document.getElementById("toolDetailDialog");
const toolDetailContent = document.getElementById("toolDetailContent");

init().catch((error) => {
  console.error(error);
  assistantOutput.textContent = "AI Guide: Coming Soon.";
});

async function init() {
  bindEvents();
  await refreshTools();

  if (state.adminToken) {
    const valid = await validateAdminToken(state.adminToken);
    if (valid) {
      enableAdminActions();
    } else {
      clearAdminToken();
    }
  }
}

function bindEvents() {
  searchInput.addEventListener("input", async () => {
    state.query = searchInput.value.trim();
    await refreshTools();
  });

  clearSearch.addEventListener("click", async () => {
    searchInput.value = "";
    state.query = "";
    await refreshTools();
  });

  askAssistant.addEventListener("click", handleAssistant);
  assistantInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAssistant();
    }
  });

  openSubmit.addEventListener("click", () => submitDialog.showModal());
  closeSubmit.addEventListener("click", () => submitDialog.close());

  submitForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(submitForm).entries());

    try {
      await api("/api/submissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      submitForm.reset();
      submitDialog.close();
      assistantOutput.textContent = `${payload.name} was sent for approval. It appears after admin approval.`;
      if (!adminPanel.classList.contains("hidden")) {
        await renderPending();
      }
    } catch (error) {
      assistantOutput.textContent = error.message;
    }
  });

  autoFillSubmit.addEventListener("click", async () => {
    await runAutoFill(submitForm, autoFillSubmit);
  });

  toggleAdmin.addEventListener("click", async () => {
    if (!adminPanel.classList.contains("hidden")) {
      closeAdminPanel();
      return;
    }

    const hasAccess = await ensureAdminAccess();
    if (!hasAccess) {
      closeAdminPanel();
      return;
    }

    openAdminPanel();
    await renderPending();
  });

  openAdminAdd.addEventListener("click", async () => {
    const hasAccess = await ensureAdminAccess();
    if (!hasAccess) return;
    adminAddDialog.showModal();
  });

  closeAdminAdd.addEventListener("click", () => adminAddDialog.close());

  adminAddForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = Object.fromEntries(new FormData(adminAddForm).entries());

    try {
      await api("/api/tools", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-token": state.adminToken,
        },
        body: JSON.stringify(payload),
      });

      adminAddForm.reset();
      adminAddDialog.close();
      assistantOutput.textContent = `${payload.name} was published directly.`;
      await refreshTools();
    } catch (error) {
      assistantOutput.textContent = error.message;
    }
  });

  autoFillAdmin.addEventListener("click", async () => {
    await runAutoFill(adminAddForm, autoFillAdmin);
  });

  toolDetailDialog.addEventListener("click", (event) => {
    const bounds = toolDetailDialog.getBoundingClientRect();
    const isInDialog =
      bounds.top <= event.clientY &&
      event.clientY <= bounds.top + bounds.height &&
      bounds.left <= event.clientX &&
      event.clientX <= bounds.left + bounds.width;

    if (!isInDialog) {
      toolDetailDialog.close();
    }
  });
}

async function runAutoFill(form, triggerButton) {
  const urlInput = form.querySelector('input[name="url"]');
  const thumbInput = form.querySelector('input[name="thumbnailUrl"]');
  const videoInput = form.querySelector('input[name="demoVideoUrl"]');
  const nameInput = form.querySelector('input[name="name"]');
  const descriptionInput = form.querySelector('textarea[name="description"]');

  const url = urlInput.value.trim();
  if (!url) {
    assistantOutput.textContent = "Enter a tool URL first, then use auto-fill.";
    return;
  }

  const originalLabel = triggerButton.textContent;
  triggerButton.disabled = true;
  triggerButton.textContent = "Fetching...";

  try {
    const data = await api("/api/tools/enrich", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });

    const enriched = data.enrichment || {};

    if (enriched.thumbnailUrl && !thumbInput.value.trim()) {
      thumbInput.value = enriched.thumbnailUrl;
    }
    if (enriched.demoVideoUrl && !videoInput.value.trim()) {
      videoInput.value = enriched.demoVideoUrl;
    }
    if (enriched.title && !nameInput.value.trim()) {
      nameInput.value = enriched.title;
    }
    if (enriched.description && !descriptionInput.value.trim()) {
      descriptionInput.value = enriched.description;
    }

    assistantOutput.textContent = "Media auto-fill completed. Review and adjust before submit.";
  } catch (error) {
    assistantOutput.textContent = `Auto-fill failed: ${error.message}`;
  } finally {
    triggerButton.disabled = false;
    triggerButton.textContent = originalLabel;
  }
}

async function refreshTools() {
  const params = new URLSearchParams({
    query: state.query,
    category: state.activeCategory,
  });

  const data = await api(`/api/tools?${params.toString()}`);
  state.tools = data.tools;
  state.categories = data.categories;

  buildCategoryFilters();
  renderTools();
}

function buildCategoryFilters() {
  if (!state.categories.includes(state.activeCategory)) {
    state.activeCategory = "All";
  }

  categoryFilters.innerHTML = "";
  state.categories.forEach((category) => {
    const button = document.createElement("button");
    button.className = `chip ${category === state.activeCategory ? "active" : ""}`;
    button.textContent = category;
    button.addEventListener("click", async () => {
      state.activeCategory = category;
      await refreshTools();
    });
    categoryFilters.appendChild(button);
  });
}

function renderTools() {
  toolGrid.innerHTML = "";

  state.tools.forEach((tool) => {
    const card = document.createElement("article");
    card.className = "tool-card";

    const thumbnail = tool.thumbnailUrl
      ? `<img class="tool-thumb" src="${escapeHTML(tool.thumbnailUrl)}" alt="${escapeHTML(tool.name)} preview" loading="lazy" />`
      : `<div class="tool-thumb placeholder">${escapeHTML(tool.name.slice(0, 1).toUpperCase())}</div>`;

    card.innerHTML = `
      ${thumbnail}
      <div class="tool-top">
        <strong>${escapeHTML(tool.name)}</strong>
        <span class="badge">${escapeHTML(tool.category)}</span>
      </div>
      <p class="tool-desc">${escapeHTML(tool.description)}</p>
      <div class="tags">${tool.tags.map((tag) => `<span>#${escapeHTML(tag)}</span>`).join("")}</div>
      <div class="card-actions">
        <a href="${escapeHTML(tool.url)}" target="_blank" rel="noreferrer">Visit</a>
        <button class="vote-btn" data-id="${tool.id}">▲ ${tool.votes}</button>
      </div>
    `;

    card.querySelector(".vote-btn").addEventListener("click", async (event) => {
      event.stopPropagation();
      try {
        await api(`/api/tools/${tool.id}/vote`, { method: "POST" });
        await refreshTools();
      } catch (error) {
        assistantOutput.textContent = error.message;
      }
    });

    card.querySelector("a").addEventListener("click", (event) => {
      event.stopPropagation();
    });

    card.addEventListener("click", () => {
      openToolDetail(tool);
    });

    toolGrid.appendChild(card);
  });

  resultCount.textContent = `${state.tools.length} tool${state.tools.length === 1 ? "" : "s"}`;
}

function openToolDetail(tool) {
  const mediaBlock = buildMediaBlock(tool);

  toolDetailContent.innerHTML = `
    <header class="detail-head">
      <div>
        <p class="eyebrow">${escapeHTML(tool.category)}</p>
        <h3>${escapeHTML(tool.name)}</h3>
      </div>
      <button class="ghost" id="closeToolDetail">Close</button>
    </header>
    <section class="detail-media">${mediaBlock}</section>
    <p class="detail-desc">${escapeHTML(tool.description)}</p>
    <div class="tags">${tool.tags.map((tag) => `<span>#${escapeHTML(tag)}</span>`).join("")}</div>
    <div class="detail-actions">
      <a href="${escapeHTML(tool.url)}" target="_blank" rel="noreferrer">Open Tool Website</a>
      <span>▲ ${tool.votes}</span>
    </div>
  `;

  toolDetailContent.querySelector("#closeToolDetail").addEventListener("click", () => toolDetailDialog.close());
  toolDetailDialog.showModal();
}

function buildMediaBlock(tool) {
  if (tool.demoVideoUrl) {
    if (isEmbeddableVideo(tool.demoVideoUrl)) {
      return `<iframe src="${escapeHTML(toEmbedUrl(tool.demoVideoUrl))}" title="${escapeHTML(tool.name)} demo" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
    }

    return `<video controls preload="metadata" src="${escapeHTML(tool.demoVideoUrl)}"></video>`;
  }

  if (tool.thumbnailUrl) {
    return `<img src="${escapeHTML(tool.thumbnailUrl)}" alt="${escapeHTML(tool.name)} preview" loading="lazy" />`;
  }

  return `<div class="media-empty">No preview media available for this tool yet.</div>`;
}

async function handleAssistant() {
  const userQuery = assistantInput.value.trim();

  if (!userQuery) {
    assistantOutput.textContent = "Tell me your use case and I will suggest tools from this library.";
    return;
  }

  try {
    const data = await api(`/api/assistant?q=${encodeURIComponent(userQuery)}`);

    if (!data.recommendations.length) {
      assistantOutput.textContent = "No direct match found. Try a more specific request.";
      return;
    }

    assistantOutput.innerHTML = `${data.intro}<br><br>${data.recommendations
      .map((tool, idx) => `${idx + 1}. <strong>${escapeHTML(tool.name)}</strong> - ${escapeHTML(tool.description)}`)
      .join("<br>")}`;

    searchInput.value = userQuery;
    state.query = userQuery;
    if (data.inferredCategory) {
      state.activeCategory = data.inferredCategory;
    }
    await refreshTools();
  } catch (error) {
    console.error(error);
    assistantOutput.textContent = "AI Guide: Coming Soon.";
  }
}

async function renderPending() {
  pendingList.innerHTML = "<p>Loading...</p>";

  try {
    const data = await api("/api/submissions", {
      headers: { "x-admin-token": state.adminToken },
    });

    if (!data.submissions.length) {
      pendingList.innerHTML = "<p>No pending submissions.</p>";
      return;
    }

    pendingList.innerHTML = "";
    data.submissions.forEach((item) => {
      const container = document.createElement("article");
      container.className = "pending-item";
      container.innerHTML = `
        <strong>${escapeHTML(item.name)}</strong>
        <p>${escapeHTML(item.description)}</p>
        <p>${escapeHTML(item.category)} | ${escapeHTML(item.url)}</p>
        <div class="pending-actions">
          <button class="approve">Approve</button>
          <button class="reject">Reject</button>
        </div>
      `;

      container.querySelector(".approve").addEventListener("click", async () => {
        await api(`/api/submissions/${item.id}/approve`, {
          method: "POST",
          headers: { "x-admin-token": state.adminToken },
        });
        await renderPending();
        await refreshTools();
      });

      container.querySelector(".reject").addEventListener("click", async () => {
        await api(`/api/submissions/${item.id}/reject`, {
          method: "POST",
          headers: { "x-admin-token": state.adminToken },
        });
        await renderPending();
      });

      pendingList.appendChild(container);
    });
  } catch (error) {
    if (error.message === "Admin token required") {
      clearAdminToken();
      closeAdminPanel();
      disableAdminActions();
      assistantOutput.textContent = "Admin access denied. Reopen Admin Queue and enter a valid token.";
      return;
    }
    pendingList.innerHTML = `<p>${escapeHTML(error.message)}</p>`;
  }
}

async function ensureAdminAccess() {
  if (state.adminToken) {
    const valid = await validateAdminToken(state.adminToken);
    if (valid) {
      enableAdminActions();
      return true;
    }
    clearAdminToken();
  }

  const token = window.prompt("Enter admin token");
  if (!token || !token.trim()) return false;

  const candidate = token.trim();
  const valid = await validateAdminToken(candidate);
  if (!valid) {
    window.alert("Invalid admin token.");
    return false;
  }

  state.adminToken = candidate;
  sessionStorage.setItem("fluxstack.adminToken", state.adminToken);
  enableAdminActions();
  return true;
}

async function validateAdminToken(token) {
  const response = await fetch("/api/submissions", {
    headers: { "x-admin-token": token },
  });

  if (response.status === 401) {
    return false;
  }

  if (!response.ok) {
    throw new Error(`Could not verify admin access (${response.status})`);
  }

  return true;
}

function clearAdminToken() {
  state.adminToken = "";
  sessionStorage.removeItem("fluxstack.adminToken");
}

function enableAdminActions() {
  openAdminAdd.classList.remove("hidden");
}

function disableAdminActions() {
  openAdminAdd.classList.add("hidden");
}

function openAdminPanel() {
  adminPanel.classList.remove("hidden");
  toggleAdmin.textContent = "Close Admin";
}

function closeAdminPanel() {
  adminPanel.classList.add("hidden");
  toggleAdmin.textContent = "Admin Queue";
}

function isEmbeddableVideo(url) {
  return /youtube\.com|youtu\.be|vimeo\.com/i.test(url);
}

function toEmbedUrl(url) {
  if (/youtube\.com\/watch\?v=/i.test(url)) {
    const parsed = new URL(url);
    const id = parsed.searchParams.get("v");
    return `https://www.youtube.com/embed/${id}`;
  }

  if (/youtu\.be\//i.test(url)) {
    const parsed = new URL(url);
    const id = parsed.pathname.replace("/", "");
    return `https://www.youtube.com/embed/${id}`;
  }

  if (/vimeo\.com\//i.test(url)) {
    const parsed = new URL(url);
    const id = parsed.pathname.split("/").filter(Boolean).pop();
    return `https://player.vimeo.com/video/${id}`;
  }

  return url;
}

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  return data;
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
