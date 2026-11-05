# CodePush (Chrome extension v1.2.0)

Automatically detects your coding platform, captures written code in real-time, and pushes solved problems from **GeeksforGeeks**, **HackerRank**, **CodeChef**, and **LeetCode** straight to your GitHub repository.

## Features
- **Auto-Detect Platform**: Instantly recognizes whether you are on GeeksforGeeks, HackerRank, CodeChef, or LeetCode.
- **Deep Code Extraction (Main-World Bridge)**: Uses `page-bridge.js` to inspect Monaco Editor models, Ace Editor sessions, and CodeMirror instances to extract complete, pristine source code without virtual scrolling truncation.
- **Real-Time Editor Sync**: Captures code edits as you write; updates the floating pill and sidepanel live.
- **Auto-Verdict Detection**: Automatically flags "Accepted" / "All Test Cases Passed" and prepares your solution for one-click commit.
- **Clean Repository Architecture**: Commits go to `<repoName>/<Platform>/<problem-slug>.<ext>`. Auto-creates the repo if missing and preserves git commit history when re-pushing.
- **Private & Local**: Your GitHub Personal Access Token stays strictly inside `chrome.storage.local` on your machine and only communicates with `api.github.com`.

## Extension Files
- `manifest.json` — Manifest V3 configuration with dual-world content scripts.
- `page-bridge.js` — Main-world script with direct access to `window.monaco`, `window.ace`, and CodeMirror.
- `content.js` — Isolated-world content script, floating status widget, verdict observer, and DOM fallbacks.
- `background.js` — Service worker managing GitHub REST API requests, token validation, repo creation, and commits.
- `popup.html` & `sidepanel.html` — Extension panel interfaces loaded with `popup.js`.
- `popup.js` — Sidepanel / popup logic with live active tab auto-fill and token authentication.
