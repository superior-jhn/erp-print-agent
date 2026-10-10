# Office print agent

Runs on the PC the office printer is attached to. It asks the ERP for queued invoice
jobs, prints each invoice PDF on the local printer, and reports back. The ERP cannot
reach a USB printer itself, so this agent is the link.

## Setup (Windows)

1. **Install Node.js 24 or later** from nodejs.org. Check in PowerShell with `node -v`.
2. **Install SumatraPDF** from sumatrapdfreader.org. The default Windows command runs
   `SumatraPDF.exe` by name, so its folder must be on your PATH: System Environment
   Variables → Path → add the folder, e.g. `C:\SumatraPDF`. Or set `PRINT_COMMAND`
   to its full path (see below).
3. **Find the exact printer name:** in PowerShell run `Get-Printer | Select Name`.
   Spaces in the name are fine.
4. **Clone this repository** to e.g. `C:\erp-print-agent`.
5. **Create `C:\erp-print-agent\.env`** (copy `.env.example` and fill it in):

   ```
   APP_URL=https://erp.example.edu
   PRINT_AGENT_TOKEN=the-same-token-as-the-server
   PRINTER_NAME=HP LaserJet 1020
   ```

6. **Start it** in PowerShell:

   ```powershell
   cd C:\erp-print-agent
   node agent.mjs
   ```

   You should see `print agent running against https://erp.example.edu`. Leave the
   window open. The agent reads `.env` from its own folder itself.
7. **Keep it running after a reboot:** in Task Scheduler, create a task that runs at
   logon. Program: `node.exe` (full path, e.g. `C:\Program Files\nodejs\node.exe`).
   Arguments: `C:\erp-print-agent\agent.mjs`. Start in: `C:\erp-print-agent`.

### Setup (macOS / Linux)

Install Node 24, create `.env` the same way, and run `node agent.mjs`. Add the printer
to CUPS first; `PRINTER_NAME` is its queue name.

## Printing commands

- **Windows default:** `SumatraPDF.exe -print-to "{printer}" -silent "{file}"`.
- **macOS / Linux default:** `lp -d "{printer}" "{file}"`.
- To use another command, set `PRINT_COMMAND` in `.env`. Words are separated by
  spaces. Wrap a word in double quotes to keep spaces inside it. `{printer}` and
  `{file}` are replaced after the split, so their values may contain spaces. Example
  with SumatraPDF under Program Files:

  ```
  PRINT_COMMAND="C:\Program Files\SumatraPDF\SumatraPDF.exe" -print-to "{printer}" -silent "{file}"
  ```

## What the agent does with failures

A job that cannot be printed is reported as `FAILED` with the printer's error. It stays
in the ERP's print queue, where someone can look at it and press **Queue again**.
Nothing is billed again. If the agent crashes mid-print, the job is handed out again
after ten minutes.

## Security

- The token is the only credential. Keep `.env` out of version control and out of
  shared folders.
- The agent sends the token only to `APP_URL` and never logs it.
