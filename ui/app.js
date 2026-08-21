function loadRemoteCache() {
  try {
    const cached = JSON.parse(localStorage.getItem("nvm-remote-cache") || "null");
    if (!cached || !Array.isArray(cached.releases) || Date.now() - cached.savedAt > 6 * 60 * 60 * 1000) return null;
    return cached;
  } catch (_) { return null; }
}

const remoteCache = loadRemoteCache();
const state = {
  nvm: { versions: [], defaultVersion: null, nvmDirectory: "", nvmScript: "" },
  remote: remoteCache?.releases || [],
  remoteSavedAt: remoteCache?.savedAt || null,
  remoteFilter: "lts",
  remotePage: 0,
  remotePageSize: 40,
  remoteLoading: false,
  versionSearch: "",
  projects: JSON.parse(localStorage.getItem("nvm-projects") || "[]"),
  projectDetails: new Map(),
  busy: false,
  customDirectory: localStorage.getItem("nvm-directory") || "",
  operationTimer: null
};

const $ = (selector) => document.querySelector(selector);
const elements = {
  status: $("#status"), notice: $("#notice"), installedRows: $("#installed-rows"),
  installedEmpty: $("#installed-empty"), installedSummary: $("#installed-summary"),
  onlineRows: $("#online-rows"), onlineEmpty: $("#online-empty"), onlineSummary: $("#online-summary"),
  projectList: $("#project-list"), projectEmpty: $("#project-empty"), projectSummary: $("#project-summary"),
  healthList: $("#health-list"), environmentValues: $("#environment-values"),
  operation: $("#operation"), operationTitle: $("#operation-title"),
  operationStage: $("#operation-stage"), operationTime: $("#operation-time"),
  summaryDefault: $("#summary-default"), summaryInstalled: $("#summary-installed"),
  summaryDirectory: $("#summary-directory"), onlineLoading: $("#online-loading"),
  onlineUpdated: $("#online-updated"), pageInfo: $("#page-info"),
  previousPage: $("#previous-page"), nextPage: $("#next-page")
};

function payload(values = {}) {
  return Object.assign({ nvmDirectory: state.customDirectory }, values);
}

function notice(message = "") {
  elements.notice.textContent = message;
  elements.notice.hidden = !message;
}

function setBusy(value, message = "") {
  state.busy = value;
  document.querySelectorAll(
    "#installed button, #installed select, #projects button, #projects select, #environment button, #environment select"
  ).forEach((control) => { control.disabled = value; });
  if (message) elements.status.textContent = message;
}

function formatElapsed(seconds) {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function startInstallProgress(version) {
  const startedAt = Date.now();
  clearInterval(state.operationTimer);
  elements.operation.hidden = false;
  elements.operationTitle.textContent = `正在安装 ${version}`;
  const update = () => {
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    elements.operationTime.textContent = formatElapsed(elapsed);
    elements.operationStage.textContent = elapsed < 5
      ? "准备 NVM 环境"
      : elapsed < 20
        ? "正在查询并连接下载源"
        : elapsed < 90
          ? "正在下载 Node.js 文件"
          : "NVM 仍在处理，请保持窗口打开";
  };
  update();
  state.operationTimer = setInterval(update, 1000);
}

function finishInstallProgress(message, failed = false) {
  clearInterval(state.operationTimer);
  state.operationTimer = null;
  elements.operationStage.textContent = message;
  elements.operation.classList.toggle("failed", failed);
  setTimeout(() => { elements.operation.hidden = true; }, failed ? 5000 : 1800);
}

async function invoke(action, values = {}) {
  return window.PluginDeck.invoke(action, payload(values));
}

function parseDetail(result) {
  return JSON.parse(result.detail || "null");
}

function button(title, handler, className = "") {
  const item = document.createElement("button");
  item.type = "button";
  item.textContent = title;
  item.className = className;
  item.addEventListener("click", handler);
  return item;
}

function cell(value, className = "") {
  const item = document.createElement("td");
  item.textContent = value ?? "-";
  item.className = className;
  item.title = String(value ?? "-");
  return item;
}

async function refreshState() {
  setBusy(true, "正在读取 NVM 状态...");
  notice();
  try {
    state.nvm = parseDetail(await invoke("state"));
    elements.status.textContent = state.nvm.defaultVersion
      ? `默认版本 ${state.nvm.defaultVersion}` : "尚未设置默认版本";
    renderInstalled();
    renderSummary();
    renderProjects();
  } catch (error) {
    notice(error.message || String(error));
    elements.status.textContent = "NVM 不可用";
  } finally { setBusy(false); }
}

function renderSummary() {
  elements.summaryDefault.textContent = state.nvm.defaultVersion || "未设置";
  elements.summaryInstalled.textContent = `${state.nvm.versions.length} 个版本`;
  elements.summaryDirectory.textContent = state.nvm.nvmDirectory || "未检测到";
  elements.summaryDirectory.title = state.nvm.nvmDirectory || "";
}

function renderInstalled() {
  elements.installedRows.replaceChildren();
  state.nvm.versions.forEach((version) => {
    const row = document.createElement("tr");
    row.append(cell(version, "version"));
    const status = document.createElement("td");
    if (version === state.nvm.defaultVersion) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "默认版本";
      status.append(badge);
    } else status.textContent = "已安装";
    row.append(status);
    const actions = document.createElement("td");
    actions.className = "actions";
    actions.append(
      button("终端", () => runSimple("terminal", { version }, "正在打开 Terminal...")),
      button("设为默认", () => setDefault(version)),
      button("卸载", () => uninstall(version), "danger")
    );
    row.append(actions);
    elements.installedRows.append(row);
  });
  elements.installedEmpty.hidden = state.nvm.versions.length !== 0;
  elements.installedSummary.textContent = `${state.nvm.versions.length} 个 Node.js 版本`;
}

async function runSimple(action, values, message) {
  setBusy(true, message);
  notice();
  try { await invoke(action, values); }
  catch (error) { notice(error.message || String(error)); }
  finally { setBusy(false); }
}

async function setDefault(version) {
  setBusy(true, `正在设置 ${version}...`);
  try { await invoke("default", { version }); await refreshState(); }
  catch (error) { notice(error.message || String(error)); setBusy(false); }
}

async function uninstall(version) {
  setBusy(true, `正在卸载 ${version}...`);
  try { await invoke("uninstall", { version }); await refreshState(); }
  catch (error) { notice(error.message || String(error)); setBusy(false); }
}

function setRemoteLoading(value) {
  state.remoteLoading = value;
  elements.onlineLoading.hidden = !value;
  $("#online-rows").closest("table").hidden = value;
  $("#refresh-online").disabled = value;
  elements.previousPage.disabled = value;
  elements.nextPage.disabled = value;
}

async function loadRemote(force = false) {
  if (state.remoteLoading) return;
  if (!force && state.remote.length) {
    renderRemote();
    return;
  }
  setRemoteLoading(true);
  elements.status.textContent = "正在同步 Node.js 在线版本...";
  notice();
  try {
    state.remote = parseDetail(await invoke("remote"));
    state.remoteSavedAt = Date.now();
    localStorage.setItem("nvm-remote-cache", JSON.stringify({ savedAt: state.remoteSavedAt, releases: state.remote }));
    state.remotePage = 0;
    renderRemote();
    elements.status.textContent = "在线版本已更新";
  } catch (error) { notice(error.message || String(error)); }
  finally { setRemoteLoading(false); renderRemote(); }
}

function visibleRemote() {
  const query = state.versionSearch.toLowerCase().trim();
  return state.remote.filter((release) => {
    const matchesFilter = state.remoteFilter === "all" || release.lts;
    const matchesSearch = !query || release.version.toLowerCase().includes(query)
      || String(release.lts || "").toLowerCase().includes(query);
    return matchesFilter && matchesSearch;
  });
}

function renderRemote() {
  const releases = visibleRemote();
  const pageCount = Math.max(1, Math.ceil(releases.length / state.remotePageSize));
  state.remotePage = Math.min(state.remotePage, pageCount - 1);
  const pageStart = state.remotePage * state.remotePageSize;
  const pageReleases = releases.slice(pageStart, pageStart + state.remotePageSize);
  elements.onlineRows.replaceChildren();
  pageReleases.forEach((release) => {
    const row = document.createElement("tr");
    row.append(
      cell(release.version + (release.security ? " · 安全" : ""), "version"),
      cell(release.lts || "-"), cell(release.date), cell(release.npm), cell(release.v8),
      cell(release.appleSilicon && release.intel ? "Apple + Intel" : release.appleSilicon ? "Apple" : release.intel ? "Intel" : "-")
    );
    const actions = document.createElement("td");
    actions.className = "actions";
    if (state.nvm.versions.includes(release.version)) actions.textContent = "已安装";
    else actions.append(button("安装", () => install(release.version)));
    row.append(actions);
    elements.onlineRows.append(row);
  });
  elements.onlineEmpty.hidden = releases.length !== 0;
  elements.onlineSummary.textContent = `${releases.length} 个可见版本 · 共 ${state.remote.length} 个发布`;
  elements.pageInfo.textContent = `第 ${state.remotePage + 1} / ${pageCount} 页`;
  elements.previousPage.disabled = state.remoteLoading || state.remotePage === 0;
  elements.nextPage.disabled = state.remoteLoading || state.remotePage >= pageCount - 1;
  elements.onlineUpdated.textContent = state.remoteSavedAt
    ? `更新于 ${new Date(state.remoteSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    : "尚未同步";
}

async function install(version) {
  setBusy(true, `正在通过 NVM 安装 ${version}，请保持窗口打开...`);
  startInstallProgress(version);
  notice();
  try {
    await invoke("install", { version });
    finishInstallProgress("安装完成，正在刷新版本列表");
    await refreshState();
    renderRemote();
  } catch (error) {
    finishInstallProgress("安装失败", true);
    notice(error.message || String(error));
    setBusy(false);
  }
}

function persistProjects() {
  localStorage.setItem("nvm-projects", JSON.stringify(state.projects));
}

async function inspectProject(path) {
  try {
    const detail = parseDetail(await invoke("project-inspect", { path }));
    state.projectDetails.set(path, detail);
  } catch (error) {
    state.projectDetails.set(path, { path, name: path.split("/").pop(), error: error.message || String(error) });
  }
  renderProjects();
}

function renderProjects() {
  elements.projectList.replaceChildren();
  state.projects.forEach((path) => {
    const detail = state.projectDetails.get(path);
    const row = document.createElement("div");
    row.className = "project-row";
    const identity = document.createElement("div");
    identity.innerHTML = `<div class="project-name"></div><div class="project-path"></div>`;
    identity.querySelector(".project-name").textContent = detail?.name || path.split("/").pop() || path;
    identity.querySelector(".project-path").textContent = path;
    const status = document.createElement("div");
    status.className = "project-status";
    status.textContent = detail?.error || (detail?.source
      ? `${detail.source}: ${detail.requestedVersion}${detail.resolvedVersion ? ` → ${detail.resolvedVersion}` : ""}`
      : detail ? "未找到版本配置" : "等待扫描");
    const actions = document.createElement("div");
    actions.className = "project-actions";
    const versions = document.createElement("select");
    versions.title = "写入 .nvmrc";
    versions.append(new Option("选择版本", ""), ...state.nvm.versions.map((version) => new Option(version, version)));
    versions.addEventListener("change", async () => {
      if (!versions.value) return;
      await invoke("project-write", { path, version: versions.value });
      await inspectProject(path);
    });
    actions.append(
      versions,
      button("终端", () => invoke("project-terminal", { path, version: detail?.resolvedVersion || "" }).catch((error) => notice(error.message))),
      button("移除", () => removeProject(path), "danger")
    );
    row.append(identity, status, actions);
    elements.projectList.append(row);
    if (!detail) inspectProject(path);
  });
  elements.projectEmpty.hidden = state.projects.length !== 0;
  elements.projectSummary.textContent = `${state.projects.length} 个项目`;
}

function addProject(path) {
  const normalized = path.trim().replace(/\/$/, "");
  if (!normalized || state.projects.includes(normalized)) return;
  state.projects.unshift(normalized);
  persistProjects();
  renderProjects();
}

function removeProject(path) {
  state.projects = state.projects.filter((item) => item !== path);
  state.projectDetails.delete(path);
  persistProjects();
  renderProjects();
}

async function loadEnvironment() {
  setBusy(true, "正在检查 NVM 环境...");
  notice();
  try {
    const environment = parseDetail(await invoke("environment"));
    renderEnvironment(environment);
  } catch (error) { notice(error.message || String(error)); }
  finally { setBusy(false); }
}

function renderEnvironment(value) {
  const checks = [
    ["NVM 安装", true, value.nvmScript],
    ["加载脚本", value.scriptReadable, value.scriptReadable ? "文件可读" : "文件不可读"],
    ["数据目录", value.directoryWritable, value.directoryWritable ? "目录可写" : "目录不可写"],
    ["默认版本", Boolean(value.defaultVersion), value.defaultVersion || "尚未设置"],
    ["Shell 配置", value.profileConfigured, `${value.profileName} ${value.profileConfigured ? "已配置" : "未检测到 NVM"}`]
  ];
  elements.healthList.replaceChildren();
  checks.forEach(([title, good, detail]) => {
    const item = document.createElement("div");
    item.className = `health-item ${good ? "good" : ""}`;
    item.innerHTML = `<span class="health-dot"></span><strong></strong><span class="health-detail"></span>`;
    item.querySelector("strong").textContent = title;
    item.querySelector(".health-detail").textContent = detail;
    elements.healthList.append(item);
  });
  const values = [
    ["NVM 数据目录", value.nvmDirectory], ["NVM 加载脚本", value.nvmScript],
    ["默认版本", value.defaultVersion || "未设置"], ["Shell", value.shell], ["系统", value.architecture]
  ];
  elements.environmentValues.replaceChildren();
  values.forEach(([label, detail]) => {
    const term = document.createElement("dt"); term.textContent = label;
    const description = document.createElement("dd"); description.textContent = detail;
    elements.environmentValues.append(term, description);
  });
}

document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => {
  document.querySelectorAll(".tab, .panel").forEach((item) => item.classList.remove("active"));
  tab.classList.add("active");
  $(`#${tab.dataset.panel}`).classList.add("active");
  if (tab.dataset.panel === "online" && state.remote.length === 0) loadRemote();
  else if (tab.dataset.panel === "online") renderRemote();
  if (tab.dataset.panel === "environment") loadEnvironment();
}));
document.querySelectorAll(".filter").forEach((item) => item.addEventListener("click", () => {
  document.querySelectorAll(".filter").forEach((button) => button.classList.remove("active"));
  item.classList.add("active"); state.remoteFilter = item.dataset.filter; state.remotePage = 0; renderRemote();
}));
$("#version-search").addEventListener("input", (event) => {
  state.versionSearch = event.target.value; state.remotePage = 0; renderRemote();
});
$("#refresh-installed").addEventListener("click", refreshState);
$("#refresh-online").addEventListener("click", () => loadRemote(true));
elements.previousPage.addEventListener("click", () => { state.remotePage -= 1; renderRemote(); });
elements.nextPage.addEventListener("click", () => { state.remotePage += 1; renderRemote(); });
$("#refresh-environment").addEventListener("click", loadEnvironment);
$("#project-form").addEventListener("submit", (event) => {
  event.preventDefault(); addProject($("#project-path").value); $("#project-path").value = "";
});
$("#nvm-directory").value = state.customDirectory;
$("#nvm-directory-form").addEventListener("submit", async (event) => {
  event.preventDefault(); state.customDirectory = $("#nvm-directory").value.trim();
  localStorage.setItem("nvm-directory", state.customDirectory); await refreshState(); await loadEnvironment();
});
$("#clear-nvm-directory").addEventListener("click", async () => {
  state.customDirectory = ""; $("#nvm-directory").value = ""; localStorage.removeItem("nvm-directory");
  await refreshState(); await loadEnvironment();
});

if (state.remote.length) renderRemote();
refreshState();
