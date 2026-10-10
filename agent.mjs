#!/usr/bin/env node
/**
 * Office print agent. Runs on the PC the USB printer is attached to.
 *
 * It polls the ERP for queued invoice jobs, downloads each job's PDF, sends it to the
 * printer with a local command, and reports the result back. It has no dependencies
 * beyond Node itself and never logs the token.
 *
 * Configuration (from .env beside this script, or the environment):
 *   APP_URL              base URL of the ERP, e.g. https://erp.example.edu
 *   PRINT_AGENT_TOKEN    the same token the server has in PRINT_AGENT_TOKEN
 *   PRINTER_NAME         printer queue name (macOS/Linux CUPS, e.g. "Office_HP")
 *   PRINT_COMMAND        optional command template. {file} and {printer} are placeholders.
 *                        Words are separated by spaces; wrap a word in double quotes to keep
 *                        spaces inside it, e.g. "C:\\Program Files\\SumatraPDF\\SumatraPDF.exe".
 *   POLL_SECONDS         how often to ask for work when the queue is empty (default 5)
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir, platform } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCommand } from './command.mjs'

// Load .env beside this script when present; variables already set win.
const envFile = join(dirname(fileURLToPath(import.meta.url)), '.env')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const config = {
    appUrl: required('APP_URL').replace(/\/$/, ''),
    token: required('PRINT_AGENT_TOKEN'),
    printer: process.env.PRINTER_NAME ?? '',
    command: process.env.PRINT_COMMAND ?? defaultCommand(),
    pollMs: Math.max(1, Number(process.env.POLL_SECONDS ?? 5)) * 1000,
}

function required(name) {
    const value = process.env[name]
    if (!value) {
        console.error(`${name} is not set; see README.md`)
        process.exit(1)
    }
    return value
}

/** CUPS `lp` on macOS and Linux; on Windows, SumatraPDF's silent print switch. */
function defaultCommand() {
    if (platform() === 'win32') {
        return 'SumatraPDF.exe -print-to "{printer}" -silent "{file}"'
    }
    return 'lp -d "{printer}" "{file}"'
}

async function api(path, init = {}) {
    return fetch(`${config.appUrl}${path}`, {
        ...init,
        headers: { authorization: `Bearer ${config.token}`, ...(init.headers ?? {}) },
    })
}

function runPrintCommand(file) {
    const [bin, ...args] = parseCommand(config.command, { printer: config.printer, file })
    if (!bin) return Promise.reject(new Error('PRINT_COMMAND is empty'))
    return new Promise((resolve, reject) => {
        const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
        let stderr = ''
        child.stderr.on('data', (chunk) => (stderr += chunk))
        child.on('error', reject)
        child.on('close', (code) =>
            code === 0 ? resolve() : reject(new Error(stderr.trim() || `print command exited ${code}`))
        )
    })
}

async function reportResult(id, outcome) {
    const body = new URLSearchParams(outcome)
    const response = await api(`/api/print-jobs/${id}/result`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
    })
    if (!response.ok) {
        console.error(`job ${id}: could not record the result (HTTP ${response.status})`)
    }
}

async function printOne(job, workDir) {
    const pdf = await api(job.pdfUrl)
    if (!pdf.ok) throw new Error(`could not download the PDF (HTTP ${pdf.status})`)
    const file = join(workDir, `${job.invoiceNumber}-${job.id}.pdf`)
    await writeFile(file, Buffer.from(await pdf.arrayBuffer()))
    await runPrintCommand(file)
}

/** Returns true when a job was handled, false when the queue was empty. */
async function pollOnce(workDir) {
    const claim = await api('/api/print-jobs/claim', { method: 'POST' })
    if (claim.status === 204) return false
    if (!claim.ok) {
        console.error(`claim failed (HTTP ${claim.status}); will retry`)
        return false
    }
    const job = await claim.json()
    try {
        await printOne(job, workDir)
        await reportResult(job.id, { ok: 'true' })
        console.log(`printed ${job.invoiceNumber}`)
    } catch (error) {
        await reportResult(job.id, { ok: 'false', error: String(error.message ?? error) })
        console.error(`failed ${job.invoiceNumber}: ${error.message ?? error}`)
    }
    return true
}

async function main() {
    const workDir = await mkdtemp(join(tmpdir(), 'erp-print-'))
    console.log(`print agent running against ${config.appUrl}`)
    const stop = () => {
        rm(workDir, { recursive: true, force: true }).finally(() => process.exit(0))
    }
    process.on('SIGINT', stop)
    process.on('SIGTERM', stop)

    for (;;) {
        try {
            const handled = await pollOnce(workDir)
            if (!handled) await new Promise((resolve) => setTimeout(resolve, config.pollMs))
        } catch (error) {
            // The server being unreachable is expected now and then; keep polling.
            console.error(`cannot reach the ERP: ${error.message ?? error}`)
            await new Promise((resolve) => setTimeout(resolve, config.pollMs))
        }
    }
}

main()
