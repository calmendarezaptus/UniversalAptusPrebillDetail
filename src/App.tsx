import { useEffect, useMemo, useRef, useState } from 'react'
import 'animate.css'
import { Toaster, toast } from 'sonner'
import {
  AlertTriangle, BadgePercent, Check, ChevronLeft, FileText, History, Info, Languages, Lock, Plus, ReceiptText, RefreshCw, Trash2, Undo2, UserCheck, X,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StatusModal, type StatusModalType } from '@/components/StatusModal'
import { ThemeMenu } from '@/components/ThemeMenu'
import { cn } from '@/lib/utils'
import { LIST_URL, screenUrl } from '@/lib/api'
import { cardCls, gradientBtnCls, inputCls, labelCls, sectionIconCls, sectionTitleCls, useTheme } from '@/lib/ui'
import {
  AVANZAR, avanzarEstado, cambiarLineas, contarIgnorados, deshacerFactura, editable, editableEnBooks, eliminarPrebill, facturar, ESTADO_CLS, ESTADO_LABEL, ESTADOS, formatFecha, formatMoney,
  getDisponible, getEdicion, getMovimientos, getPrebill, getVistaFactura, idsPorTipo, KIND_PLURAL, KINDS, lineasDe, parseAjuste,
  setDescuentoAjuste, setIdioma, setTipoCambio,
  type Edicion, type Linea, type Movimiento, type PrebillDetalle, type VistaFactura,
} from '@/lib/prebills'

type Modal = { isOpen: boolean; type: StatusModalType; title: string; message: string }
type Tipo = '' | 'monto' | 'porcentaje'
const uncertainOf = (error: unknown) => error instanceof Error && 'uncertain' in error && (error as { uncertain?: boolean }).uncertain === true
const FUENTE: Record<string, string> = { local: 'asignado en Aptus', rol_proyecto: 'rol en el proyecto de Books', campo_cliente: 'campo del cliente en Books' }
const MOV_TIPO: Record<string, string> = { tiempo: 'tiempo', gasto: 'gasto', cargo_fijo: 'honorario fijo' }

function App() {
  const [theme, setTheme] = useTheme()
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const organizationId = params.get('organization_id')
  const prebillId = params.get('prebill_id')
  const [statusModal, setStatusModal] = useState<Modal>({ isOpen: false, type: 'info', title: '', message: '' })
  const showError = (title: string, error: unknown) => setStatusModal({ isOpen: true, type: 'error', title: uncertainOf(error) ? 'Resultado por verificar' : title, message: error instanceof Error ? error.message : 'Error.' })

  useEffect(() => {
    if (!organizationId) setStatusModal({ isOpen: true, type: 'error', title: 'Error de Inicialización', message: 'No se detectó la organización relacionada. Es necesario incluir el parámetro "organization_id" en la URL.' })
    else if (!prebillId) setStatusModal({ isOpen: true, type: 'error', title: 'Falta la Prebill', message: 'Abre esta pantalla desde la lista de Prebills (falta "prebill_id" en la URL).' })
  }, [organizationId, prebillId])

  // ── Datos ──────────────────────────────────────────────────────────────
  const [prebill, setPrebill] = useState<PrebillDetalle | null>(null)
  const [vista, setVista] = useState<{ data: VistaFactura | null; error: string }>({ data: null, error: '' })
  const [movs, setMovs] = useState<Movimiento[]>([])
  const [edicion, setEdicion] = useState<Edicion | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [gone, setGone] = useState(false)
  const load = async () => {
    if (!organizationId || !prebillId) return
    setLoading(true); setLoadError('')
    try {
      const p = await getPrebill(organizationId, prebillId)
      setPrebill(p); setGone(false)
      const [v, m] = await Promise.allSettled([getVistaFactura(organizationId, prebillId), getMovimientos(organizationId, prebillId)])
      setVista(v.status === 'fulfilled' ? { data: v.value, error: '' } : { data: null, error: v.reason instanceof Error ? v.reason.message : 'No se pudo armar la vista previa.' })
      setMovs(m.status === 'fulfilled' ? m.value : [])
      if (!editable(p.status)) getEdicion(organizationId, prebillId).then(setEdicion).catch(() => setEdicion(null))
      else setEdicion(null)
    } catch (error) {
      const e = error as Error & { status?: number; stage?: string }
      if (e.status === 404 && e.stage) setGone(true)
      setLoadError(e.message || 'No se pudo cargar la Prebill.')
    } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [organizationId, prebillId]) // eslint-disable-line react-hooks/exhaustive-deps

  const lineas = useMemo(() => prebill ? lineasDe(prebill) : [], [prebill])
  const enBooks = !!prebill && editableEnBooks(prebill.status, edicion)
  const puedeEditar = !!prebill && (editable(prebill.status) || enBooks)
  const enBorrador = prebill?.status === 'borrador'

  const [saving, setSaving] = useState(false)
  const busy = useRef(false)
  async function run(action: () => Promise<void>, errorTitle: string) {
    if (busy.current || !organizationId || !prebill) return
    busy.current = true; setSaving(true)
    try { await action() } catch (error) { showError(errorTitle, error); void load() } finally { busy.current = false; setSaving(false) }
  }

  // ── Líneas ─────────────────────────────────────────────────────────────
  const quitar = (l: Linea) => {
    if (!window.confirm(`¿Quitar de la Prebill este ${l.kind === 'cargo' ? 'honorario fijo' : l.kind} (${formatMoney(l.monto, l.moneda)})?\n\nVuelve a quedar liberado y disponible para otra Prebill.${enBooks ? `\n\nTambién se quita de la factura ${prebill?.invoice_number} en Books.` : ''}`)) return
    void run(async () => {
      const r = await cambiarLineas(organizationId!, prebill!.id, idsPorTipo([l], 'quitar_'))
      avisoFactura(r.factura_actualizada, 'Línea quitada.'); await load()
    }, 'No se quitó la línea')
  }
  const [agregando, setAgregando] = useState(false)
  const [disp, setDisp] = useState<{ rows: Linea[]; loading: boolean; error: string }>({ rows: [], loading: false, error: '' })
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const openAgregar = async () => {
    if (!organizationId || !prebillId) return
    setAgregando(true); setMarcadas(new Set()); setDisp({ rows: [], loading: true, error: '' })
    try { setDisp({ rows: lineasDe(await getDisponible(organizationId, prebillId)), loading: false, error: '' }) }
    catch (error) { setDisp({ rows: [], loading: false, error: error instanceof Error ? error.message : 'No se pudo cargar lo disponible.' }) }
  }
  const agregar = () => run(async () => {
    const elegidas = disp.rows.filter(r => marcadas.has(r.key))
    if (!elegidas.length) return
    if (enBooks && !window.confirm(`¿Agregar ${elegidas.length} línea(s)?\n\nTambién se agregan a la factura ${prebill?.invoice_number} en Books.`)) return
    const r = await cambiarLineas(organizationId!, prebill!.id, idsPorTipo(elegidas, 'agregar_'))
    const ignorados = contarIgnorados(r.ids_ignorados)
    if (ignorados) toast.warning(`${elegidas.length - ignorados} agregada(s); ${ignorados} ya no estaban disponibles.`)
    else avisoFactura(r.factura_actualizada, `${elegidas.length} línea(s) agregada(s).`)
    setAgregando(false); await load()
  }, 'No se agregaron las líneas')

  // Resultado de actualizar la factura en Books al cambiar líneas.
  const avisoFactura = (f: { numero: string; cuadra: boolean; subtotal_books: number; subtotal_esperado: number } | undefined, ok: string) => {
    if (!f) { toast.success(ok); return }
    if (f.cuadra) toast.success(`${ok} Factura ${f.numero} actualizada en Books.`)
    else toast.warning(`${ok} La factura ${f.numero} en Books suma ${formatMoney(f.subtotal_books)} y se esperaba ${formatMoney(f.subtotal_esperado)}: revísala.`)
  }

  // ── Descuento y ajuste (solo borrador) ─────────────────────────────────
  const [desc, setDesc] = useState<{ tipo: Tipo; valor: string }>({ tipo: '', valor: '' })
  const [ajus, setAjus] = useState<{ tipo: Tipo; valor: string }>({ tipo: '', valor: '' })
  useEffect(() => {
    if (!prebill) return
    setDesc({ tipo: prebill.descuento_tipo || '', valor: prebill.descuento_tipo ? String(prebill.descuento_valor) : '' })
    setAjus({ tipo: prebill.ajuste_tipo || '', valor: prebill.ajuste_tipo ? String(prebill.ajuste_valor) : '' })
  }, [prebill])
  const ajusteDirty = !!prebill && (desc.tipo !== (prebill.descuento_tipo || '') || (desc.tipo && Number(desc.valor) !== Number(prebill.descuento_valor))
    || ajus.tipo !== (prebill.ajuste_tipo || '') || (ajus.tipo && Number(ajus.valor) !== Number(prebill.ajuste_valor)))
  const guardarAjustes = () => run(async () => {
    const d = parseAjuste(desc.tipo, desc.valor, 'descuento'), a = parseAjuste(ajus.tipo, ajus.valor, 'ajuste')
    await setDescuentoAjuste(organizationId!, prebill!.id, { descuento_tipo: d.tipo, descuento_valor: d.valor, ajuste_tipo: a.tipo, ajuste_valor: a.valor })
    toast.success('Descuento y ajuste guardados.'); await load()
  }, 'No se guardó el descuento')

  // ── Idioma y tipo de cambio ────────────────────────────────────────────
  const cambiarIdioma = (v: string) => run(async () => {
    if (enBooks && !window.confirm(`¿Cambiar el idioma?\n\nLa factura ${prebill?.invoice_number} se rearma en Books con los conceptos del otro idioma.`)) return
    await setIdioma(organizationId!, prebill!.id, v === 'cliente' ? '' : v as 'es' | 'en')
    toast.success('Idioma de la factura actualizado.'); await load()
  }, 'No se cambió el idioma')
  const [tc, setTc] = useState('')
  useEffect(() => { setTc(prebill?.tipo_cambio ? String(prebill.tipo_cambio) : '') }, [prebill])
  const guardarTc = () => run(async () => {
    const clean = tc.trim()
    if (clean && !(/^\d+(\.\d{1,6})?$/.test(clean) && Number(clean) > 0)) throw new Error('El tipo de cambio debe ser un número mayor que cero, con máximo 6 decimales.')
    await setTipoCambio(organizationId!, prebill!.id, clean ? Number(clean) : null)
    toast.success(clean ? 'Tipo de cambio guardado.' : 'Se usará el FIX de Banxico al facturar.'); await load()
  }, 'No se guardó el tipo de cambio')

  // ── Estado y eliminar ──────────────────────────────────────────────────
  const siguiente = prebill ? AVANZAR[prebill.status] : undefined
  const avanzar = () => {
    if (!siguiente || !prebill) return
    const bloq = vista.data?.bloqueantes?.length ? `\n\nOjo: la vista previa tiene ${vista.data.bloqueantes.length} bloqueo(s) para facturar.` : ''
    if (!window.confirm(`¿${siguiente.accion} la Prebill #${prebill.id}?${siguiente.a === 'en_revision' ? '\n\nEn revisión ya no se puede cambiar el descuento ni el ajuste.' : ''}${bloq}`)) return
    void run(async () => {
      await avanzarEstado(organizationId!, prebill.id, siguiente.a)
      toast.success(`Prebill #${prebill.id}: ${ESTADO_LABEL[siguiente.a]}.`); await load()
    }, 'No se cambió el estado')
  }
  // ── Facturar y deshacer (ESCRIBEN EN BOOKS) ───────────────────────────
  const bloqueos = vista.data?.bloqueantes || []
  const puedeFacturar = prebill?.status === 'autorizada' && !!vista.data && !bloqueos.length && lineas.length > 0
  const facturarPrebill = () => {
    if (!prebill || !puedeFacturar) return
    if (!window.confirm(`¿Facturar la Prebill #${prebill.id}?\n\nSe crea la factura en Zoho Books como BORRADOR para ${prebill.cliente_nombre}, por ${formatMoney(vista.data!.total_antes_de_impuestos, prebill.moneda)} antes de impuestos, y sus tiempos quedan facturados en Books.\n\nMientras siga en borrador se puede deshacer desde aquí.`)) return
    void run(async () => {
      const r = await facturar(organizationId!, prebill.id)
      toast.success(r.invoice_number ? `Factura ${r.invoice_number} creada en Books (borrador).` : 'Prebill facturada.')
      await load()
    }, 'No se facturó')
  }
  const deshacer = () => {
    if (!prebill || !window.confirm(`¿Deshacer la factura ${prebill.invoice_number} de la Prebill #${prebill.id}?\n\nSe BORRA la factura en Zoho Books (sigue en borrador) y la Prebill regresa a Autorizada con sus líneas.`)) return
    void run(async () => {
      await deshacerFactura(organizationId!, prebill.id)
      toast.success(`Factura ${prebill.invoice_number} borrada de Books; la Prebill #${prebill.id} está Autorizada.`)
      await load()
    }, 'No se deshizo la factura')
  }

  const eliminar = () => {
    if (!prebill || !window.confirm(`¿Eliminar la Prebill #${prebill.id}?\n\nSus ${lineas.length} línea(s) vuelven a quedar liberadas para otra Prebill.`)) return
    void run(async () => {
      await eliminarPrebill(organizationId!, prebill.id)
      toast.success(`Prebill #${prebill.id} eliminada.`)
      setTimeout(goBack, 700)
    }, 'No se eliminó la Prebill')
  }
  function goBack() {
    const origin = params.get('origin')
    try { window.location.href = origin ? new URL(origin).toString() : screenUrl(LIST_URL, { organization_id: organizationId || '' }) }
    catch { window.location.href = screenUrl(LIST_URL, { organization_id: organizationId || '' }) }
  }

  const t = prebill?.totales
  const m = prebill?.moneda || ''
  const paso = prebill ? ESTADOS.indexOf(prebill.status === 'facturando' ? 'facturada' : prebill.status) : -1

  return (
    <div className="min-h-screen bg-slate-50/50 p-2 sm:p-4 lg:p-8 flex justify-center items-start font-sans w-full">
      <Toaster position="top-center" richColors />
      <Card className="w-full bg-gradient-to-b from-[#FFF7F7] to-white border border-slate-200 rounded-[20px] overflow-hidden p-3 sm:p-5 lg:p-8 relative animate__animated animate__fadeIn animate__faster">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-theme-from/5 rounded-full blur-[80px] animate-blob pointer-events-none z-0"></div>
        <div className="absolute top-0 left-0 right-0 h-15 bg-gradient-to-b from-theme-light to-transparent pointer-events-none z-0"></div>

        {/* ── ENCABEZADO ─────────────────────────────────────────────────── */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-5 gap-0 relative z-10">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-theme-from to-theme-to flex items-center justify-center shrink-0 shadow-sm border border-black/5 text-white">
              <FileText className="w-7 h-7" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Prebill {prebillId ? `#${prebillId}` : ''}</h1>
                {prebill && <span className={cn('text-xs font-semibold border rounded px-2 py-0.5', ESTADO_CLS[prebill.status])}>{ESTADO_LABEL[prebill.status] || prebill.status}</span>}
                <ThemeMenu theme={theme} setTheme={setTheme} />
              </div>
              <p className="text-slate-500 text-sm mt-0.5 truncate">{prebill ? `${prebill.cliente_nombre} · ${prebill.moneda}` : 'Cargando…'}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 mt-4 lg:mt-0 w-full lg:w-auto">
            <Button variant="outline" onClick={goBack} className="flex-1 lg:flex-none h-11 px-5 rounded-lg border-slate-200 text-slate-700 font-medium gap-1.5"><ChevronLeft className="w-4 h-4" />Prebills</Button>
            {enBorrador && <Button variant="outline" onClick={eliminar} disabled={saving} className="flex-1 lg:flex-none h-11 px-5 rounded-lg border-red-200 text-red-700 hover:bg-red-50 font-medium gap-1.5"><Trash2 className="w-4 h-4" />Eliminar</Button>}
            {enBooks && (
              <Button variant="outline" onClick={deshacer} disabled={saving} className="flex-1 lg:flex-none h-11 px-5 rounded-lg border-amber-300 text-amber-800 hover:bg-amber-50 font-medium gap-1.5"><Undo2 className="w-4 h-4" />Deshacer factura</Button>
            )}
            {prebill?.status === 'autorizada' && (
              <Button onClick={facturarPrebill} disabled={saving || !puedeFacturar} title={bloqueos.length ? 'La vista previa tiene bloqueos' : undefined}
                className={cn('flex-1 lg:flex-none h-11 px-6 rounded-lg shadow-sm font-medium gap-2 border-0 disabled:opacity-50', gradientBtnCls)}>
                <ReceiptText className="w-4 h-4" />Facturar en Books
              </Button>
            )}
            {siguiente && (
              <Button onClick={avanzar} disabled={saving || !lineas.length} className={cn('flex-1 lg:flex-none h-11 px-6 rounded-lg shadow-sm font-medium gap-2 border-0 disabled:opacity-50', gradientBtnCls)}>
                <Check className="w-4 h-4" />{siguiente.accion}
              </Button>
            )}
          </div>
        </div>

        {/* Pasos */}
        {prebill && (
          <ol className="relative z-10 mb-5 flex flex-wrap items-center gap-2 text-xs">
            {ESTADOS.map((e, i) => (
              <li key={e} className="flex items-center gap-2">
                <span className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1 font-semibold', i < paso ? 'border-theme-border bg-theme-light text-theme-text' : i === paso ? 'border-theme-from bg-gradient-to-r from-theme-from to-theme-to text-white' : 'border-slate-200 text-slate-400')}>
                  {i < paso && <Check className="w-3 h-3" />}{ESTADO_LABEL[e]}
                </span>
                {i < ESTADOS.length - 1 && <span className="text-slate-300">→</span>}
              </li>
            ))}
          </ol>
        )}

        <div className="relative z-10 space-y-4">
          {loadError && (
            <div role="alert" className="text-sm text-red-700 rounded-lg border border-red-200 bg-red-50 p-3 flex items-center justify-between gap-2">
              <span>{gone ? 'Esta Prebill ya no existe (se eliminó).' : loadError}</span>
              {!gone && <Button variant="outline" size="sm" onClick={() => void load()}>Reintentar</Button>}
            </div>
          )}
          {loading && !prebill && <div role="status" className="flex items-center gap-3 rounded-xl border border-theme-border bg-theme-light/60 p-4 text-sm text-theme-text"><RefreshCw className="h-5 w-5 animate-spin" />Cargando Prebill…</div>}

          {prebill && t && (
            <div inert={saving} className="space-y-4">
              {enBooks && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Facturada: la factura {prebill.invoice_number} sigue en <b>borrador</b> en Books. Quitar o agregar líneas o cambiar el idioma <b>también actualiza la factura en Books</b>. Mientras siga en borrador puedes deshacerla.</span>
                </div>
              )}
              {!puedeEditar && (
                <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900 flex items-start gap-2">
                  <Lock className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Prebill {ESTADO_LABEL[prebill.status]?.toLowerCase()}{prebill.invoice_number ? ` (factura ${prebill.invoice_number})` : ''}: solo se consulta. {edicion?.motivo || 'La factura ya no se puede modificar.'}</span>
                </div>
              )}
              {prebill.status === 'autorizada' && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 flex items-start gap-2">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{bloqueos.length ? 'Autorizada, pero la vista previa tiene bloqueos: resuélvelos para poder facturar.' : 'Autorizada: lista para facturar. "Facturar en Books" crea la factura como borrador.'} Todavía se pueden cambiar líneas, idioma y tipo de cambio.</span>
                </div>
              )}

              {/* Totales */}
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                {[
                  ['Honorarios por hora', t.subtotalHonorariosHoras], ['Honorarios fijos', t.subtotalHonorariosFijos], ['Descuento', t.descuento ? -t.descuento : 0],
                  ['Ajuste', t.ajuste], ['Gastos', t.subtotalGastos], ['Total antes de IVA', t.total],
                ].map(([label, value], i) => (
                  <div key={label as string} className={cn('rounded-xl border p-3', i === 5 ? 'border-theme-from bg-theme-light/50' : 'border-slate-200 bg-white')}>
                    <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{label}</p>
                    <p className={cn('text-lg font-bold', i === 5 ? 'text-theme-text' : 'text-slate-800')}>{formatMoney(value as number)}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
                {/* ── Líneas ─────────────────────────────────────────────── */}
                <div className={cn(cardCls, 'xl:col-span-2 min-w-0')}>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2"><ReceiptText className={sectionIconCls} /><span className={sectionTitleCls}>Líneas ({lineas.length})</span></div>
                    <div className="flex items-center gap-2">
                      {puedeEditar && !agregando && <Button variant="outline" size="sm" onClick={() => void openAgregar()} className="h-8 gap-1.5"><Plus className="w-3.5 h-3.5" />Agregar</Button>}
                      <button type="button" onClick={() => void load()} disabled={loading} aria-label="Actualizar" className="w-8 h-8 rounded-full border border-slate-200 bg-white flex items-center justify-center hover:bg-slate-50 disabled:opacity-50">
                        <RefreshCw className={cn('w-3.5 h-3.5 text-slate-500', loading && 'animate-spin')} />
                      </button>
                    </div>
                  </div>

                  {agregando && (
                    <div className="mb-4 border border-theme-border bg-theme-light/20 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-theme-text">Disponible para agregar (liberado, del mismo cliente y moneda)</p>
                        <button type="button" onClick={() => setAgregando(false)} aria-label="Cerrar" className="p-1 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                      </div>
                      {disp.loading ? <p className="text-xs text-slate-500">Cargando…</p> : disp.error ? <p role="alert" className="text-xs text-red-700">{disp.error}</p> : !disp.rows.length ? (
                        <p className="text-xs text-slate-500">No hay nada más liberado para este cliente en {m}.</p>
                      ) : (
                        <>
                          <ul className="divide-y divide-slate-100 bg-white border border-slate-100 rounded-lg max-h-72 overflow-y-auto">
                            {disp.rows.map(r => (
                              <li key={r.key}>
                                <label className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50">
                                  <Checkbox checked={marcadas.has(r.key)} onCheckedChange={() => setMarcadas(s => { const n = new Set(s); if (n.has(r.key)) n.delete(r.key); else n.add(r.key); return n })} />
                                  <span className="text-[11px] font-semibold text-slate-400 w-16 shrink-0 uppercase">{r.kind === 'cargo' ? 'Fijo' : r.kind}</span>
                                  <span className="text-xs text-slate-500 w-24 shrink-0">{formatFecha(r.fecha)}</span>
                                  <span className="min-w-0 flex-1 text-sm text-slate-800 truncate">{r.titulo}{r.horas != null ? ` · ${r.horas} h` : ''} <span className="text-[11px] text-slate-500">{r.proyecto}</span></span>
                                  <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">{formatMoney(r.monto)}</span>
                                </label>
                              </li>
                            ))}
                          </ul>
                          <div className="mt-2 flex justify-end">
                            <Button size="sm" onClick={() => void agregar()} disabled={!marcadas.size || saving} className={cn('h-8 border-0 disabled:opacity-50', gradientBtnCls)}>Agregar {marcadas.size || ''}</Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {!lineas.length ? <p className="text-sm text-slate-500">La Prebill no tiene líneas. Agrega lo liberado del cliente.</p> : KINDS.map(kind => {
                    const rows = lineas.filter(l => l.kind === kind)
                    if (!rows.length) return null
                    return (
                      <div key={kind} className="mb-4 last:mb-0">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{KIND_PLURAL[kind]} ({rows.length})</p>
                        <ul className="divide-y divide-slate-50 border border-slate-100 rounded-lg">
                          {rows.map(l => (
                            <li key={l.key} className="flex items-center gap-3 px-3 py-2">
                              <span className="text-xs text-slate-500 w-24 shrink-0">{formatFecha(l.fecha)}</span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm text-slate-800 truncate">{l.titulo}{l.horas != null ? ` · ${l.horas} h` : ''}</span>
                                <span className="block text-[11px] text-slate-500 truncate">{[l.proyecto, l.detalle].filter(Boolean).join(' · ')}</span>
                              </span>
                              <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">{formatMoney(l.monto)}</span>
                              {puedeEditar && <button type="button" aria-label="Quitar de la Prebill" onClick={() => quitar(l)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><X className="w-3.5 h-3.5" /></button>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )
                  })}
                </div>

                {/* ── Columna derecha ───────────────────────────────────── */}
                <div className="space-y-4 min-w-0">
                  <div className={cardCls}>
                    <div className="flex items-center gap-2 mb-3"><BadgePercent className={sectionIconCls} /><span className={sectionTitleCls}>Descuento y ajuste</span></div>
                    {([['Descuento', desc, setDesc], ['Ajuste', ajus, setAjus]] as const).map(([label, val, set]) => (
                      <div key={label} className="mb-3">
                        <Label className={labelCls}>{label}</Label>
                        <div className="mt-1 flex gap-2">
                          <Select value={val.tipo || 'ninguno'} onValueChange={v => set({ tipo: v === 'ninguno' ? '' : v as Tipo, valor: v === 'ninguno' ? '' : val.valor })} disabled={!enBorrador}>
                            <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="ninguno">Ninguno</SelectItem><SelectItem value="monto">Monto ({m})</SelectItem><SelectItem value="porcentaje">Porcentaje</SelectItem></SelectContent>
                          </Select>
                          <Input inputMode="decimal" value={val.valor} onChange={e => set({ ...val, valor: e.target.value })} disabled={!enBorrador || !val.tipo} placeholder={val.tipo === 'porcentaje' ? '%' : '0.00'} className={inputCls} />
                        </div>
                      </div>
                    ))}
                    {enBorrador
                      ? <Button size="sm" onClick={() => void guardarAjustes()} disabled={!ajusteDirty || saving} className={cn('h-8 w-full border-0 disabled:opacity-50', gradientBtnCls)}>Guardar descuento y ajuste</Button>
                      : <p className="text-[11px] text-slate-500">Solo se cambia en Borrador.</p>}
                    <p className="mt-2 text-[11px] text-slate-500">Solo sobre honorarios (por hora y fijos), nunca sobre gastos.</p>
                  </div>

                  <div className={cardCls}>
                    <div className="flex items-center gap-2 mb-3"><Languages className={sectionIconCls} /><span className={sectionTitleCls}>Factura</span></div>
                    <Label className={labelCls}>Idioma</Label>
                    <Select value={prebill.idioma || 'cliente'} onValueChange={v => void cambiarIdioma(v)} disabled={!puedeEditar || saving}>
                      <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cliente">El del cliente{vista.data && !prebill.idioma ? ` (${vista.data.idioma === 'en' ? 'inglés' : 'español'})` : ''}</SelectItem>
                        <SelectItem value="es">Español</SelectItem><SelectItem value="en">Inglés</SelectItem>
                      </SelectContent>
                    </Select>
                    {m !== 'MXN' && (
                      <div className="mt-3">
                        <Label className={labelCls}>Tipo de cambio ({m} → MXN)</Label>
                        <div className="mt-1 flex gap-2">
                          <Input inputMode="decimal" value={tc} onChange={e => setTc(e.target.value)} disabled={!puedeEditar} placeholder="FIX de Banxico al facturar" className={inputCls} />
                          {puedeEditar && <Button size="sm" variant="outline" className="h-9" disabled={saving || tc.trim() === (prebill.tipo_cambio ? String(prebill.tipo_cambio) : '')} onClick={() => void guardarTc()}>Guardar</Button>}
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">Vacío = el FIX de Banxico del día en que se facture.</p>
                      </div>
                    )}
                  </div>

                  {prebill.responsables && (
                    <div className={cardCls}>
                      <div className="flex items-center gap-2 mb-3"><UserCheck className={sectionIconCls} /><span className={sectionTitleCls}>Responsables</span></div>
                      {(['facturacion', 'cobranza'] as const).map(rol => (
                        <p key={rol} className="text-sm"><span className="text-slate-500">{rol === 'facturacion' ? 'Facturación' : 'Cobranza'}: </span><b className="text-slate-800">{prebill.responsables![rol].texto}</b>
                          {prebill.responsables![rol].fuente && <span className="text-[11px] text-slate-400"> · {FUENTE[prebill.responsables![rol].fuente!] || prebill.responsables![rol].fuente}</span>}</p>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Vista previa de la factura ──────────────────────────── */}
              <div className={cardCls}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2"><ReceiptText className={sectionIconCls} /><span className={sectionTitleCls}>Vista previa de la factura</span></div>
                  {vista.data && <span className="text-[11px] text-slate-500">Formato {vista.data.modo_factura} · {vista.data.idioma === 'en' ? 'inglés' : 'español'}{vista.data.tipo_cambio ? ` · TC ${vista.data.tipo_cambio}` : ''} · así se manda a Books al facturar</span>}
                </div>
                {vista.error ? <p role="alert" className="text-xs text-red-700">{vista.error}</p> : !vista.data ? <p className="text-xs text-slate-500">Cargando…</p> : (
                  <>
                    {vista.data.bloqueantes.map(b => <p key={b} className="mb-2 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg p-2 flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />Bloquea la factura: {b}</p>)}
                    {vista.data.avisos.map(a => <p key={a} className="mb-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 flex gap-1.5"><Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />{a}</p>)}
                    <div className="overflow-x-auto -mx-4 px-4">
                      <table className="w-full text-sm min-w-[640px]">
                        <thead className="text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-100">
                          <tr><th className="text-left py-2 font-semibold">Concepto</th><th className="text-left py-2 font-semibold">Descripción</th><th className="text-left py-2 font-semibold">IVA</th>
                            <th className="text-right py-2 font-semibold">Subtotal</th><th className="text-right py-2 font-semibold">Descuento</th><th className="text-right py-2 font-semibold">Importe</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {vista.data.lineas.map((l, i) => (
                            <tr key={i}>
                              <td className="py-2 text-slate-800 font-medium whitespace-nowrap">{l.nombre}</td>
                              <td className="py-2 text-slate-500 text-xs max-w-[360px]">{l.description}</td>
                              <td className="py-2 text-slate-500 text-xs whitespace-nowrap">{l.iva}</td>
                              <td className="py-2 text-right text-slate-600 whitespace-nowrap">{formatMoney(l.subtotal + (l.ajuste || 0))}</td>
                              <td className="py-2 text-right text-slate-600 whitespace-nowrap">{l.descuento ? `−${formatMoney(l.descuento)}` : '—'}</td>
                              <td className="py-2 text-right font-semibold text-slate-800 whitespace-nowrap">{formatMoney(l.importe)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot><tr className="border-t border-slate-200"><td colSpan={5} className="py-2 text-right text-xs font-semibold text-slate-500 uppercase">Total antes de impuestos</td><td className="py-2 text-right font-bold text-theme-text whitespace-nowrap">{formatMoney(vista.data.total_antes_de_impuestos, vista.data.moneda)}</td></tr></tfoot>
                      </table>
                    </div>
                  </>
                )}
              </div>

              {/* ── Movimientos ─────────────────────────────────────────── */}
              {!!movs.length && (
                <div className={cardCls}>
                  <div className="flex items-center gap-2 mb-3"><History className={sectionIconCls} /><span className={sectionTitleCls}>Movimientos de líneas</span></div>
                  <ul className="space-y-1 text-xs text-slate-600">
                    {[...movs].sort((a, b) => b.fecha.localeCompare(a.fecha)).map(mv => (
                      <li key={mv.id} className="flex flex-wrap gap-x-2">
                        <span className="text-slate-400 w-28">{formatFecha(mv.fecha)}</span>
                        <span className={mv.accion === 'agregar' ? 'text-emerald-700' : 'text-red-700'}>{mv.accion === 'agregar' ? 'Agregó' : 'Quitó'}</span>
                        <span>{MOV_TIPO[mv.tipo] || mv.tipo} #{mv.registro_id}</span>
                        <span className="font-semibold">{formatMoney(mv.importe, mv.moneda)}</span>
                        <span className="text-slate-400">· {mv.origen}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="flex items-start gap-2 text-[11px] text-slate-500 px-1"><Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />Facturar crea la factura en Books como borrador; deshacer la borra mientras siga en borrador. Enviarla, cobrarla o anularla se hace en Books.</p>
            </div>
          )}
        </div>
      </Card>

      <StatusModal
        isOpen={statusModal.isOpen}
        onClose={statusModal.type === 'error' && (!organizationId || !prebillId) ? undefined : () => setStatusModal(prev => ({ ...prev, isOpen: false }))}
        type={statusModal.type} title={statusModal.title} message={statusModal.message}
      />
    </div>
  )
}

export default App
