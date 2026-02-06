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
const adminPanel = document.getElementById("adminPanel");
const toggleAdmin = document.getElementById("toggleAdmin");
const pendingList = document.getElementById("pendingList");

init().catch((error) => {
  console.error(error);
  assistantOutput.textContent = "Failed to initialize. Start the backend server and refresh.";
});

async function init() {
  bindEvents();
  await refreshTools();
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

  toggleAdmin.addEventListener("click", async () => {
    adminPanel.classList.toggle("hidden");
    toggleAdmin.textContent = adminPanel.classList.contains("hidden") ? "Admin Queue" : "Close Admin";

    if (!adminPanel.classList.contains("hidden")) {
      ensureAdminToken();
      await renderPending();
    }
  });
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
    card.innerHTML = `
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

    card.querySelector(".vote-btn").addEventListener("click", async () => {
      try {
        await api(`/api/tools/${tool.id}/vote`, { method: "POST" });
        await refreshTools();
      } catch (error) {
        assistantOutput.textContent = error.message;
      }
    });

    toolGrid.appendChild(card);
  });

  resultCount.textContent = `${state.tools.length} tool${state.tools.length === 1 ? "" : "s"}`;
}

async function handleAssistant() {
  const query = assistantInput.value.trim();

  if (!query) {
    assistantOutput.textContent = "Tell me your use case and I will suggest tools from this library.";
    return;
  }

  try {
    const data = await api(`/api/assistant?q=${encodeURIComponent(query)}`);

    if (!data.recommendations.length) {
      assistantOutput.textContent = "No direct match found. Try a more specific request.";
      return;
    }

    assistantOutput.innerHTML = `${data.intro}<br><br>${data.recommendations
      .map((tool, idx) => `${idx + 1}. <strong>${escapeHTML(tool.name)}</strong> - ${escapeHTML(tool.description)}`)
      .join("<br>")}`;

    searchInput.value = query;
    state.query = query;
    if (data.inferredCategory) {
      state.activeCategory = data.inferredCategory;
    }
    await refreshTools();
  } catch (error) {
    assistantOutput.textContent = error.message;
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
    pendingList.innerHTML = `<p>${escapeHTML(error.message)}</p>`;
  }
}

function ensureAdminToken() {
  if (state.adminToken) return;
  const token = window.prompt("Enter admin token");
  if (!token) return;
  state.adminToken = token.trim();
  sessionStorage.setItem("fluxstack.adminToken", state.adminToken);
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
