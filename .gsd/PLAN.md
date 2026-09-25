---
phase: 1
plan: 1
wave: 1
depends_on: []
files_modified:
  - package.json
  - server/package.json
  - web/package.json
  - .env
  - START.bat
  - STOP.bat
autonomous: true
must_haves:
  truths:
    - "npm install completes without fatal errors across workspaces"
    - "Server and Web builds compile cleanly"
    - "Express backend serves http://127.0.0.1:4000/api/status"
    - "Next.js frontend renders dashboard on http://localhost:3000"
    - "START.bat launches both services, waits for http://localhost:3000, and opens Chrome"
    - "STOP.bat stops all processes listening on port 3000 and 4000 safely"
    - "Desktop shortcut OpenTerminal.lnk is placed on user's Desktop"
  artifacts:
    - "C:/Users/LENOVO/OneDrive/Documents/My Projects/OpenTerminal/START.bat"
    - "C:/Users/LENOVO/OneDrive/Documents/My Projects/OpenTerminal/STOP.bat"
    - "C:/Users/LENOVO/Desktop/OpenTerminal.lnk"
---

# Plan 1.1: OpenTerminal Local Setup, Automation & Empirical Validation

<objective>
Install dependencies, verify builds, configure environment, build START.bat and STOP.bat automation, create desktop shortcut, and empirically verify the complete user workflow.
</objective>

<tasks>

<task type="auto">
  <name>Task 1: Dependency Installation & Build Verification</name>
  <files>package.json, server/package.json, web/package.json</files>
  <action>
    Run npm install from root workspace.
    Check better-sqlite3 compilation/binary download on Node v26 Windows.
    Run TypeScript build for server (npm run build -w server).
    Run Next.js build for web (npm run build -w web).
    Ensure zero build errors.
  </action>
  <verify>npm run build completes with exit code 0</verify>
  <done>Both server and web workspaces build successfully.</done>
</task>

<task type="auto">
  <name>Task 2: Environment Configuration & OneDrive Hardening</name>
  <files>.env, server/.env, web/.env</files>
  <action>
    Ensure local configuration binds to 127.0.0.1 / localhost.
    Set up environment files if needed (e.g., API_PORT=4000, API_HOST=127.0.0.1, API_URL=http://localhost:4000).
    Ensure API key handling between server and web operates seamlessly without user friction.
    Apply OneDrive sync protection/advice for node_modules and data/ sqlite files.
  </action>
  <verify>Server initializes data/terminal.db and data/.api-key correctly</verify>
  <done>Environment variables and paths are hardened for Windows and OneDrive.</done>
</task>

<task type="auto">
  <name>Task 3: Automation Scripts (START.bat & STOP.bat) and Shortcuts</name>
  <files>START.bat, STOP.bat, scripts/create_shortcut.ps1</files>
  <action>
    Create START.bat:
      - Check if already running on ports 4000 and 3000 to prevent duplicate processes.
      - Start backend in background or managed window.
      - Start frontend.
      - Poll http://localhost:3000 until responsive (max timeout with clear error handling).
      - Launch Google Chrome to http://localhost:3000.
      - Keep window open on error with pause.
    Create STOP.bat:
      - Find and kill processes bound to port 4000 and port 3000 cleanly.
    Create Desktop shortcut OpenTerminal.lnk pointing to START.bat.
    Optionally create / provide Windows Startup script.
  </action>
  <verify>START.bat and STOP.bat execute reliably from command line and file explorer</verify>
  <done>Full automation lifecycle operational.</done>
</task>

<task type="auto">
  <name>Task 4: Empirical End-to-End Validation</name>
  <files>test_e2e.ps1</files>
  <action>
    Execute full startup sequence.
    Verify API health at http://127.0.0.1:4000/api/status.
    Verify Web UI at http://localhost:3000.
    Capture browser rendering using browser_subagent / screenshot.
    Test STOP.bat and verify clean port release.
  </action>
  <verify>Browser subagent visits http://localhost:3000 and confirms OpenTerminal dashboard renders live quotes/charts</verify>
  <done>Empirical evidence of full operation recorded.</done>
</task>

</tasks>
