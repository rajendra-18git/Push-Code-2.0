// CodePush background service worker — all GitHub API communication lives here.
const GITHUB_API = "https://api.github.com";

// Clicking the toolbar icon opens the side panel instead of a popup.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((e) => console.error("CodePush: side panel setup failed", e));

const DEFAULT_REPO = "coding-solutions";

const EXT_BY_LANG = {
  cpp: "cpp",
  "c++": "cpp",
  c: "c",
  java: "java",
  python: "py",
  python3: "py",
  javascript: "js",
  js: "js",
  typescript: "ts",
  ts: "ts",
  "c#": "cs",
  csharp: "cs",
  kotlin: "kt",
  swift: "swift",
  ruby: "rb",
  go: "go",
  rust: "rs",
  php: "php",
  dart: "dart",
  scala: "scala",
  sql: "sql",
  r: "r",
};

function extFor(lang) {
  return EXT_BY_LANG[(lang || "").toLowerCase().trim()] || "txt";
}

function slugify(title) {
  const s = (title || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (s || "untitled-problem").slice(0, 60);
}

function toBase64(str) {
  const bytes = new TextEncoder().encode(str || "");
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function ghFetch(token, path, options = {}) {
  return fetch(GITHUB_API + path, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
}

async function apiError(res) {
  let body = "";
  try {
    body = await res.text();
  } catch {}
  return new Error(`GitHub API ${res.status}: ${body || res.statusText}`);
}

async function getToken() {
  const { ghToken } = await chrome.storage.local.get("ghToken");
  return ghToken || null;
}

// Returns the repo object, creating it if it does not exist yet.
async function ensureRepo(token, repoName, isPrivate) {
  const { ghUser } = await chrome.storage.local.get("ghUser");
  if (!ghUser || !ghUser.login) throw new Error("Connect your GitHub account first.");
  const owner = ghUser.login;
  let res = await ghFetch(token, `/repos/${owner}/${encodeURIComponent(repoName)}`);
  if (res.status === 404) {
    const create = await ghFetch(token, "/user/repos", {
      method: "POST",
      body: JSON.stringify({
        name: repoName,
        private: !!isPrivate,
        description:
          "Solutions to coding problems from GeeksforGeeks, HackerRank, CodeChef and LeetCode — auto-committed with CodePush.",
      }),
    });
    if (!create.ok && create.status !== 422) throw await apiError(create);
    res = await ghFetch(token, `/repos/${owner}/${encodeURIComponent(repoName)}`);
  }
  if (!res.ok) throw await apiError(res);
  return res.json();
}

async function pushSolution(data) {
  const token = await getToken();
  if (!token) {
    return {
      ok: false,
      error: "Not connected to GitHub. Click the CodePush icon and connect your account first.",
    };
  }
  const repoName = (data.repoName || "").trim() || DEFAULT_REPO;
  const repo = await ensureRepo(token, repoName, data.privateRepo);
  const branch = repo.default_branch || "main";
  const folder = data.folder || "Solutions";
  const path = `${folder}/${slugify(data.title)}.${extFor(data.language)}`;
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");

  let sha;
  const existing = await ghFetch(
    token,
    `/repos/${repo.owner.login}/${repo.name}/contents/${encodedPath}?ref=${branch}`
  );
  if (existing.ok) {
    const j = await existing.json();
    sha = j.sha;
  }

  const content = toBase64(data.code || "");
  const message = `Solved: ${data.title}${data.difficulty ? ` (${data.difficulty})` : ""} [${data.platformLabel}]\n\nProblem: ${data.url}\nPushed with CodePush`;

  const put = await ghFetch(
    token,
    `/repos/${repo.owner.login}/${repo.name}/contents/${encodedPath}`,
    {
      method: "PUT",
      body: JSON.stringify({ message, content, branch, ...(sha ? { sha } : {}) }),
    }
  );
  if (!put.ok) throw await apiError(put);
  const result = await put.json();
  return {
    ok: true,
    created: !sha,
    path,
    htmlUrl:
      (result.content && result.content.html_url) ||
      (result.commit && result.commit.html_url) ||
      repo.html_url,
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "connect") {
        const res = await ghFetch(msg.token, "/user");
        if (!res.ok) {
          sendResponse({
            ok: false,
            error:
              res.status === 401
                ? "Token rejected by GitHub (401). Make sure it is correct and has the `repo` scope."
                : `GitHub returned ${res.status}. Try again.`,
          });
          return;
        }
        const user = await res.json();
        await chrome.storage.local.set({
          ghToken: msg.token,
          ghUser: { login: user.login, name: user.name || user.login },
        });
        sendResponse({ ok: true, login: user.login });
      } else if (msg.type === "getStatus") {
        const { ghToken, ghUser, repoName, privateRepo } = await chrome.storage.local.get([
          "ghToken",
          "ghUser",
          "repoName",
          "privateRepo",
        ]);
        sendResponse({
          ok: true,
          connected: !!ghToken,
          login: (ghUser && ghUser.login) || null,
          repoName: repoName || DEFAULT_REPO,
          privateRepo: !!privateRepo,
        });
      } else if (msg.type === "disconnect") {
        await chrome.storage.local.remove(["ghToken", "ghUser"]);
        sendResponse({ ok: true });
      } else if (msg.type === "pushSolution") {
        sendResponse(await pushSolution(msg));
      }
    } catch (e) {
      sendResponse({ ok: false, error: String((e && e.message) || e) });
    }
  })();
  return true; // keep the message channel open for the async response
});
