// CodePush Content Script — Safely detects the active problem, code, and language.
// Engineered to be 100% non-blocking so browsing questions and navigation never freeze.
(() => {
  "use strict";

  const PLATFORMS = [
    { id: "GFG", label: "GeeksforGeeks", folder: "GeeksforGeeks", match: ["geeksforgeeks.org"] },
    { id: "HackerRank", label: "HackerRank", folder: "HackerRank", match: ["hackerrank.com"] },
    { id: "CodeChef", label: "CodeChef", folder: "CodeChef", match: ["codechef.com"] },
    { id: "LeetCode", label: "LeetCode", folder: "LeetCode", match: ["leetcode.com"] },
  ];

  let bridgeCode = "";
  let bridgeLanguage = "";
  let isSolved = false;
  let isWidgetMinimized = false;
  let lastUrl = location.href;
  let widgetEl = null;
  let uiElements = null;

  // 1. Detect platform
  function currentPlatform() {
    const host = location.hostname.toLowerCase();
    for (const p of PLATFORMS) {
      if (p.match.some((m) => host.includes(m))) return p;
    }
    return null;
  }

  // 2. Strict Problem Page Check — ONLY activate on individual problem solving pages.
  // Never activate on listing, catalog, explore, discussion, or search pages.
  function isActualProblemPage() {
    const plat = currentPlatform();
    if (!plat) return false;

    const path = location.pathname.toLowerCase();

    // Listing / catalog exclusions
    if (
      path.includes("/problemset") ||
      path.includes("/explore") ||
      path.includes("/category") ||
      path.includes("/tag") ||
      path.includes("/discussion") ||
      path.includes("/contest") && !path.includes("/problems/")
    ) {
      return false;
    }

    // GeeksforGeeks: /problems/<slug>
    if (plat.id === "GFG") {
      return /\/problems\/[a-z0-9_-]+/i.test(path);
    }

    // HackerRank: /challenges/<slug>
    if (plat.id === "HackerRank") {
      return /\/challenges\/[a-z0-9_-]+/i.test(path);
    }

    // CodeChef: /problems/<slug>
    if (plat.id === "CodeChef") {
      return /\/problems\/[a-z0-9_-]+/i.test(path);
    }

    // LeetCode: /problems/<slug>
    if (plat.id === "LeetCode") {
      return /\/problems\/[a-z0-9_-]+/i.test(path);
    }

    return false;
  }

  // 3. One-time Bridge Injection fallback
  function ensureBridge() {
    try {
      if (document.getElementById("codepush-bridge-script")) return;
      const script = document.createElement("script");
      script.id = "codepush-bridge-script";
      script.src = chrome.runtime.getURL("page-bridge.js");
      (document.head || document.documentElement).appendChild(script);
    } catch {}
  }

  // 4. Listen for messages from page-bridge.js
  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.source !== "codepush-bridge") return;
    if (event.data.type === "CODEPUSH_CODE_UPDATE" || event.data.type === "CODEPUSH_CODE_RESPONSE") {
      if (typeof event.data.code === "string" && event.data.code.trim()) {
        bridgeCode = event.data.code;
      }
      if (event.data.language) {
        bridgeLanguage = event.data.language;
      }
      syncWidgetUI();
    }
  });

  function requestCodeFromBridge() {
    if (!isActualProblemPage()) return;
    window.postMessage({ type: "CODEPUSH_REQUEST_CODE" }, "*");
  }

  // 5. Title & Metadata
  function titleFromSlug(slug) {
    return (slug || "")
      .replace(/[-_]+/g, " ")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function getTitle() {
    const plat = currentPlatform();
    let t = "";

    try {
      if (plat && plat.id === "GFG") {
        const el = document.querySelector(
          'div[class*="problems_header_content"] h3, .problem-statement-title, div[class*="problemTitle"], div[class*="header"] h2, h1'
        );
        if (el && el.textContent.trim()) t = el.textContent.trim();
      } else if (plat && plat.id === "HackerRank") {
        const el = document.querySelector(
          "h1.ui-icon-labelPageTitle, .challenge-title, ol.breadcrumb li:last-child, h1"
        );
        if (el && el.textContent.trim()) t = el.textContent.trim();
      } else if (plat && plat.id === "CodeChef") {
        const el = document.querySelector(
          'aside [class*="ProblemTitle"], #problem-title, div[class*="_title_"], [class*="problem-title"], h1'
        );
        if (el && el.textContent.trim()) t = el.textContent.trim();
      } else if (plat && plat.id === "LeetCode") {
        const el = document.querySelector(
          'div[data-cy="question-title"], div.text-title-large, a[href*="/problems/"] h4, h4'
        );
        if (el && el.textContent.trim()) t = el.textContent.trim();
      }

      if (!t) {
        const mProb = location.pathname.match(/\/problems\/([^/?#]+)/i);
        if (mProb) t = titleFromSlug(mProb[1]);
        if (!t) {
          const mChal = location.pathname.match(/\/challenges\/([^/?#]+)/i);
          if (mChal) t = titleFromSlug(mChal[1]);
        }
      }

      if (!t) {
        t = document.title
          .replace(/\s*[|·—-]\s*(GeeksforGeeks|HackerRank|CodeChef|LeetCode).*$/i, "")
          .replace(/^[0-9]+[.\s]*/, "")
          .trim();
      }
    } catch {}

    return t || "Untitled Problem";
  }

  function getDifficulty() {
    const words = ["school", "basic", "easy", "medium", "hard", "expert", "advanced", "beginner"];
    try {
      const nodes = document.querySelectorAll(
        '[class*="difficulty" i], [class*="level" i], [class*="tag" i], [class*="badge" i], [class*="text-olive"], [class*="text-yellow"], [class*="text-pink"]'
      );
      for (const el of nodes) {
        const t = (el.textContent || "").trim().toLowerCase();
        if (words.includes(t)) return t.charAt(0).toUpperCase() + t.slice(1);
      }
    } catch {}
    return "";
  }

  function matchLang(t) {
    const s = (t || "").toLowerCase().trim();
    if (s.includes("c++") || s === "cpp" || s.includes("c_cpp")) return "cpp";
    if (s.includes("python3") || s === "py3" || s.includes("python") || s === "py") return "python3";
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
    if (/\b(?:std::|cout|cin|endl|#include\s*<iostream>|#include\s*<vector>)/.test(code)) return "cpp";
    if (/\b(?:def\s+\w+\s*\(|import\s+sys|import\s+math|if\s+__name__|print\s*\()/.test(code)) return "python3";
    if (/\b(?:public\s+class|public\s+static\s+void\s+main|System\.out\.print)/.test(code)) return "java";
    if (/\b(?:console\.log|function\s+\w+\s*\(|const\s+\w+\s*=|let\s+\w+\s*=|=>)/.test(code)) return "javascript";
    if (/\b(?:package\s+main|func\s+\w+\s*\(|fmt\.Print)/.test(code)) return "go";
    if (/\b(?:fn\s+main\s*\(|let\s+mut\s+|println!\s*\()/.test(code)) return "rust";
    if (/\b(?:#include\s*<stdio\.h>|printf\s*\(|scanf\s*\()/.test(code)) return "c";
    return "";
  }

  function getLanguage() {
    if (bridgeLanguage) {
      const m = matchLang(bridgeLanguage);
      if (m) return m;
    }

    try {
      const nodes = document.querySelectorAll(
        'select option:checked, [role="combobox"], [class*="language" i], [class*="lang-select" i], button[id*="headlessui-listbox-button"]'
      );
      for (const el of nodes) {
        const raw = el instanceof HTMLOptionElement ? el.textContent : el.value || el.textContent;
        const t = (raw || "").trim();
        if (!t || t.length > 30) continue;
        const m = matchLang(t);
        if (m) return m;
      }
    } catch {}

    return sniffCodeLanguage(extractCode());
  }

  // 6. DOM Code Extraction Fallback (Non-blocking)
  function extractDomCode() {
    try {
      const viewLines = document.querySelectorAll(".monaco-editor .view-line");
      if (viewLines.length > 0) {
        const lines = [];
        viewLines.forEach((vl) => lines.push(vl.textContent || ""));
        const code = lines.join("\n").replace(/\u00a0/g, " ");
        if (code.trim().length > 10) return code;
      }

      const cm6 = document.querySelector(".cm-editor .cm-content");
      if (cm6 && cm6.innerText && cm6.innerText.trim().length > 10) return cm6.innerText;

      const cm5 = document.querySelectorAll(".CodeMirror .CodeMirror-line");
      if (cm5.length > 0) {
        const lines = [];
        cm5.forEach((cl) => lines.push(cl.textContent || ""));
        const code = lines.join("\n").replace(/\u00a0/g, " ");
        if (code.trim().length > 10) return code;
      }

      const aceLines = document.querySelectorAll(".ace_editor .ace_line");
      if (aceLines.length > 0) {
        const lines = [];
        aceLines.forEach((al) => lines.push(al.textContent || ""));
        const code = lines.join("\n");
        if (code.trim().length > 10) return code;
      }
    } catch {}
    return "";
  }

  function extractCode() {
    if (bridgeCode && bridgeCode.trim()) return bridgeCode;
    return extractDomCode();
  }

  // 7. Targeted Verdict Checker (NO whole-body text scanning)
  let lastVerdictCheck = 0;
  function checkSubmissionSolved() {
    if (!isActualProblemPage()) return;
    const now = Date.now();
    if (now - lastVerdictCheck < 2500) return; // check at most once every 2.5s
    lastVerdictCheck = now;

    try {
      const plat = currentPlatform();
      let text = "";

      if (plat && plat.id === "GFG") {
        const el = document.querySelector('div[class*="problems_header_content"], [class*="verdict"], [class*="feedback"], [class*="output"]');
        if (el) text = el.textContent.toLowerCase();
      } else if (plat && plat.id === "LeetCode") {
        const el = document.querySelector('[data-e2e-locator="submission-result"], [class*="text-green"], [class*="result__"]');
        if (el) text = el.textContent.toLowerCase();
      } else if (plat && plat.id === "HackerRank") {
        const el = document.querySelector(".congrats-heading, .submission-response, [class*='verdict']");
        if (el) text = el.textContent.toLowerCase();
      } else if (plat && plat.id === "CodeChef") {
        const el = document.querySelector('[class*="verdict"], [class*="submission"]');
        if (el) text = el.textContent.toLowerCase();
      }

      if (
        text.includes("problem solved successfully") ||
        text.includes("correct answer") ||
        text.includes("all test cases passed") ||
        text.includes("congratulations!") ||
        text.includes("accepted") ||
        text.includes("100/100")
      ) {
        if (!isSolved) {
          isSolved = true;
          requestCodeFromBridge();
          syncWidgetUI();
        }
      }
    } catch {}
  }

  // 8. Problem Data Object
  function getProblem() {
    if (!isActualProblemPage()) return null;
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

  // 9. Toast Notifications
  function toast(text, ok, link) {
    const existing = document.getElementById("codepush-toast");
    if (existing) existing.remove();

    const el = document.createElement("div");
    el.id = "codepush-toast";
    el.style.cssText =
      "position:fixed;left:50%;transform:translateX(-50%);bottom:92px;z-index:2147483647;max-width:440px;padding:10px 16px;border-radius:8px;font:13px/1.4 system-ui,sans-serif;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.45);display:flex;align-items:center;gap:10px;pointer-events:auto;";
    el.style.background = ok ? "#238636" : "#b62324";

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
    setTimeout(() => el.remove(), 5000);
  }

  // 10. Clean, Non-Destructive Floating Widget
  async function onPushClick() {
    requestCodeFromBridge();
    const problem = getProblem();
    if (!problem || !problem.code.trim()) {
      toast("No solution code found. Type code in editor first.", false);
      return;
    }

    const { ghToken, repoName, privateRepo } = await chrome.storage.local.get([
      "ghToken",
      "repoName",
      "privateRepo",
    ]);

    if (!ghToken) {
      toast("Connect GitHub first from the CodePush panel.", false);
      return;
    }

    if (uiElements && uiElements.pushBtn) {
      uiElements.pushBtn.disabled = true;
      uiElements.pushBtn.textContent = "⏳ Pushing…";
    }

    try {
      const res = await chrome.runtime.sendMessage({
        type: "pushSolution",
        ...problem,
        repoName,
        privateRepo,
      });

      if (uiElements && uiElements.pushBtn) {
        uiElements.pushBtn.disabled = false;
        uiElements.pushBtn.textContent = isSolved ? "🎉 Push Solved Code" : "⬆ Push to GitHub";
      }

      if (res && res.ok) {
        toast(res.created ? "Pushed to GitHub! 🎉" : "Updated on GitHub.", true, res.htmlUrl);
      } else {
        toast((res && res.error) || "Push failed.", false);
      }
    } catch (e) {
      if (uiElements && uiElements.pushBtn) {
        uiElements.pushBtn.disabled = false;
        uiElements.pushBtn.textContent = isSolved ? "🎉 Push Solved Code" : "⬆ Push to GitHub";
      }
      toast("Error: " + (e.message || e), false);
    }
  }

  function buildWidgetDom() {
    if (widgetEl || document.getElementById("codepush-floating-widget")) return;

    widgetEl = document.createElement("div");
    widgetEl.id = "codepush-floating-widget";
    widgetEl.style.cssText = `
      position: fixed;
      right: 20px;
      bottom: 20px;
      z-index: 2147483640;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 10px 28px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.12);
      border-radius: 999px;
      background: #0d1117;
      color: #e6edf3;
      padding: 6px 8px 6px 14px;
      display: flex;
      align-items: center;
      gap: 10px;
      user-select: none;
      pointer-events: auto;
    `;

    // Dot
    const dot = document.createElement("span");
    dot.style.cssText = "width:8px;height:8px;border-radius:50%;background:#e3b341;display:inline-block;";

    // Brand
    const brand = document.createElement("span");
    brand.textContent = "CodePush";
    brand.style.cssText = "font-weight:600;font-size:12px;color:#f0f6fc;";

    // Platform badge
    const platBadge = document.createElement("span");
    platBadge.style.cssText = "font-size:11px;background:#21262d;border:1px solid #30363d;padding:2px 6px;border-radius:4px;color:#58a6ff;font-family:ui-monospace,monospace;";

    // Language badge
    const langBadge = document.createElement("span");
    langBadge.style.cssText = "font-size:11px;background:#21262d;border:1px solid #30363d;padding:2px 6px;border-radius:4px;color:#7ee787;font-family:ui-monospace,monospace;";

    // Lines badge
    const linesBadge = document.createElement("span");
    linesBadge.style.cssText = "font-size:11px;color:#8b949e;font-family:ui-monospace,monospace;";

    // Push action button
    const pushBtn = document.createElement("button");
    pushBtn.type = "button";
    pushBtn.style.cssText = "background:#238636;color:#ffffff;border:none;border-radius:999px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;";
    pushBtn.textContent = "⬆ Push to GitHub";
    pushBtn.addEventListener("click", onPushClick);

    // Minimize toggle
    const minBtn = document.createElement("button");
    minBtn.type = "button";
    minBtn.style.cssText = "background:transparent;border:none;color:#8b949e;font-size:13px;cursor:pointer;padding:2px 4px;";
    minBtn.textContent = "✕";
    minBtn.addEventListener("click", () => {
      isWidgetMinimized = !isWidgetMinimized;
      syncWidgetUI();
    });

    widgetEl.appendChild(dot);
    widgetEl.appendChild(brand);
    widgetEl.appendChild(platBadge);
    widgetEl.appendChild(langBadge);
    widgetEl.appendChild(linesBadge);
    widgetEl.appendChild(pushBtn);
    widgetEl.appendChild(minBtn);

    uiElements = { dot, brand, platBadge, langBadge, linesBadge, pushBtn, minBtn };

    document.body.appendChild(widgetEl);
    syncWidgetUI();
  }

  function syncWidgetUI() {
    if (!isActualProblemPage()) {
      if (widgetEl) widgetEl.style.display = "none";
      return;
    }

    if (!widgetEl) {
      buildWidgetDom();
      return;
    }

    widgetEl.style.display = "flex";

    const plat = currentPlatform();
    const code = extractCode();
    const lineCount = code ? code.split("\n").length : 0;
    const lang = getLanguage() || "code";

    if (!uiElements) return;

    if (isWidgetMinimized) {
      uiElements.brand.style.display = "none";
      uiElements.platBadge.style.display = "none";
      uiElements.langBadge.style.display = "none";
      uiElements.linesBadge.style.display = "none";
      uiElements.pushBtn.style.display = "none";
      uiElements.minBtn.textContent = "⬆";
      uiElements.dot.style.background = lineCount > 0 ? "#238636" : "#e3b341";
      return;
    }

    uiElements.brand.style.display = "inline";
    uiElements.platBadge.style.display = "inline";
    uiElements.langBadge.style.display = "inline";
    uiElements.linesBadge.style.display = lineCount > 0 ? "inline" : "none";
    uiElements.pushBtn.style.display = "inline";
    uiElements.minBtn.textContent = "✕";

    uiElements.dot.style.background = lineCount > 0 ? "#238636" : "#e3b341";
    uiElements.platBadge.textContent = plat ? plat.id : "";
    uiElements.langBadge.textContent = lang;
    uiElements.linesBadge.textContent = `${lineCount}L`;
    uiElements.pushBtn.textContent = isSolved ? "🎉 Push Solved Code" : "⬆ Push to GitHub";
    uiElements.pushBtn.style.background = isSolved ? "#2ea043" : "#238636";
  }

  function teardownWidget() {
    if (widgetEl) {
      widgetEl.remove();
      widgetEl = null;
      uiElements = null;
    }
  }

  // 11. Chrome Extension Message Listener
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "getProblem") {
      requestCodeFromBridge();
      sendResponse({ problem: getProblem() });
    }
  });

  // 12. Safe Lifecycle Watcher (Zero recursive mutations)
  function handleUrlChange() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    isSolved = false;
    bridgeCode = "";

    if (isActualProblemPage()) {
      ensureBridge();
      buildWidgetDom();
      requestCodeFromBridge();
    } else {
      teardownWidget();
    }
  }

  // Hook history pushState/replaceState for instant SPA transition detection
  const origPushState = history.pushState;
  history.pushState = function () {
    const res = origPushState.apply(this, arguments);
    setTimeout(handleUrlChange, 100);
    return res;
  };
  const origReplaceState = history.replaceState;
  history.replaceState = function () {
    const res = origReplaceState.apply(this, arguments);
    setTimeout(handleUrlChange, 100);
    return res;
  };
  window.addEventListener("popstate", () => setTimeout(handleUrlChange, 100));

  // Non-destructive periodic watchdog (runs every 2.5s)
  setInterval(() => {
    if (isActualProblemPage()) {
      ensureBridge();
      if (!widgetEl) buildWidgetDom();
      checkSubmissionSolved();
      syncWidgetUI();
    } else {
      teardownWidget();
    }
  }, 2500);

  // Initial activation check
  if (isActualProblemPage()) {
    ensureBridge();
    if (document.body) {
      buildWidgetDom();
      requestCodeFromBridge();
    } else {
      document.addEventListener("DOMContentLoaded", () => {
        buildWidgetDom();
        requestCodeFromBridge();
      });
    }
  }
})();
