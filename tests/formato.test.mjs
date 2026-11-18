import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'

const toModule = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')
const read = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8')
const api = read('../src/lib/api.ts').replace('import.meta.env.DEV', 'true').replace(/import\.meta\.env\.VITE_\w+/g, 'undefined')
const lib = await import(toModule(read('../src/lib/formato.ts').replace("from './api'", `from '${toModule(api)}'`)))

test('URL del formato: solo lo elegido; PDF o HTML; descargar opcional', () => {
  assert.equal(lib.formatoUrl('636939444', 9, { formato: '', idioma: '' }, 'pdf'), '/api/636939444/prebills/9/formato?salida=pdf')
  assert.equal(lib.formatoUrl('1', 9, { formato: 'detallado', idioma: 'en' }, 'html', true), '/api/1/prebills/9/formato?formato=detallado&idioma=en&salida=html&descargar=1')
  assert.equal(lib.nombreArchivo(9, { formato: 'carta', idioma: '' }, 'pdf'), 'Prebill-9-carta.pdf')
})

test('getFormato: PDF como archivo; errores JSON con su mensaje; tipo inesperado falla', async () => {
  const pdf = async () => new Response(new Uint8Array([37, 80, 68, 70]), { status: 200, headers: { 'content-type': 'application/pdf' } })
  const blob = await lib.getFormato('1', 9, { formato: '', idioma: '' }, 'pdf', pdf)
  assert.equal(blob.size, 4)
  const err = async () => new Response(JSON.stringify({ error: 'Prebill 9999 no existe', stage: 'formato' }), { status: 404, headers: { 'content-type': 'application/json' } })
  await assert.rejects(lib.getFormato('1', 9999, { formato: '', idioma: '' }, 'pdf', err), /no existe/)
  const html = async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } })
  await assert.rejects(lib.getFormato('1', 9, { formato: '', idioma: '' }, 'pdf', html), /inesperado/)
  assert.equal((await lib.getFormato('1', 9, { formato: '', idioma: '' }, 'html', html)).size, 6)
  const caida = async () => { throw new TypeError('x') }
  await assert.rejects(lib.getFormato('1', 9, { formato: '', idioma: '' }, 'pdf', caida), /conexión/)
})
