// CodePush Content Script — Automatically detects the active coding platform,
// problem title, difficulty, active language, and written code in real-time.
(() => {
  "use strict";

  const PLATFORMS = [
    { id: "GFG", label: "GeeksforGeeks", folder: "GeeksforGeeks", match: ["geeksforgeeks.org"] },
    { id: "HackerRank", label: "HackerRank", folder: "HackerRank", match: ["hackerrank.com"] },
    { id: "CodeChef", label: "CodeChef", folder: "CodeChef", match: ["codechef.com"] },
    { id: "LeetCode", label: "LeetCode", folder: "LeetCode", match: ["leetcode.com"] },
  ];

  const PROBLEM_URL_REGEX = /\/(problems|challenges|contests|submit|explore|practice)\//i;

  let bridgeCode = "";
  let bridgeLanguage = "";
  let bridgeEditorSource = "";
  let isSolved = false;
  let isWidgetMinimized = false;
  let lastUrl = location.href;

  // 1. Inject Page Bridge into MAIN world for direct Monaco/Ace/CodeMirror access
  function injectBridge() {
    try {
      if (document.getElementById("codepush-bridge-script")) return;
      const script = document.createElement("script");
      script.id = "codepush-bridge-script";
      script.src = chrome.runtime.getURL("page-bridge.js");
      script.onload = () => script.remove();
      (document.head || document.documentElement).appendChild(script);
    } catch (e) {
      console.debug("CodePush: bridge injection fallback notice:", e);
    }
  }

  // 2. Listen for messages from page-bridge.js
  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.source !== "codepush-bridge") return;
    if (event.data.type === "CODEPUSH_CODE_UPDATE" || event.data.type === "CODEPUSH_CODE_RESPONSE") {
      if (typeof event.data.code === "string" && event.data.code.trim()) {
        bridgeCode = event.data.code;
      }
      if (event.data.language) {
        bridgeLanguage = event.data.language;
      }
      if (event.data.editorSource) {
        bridgeEditorSource = event.data.editorSource;
      }
      updateWidgetUI();
    }
  });

  // Request latest code from bridge
  function requestCodeFromBridge() {
    window.postMessage({ type: "CODEPUSH_REQUEST_CODE" }, "*");
  }

  // 3. Platform Detection
  function currentPlatform() {
    const host = location.hostname.toLowerCase();
    for (const p of PLATFORMS) {
      if (p.match.some((m) => host.includes(m))) return p;
    }
    return null;
  }

  // 4. Title & Slug Extraction
  function titleFromSlug(slug) {
    return (slug || "")
      .replace(/[-_]+/g, " ")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function getTitle() {
    const plat = currentPlatform();
    let t = "";

    // Platform-specific selectors
    if (plat && plat.id === "GFG") {
      const gfgEl = document.querySelector(
        'div[class*="problems_header_content"] h3, .problem-statement-title, div[class*="problemTitle"], div[class*="header"] h2, div[class*="header"] h3'
      );
      if (gfgEl && gfgEl.textContent.trim()) t = gfgEl.textContent.trim();
    } else if (plat && plat.id === "HackerRank") {
      const hrEl = document.querySelector(
        "h1.ui-icon-labelPageTitle, .challenge-title, ol.breadcrumb li:last-child"
      );
      if (hrEl && hrEl.textContent.trim()) t = hrEl.textContent.trim();
    } else if (plat && plat.id === "CodeChef") {
      const ccEl = document.querySelector(
        'aside [class*="ProblemTitle"], #problem-title, div[class*="_title_"], [class*="problem-title"]'
      );
      if (ccEl && ccEl.textContent.trim()) t = ccEl.textContent.trim();
    } else if (plat && plat.id === "LeetCode") {
      const lcEl = document.querySelector(
        'div[data-cy="question-title"], div.text-title-large, a[href*="/problems/"] h4, div[class*="title__"]'
      );
      if (lcEl && lcEl.textContent.trim()) t = lcEl.textContent.trim();
    }

    // Generic H1 fallback
    if (!t) {
      const h1 = document.querySelector("h1");
      if (h1 && h1.textContent.trim().length > 1 && h1.textContent.trim().length < 90) {
        t = h1.textContent.trim();
      }
    }

    // URL Regex extraction fallback
    if (!t || t.length > 90) {
      const mProb = location.pathname.match(/\/problems\/([^/?#]+)/i);
      if (mProb) t = titleFromSlug(mProb[1]);
      if (!t) {
        const mChal = location.pathname.match(/\/challenges\/([^/?#]+)/i);
        if (mChal) t = titleFromSlug(mChal[1]);
      }
    }

    // Document title cleanup fallback
    if (!t) {
      t = document.title
        .replace(/\s*[|·—-]\s*(GeeksforGeeks|HackerRank|CodeChef|LeetCode).*$/i, "")
        .replace(/^[0-9]+[.\s]*/, "")
        .trim();
    }

    return t || "Untitled Problem";
  }

  // 5. Difficulty Extraction
  function getDifficulty() {
    const plat = currentPlatform();
    const words = ["school", "basic", "easy", "medium", "hard", "expert", "advanced", "beginner"];

    // LeetCode specific
    if (plat && plat.id === "LeetCode") {
      const lcDiff = document.querySelector(
        '[class*="text-difficulty" i], [class*="text-olive"], [class*="text-yellow"], [class*="text-pink"], [data-degree]'
      );
      if (lcDiff && lcDiff.textContent.trim()) {
        const text = lcDiff.textContent.trim().toLowerCase();
        if (words.includes(text)) return text.charAt(0).toUpperCase() + text.slice(1);
      }
    }

    // General difficulty badges
    const nodes = document.querySelectorAll(
      '[class*="difficulty" i], [class*="level" i], [class*="tag" i], [class*="badge" i]'
    );
    for (const el of nodes) {
      const t = (el.textContent || "").trim().toLowerCase();
      if (words.includes(t)) return t.charAt(0).toUpperCase() + t.slice(1);
    }
    return "";
  }

  // 6. Language Normalization & Detection
  function matchLang(t) {
    const s = (t || "").toLowerCase().trim();
    if (s.includes("c++") || s === "cpp" || s.includes("c++src") || s.includes("c_cpp")) return "cpp";
    if (s.includes("python3") || s === "py3") return "python3";
    if (s.includes("python") || s === "py") return "python3";
    if (s.includes("javascript") || s.includes("node") || s === "js") return "javascript";
    if (s.includes("typescript") || s === "ts") return "typescript";
    if (s.includes("c#") || s.includes("csharp") || s === "cs") return "c#";
    if (s.includes("java")) return "java";
    if (s.includes("kotlin") || s === "kt") return "kotlin";
    if (s.includes("ruby") || s === "rb") return "ruby";
    if (s.includes("swift")) return "swift";
    if (s.includes("golang") || s === "go") return "go";
    if (s.includes("rust") || s === "rs") return "rust";
    if (s.includes("php")) return "php";
    if (s.includes("dart")) return "dart";
    if (s.includes("scala")) return "scala";
    if (s.includes("sql")) return "sql";
    if (s === "c" || s === "text/x-csrc") return "c";
    return "";
  }

  function sniffCodeLanguage(code) {
    if (!code) return "";
    if (/\b(?:std::|cout|cin|endl|#include\s*<iostream>|#include\s*<vector>|template\s*<)/.test(code)) return "cpp";
    if (/\b(?:def\s+\w+\s*\(|import\s+sys|import\s+math|if\s+__name__\s*==\s*['"]__main__['"]|elif\s+:|print\s*\()/.test(code)) return "python3";
    if (/\b(?:public\s+class|public\s+static\s+void\s+main|System\.out\.print)/.test(code)) return "java";
    if (/\b(?:console\.log|function\s+\w+\s*\(|const\s+\w+\s*=|let\s+\w+\s*=|=>)/.test(code)) return "javascript";
    if (/\b(?:package\s+main|func\s+\w+\s*\(|fmt\.Print)/.test(code)) return "go";
    if (/\b(?:fn\s+main\s*\(|let\s+mut\s+|println!\s*\()/.test(code)) return "rust";
    if (/\b(?:#include\s*<stdio\.h>|printf\s*\(|scanf\s*\()/.test(code)) return "c";
    return "";
  }

  function getLanguage() {
    // 1. From Bridge model
    if (bridgeLanguage) {
      const m = matchLang(bridgeLanguage);
      if (m) return m;
    }

    // 2. From Dropdown selectors in DOM
    const nodes = document.querySelectorAll(
      'select option:checked, [role="combobox"], [class*="language" i], [class*="lang-select" i], [data-testid*="language" i], button[id*="headlessui-listbox-button"], [data-cy="lang-select"]'
    );
    for (const el of nodes) {
      const raw = el instanceof HTMLOptionElement ? el.textContent : el.value || el.textContent;
      const t = (raw || "").trim();
      if (!t || t.length > 40) continue;
      const m = matchLang(t);
      if (m) return m;
    }

    // 3. Fallback: sniff code syntax
    return sniffCodeLanguage(extractCode());
  }

  // 7. Isolated-World DOM Code Extraction Fallbacks
  function extractDomCode() {
    // A. Monaco DOM lines aggregation
    const viewLines = document.querySelectorAll(".monaco-editor .view-line");
    if (viewLines.length > 0) {
      const lines = [];
      viewLines.forEach((vl) => lines.push(vl.textContent || ""));
      const code = lines.join("\n").replace(/\u00a0/g, " ");
      if (code.trim().length > 10) return code;
    }

    // B. CodeMirror 6
    const cm6Content = document.querySelector(".cm-editor .cm-content");
    if (cm6Content && cm6Content.innerText && cm6Content.innerText.trim().length > 10) {
      return cm6Content.innerText;
    }

    // C. CodeMirror 5
    const cm5Lines = document.querySelectorAll(".CodeMirror .CodeMirror-line");
    if (cm5Lines.length > 0) {
      const lines = [];
      cm5Lines.forEach((cl) => lines.push(cl.textContent || ""));
      const code = lines.join("\n").replace(/\u00a0/g, " ");
      if (code.trim().length > 10) return code;
    }

    // D. Ace editor lines
    const aceLines = document.querySelectorAll(".ace_editor .ace_line");
    if (aceLines.length > 0) {
      const lines = [];
      aceLines.forEach((al) => lines.push(al.textContent || ""));
      const code = lines.join("\n");
      if (code.trim().length > 10) return code;
    }

    // E. General Textarea (excluding single-character IME inputareas)
    const textareas = document.querySelectorAll("textarea");
    for (const ta of textareas) {
      if (ta.value && ta.value.trim().length > 25 && !ta.classList.contains("inputarea")) {
        return ta.value;
      }
    }

    return "";
  }

  // Combined code extractor
  function extractCode() {
    if (bridgeCode && bridgeCode.trim()) {
      return bridgeCode;
    }
    const domCode = extractDomCode();
    if (domCode && domCode.trim()) {
      return domCode;
    }
    return "";
  }

  // 8. Solved / Accepted Detection
  function checkSubmissionSolved() {
    const text = (document.body ? document.body.innerText : "").toLowerCase();
    const plat = currentPlatform();

    let solved = false;
    if (plat && plat.id === "GFG") {
      solved =
        text.includes("problem solved successfully") ||
        text.includes("correct answer") ||
        text.includes("all test cases passed");
    } else if (plat && plat.id === "HackerRank") {
      solved =
        text.includes("congratulations!") ||
        text.includes("success") ||
        text.includes("all test cases passed");
    } else if (plat && plat.id === "CodeChef") {
      solved =
        text.includes("correct answer") ||
        text.includes("accepted") ||
        text.includes("100/100");
    } else if (plat && plat.id === "LeetCode") {
      solved =
        text.includes("accepted") &&
        (text.includes("runtime") || text.includes("beats"));
    }

    if (solved && !isSolved) {
      isSolved = true;
      requestCodeFromBridge();
      updateWidgetUI();
      toast("🎉 Problem solved! Ready to push to GitHub.", true);
    }
  }

  // 9. Full Problem Data Assembly
  function getProblem() {
    const platform = currentPlatform();
    if (!platform) return null;
    const code = extractCode();
    const lines = code ? code.split("\n").length : 0;
    return {
      platform: platform.id,
      platformLabel: platform.label,
      folder: platform.folder,
      title: getTitle(),
      url: location.href.split("#")[0],
      difficulty: getDifficulty(),
      language: getLanguage(),
      code: code,
      lineCount: lines,
      isSolved: isSolved,
    };
  }

  // 10. Floating Widget & Notification UI
  function toast(text, ok, link) {
    const existing = document.getElementById("codepush-toast");
    if (existing) existing.remove();

    const el = document.createElement("div");
    el.id = "codepush-toast";
    el.style.cssText =
      "position:fixed;left:50%;transform:translateX(-50%);bottom:92px;z-index:2147483647;max-width:460px;padding:12px 18px;border-radius:10px;font:14px/1.4 system-ui,sans-serif;color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.5);display:flex;align-items:center;gap:10px;backdrop-filter:blur(8px);transition:all .3s ease;";
    el.style.background = ok ? "rgba(35, 134, 54, 0.95)" : "rgba(182, 35, 36, 0.95)";
    el.style.border = ok ? "1px solid #2ea043" : "1px solid #f85149";

    const msg = document.createElement("span");
    msg.textContent = text;
    el.appendChild(msg);

    if (link) {
      const a = document.createElement("a");
      a.href = link;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "View on GitHub ↗";
      a.style.cssText = "color:#fff;font-weight:700;text-decoration:underline;margin-left:6px;";
      el.appendChild(a);
    }

    document.body.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transform = "translateX(-50%) translateY(10px)";
      setTimeout(() => el.remove(), 400);
    }, 6000);
  }

  let widgetEl = null;

  async function onPushClick() {
    requestCodeFromBridge();
    const problem = getProblem();
    if (!problem || !problem.code.trim()) {
      toast("No solution code detected yet. Write or open your code editor.", false);
      return;
    }

    const { ghToken, repoName, privateRepo } = await chrome.storage.local.get([
      "ghToken",
      "repoName",
      "privateRepo",
    ]);

    if (!ghToken) {
      toast("Connect GitHub first! Click the CodePush extension icon.", false);
      return;
    }

    const pushBtn = widgetEl ? widgetEl.querySelector("#cp-push-action") : null;
    if (pushBtn) {
      pushBtn.disabled = true;
      pushBtn.innerHTML = `<span>⏳ Pushing…</span>`;
    }

    try {
      const res = await chrome.runtime.sendMessage({
        type: "pushSolution",
        ...problem,
        repoName,
        privateRepo,
      });

      if (pushBtn) {
        pushBtn.disabled = false;
        pushBtn.innerHTML = `<span>⬆ Push to GitHub</span>`;
      }

      if (res && res.ok) {
        toast(res.created ? "🎉 Solution pushed to GitHub!" : "✅ Updated on GitHub.", true, res.htmlUrl);
      } else {
        toast((res && res.error) || "Push failed. Check GitHub settings.", false);
      }
    } catch (err) {
      if (pushBtn) {
        pushBtn.disabled = false;
        pushBtn.innerHTML = `<span>⬆ Push to GitHub</span>`;
      }
      toast("Error: " + (err.message || err), false);
    }
  }

  function createWidget() {
    if (document.getElementById("codepush-floating-widget")) return;

    widgetEl = document.createElement("div");
    widgetEl.id = "codepush-floating-widget";
    widgetEl.style.cssText = `
      position: fixed;
      right: 24px;
      bottom: 24px;
      z-index: 2147483645;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.1);
      border-radius: 999px;
      background: #0d1117;
      color: #e6edf3;
      padding: 6px 8px 6px 14px;
      display: flex;
      align-items: center;
      gap: 10px;
      user-select: none;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    updateWidgetContent();
    document.body.appendChild(widgetEl);
  }

  function updateWidgetContent() {
    if (!widgetEl) return;

    const plat = currentPlatform();
    if (!plat) {
      widgetEl.style.display = "none";
      return;
    }
    widgetEl.style.display = "flex";

    const code = extractCode();
    const lineCount = code ? code.split("\n").length : 0;
    const lang = getLanguage() || "code";

    if (isWidgetMinimized) {
      widgetEl.style.padding = "10px";
      widgetEl.innerHTML = `
        <div id="cp-expand-btn" title="Expand CodePush" style="cursor:pointer;display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:#238636;color:#fff;font-weight:700;font-size:14px;">
          ⬆
        </div>
      `;
      widgetEl.querySelector("#cp-expand-btn").addEventListener("click", () => {
        isWidgetMinimized = false;
        updateWidgetContent();
      });
      return;
    }

    widgetEl.style.padding = "6px 8px 6px 14px";
    widgetEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="width:8px;height:8px;border-radius:50%;background:${lineCount > 0 ? "#238636" : "#e3b341"};box-shadow:${lineCount > 0 ? "0 0 8px #2ea043" : "none"};display:inline-block;"></span>
        <span style="font-weight:600;font-size:12px;color:#f0f6fc;letter-spacing:-0.2px;">CodePush</span>
        <span style="font-size:11px;background:#21262d;border:1px solid #30363d;padding:2px 6px;border-radius:4px;color:#58a6ff;font-family:ui-monospace,monospace;">${plat.id}</span>
        <span style="font-size:11px;background:#21262d;border:1px solid #30363d;padding:2px 6px;border-radius:4px;color:#7ee787;font-family:ui-monospace,monospace;">${lang}</span>
        ${lineCount > 0 ? `<span style="font-size:11px;color:#8b949e;font-family:ui-monospace,monospace;">${lineCount}L</span>` : ""}
      </div>
      <button id="cp-push-action" style="
        background: ${isSolved ? "#2ea043" : "#238636"};
        color: #ffffff;
        border: none;
        border-radius: 999px;
        padding: 6px 14px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        transition: background 0.2s ease, transform 0.1s ease;
      ">
        ${isSolved ? "🎉 Push Solved Code" : "⬆ Push to GitHub"}
      </button>
      <button id="cp-minimize-btn" title="Minimize widget" style="
        background: transparent;
        border: none;
        color: #8b949e;
        font-size: 14px;
        cursor: pointer;
        padding: 2px 6px;
        border-radius: 4px;
      ">✕</button>
    `;

    const pushBtn = widgetEl.querySelector("#cp-push-action");
    pushBtn.addEventListener("click", onPushClick);
    pushBtn.addEventListener("mouseenter", () => (pushBtn.style.background = "#2ea043"));
    pushBtn.addEventListener("mouseleave", () => (pushBtn.style.background = isSolved ? "#2ea043" : "#238636"));

    widgetEl.querySelector("#cp-minimize-btn").addEventListener("click", () => {
      isWidgetMinimized = true;
      updateWidgetContent();
    });
  }

  function updateWidgetUI() {
    updateWidgetContent();
  }

  // 11. Chrome Extension Message Listener
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "getProblem") {
      requestCodeFromBridge();
      sendResponse({ problem: getProblem() });
    }
  });

  // 12. Lifecycle & SPA Watchdog
  function init() {
    injectBridge();
    if (currentPlatform() && PROBLEM_URL_REGEX.test(location.pathname)) {
      createWidget();
      requestCodeFromBridge();
    }
  }

  // Observe DOM for dynamic page changes, problem solves, and SPA navigation
  const observer = new MutationObserver(() => {
    checkSubmissionSolved();
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      isSolved = false;
      bridgeCode = "";
      requestCodeFromBridge();
      if (currentPlatform() && PROBLEM_URL_REGEX.test(location.pathname)) {
        createWidget();
      }
    }
    updateWidgetUI();
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  // Periodic heartbeat to ensure bridge sync and widget existence
  setInterval(() => {
    injectBridge();
    if (currentPlatform() && PROBLEM_URL_REGEX.test(location.pathname)) {
      if (!widgetEl || !document.getElementById("codepush-floating-widget")) {
        createWidget();
      }
      requestCodeFromBridge();
      checkSubmissionSolved();
    }
  }, 2500);

  init();
})();
