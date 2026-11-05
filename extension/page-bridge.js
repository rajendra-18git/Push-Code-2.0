// CodePush Page Bridge — Runs directly in the MAIN page execution context
// Gives direct access to window.monaco, window.ace, CodeMirror 5/6, and page memory.
(() => {
  "use strict";

  if (window.__CODEPUSH_BRIDGE_LOADED__) return;
  window.__CODEPUSH_BRIDGE_LOADED__ = true;

  let debounceTimer = null;
  let lastSentCode = "";
  let lastSentLang = "";

  function normalizeLang(lang) {
    const s = (lang || "").toLowerCase().trim();
    if (s.includes("c++") || s === "cpp" || s.includes("c_cpp")) return "cpp";
    if (s.includes("python3") || s === "py3") return "python3";
    if (s.includes("python") || s === "py") return "python3";
    if (s.includes("javascript") || s === "js" || s.includes("node")) return "javascript";
    if (s.includes("typescript") || s === "ts") return "typescript";
    if (s.includes("c#") || s === "csharp" || s === "cs") return "c#";
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

  // Sniff language from code keywords when editor mode is generic or unknown
  function sniffLangFromCode(code) {
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

  // Extract from Monaco Editor (used by GeeksforGeeks, LeetCode, modern HackerRank)
  function getMonacoCode() {
    try {
      if (window.monaco && window.monaco.editor) {
        // Method A: Check active editor instance
        const editors = typeof window.monaco.editor.getEditors === "function" 
          ? window.monaco.editor.getEditors() 
          : [];
        for (const ed of editors) {
          const m = ed.getModel && ed.getModel();
          if (m) {
            const v = m.getValue();
            if (v && v.trim().length > 0) {
              const lang = normalizeLang(m.getLanguageId()) || sniffLangFromCode(v);
              return { code: v, language: lang, source: "monaco-editor" };
            }
          }
        }

        // Method B: Check all registered models in memory
        if (typeof window.monaco.editor.getModels === "function") {
          const models = window.monaco.editor.getModels();
          // Filter out output/console/diff models
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
    } catch (e) {
      console.debug("CodePush bridge Monaco check error:", e);
    }
    return null;
  }

  // Extract from Ace Editor (used by HackerRank)
  function getAceCode() {
    try {
      if (window.ace) {
        const aceEls = document.querySelectorAll(".ace_editor");
        for (const el of aceEls) {
          const editor = window.ace.edit(el);
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
    } catch (e) {
      console.debug("CodePush bridge Ace check error:", e);
    }
    return null;
  }

  // Extract from CodeMirror 5 (used by CodeChef & older competitive sites)
  function getCodeMirror5Code() {
    try {
      const cmEls = document.querySelectorAll(".CodeMirror");
      for (const el of cmEls) {
        if (el.CodeMirror && typeof el.CodeMirror.getValue === "function") {
          const v = el.CodeMirror.getValue();
          if (v && v.trim().length > 0) {
            let lang = "";
            const mode = el.CodeMirror.getOption("mode");
            const modeStr = typeof mode === "string" ? mode : (mode && mode.name) || "";
            lang = normalizeLang(modeStr);
            return { code: v, language: lang || sniffLangFromCode(v), source: "codemirror5" };
          }
        }
      }
    } catch (e) {}
    return null;
  }

  // Extract from CodeMirror 6 (modern CodeMirror)
  function getCodeMirror6Code() {
    try {
      const cm6 = document.querySelector(".cm-editor");
      if (cm6 && cm6.cmView && cm6.cmView.view && cm6.cmView.view.state) {
        const v = cm6.cmView.view.state.doc.toString();
        if (v && v.trim().length > 0) {
          return { code: v, language: sniffLangFromCode(v), source: "codemirror6" };
        }
      }
    } catch (e) {}
    return null;
  }

  // Global editor fallback (some sites store `window.editor` or `window.codeEditor`)
  function getGlobalEditorCode() {
    try {
      const g = window.editor || window.codeEditor || window.solutionEditor;
      if (g && typeof g.getValue === "function") {
        const v = g.getValue();
        if (v && v.trim().length > 0) {
          return { code: v, language: sniffLangFromCode(v), source: "global-editor" };
        }
      }
    } catch (e) {}
    return null;
  }

  // Main code extraction query
  function extractCurrentCode() {
    const monaco = getMonacoCode();
    if (monaco) return monaco;

    const ace = getAceCode();
    if (ace) return ace;

    const cm5 = getCodeMirror5Code();
    if (cm5) return cm5;

    const cm6 = getCodeMirror6Code();
    if (cm6) return cm6;

    const globalEd = getGlobalEditorCode();
    if (globalEd) return globalEd;

    return null;
  }

  function broadcastCode(force = false) {
    const data = extractCurrentCode();
    if (!data) return;
    if (!force && data.code === lastSentCode && data.language === lastSentLang) return;
    lastSentCode = data.code;
    lastSentLang = data.language;

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

  function debouncedBroadcast() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => broadcastCode(false), 400);
  }

  // Attach change listeners whenever Monaco models are created
  function hookMonaco() {
    if (window.monaco && window.monaco.editor) {
      if (typeof window.monaco.editor.onDidCreateEditor === "function") {
        window.monaco.editor.onDidCreateEditor((ed) => {
          ed.onDidChangeModelContent && ed.onDidChangeModelContent(debouncedBroadcast);
          debouncedBroadcast();
        });
      }
      if (typeof window.monaco.editor.getModels === "function") {
        const models = window.monaco.editor.getModels();
        for (const m of models) {
          if (!m.__codepush_hooked) {
            m.__codepush_hooked = true;
            m.onDidChangeContent && m.onDidChangeContent(debouncedBroadcast);
          }
        }
      }
    }
  }

  // Listen for messages from content.js (in isolated world)
  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data) return;
    if (event.data.type === "CODEPUSH_REQUEST_CODE") {
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

  // Watch for DOM changes (Monaco/Ace/CodeMirror being inserted or loaded)
  const observer = new MutationObserver(() => {
    hookMonaco();
    debouncedBroadcast();
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  // Initial checks
  hookMonaco();
  broadcastCode(true);

  // Periodic heartbeat to capture delayed asynchronous script loads
  setInterval(() => {
    hookMonaco();
    broadcastCode(false);
  }, 2000);
})();
