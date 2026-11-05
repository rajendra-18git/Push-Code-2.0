// CodePush Page Bridge — Runs directly in the MAIN page execution context.
// Provides non-blocking, safe access to Monaco, Ace, and CodeMirror models.
(() => {
  "use strict";

  if (window.__CODEPUSH_BRIDGE_INITIALIZED__) return;
  window.__CODEPUSH_BRIDGE_INITIALIZED__ = true;

  function isProblemPage() {
    const path = location.pathname.toLowerCase();
    if (path.includes("/problemset") || path.includes("/explore") || path.includes("/category")) {
      return false;
    }
    return (
      (path.includes("/problems/") && path.length > 10) ||
      (path.includes("/challenges/") && path.length > 12)
    );
  }

  function normalizeLang(lang) {
    const s = (lang || "").toLowerCase().trim();
    if (s.includes("c++") || s === "cpp" || s.includes("c_cpp")) return "cpp";
    if (s.includes("python3") || s === "py3" || s.includes("python") || s === "py") return "python3";
    if (s.includes("javascript") || s === "js" || s.includes("node")) return "javascript";
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

  function sniffLangFromCode(code) {
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

  function extractCurrentCode() {
    if (!isProblemPage()) return null;

    try {
      // 1. Monaco Editor (GeeksforGeeks, LeetCode, modern HackerRank)
      if (window.monaco && window.monaco.editor) {
        if (typeof window.monaco.editor.getEditors === "function") {
          const editors = window.monaco.editor.getEditors();
          for (const ed of editors) {
            const m = ed && ed.getModel && ed.getModel();
            if (m) {
              const v = m.getValue();
              if (v && v.trim().length > 0) {
                const lang = normalizeLang(m.getLanguageId()) || sniffLangFromCode(v);
                return { code: v, language: lang, source: "monaco-editor" };
              }
            }
          }
        }

        if (typeof window.monaco.editor.getModels === "function") {
          const models = window.monaco.editor.getModels();
          const validModels = models.filter((m) => {
            const uri = (m.uri ? m.uri.toString() : "").toLowerCase();
            return !uri.includes("output") && !uri.includes("console") && !uri.includes("test");
          });
          const target = validModels.length ? validModels[0] : models[0];
          if (target) {
            const v = target.getValue();
            if (v && v.trim().length > 0) {
              const lang = normalizeLang(target.getLanguageId()) || sniffLangFromCode(v);
              return { code: v, language: lang, source: "monaco-model" };
            }
          }
        }
      }

      // 2. Ace Editor (HackerRank)
      if (window.ace) {
        const aceEl = document.querySelector(".ace_editor");
        if (aceEl) {
          const editor = window.ace.edit(aceEl);
          if (editor) {
            const v = editor.getValue();
            if (v && v.trim().length > 0) {
              let lang = "";
              const session = editor.getSession();
              if (session && session.getMode()) {
                const modeId = session.getMode().$id || "";
                lang = normalizeLang(modeId.replace(/^ace\/mode\//, ""));
              }
              return { code: v, language: lang || sniffLangFromCode(v), source: "ace" };
            }
          }
        }
      }

      // 3. CodeMirror 5 (CodeChef)
      const cmEl = document.querySelector(".CodeMirror");
      if (cmEl && cmEl.CodeMirror && typeof cmEl.CodeMirror.getValue === "function") {
        const v = cmEl.CodeMirror.getValue();
        if (v && v.trim().length > 0) {
          const mode = cmEl.CodeMirror.getOption("mode");
          const modeStr = typeof mode === "string" ? mode : (mode && mode.name) || "";
          return { code: v, language: normalizeLang(modeStr) || sniffLangFromCode(v), source: "codemirror5" };
        }
      }

      // 4. CodeMirror 6
      const cm6 = document.querySelector(".cm-editor");
      if (cm6 && cm6.cmView && cm6.cmView.view && cm6.cmView.view.state) {
        const v = cm6.cmView.view.state.doc.toString();
        if (v && v.trim().length > 0) {
          return { code: v, language: sniffLangFromCode(v), source: "codemirror6" };
        }
      }
    } catch (e) {
      console.debug("CodePush bridge extraction notice:", e);
    }

    return null;
  }

  // Safe Monaco listener setup (attached at most ONCE)
  let monacoHooked = false;
  function safeHookMonaco() {
    if (monacoHooked || !window.monaco || !window.monaco.editor) return;
    try {
      if (typeof window.monaco.editor.onDidCreateEditor === "function") {
        monacoHooked = true;
        window.monaco.editor.onDidCreateEditor((ed) => {
          if (ed && ed.onDidChangeModelContent) {
            ed.onDidChangeModelContent(debouncedNotify);
          }
        });
      }
    } catch {}
  }

  let notifyTimer = null;
  function debouncedNotify() {
    if (!isProblemPage()) return;
    clearTimeout(notifyTimer);
    notifyTimer = setTimeout(() => {
      const data = extractCurrentCode();
      if (data && data.code) {
        window.postMessage(
          {
            source: "codepush-bridge",
            type: "CODEPUSH_CODE_UPDATE",
            code: data.code,
            language: data.language,
            editorSource: data.source,
          },
          "*"
        );
      }
    }, 500);
  }

  // Listen for explicit requests from content.js
  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data) return;
    if (event.data.type === "CODEPUSH_REQUEST_CODE") {
      safeHookMonaco();
      const data = extractCurrentCode();
      window.postMessage(
        {
          source: "codepush-bridge",
          type: "CODEPUSH_CODE_RESPONSE",
          code: data ? data.code : "",
          language: data ? data.language : "",
          editorSource: data ? data.source : "none",
        },
        "*"
      );
    }
  });

  // Non-intrusive periodic poll only on actual problem pages
  setInterval(() => {
    if (isProblemPage()) {
      safeHookMonaco();
    }
  }, 3000);
})();
