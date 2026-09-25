# OpenTerminal Local Installation & Automation Specification

## 1. Overview & Objective
Establish a permanent, robust, production-grade local installation of OpenTerminal on Windows (PC).
Repository: `https://github.com/ErTasselli/OpenTerminal`
Target Location: `C:\Users\LENOVO\OneDrive\Documents\My Projects\OpenTerminal`

The installation must:
1. Have all backend and frontend dependencies installed cleanly.
2. Build and run without errors.
3. Be fully launchable via `START.bat` (and Desktop shortcut) which starts backend & frontend, waits for readiness, opens Google Chrome at `http://localhost:3000`, avoids duplicate processes, and handles errors.
4. Have a reliable `STOP.bat` to gracefully terminate processes on ports 3000 and 4000.
5. Provide a desktop shortcut `OpenTerminal.lnk` pointing to `START.bat`.
6. Provide an optional Windows Startup configuration/script.
7. Address OneDrive sync interference with `node_modules` and SQLite database (`terminal.db`, WAL/SHM).
8. Bind strictly to `127.0.0.1` / `localhost` for security.
9. Support full local data without required external paid API keys, with optional Anthropic Claude integration.

## 2. Technical Stack & Architecture
- **Runtime**: Node.js v26.8.1, npm 11.19.0, Python 3.14/3.13, Windows 11 / PowerShell / cmd.exe.
- **Backend (`server/`)**: Express.js, TypeScript, better-sqlite3 (`terminal.db` in `data/`), cors, zod, @anthropic-ai/sdk. Listens on `http://127.0.0.1:4000`.
- **Frontend (`web/`)**: Next.js 15, React 19, Tailwind CSS v4, Zustand, Lightweight Charts. Proxies API requests to `http://localhost:4000`. Listens on `http://localhost:3000`.
- **Database**: SQLite WAL mode located at `data/terminal.db`.
- **Browser**: Google Chrome at `C:\Program Files\Google\Chrome\Application\chrome.exe`.

## 3. OneDrive Safety Considerations
Because `C:\Users\LENOVO\OneDrive\Documents\My Projects\OpenTerminal` is managed under OneDrive:
- `node_modules/` (thousands of tiny files) can cause OneDrive sync thrashing.
- SQLite WAL mode files (`data/terminal.db-wal`, `data/terminal.db-shm`) can lock or conflict if synced actively during runtime.
- Solution: Configure OneDrive ignore attributes (`attrib +U -P` or `Set-Content -Path ... -Stream ...` or OneDrive exclude list guidance), and ensure clean shutdown.

## 4. Verification Criteria
- [ ] Dependencies installed cleanly across root, `server`, and `web`.
- [ ] TypeScript build for `server` succeeds (`npm run build -w server`).
- [ ] Next.js build or dev mode for `web` succeeds (`npm run build -w web`).
- [ ] API status endpoint `http://127.0.0.1:4000/api/status` returns `{"ok":true,...}`.
- [ ] Web frontend at `http://localhost:3000` renders OpenTerminal dashboard.
- [ ] `START.bat` executes cleanly, detects duplicate runs, waits for readiness, launches Chrome.
- [ ] `STOP.bat` cleanly shuts down all background processes on ports 3000 and 4000.
- [ ] Desktop shortcut exists and points to `START.bat`.
- [ ] Empirical proof captured and documented.
