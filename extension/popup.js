const DEFAULT_REPO = "coding-solutions";
const PLATFORMS = [
  { id: "GFG", label: "GeeksforGeeks", folder: "GeeksforGeeks" },
  { id: "HackerRank", label: "HackerRank", folder: "HackerRank" },
  { id: "CodeChef", label: "CodeChef", folder: "CodeChef" },
  { id: "LeetCode", label: "LeetCode", folder: "LeetCode" },
];
const LANGUAGES = [
  "cpp",
  "c",
  "java",
  "python3",
  "javascript",
  "typescript",
  "c#",
  "go",
  "kotlin",
  "ruby",
  "swift",
  "rust",
  "php",
  "dart",
  "scala",
  "sql",
  "other",
];

const $ = (id) => document.getElementById(id);

function langLabel(l) {
  if (l === "cpp") return "C++";
  if (l === "python3") return "Python 3";
  if (l === "c#") return "C#";
  return l.charAt(0).toUpperCase() + l.slice(1);
}

function init() {
  const platformSel = $("platform");
  platformSel.innerHTML = "";
  for (const p of PLATFORMS) platformSel.add(new Option(p.label, p.id));

  const langSel = $("language");
  langSel.innerHTML = "";
  for (const l of LANGUAGES) langSel.add(new Option(langLabel(l), l));

  loadState();
  $("code").addEventListener("input", () => {
    codeTouched = true; // user is typing here — stop mirroring the site's editor
  });
  $("connect-btn").addEventListener("click", connect);
  $("pat").addEventListener("keydown", (e) => {
    if (e.key === "Enter") connect();
  });
  $("disconnect-btn").addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "disconnect" });
    loadState();
  });
  $("push-btn").addEventListener("click", push);
  $("repo").addEventListener("change", saveSettings);
  $("private").addEventListener("change", saveSettings);
}

async function saveSettings() {
  await chrome.storage.local.set({
    repoName: $("repo").value.trim() || DEFAULT_REPO,
    privateRepo: $("private").checked,
  });
}

async function loadState() {
  const st = await chrome.runtime.sendMessage({ type: "getStatus" });
  $("repo").value = st.repoName || DEFAULT_REPO;
  $("private").checked = !!st.privateRepo;
  $("conn-dot").classList.toggle("on", !!st.connected);
  if (st.connected) {
    $("conn-out").hidden = true;
    $("conn-in").hidden = false;
    $("login").textContent = st.login;
  } else {
    $("conn-out").hidden = false;
    $("conn-in").hidden = true;
  }

  refreshAutofill();
  setInterval(refreshAutofill, 2000);
  document.addEventListener("visibilitychange", refreshAutofill);
}

// Auto-fill from the problem page in the active tab.
let autoUrl = null;
let codeTouched = false;

async function refreshAutofill() {
  if (document.hidden) return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || tab.id == null) return;
    const res = await chrome.tabs
      .sendMessage(tab.id, { type: "getProblem" })
      .catch(() => null);
    if (!res || !res.problem || !res.problem.url) {
      const banner = $("autodetect-status");
      if (banner) banner.hidden = true;
      return;
    }

    const p = res.problem;
    const banner = $("autodetect-status");
    if (banner) {
      banner.hidden = false;
      const lines = p.lineCount || (p.code ? p.code.split("\n").length : 0);
      banner.innerHTML = `<span>⚡ Auto-detected: <b>${p.platformLabel || p.platform}</b> • ${lines} lines ${p.isSolved ? "• <b>Solved 🎉</b>" : ""}</span>`;
    }

    if (p.url !== autoUrl) {
      autoUrl = p.url;
      codeTouched = false;
      fillForm(p);
      return;
    }

    if (!codeTouched) {
      if (p.code && p.code.trim() && p.code !== $("code").value) {
        $("code").value = p.code;
      }
      if (p.language && $("language").value !== p.language) {
        const opt = [...$("language").options].find((o) => o.value === p.language);
        if (opt) $("language").value = p.language;
      }
      if (p.title && !$("title").value) {
        $("title").value = p.title;
      }
    }
  } catch (e) {
    console.debug("CodePush refreshAutofill notice:", e);
  }
}

function fillForm(p) {
  const plat = PLATFORMS.find((x) => x.id === p.platform);
  if (plat) $("platform").value = plat.id;
  if (p.title) $("title").value = p.title;
  if (p.language) {
    const opt = [...$("language").options].find((o) => o.value === p.language);
    if (opt) $("language").value = p.language;
  }
  if (p.code && p.code.trim()) $("code").value = p.code;
  if (p.url) $("url").value = p.url;
}

async function connect() {
  const token = $("pat").value.trim();
  const errEl = $("conn-error");
  errEl.textContent = "";
  if (!token) {
    errEl.textContent = "Paste your personal access token first.";
    return;
  }
  const btn = $("connect-btn");
  btn.disabled = true;
  btn.textContent = "Connecting…";
  const res = await chrome.runtime.sendMessage({ type: "connect", token });
  btn.disabled = false;
  btn.textContent = "Connect GitHub";
  if (res && res.ok) {
    $("pat").value = "";
    loadState();
  } else {
    errEl.textContent = (res && res.error) || "Could not verify the token.";
  }
}

async function push() {
  const title = $("title").value.trim();
  const code = $("code").value;
  if (!title || !code.trim()) {
    setStatus("Add a title and your code before pushing.", true);
    return;
  }
  await saveSettings();
  const p = PLATFORMS.find((x) => x.id === $("platform").value) || PLATFORMS[0];
  setStatus("Pushing…");
  const res = await chrome.runtime.sendMessage({
    type: "pushSolution",
    platform: p.id,
    platformLabel: p.label,
    folder: p.folder,
    title,
    url: $("url").value,
    language: $("language").value,
    code,
    repoName: $("repo").value.trim() || DEFAULT_REPO,
    privateRepo: $("private").checked,
  });
  if (res && res.ok) {
    setStatus(res.created ? "Pushed to GitHub! 🎉" : "Updated on GitHub.", false, res.htmlUrl);
  } else {
    setStatus((res && res.error) || "Push failed.", true);
  }
}

function setStatus(text, isError, link) {
  const el = $("status");
  el.textContent = text;
  el.className = isError ? "error" : "";
  if (link) {
    const a = document.createElement("a");
    a.href = link;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = " View on GitHub";
    el.appendChild(a);
  }
}

document.addEventListener("DOMContentLoaded", init);
