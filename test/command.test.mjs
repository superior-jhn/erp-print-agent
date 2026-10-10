import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCommand } from '../command.mjs'

test('splits words on spaces', () => {
    assert.deepEqual(parseCommand('lp -d {printer} {file}', { printer: 'Office_HP', file: '/tmp/a.pdf' }), [
        'lp', '-d', 'Office_HP', '/tmp/a.pdf',
    ])
})

test('keeps a quoted executable path with spaces as one word', () => {
    const words = parseCommand(
        '"C:\\Program Files\\SumatraPDF\\SumatraPDF.exe" -print-to "{printer}" -silent "{file}"',
        { printer: 'HP LaserJet 1020', file: 'C:\\Users\\John Smith\\Temp\\INV-1.pdf' }
    )
    assert.deepEqual(words, [
        'C:\\Program Files\\SumatraPDF\\SumatraPDF.exe',
        '-print-to',
        'HP LaserJet 1020',
        '-silent',
        'C:\\Users\\John Smith\\Temp\\INV-1.pdf',
    ])
})

test('a printer name with spaces is not split when substituted unquoted', () => {
    assert.deepEqual(parseCommand('lp -d {printer}', { printer: 'Office HP' }), ['lp', '-d', 'Office HP'])
})

test('an empty template yields no words', () => {
    assert.deepEqual(parseCommand('   ', {}), [])
})
