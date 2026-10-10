/**
 * Print-command parsing, kept apart from agent.mjs so it can be tested without a server.
 */

/**
 * Splits a command template into words, honouring double quotes, then fills in the
 * placeholders. Substitution happens per word, so a printer name or file path with
 * spaces stays a single argument. Backslashes are kept as-is for Windows paths.
 */
export function parseCommand(template, values) {
    const words = []
    let current = null
    let quoted = false
    for (const char of template) {
        if (char === '"') {
            quoted = !quoted
            current ??= ''
        } else if (/\s/.test(char) && !quoted) {
            if (current !== null) words.push(current)
            current = null
        } else {
            current = (current ?? '') + char
        }
    }
    if (current !== null) words.push(current)
    return words.map((word) =>
        word.replaceAll('{printer}', values.printer).replaceAll('{file}', values.file)
    )
}
