import { API_BASE } from './api'

// Formato imprimible de la Prebill (carta o detallado) vía prebill_services. Solo lectura: genera el
// PDF o la versión para imprimir; no adjunta nada en Books.
export type Formato = '' | 'carta' | 'detallado'
export type IdiomaFormato = '' | 'es' | 'en'
export type Salida = 'pdf' | 'html'
export interface OpcionesFormato { formato: Formato; idioma: IdiomaFormato }

export function formatoQuery(o: OpcionesFormato, salida: Salida, descargar = false): string {
  const q = new URLSearchParams()
  if (o.formato) q.set('formato', o.formato)
  if (o.idioma) q.set('idioma', o.idioma)
  q.set('salida', salida)
  if (descargar) q.set('descargar', '1')
  return q.toString()
}
export const formatoUrl = (org: string, id: number, o: OpcionesFormato, salida: Salida, descargar = false) =>
  `${API_BASE}/${encodeURIComponent(org)}/prebills/${id}/formato?${formatoQuery(o, salida, descargar)}`

export const nombreArchivo = (id: number, o: OpcionesFormato, salida: Salida) => `Prebill-${id}${o.formato ? '-' + o.formato : ''}.${salida}`

// Trae el archivo; los errores de la función vienen en JSON con un mensaje para el usuario.
export async function getFormato(org: string, id: number, o: OpcionesFormato, salida: Salida, fetchImpl: typeof fetch = fetch): Promise<Blob> {
  let response: Response
  try { response = await fetchImpl(formatoUrl(org, id, o, salida), { signal: AbortSignal.timeout(40000) }) }
  catch (e) {
    throw new Error((e as Error)?.name === 'TimeoutError' ? 'El PDF tardó demasiado. Vuelve a intentarlo o abre la versión para imprimir.' : 'No hay conexión con el servicio de Prebills.')
  }
  const type = response.headers.get('content-type') || ''
  if (!response.ok || /json/.test(type)) {
    const data = await response.json().catch(() => null)
    throw new Error(typeof data?.error === 'string' ? data.error : `No se pudo generar el formato (HTTP ${response.status}).`)
  }
  const esperado = salida === 'pdf' ? /application\/pdf/ : /text\/html/
  if (!esperado.test(type)) throw new Error('El servicio devolvió un archivo inesperado.')
  return response.blob()
}

export function descargarBlob(blob: Blob, nombre: string) {
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href; a.download = nombre
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(href), 60000)
}

// La ventana se abre al hacer clic (antes de esperar el archivo) para que el navegador no la bloquee.
export function abrirEnVentana(win: Window | null, blob: Blob, nombre: string) {
  const href = URL.createObjectURL(blob)
  if (win && !win.closed) win.location.href = href
  else descargarBlob(blob, nombre) // ventana bloqueada: se descarga
  setTimeout(() => URL.revokeObjectURL(href), 5 * 60000)
}
