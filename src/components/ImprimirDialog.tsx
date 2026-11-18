import { useState } from 'react'
import { Download, ExternalLink, Printer, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { gradientBtnCls, labelCls } from '@/lib/ui'
import { abrirEnVentana, descargarBlob, getFormato, nombreArchivo, type OpcionesFormato, type Salida } from '@/lib/formato'

const FORMATOS: { id: OpcionesFormato['formato']; label: string; desc: string }[] = [
  { id: '', label: 'El del despacho', desc: 'El formato elegido en Configuración del despacho' },
  { id: 'carta', label: 'Carta', desc: 'Resumen por concepto, totales, importe con letra, datos bancarios y anexo' },
  { id: 'detallado', label: 'Detallado', desc: 'Por proyecto, abogado y tipo de cargo, con el detalle de cada servicio' },
]
const IDIOMAS: { id: OpcionesFormato['idioma']; label: string }[] = [
  { id: '', label: 'El de la Prebill' }, { id: 'es', label: 'Español' }, { id: 'en', label: 'Inglés' },
]

export function ImprimirDialog({ open, onOpenChange, org, prebillId }: { open: boolean; onOpenChange: (v: boolean) => void; org: string; prebillId: number }) {
  const [o, setO] = useState<OpcionesFormato>({ formato: '', idioma: '' })
  const [busy, setBusy] = useState<'' | 'abrir' | 'descargar' | 'html'>('')
  const [error, setError] = useState('')

  const run = async (accion: 'abrir' | 'descargar' | 'html') => {
    if (busy) return
    const salida: Salida = accion === 'html' ? 'html' : 'pdf'
    const win = accion === 'descargar' ? null : window.open('', '_blank')
    if (win) win.document.write('<p style="font-family:sans-serif;color:#555;padding:24px">Generando la Prebill…</p>')
    setBusy(accion); setError('')
    try {
      const blob = await getFormato(org, prebillId, o, salida)
      const nombre = nombreArchivo(prebillId, o, salida)
      if (accion === 'descargar') descargarBlob(blob, nombre); else abrirEnVentana(win, blob, nombre)
    } catch (e) {
      win?.close()
      setError(e instanceof Error ? e.message : 'No se pudo generar el formato.')
    } finally { setBusy('') }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Printer className="w-5 h-5 text-theme-text" />Imprimir Prebill #{prebillId}</DialogTitle>
          <DialogDescription>Genera la Prebill para mandarla al cliente. Solo consulta: no cambia la Prebill ni escribe en Books.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <span className={labelCls}>Formato</span>
            <div role="radiogroup" aria-label="Formato" className="grid gap-2">
              {FORMATOS.map(f => (
                <button key={f.id || 'omision'} type="button" role="radio" aria-checked={o.formato === f.id} onClick={() => setO(x => ({ ...x, formato: f.id }))}
                  className={cn('text-left rounded-lg border px-3 py-2 transition-all', o.formato === f.id ? 'border-theme-border bg-theme-light' : 'border-slate-200 hover:bg-slate-50')}>
                  <span className={cn('block text-sm font-semibold', o.formato === f.id ? 'text-theme-text' : 'text-slate-800')}>{f.label}</span>
                  <span className="block text-[11px] text-slate-500">{f.desc}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <span className={labelCls}>Idioma</span>
            <div role="radiogroup" aria-label="Idioma" className="flex gap-1 bg-slate-50 p-1 rounded-lg border border-slate-200 w-max">
              {IDIOMAS.map(i => (
                <button key={i.id || 'prebill'} type="button" role="radio" aria-checked={o.idioma === i.id} onClick={() => setO(x => ({ ...x, idioma: i.id }))}
                  className={cn('px-3 h-8 text-xs font-semibold rounded-md border', o.idioma === i.id ? 'bg-white text-theme-text shadow-sm border-slate-200' : 'text-slate-500 border-transparent hover:bg-theme-light')}>{i.label}</button>
              ))}
            </div>
          </div>
          {error && <p role="alert" className="text-xs rounded-lg border border-red-200 bg-red-50 p-2 text-red-700">{error}</p>}
          <div className="flex flex-wrap gap-2 justify-end pt-1">
            <Button variant="outline" className="h-10 gap-1.5 border-slate-200" disabled={!!busy} onClick={() => void run('html')} title="Abre la hoja en otra pestaña para imprimirla desde el navegador">
              {busy === 'html' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}Versión para imprimir
            </Button>
            <Button variant="outline" className="h-10 gap-1.5 border-slate-200" disabled={!!busy} onClick={() => void run('abrir')}>
              {busy === 'abrir' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}Abrir PDF
            </Button>
            <Button className={cn('h-10 gap-1.5 border-0', gradientBtnCls)} disabled={!!busy} onClick={() => void run('descargar')}>
              {busy === 'descargar' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}Descargar PDF
            </Button>
          </div>
          <p className="text-[11px] text-slate-500">El primer PDF después de reiniciar el servidor puede tardar unos 30 segundos.</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
