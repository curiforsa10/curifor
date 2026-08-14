/* Tablero del Planificador — portado desde app.py (Streamlit).
 *
 * Es el mismo codigo que corria en produccion: 214 funciones y 18 vistas ya
 * probadas, incluidas las guardias de integridad del incidente del 05/08/2026.
 * Se porta tal cual A PROPOSITO — reescribirlo en React de una sola vez es
 * donde se pierden esas guardias. La refactorizacion va despues, por vista.
 *
 * Lo unico que cambio: las constantes ya no se interpolan desde Python, se leen
 * de window.__PLANIF__, que inyecta el Server Component.
 *
 * GITHUB_TOKEN y API_BASE quedan vacios: el camino GitHub esta muerto (la app
 * ya no usa Streamlit ni la Contents API). Se conservan porque el codigo de
 * abajo los consulta en varios puntos, y con USA_SB en true nunca se toman esas
 * ramas. Se limpian cuando se refactorice cada vista.
 */
const _P = window.__PLANIF__ || {};

const GITHUB_TOKEN  = "";
const API_BASE      = "";
const SB_URL        = _P.sbUrl || "";
const SB_ANON       = _P.sbAnon || "";
const VALE          = _P.vale || "";
const USA_SB        = !!(SB_URL && SB_ANON && VALE);
const SUCURSAL      = _P.sucursal || "";
const CTRL_FILE     = _P.ctrlFile || "";
const USUARIO       = _P.usuario || "";
const PUEDE_EDITAR  = !!_P.puedeEditar;
const PUEDE_CONFIRMAR_CITAS = !!_P.puedeConfirmarCitas;
const PUEDE_DISPONIBILIDAD = !!_P.puedeDisponibilidad;
const PUEDE_PREPICK = !!_P.puedePrepicking;
const LOGO_URI      = _P.logoUri || "";
const _AGENDA_INIT  = _P.agenda || {};
const _CTRL_INIT    = _P.ctrl || {};
const _CTRL_SHA     = _P.ctrlSello || "";
const _PP_INIT      = _P.prepicking || {};
const _PP_SHA       = _P.ppSello || "";
const _PROD_INIT    = _P.produccion || {};
const _COTIZ_GZ     = _P.cotizadorGz || "";
const _STOCK_GZ     = _P.stockGz || "";
const VCU_IMG_P1    = _P.vcuP1 || "";
const VCU_IMG_P2    = _P.vcuP2 || "";

// Bundle del Cotizador de Mantenciones (indice/stock/pautas), descomprimido en el
// navegador desde _COTIZ_GZ (gzip+base64, mismo mecanismo que el modulo standalone
// "Cotizador de Mantenciones"). Se usa en Pre-picking para sacar repuestos+stock
// directamente de las pautas del cotizador en vez del pipeline viejo del
// consolidador (pauta_repuestos.json + Stock Repestos Costo.xlsx). 22/07/2026.
let COTIZ_PP = null;
(async function(){
  if(!_COTIZ_GZ) return;
  try{
    if(typeof DecompressionStream==='undefined') return;
    const bin=Uint8Array.from(atob(_COTIZ_GZ), c=>c.charCodeAt(0));
    const ds=new DecompressionStream('gzip');
    const stream=new Blob([bin]).stream().pipeThrough(ds);
    const buf=await new Response(stream).arrayBuffer();
    const pkg=JSON.parse(new TextDecoder().decode(buf));
    COTIZ_PP={indice:pkg.indice, stock:pkg.stock, pautas:pkg.pautas};
    if(typeof renderPrepickingView==='function' && document.getElementById('ppCards')) renderPrepickingView();
  }catch(e){ console.warn('No se pudo cargar el bundle del Cotizador para Pre-picking', e); }
})();

// Catalogo COMPLETO de Stock de Repuestos (stock_repuestos.json, ~33.000
// filas producto+bodega), descomprimido en el navegador desde _STOCK_GZ y
// agrupado por codigo normalizado -> {descripcion, bodegas:[{n,q}]}. Se usa
// SOLO para ampliar las alternativas "tambien sirve" de Pre-picking (busqueda
// de codigo relacionado contra todo el catalogo real, no solo los ~400
// codigos acotados del bundle del Cotizador) y como respaldo de stock si un
// codigo de la pauta no esta en ese bundle chico. 22/07/2026.
let STOCK_FULL = null;
(async function(){
  try{
    if(typeof DecompressionStream==='undefined') return;
    // El catalogo ya no viaja dentro del HTML: en Streamlit se inyectaban 9 MB
    // de JSON en la pagina aunque nadie abriera Pre-picking. Ahora se pide a
    // /api/stock, que lo manda comprimido (~0,69 MB) con el mismo formato, asi
    // que el descompresor de abajo queda igual. Sin permiso de Pre-picking la
    // ruta responde 403 y el catalogo simplemente no se carga.
    let gzB64 = _STOCK_GZ;
    if(!gzB64){
      if(!PUEDE_PREPICK) return;
      const r = await fetch('/api/stock');
      if(!r.ok) return;
      const j = await r.json();
      if(!j || !j.ok || !j.gz) return;
      gzB64 = j.gz;
    }
    const bin=Uint8Array.from(atob(gzB64), c=>c.charCodeAt(0));
    const ds=new DecompressionStream('gzip');
    const stream=new Blob([bin]).stream().pipeThrough(ds);
    const buf=await new Response(stream).arrayBuffer();
    const productos=JSON.parse(new TextDecoder().decode(buf));
    const idx={};
    for(const p of productos){
      // OJO: el codigo crudo de Stock Repestos Costo.xlsx trae un prefijo
      // numerico de familia pegado con espacio (ej. "13 XO5W30Q1SP") — hay
      // que quitarlo (_cotizCodBase) ANTES de normalizar, si no el prefijo
      // queda pegado al codigo real y nunca calza con el codigo limpio que
      // trae la pauta del Cotizador (ej. "XO5W30Q1SP"). 22/07/2026.
      const cod=_cotizCodBase(p.p);
      if(!cod) continue;
      if(!idx[cod]) idx[cod]={descripcion:p.d||'', bodegas:[]};
      idx[cod].bodegas.push({n:p.b||'', q:Number(p.s)||0});
    }
    STOCK_FULL=idx;
    if(typeof renderPrepickingView==='function' && document.getElementById('ppCards')) renderPrepickingView();
  }catch(e){ console.warn('No se pudo cargar el catalogo completo de Stock para Pre-picking', e); }
})();

const START=8*60+30,STEP=30,COLW=56;
const ETAPAS=[
  {id:"recepcion",      t:"1 · Recepcion",       color:"#1b6ec2", bg:"#eaf3fc"},
  {id:"ingreso_taller", t:"2 · Ingreso Taller",  color:"#c87900", bg:"#fff3e0"},
  {id:"en_proceso",     t:"3 · En Proceso",      color:"#147a3d", bg:"#eafaf0"},
  {id:"en_prueba",      t:"4 · En Prueba",       color:"#6c4fc4", bg:"#f2eefc"},
  {id:"lavado",         t:"5 · Lavado",          color:"#0077b6", bg:"#e8f4fb"},
  {id:"entrega",        t:"6 · Entrega",         color:"#0d5c2e", bg:"#e3f6ea"},
];
const etapaInfo=id=>ETAPAS.find(e=>e.id===id)||{color:"#999",bg:"#fff"};
const STOPS=[
  {id:"decision", t:"Esperando diagnostico"},
  {id:"aprob",    t:"Esperando aprobacion"},
  {id:"repuestos",t:"Esperando repuestos"},
  {id:"terceros", t:"Terceros (sublet)"},
];
// Estado de Campaña (garantia/recall) — 14/07/2026, a pedido de Cristobal. Los 3
// estados de "salida" (Quiebre Stock/Cliente desiste/Falla servidor) sacan la orden
// del tablero JPCB (sigue visible en Control de Taller/Vehiculos en Taller); "Realizada"
// no la oculta, solo la marca.
const ESTADOS_CAMPANA=[
  {id:"realizada",       t:"Realizada"},
  {id:"quiebre_stock",   t:"Quiebre Stock"},
  {id:"cliente_desiste", t:"Cliente desiste"},
  {id:"falla_servidor",  t:"Falla servidor"},
];
const _ESTADOS_CAMPANA_OCULTAN_JPCB=["quiebre_stock","cliente_desiste","falla_servidor"];
// Responsable de cada tramo del JPCB (14/07/2026, a pedido de Cristobal) — solo es una
// fila de titulos informativos sobre el tablero, no cambia ninguna logica de datos.
// "_no_asiste_" es un id ficticio para la columna No asiste (no es una Etapa real).
// "_citas_" (23/07/2026) es otro id ficticio para la columna nueva "Citas <fecha>" —
// las citas de la Agenda aterrizan ahi primero (sin confirmar) antes de pasar a
// Recepcion; confirmar asistencia es tarea del Asesor, igual que No Asiste.
const GRUPOS_RESPONSABLE=[
  {label:"Asesor",        ids:["_citas_","_no_asiste_"]},
  {label:"Torre Control",  ids:["recepcion","ingreso_taller"]},
  {label:"Tecnico",        ids:["en_proceso","en_prueba","lavado"]},
  {label:"Asesor",        ids:["entrega"]},
];
const IDX_EN_PROCESO=ETAPAS.findIndex(e=>e.id==='en_proceso');

// =============================================================
// VCU — Hoja Multipuntos Ford: imagenes reales del documento oficial (15/07/2026).
// A pedido explicito de Cristobal, el formulario NO es una recreacion en HTML: se
// dibujan los campos ENCIMA de la imagen escaneada real de las 2 paginas del PDF que
// exige la marca. Las imagenes se hospedan en GitHub (vcu_ford_p1.jpg/p2.jpg).


// =============================================================
// VCU — Hoja Multipuntos Ford (14/07/2026, a pedido de Cristobal)
// Solo aplica a vehiculos Ford. Obligatorio completar antes de avanzar
// el JPCB mas alla de la etapa "3 - En Proceso". Datos guardados en
// ctrlData[SUCURSAL].vcu[ordenId] = {datos, completo, tecnico, fecha}.
// =============================================================
const VCU_SCHEMA=[
  {section:"Datos del Vehiculo", fields:[
    {id:"fecha",   label:"Fecha",        type:"date", req:true},
    {id:"or",      label:"N° OR",        type:"text", req:true},
    {id:"linea",   label:"Linea",        type:"text", req:false},
    {id:"modelo",  label:"Modelo",       type:"text", req:true},
    {id:"vin",     label:"N° de Serie / VIN", type:"text", req:true},
  ]},
  {section:"Niveles de Fluidos (Asesor)", fields:[
    {id:"fl_fugas",        label:"Fugas visibles",                       type:"sino", req:true},
    {id:"fl_aceite_motor", label:"Aceite Motor",                          type:"sino", req:true},
    {id:"fl_fluido_freno", label:"Fluido de Freno",                       type:"sino", req:true},
    {id:"fl_embrague",     label:"Revision Embrague",                     type:"sino", req:true},
    {id:"fl_dir_hid",      label:"Direccion Hidraulica",                  type:"sino", req:true},
    {id:"fl_limpiaparab",  label:"Nivel Deposito Limpiaparabrisas",       type:"sino", req:true},
    {id:"fl_lineas_comb",  label:"Revision lineas de Combustible",        type:"sino", req:true},
    {id:"fl_transmision",  label:"Transmision",                           type:"sino", req:true},
    {id:"fl_refrigerante", label:"Deposito recuperacion Refrigerante",    type:"sino", req:true},
    {id:"fl_diferencial",  label:"Revision Fugas Diferencial",            type:"sino", req:true},
  ]},
  {section:"Plumillas / Luces / Cristales (Asesor)", fields:[
    {id:"plumillas",       label:"Plumillas",                              type:"sino", req:true},
    {id:"luces",           label:"Luces",                                  type:"sino", req:true},
    {id:"parabrisas",      label:"Parabrisas",                             type:"sino", req:true},
    {id:"cristales",       label:"Cristales",                              type:"sino", req:true},
  ]},
  {section:"Bateria (Asesor)", fields:[
    {id:"bat_estado",      label:"Estado de la Bateria",                   type:"semaforo", req:true},
    {id:"bat_nivel_carga", label:"Nivel de carga de Bateria",              type:"trislider", req:false},
    {id:"bat_cca_real",    label:"CCA real",                               type:"text", req:true},
    {id:"bat_cca_fabrica", label:"CCA de fabrica",                         type:"text", req:true},
    {id:"bat_recuperacion",label:"Recuperacion",                           type:"sino", req:false},
  ]},
  {section:"Codigos de Falla (Asesor)", fields:[
    {id:"cod_verificacion",label:"Verificacion de Codigos",  type:"radio", req:true,
      opts:[["ok","Sin codigos"],["pendiente","Con codigos pendientes"]]},
    {id:"cod_relenti",     label:"Funcionamiento de motor en relenti", type:"radio", req:true,
      opts:[["normal","Normal"],["anormal","Anormal"]]},
  ]},
  {section:"Correas / Mangueras (Tecnico)", fields:[
    {id:"correa_accesorios", label:"Correa de accesorios",   type:"semaforo", req:true},
    {id:"mangueras_motor",   label:"Mangueras de motor",     type:"semaforo", req:true},
    {id:"mangueras_refrig",  label:"Mangueras de refrigeracion", type:"semaforo", req:true},
  ]},
  {section:"Sistema de Frenos (Tecnico)", fields:[
    {id:"frenos_sistema",    label:"Sistema de frenos completo", type:"semaforo", req:true},
  ]},
  {section:"Direccion / Suspension (Tecnico)", fields:[
    {id:"direccion",         label:"Sistema de direccion",   type:"semaforo", req:true},
    {id:"suspension",        label:"Sistema de suspension",  type:"semaforo", req:true},
  ]},
  {section:"Sistema de Escape (Tecnico)", fields:[
    {id:"escape",            label:"Sistema de escape",      type:"semaforo", req:true},
  ]},
  {section:"Tren Motriz (Tecnico)", fields:[
    {id:"tren_motriz_del",   label:"Tren motriz delantero",  type:"semaforo", req:true},
    {id:"tren_motriz_tra",   label:"Tren motriz trasero",    type:"semaforo", req:true},
  ]},
  {section:"Aire Acondicionado (Tecnico)", fields:[
    {id:"ac_funcionamiento", label:"Funcionamiento A/C",     type:"semaforo", req:true},
    {id:"ac_filtro_cabina",  label:"Filtro de cabina",       type:"semaforo", req:true},
  ]},
  {section:"Filtros (Tecnico)", fields:[
    {id:"filtro_aire",       label:"Filtro de aire",         type:"semaforo", req:true},
    {id:"filtro_combustible",label:"Filtro de combustible",  type:"semaforo", req:true},
  ]},
  {section:"Parte Inferior del Vehiculo (Tecnico)", fields:[
    {id:"parte_inferior_obs",label:"Observaciones parte inferior", type:"textarea", req:false},
  ]},
  {section:"Neumatico Delantero Izquierdo", fields:[
    {id:"ndi_labrado",   label:"Profundidad de labrado (mm)",  type:"semaforo_num", req:true},
    {id:"ndi_desgaste",  label:"Patron de desgaste / dano",    type:"text", req:true},
    {id:"ndi_presion",   label:"Presion de inflado (PSI)",     type:"text", req:true},
    {id:"ndi_pastillas", label:"Espesor de Pastillas (mm)",    type:"semaforo_num", req:true},
    {id:"ndi_disco",     label:"Espesor de Disco (mm)",        type:"semaforo_num", req:true},
  ]},
  {section:"Neumatico Delantero Derecho", fields:[
    {id:"ndd_labrado",   label:"Profundidad de labrado (mm)",  type:"semaforo_num", req:true},
    {id:"ndd_desgaste",  label:"Patron de desgaste / dano",    type:"text", req:true},
    {id:"ndd_presion",   label:"Presion de inflado (PSI)",     type:"text", req:true},
    {id:"ndd_pastillas", label:"Espesor de Pastillas (mm)",    type:"semaforo_num", req:true},
    {id:"ndd_disco",     label:"Espesor de Disco (mm)",        type:"semaforo_num", req:true},
  ]},
  {section:"Neumatico Trasero Izquierdo", fields:[
    {id:"nti_labrado",   label:"Profundidad de labrado (mm)",  type:"semaforo_num", req:true},
    {id:"nti_desgaste",  label:"Patron de desgaste / dano",    type:"text", req:true},
    {id:"nti_presion",   label:"Presion de inflado (PSI)",     type:"text", req:true},
    {id:"nti_pastillas", label:"Espesor de Pastillas (mm)",    type:"semaforo_num", req:true},
    {id:"nti_tambor",    label:"Diametro del tambor (mm)",     type:"semaforo_num", req:false},
  ]},
  {section:"Neumatico Trasero Derecho", fields:[
    {id:"ntd_labrado",   label:"Profundidad de labrado (mm)",  type:"semaforo_num", req:true},
    {id:"ntd_desgaste",  label:"Patron de desgaste / dano",    type:"text", req:true},
    {id:"ntd_presion",   label:"Presion de inflado (PSI)",     type:"text", req:true},
    {id:"ntd_pastillas", label:"Espesor de Pastillas (mm)",    type:"semaforo_num", req:true},
    {id:"ntd_tambor",    label:"Diametro del tambor (mm)",     type:"semaforo_num", req:false},
  ]},
  {section:"Neumatico de Repuesto", fields:[
    {id:"nrep_presion",  label:"Presion de inflado (PSI)",     type:"text", req:true},
  ]},
  {section:"Mantencion / Comentarios", fields:[
    {id:"reinicio_aceite", label:"Reinicio indicador de cambio de Aceite", type:"check", req:false},
    {id:"comentarios",     label:"Comentarios",                 type:"textarea", req:false},
  ]},
  {section:"Diagnostico", fields:[
    {id:"diag_sintoma",     label:"Sintoma",      type:"textarea", req:false},
    {id:"diag_componente",  label:"Componente",   type:"textarea", req:false},
    {id:"diag_causa_raiz",  label:"Causa Raiz",   type:"textarea", req:false},
  ]},
  {section:"Firmas", fields:[
    {id:"nombre_asesor",   label:"Nombre del Asesor",  type:"text", req:true},
    {id:"nombre_tecnico",  label:"Nombre del Tecnico", type:"text", req:true},
  ]},
];

function esFord(o){return marcaDeOrden(o).toUpperCase()==='FORD';}

function _vcuMap(){
  if(!ctrlData[SUCURSAL])ctrlData[SUCURSAL]={};
  if(!ctrlData[SUCURSAL].vcu)ctrlData[SUCURSAL].vcu={};
  return ctrlData[SUCURSAL].vcu;
}
function vcuEstado(o){return _vcuMap()[o.id]||null;}
function vcuDatos(o){const e=vcuEstado(o);return(e&&e.datos)||{};}
function vcuCompleto(o){const e=vcuEstado(o);return!!(e&&e.completo);}

function _vcuCamposRequeridos(){
  const out=[];
  VCU_SCHEMA.forEach(sec=>sec.fields.forEach(f=>{if(f.req)out.push(f);}));
  return out;
}
function vcuFaltantes(datos){
  return _vcuCamposRequeridos().filter(f=>{
    const v=datos[f.id];
    if(v===undefined||v===null||String(v).trim()==='')return true;
    if(f.type==='semaforo_num'){
      const vn=datos[f.id+'_valor'];
      if(vn===undefined||vn===null||String(vn).trim()==='')return true;
    }
    return false;
  });
}

// Antes bloqueaba el avance de etapa de una orden Ford mas alla de "En Proceso" si su
// VCU no estaba completo. A pedido de Cristobal (15/07/2026) se elimino esa restriccion:
// el VCU se sigue pidiendo/mostrando (badge, formulario, PDF), pero ya no impide mover
// la orden de etapa en el JPCB/Control de Taller/modal aunque falte completarlo.
function _avanceBloqueadoPorVCU(o,nuevaEtapaId){
  return false;
}

const TIPOS={
  recall:{color:"#ffcc99",border:"#d2691e",label:"Recall"},
  mant:{color:"#f8c6d6",border:"#e87aa0",label:"Mantencion"},
  rep: {color:"#bfe3b0",border:"#5aa84a",label:"Reparacion"},
  diag:{color:"#d2b3e8",border:"#9a5fc4",label:"Diagnostico"},
  ot:  {color:"#d9e1e7",border:"#7a8ba0",label:"Otro"},
};
const DIAS=['Dom','Lun','Mar','Mie','Jue','Vie','Sab'];
const MESES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

const hhmm=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
const parseHH=t=>{const[a,b]=(t||'00:00').split(':').map(Number);return a*60+b;};
const byId=id=>ordenes.find(o=>o.id===String(id));
const tipoInfo=o=>TIPOS[o.tipo||'ot']||TIPOS.ot;

function formatDate(d){return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();}
function parseDate(s){const p=s.split('/');return new Date(+p[2],+p[1]-1,+p[0]);}
function getEnd(dateStr){const dow=parseDate(dateStr).getDay();return(dow===1||dow===2)?18*60:17*60;}
function toast(msg,dur=2500){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),dur);}
function setSaveStatus(msg){const el=document.getElementById('saveStatus');el.textContent=msg;if(msg&&msg.startsWith('✅'))setTimeout(()=>el.textContent='',4000);}

let agendaData=null,ctrlData=null,ctrlSha=null;
let prodData=null,_prodTecSel=null;
let ppData=null,ppSha=null,ppSelectedDate='',ppOpenKey=null;
// Descuento del 10% aplicado (o no) al presupuesto de cada cita del Pre-picking —
// estado solo de la sesion actual (como ppOpenKey), no se guarda en GitHub: es una
// herramienta rapida para simular el presupuesto con descuento antes de exportarlo.
let ppDescuentos={};
let ordenes=[],tecnicos=[],asesoresSucursal=[];
let currentView='jpcb',selectedDate='',modalBloqueId=null;
let currentArea='st';
// Ultima version "sincronizada" de ordenes/bloques (id/fecha -> JSON), usada para
// mezclar los cambios propios con los de otros usuarios en vez de pisar todo el
// registro de la sucursal — ver _refrescarCtrlSha() (22/07/2026).
let _ordenesBaseline=new Map(), _bloquesBaseline=new Map();

/* ─── Area de trabajo: Servicio Tecnico vs Desabolladura y Pintura ───
   Se detecta automaticamente segun palabras clave en el texto que viaja desde
   la Agenda Curifor al campo Comentarios/Servicio de cada orden o cita — no hay
   que elegirlo a mano. Si no calza con ninguna palabra de DyP, se asume Servicio
   Tecnico (comportamiento por defecto, igual que antes de esta funcionalidad). */
function detectArea(text){
  const s=String(text||'').toUpperCase();
  if(/DESABOLL|PINTURA|\bCHAPA\b|\bDYP\b|D\s*&\s*P|LATONER/.test(s))return'dyp';
  return'st';
}
function ordenArea(o){return detectArea(o.comentarios||o.servicio||o.mantencion||'');}
function citaArea(c){return detectArea(c.servicio||c.mantencion||'');}
function setArea(area,btn){
  currentArea=area;
  document.querySelectorAll('.area-tab').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  renderJPCB();
  renderControlTaller();
  renderVehiculosTaller();
  renderHistorialTaller();
  if(currentView==='plan')renderPlanView();
}
const today_d=new Date();
const planDates=[0,1,2,3,4].map(i=>{const d=new Date(today_d);d.setDate(d.getDate()+i);return d;});

function switchView(v,btn){
  document.querySelectorAll('.sntab').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  document.getElementById('v-jpcb').style.display=v==='jpcb'?'block':'none';
  document.getElementById('v-plan').style.display=v==='plan'?'block':'none';
  document.getElementById('v-ct').style.display=v==='ct'?'block':'none';
  document.getElementById('v-vt').style.display=v==='vt'?'block':'none';
  document.getElementById('v-hist').style.display=v==='hist'?'block':'none';
  document.getElementById('v-prod').style.display=v==='prod'?'block':'none';
  const _vpp=document.getElementById('v-pp');
  if(_vpp)_vpp.style.display=v==='pp'?'block':'none';
  currentView=v;
  if(v==='plan')renderPlanView();
  if(v==='ct')renderControlTaller();
  if(v==='vt')renderVehiculosTaller();
  if(v==='hist')renderHistorialTaller();
  if(v==='prod')renderProduccion();
  if(v==='pp')renderPrepickingView();
}

/* Puntaje de "cuanto avance/datos tiene" una orden — usado por
   _dedupOrdenesPorPatenteOT para decidir cual de 2 duplicados exactos (misma
   patente+OT) conservar cuando aparecen ambos. Prioriza la que ya tiene trabajo
   real encima (tecnico asignado, etapa avanzada, cerrada, confirmada, comentarios,
   etc.) para no perder nada si alguien ya empezo a operar sobre una de las 2. */
function _ordenScore(o){
  let s=0;
  if(o.tecnico!==null&&o.tecnico!==undefined&&o.tecnico!=='')s+=2;
  if(o.etapa&&ETAPAS.length&&o.etapa!==ETAPAS[0].id)s+=3;
  if(o.cerrada)s+=3;
  if(o.estadoCita==='asiste')s+=2;
  if(o.estadoCita==='no_asiste'||o.estadoCita==='reagenda')s+=1;
  if(o.stop)s+=1;
  ['comentario2','numero_caso','n_pedido','eta','auto_reemplazo',
   'ingreso_taller','salida_taller','tecnico_x_hora'].forEach(f=>{
    if(String(o[f]||'').trim())s+=1;
  });
  return s;
}
/* Deduplica ordenes que comparten la MISMA patente y el MISMO Folio OT — nunca toca
   patentes con OTs distintas (una patente puede tener varias citas activas a la vez
   por diseno, ver autoImportarCitas). Un duplicado real de patente+OT solo puede pasar
   por una carrera: 2 sesiones/pestañas abriendo el Planificador casi al mismo tiempo,
   cada una creando su propia orden nueva para la misma cita porque todavia no veian la
   que la otra acababa de crear (autoImportarCitas compara solo contra lo que esa
   sesion tiene cargado localmente) — el merge por id de mas abajo no lo detectaba,
   asi que ambas quedaban guardadas para siempre. 29/07/2026, a pedido de Cristobal
   ("estaria bueno... siempre y cuando el numero de OT este duplicado"). Ordenes sin
   OT (altas manuales sin folio) nunca se tocan aqui — no hay forma confiable de saber
   si son la misma cita o 2 vehiculos distintos agregados a mano. */
function _dedupOrdenesPorPatenteOT(lista){
  const elegidas=new Map(); // patente|OT -> orden elegida
  const resultado=[];
  lista.forEach(o=>{
    const pat=normPat(o.patente);
    const ot=String(o.ot||'').trim();
    if(!pat||!ot){resultado.push(o);return;}
    const key=pat+'|'+ot;
    if(!elegidas.has(key)){
      elegidas.set(key,o);
      resultado.push(o);
    } else {
      const previa=elegidas.get(key);
      if(_ordenScore(o)>_ordenScore(previa)){
        const idx=resultado.indexOf(previa);
        if(idx>=0)resultado[idx]=o;
        elegidas.set(key,o);
      }
      // la orden descartada (duplicado real de patente+OT) se pierde a proposito
    }
  });
  return resultado;
}

/* Mezcla ordenes/bloques/no_show/vcu/asesores_extra de la sucursal actual entre lo que
   trae GitHub (fresco — puede incluir cambios de OTROS usuarios, ej. Torre Control
   asignando tecnico/horario a una orden) y lo que hay en memoria local (mis propios
   cambios sin guardar todavia). Antes de esto, saveCtrl() simplemente pisaba TODA la
   sucursal con la copia local — si dos personas editaban la misma sucursal a la vez,
   el ultimo en guardar borraba silenciosamente los cambios del otro sin ningun aviso.
   Ahora se compara cada registro contra su "ultima version sincronizada"
   (_ordenesBaseline/_bloquesBaseline, tomada la ultima vez que se cargo o se guardo):
   solo lo que YO modifique desde entonces se superpone sobre lo fresco — todo lo demas
   (incluyendo ordenes nuevas o editadas por otro usuario) se toma tal cual viene de
   GitHub. 22/07/2026, a pedido de Cristobal ("un torre control asigno un trabajo... yo
   no lo veo").

   04/08/2026 — FIX REAL del bug "cambios que se revierten solos" (reportado con video:
   un usuario marca 'Asiste'/mueve una tarjeta de etapa y el cambio desaparece poco
   despues, y "sigue ocurriendo" pese a 5 rondas previas de fixes de concurrencia).
   Las rondas anteriores (22/07 a 03/08) resolvian las carreras DENTRO de una misma
   sesion (encolar saveCtrl, refrescar el SHA antes de guardar) pero el merge seguia
   comparando el OBJETO COMPLETO de cada orden/bloque contra el baseline: si YO cambiaba
   CUALQUIER campo, mi copia local ENTERA (incluyendo campos que NO toque) reemplazaba
   lo que hubiera en el servidor — borrando en silencio cualquier campo que OTRO usuario
   hubiera cambiado en esa MISMA orden mientras mi pestaña seguia abierta. Ejemplo real:
   Torre Control asigna tecnico a las 09:00; un asesor tiene el JPCB abierto desde las
   08:00 y a las 09:05 marca "Asiste" en esa misma orden — su guardado trae su copia
   vieja de la orden (sin el tecnico que Torre Control acaba de asignar) y la pisa
   ENTERA, o viceversa (el guardado de Torre Control pisa el "Asiste" del asesor si sale
   despues). Con varias pestañas abiertas todo el dia (lo normal en un taller), esta
   colision es cuestion de tiempo — de ahi que "siguiera ocurriendo" pese a los fixes
   anteriores, que nunca atacaron esto. Ahora la mezcla es CAMPO A CAMPO (ver
   _mergeCampoACampo) para ordenes, y BLOQUE A BLOQUE por id (ver _mergeArrayPorId) para
   el grid Tecnico x Hora: un campo que YO no toque desde mi ultima sincronizacion
   siempre respeta lo que traiga el servidor (incluyendo cambios de otros), y solo los
   campos que SI cambie se superponen — sin arrastrar de paso el resto de la orden. */
function _mergeCampoACampo(fresco,local,baseline){
  const result={...(fresco||{})};
  const claves=new Set([...Object.keys(local||{}),...Object.keys(baseline||{})]);
  claves.forEach(k=>{
    const lv=local?local[k]:undefined, bv=baseline?baseline[k]:undefined;
    if(JSON.stringify(lv)!==JSON.stringify(bv))result[k]=lv; // yo cambie este campo -> mi valor gana
  });
  return result;
}
/* Mismo criterio que _mergeCampoACampo pero para un ARRAY de objetos con "id" (los
   bloques del grid Tecnico x Hora — varios por fecha). Antes se decidia por FECHA
   completa (si yo tocaba cualquier bloque de un dia, mi lista entera de ese dia pisaba
   la del servidor, perdiendo un bloque que otro usuario hubiera agregado/movido ese
   mismo dia) — ahora se decide bloque por bloque, por su id. */
function _mergeArrayPorId(freshArr,localArr,baselineArr){
  freshArr=Array.isArray(freshArr)?freshArr:[];
  localArr=Array.isArray(localArr)?localArr:[];
  baselineArr=Array.isArray(baselineArr)?baselineArr:[];
  const baseMap=new Map(baselineArr.map(x=>[String(x.id),JSON.stringify(x)]));
  const freshMap=new Map(freshArr.map(x=>[String(x.id),x]));
  const localMap=new Map(localArr.map(x=>[String(x.id),x]));
  const result=new Map(freshMap);
  localMap.forEach((val,id)=>{
    const baseStr=baseMap.get(id);
    if(baseStr===undefined||JSON.stringify(val)!==baseStr)result.set(id,val); // lo agregue/edite yo
  });
  baseMap.forEach((baseStr,id)=>{
    if(!localMap.has(id)){ // ya no esta en mi copia local -> lo elimine yo
      const freshVal=freshMap.get(id);
      // solo se respeta mi eliminacion si nadie mas lo cambio desde entonces; si el
      // servidor SI lo cambio, se respeta ese cambio ajeno (ya quedo en result via freshMap)
      if(freshVal!==undefined&&JSON.stringify(freshVal)===baseStr)result.delete(id);
    }
  });
  return [...result.values()];
}
function _mergeOrdenesYBloques(fresco){
  const frescoSuc=(fresco&&fresco[SUCURSAL])||{};
  if(!ctrlData[SUCURSAL])ctrlData[SUCURSAL]={};

  // --- ordenes: mezcla CAMPO A CAMPO por id (ver _mergeCampoACampo) ---
  const freshOrdenes=Array.isArray(frescoSuc.ordenes)?frescoSuc.ordenes:[];
  const mergedOrd=new Map(freshOrdenes.map(o=>[String(o.id),o]));
  ordenes.forEach(o=>{
    const id=String(o.id);
    const baseStr=_ordenesBaseline.get(id);
    if(baseStr===undefined){mergedOrd.set(id,o);return;} // orden creada localmente, aun no sincronizada
    let baseObj={};
    try{baseObj=JSON.parse(baseStr);}catch(e){}
    const freshObj=mergedOrd.get(id);
    if(freshObj===undefined){
      // el servidor ya no tiene esta orden (otro usuario la elimino). Si yo tampoco
      // cambie nada respecto al baseline, se respeta el borrado; si SI cambie algo, se
      // recrea con mi version para no perder mi trabajo.
      if(JSON.stringify(o)!==baseStr)mergedOrd.set(id,o);
      return;
    }
    mergedOrd.set(id,_mergeCampoACampo(freshObj,o,baseObj));
  });
  const idsActuales=new Set(ordenes.map(o=>String(o.id)));
  for(const id of _ordenesBaseline.keys()){
    if(!idsActuales.has(id))mergedOrd.delete(id); // eliminada localmente (eliminarOrdenCT)
  }
  // Limpia duplicados reales de patente+OT (misma cita creada 2 veces por una carrera
  // de autoImportarCitas entre sesiones concurrentes — ver _dedupOrdenesPorPatenteOT).
  // Corre en CADA merge, o sea en cada guardado (_saveCtrlInterno siempre arranca con
  // _refrescarCtrlSha) — asi cualquier duplicado que ya haya quedado guardado en
  // GitHub tambien se limpia solo apenas alguien vuelva a guardar algo.
  ordenes=_dedupOrdenesPorPatenteOT([...mergedOrd.values()]);

  // --- bloques (grid Tecnico x Hora): mezcla bloque a bloque, por id (ver _mergeArrayPorId) ---
  const freshBloques=frescoSuc.bloques||{};
  const localBloques=ctrlData[SUCURSAL].bloques||{};
  const fechasBloques=new Set([...Object.keys(freshBloques),...Object.keys(localBloques),..._bloquesBaseline.keys()]);
  const mergedBloq={};
  fechasBloques.forEach(fecha=>{
    const baseStr=_bloquesBaseline.get(fecha);
    let baseArr=[];
    if(baseStr){try{baseArr=JSON.parse(baseStr);}catch(e){}}
    mergedBloq[fecha]=_mergeArrayPorId(freshBloques[fecha],localBloques[fecha],baseArr);
  });
  ctrlData[SUCURSAL].bloques=mergedBloq;

  // --- no_show / vcu / eliminadas (mapas por clave) y asesores_extra (lista):
  // union simple, los cambios locales tienen prioridad sobre la MISMA clave, pero
  // no se pierden las claves que solo existan del lado fresco. ---
  ['no_show','vcu','eliminadas','no_disponible'].forEach(key=>{
    const freshMap=frescoSuc[key]||{};
    const localMap=ctrlData[SUCURSAL][key]||{};
    ctrlData[SUCURSAL][key]={...freshMap,...localMap};
  });
  if(frescoSuc.asesores_extra||ctrlData[SUCURSAL].asesores_extra){
    ctrlData[SUCURSAL].asesores_extra=[...new Set([...(frescoSuc.asesores_extra||[]),...(ctrlData[SUCURSAL].asesores_extra||[])])];
  }

  _snapshotOrdenes();_snapshotBloques();
}

/* --- Acceso a Supabase por VALE (reemplaza al GITHUB_TOKEN en el navegador).
   Quien valida es Postgres: el vale esta atado a un usuario y una sucursal,
   expira, y tablero_documento_permitido() limita a que documentos aplica. La
   anon key de aca abajo es publica por diseño y por si sola no permite nada. */
async function _sbRpc(fn,args){
  const r=await fetch(SB_URL+'/rest/v1/rpc/'+fn,{method:'POST',
    headers:{'apikey':SB_ANON,'Authorization':'Bearer '+SB_ANON,'Content-Type':'application/json'},
    body:JSON.stringify(args)});
  if(!r.ok)throw new Error('rpc '+fn+' HTTP '+r.status);
  return await r.json();
}
// {ok, data, sello, existe} — sin limite de tamaño y en una sola llamada.
async function _sbLeer(nombre){
  try{ return await _sbRpc('tablero_leer',{p_nombre:nombre,p_vale:VALE}); }
  catch(e){ return {ok:false,motivo:'red'}; }
}
// {ok, sello} o {ok:false, motivo}. motivo 'conflicto' => otro guardado gano;
// viene con el sello actual para reintentar sobre la version nueva.
async function _sbGuardar(nombre,data,sello){
  try{ return await _sbRpc('tablero_guardar',
        {p_nombre:nombre,p_vale:VALE,p_sello:sello||null,p_data:data}); }
  catch(e){ return {ok:false,motivo:'red'}; }
}

// Guardias de integridad + merge + repintado. Es identico venga el dato de
// Supabase o de GitHub, asi que vive aparte para no duplicarlo.
function _aplicarCtrlFresco(fresco){
  // Si el archivo existe pero NO se pudo leer, se aborta: guardar a ciegas es
  // exactamente lo que borro los datos el 05/08/2026.
  if(fresco===null||fresco===undefined){_ctrlLecturaOk=false;return false;}
  _ctrlLecturaOk=true;
  _ctrlSucursalesServidor=Object.keys(fresco).filter(k=>fresco[k]&&typeof fresco[k]==='object'&&!Array.isArray(fresco[k]));
  _ctrlOrdenesServidor=(((fresco[SUCURSAL]||{}).ordenes)||[]).length;
  _ctrlTecnicosServidor=((fresco[SUCURSAL]||{}).tecnicos)||[];
  if(!ctrlData)ctrlData={};
  for(const k of Object.keys(fresco)){
    if(k!==SUCURSAL)ctrlData[k]=fresco[k]; // otras sucursales: se toman tal cual (no las edita esta sesion)
  }
  _mergeOrdenesYBloques(fresco);
  // El merge puede traer cambios de otro usuario (ej. una orden nueva/editada por
  // Torre Control) — se refleja de inmediato en la pantalla, no solo cuando se
  // recarga la pagina.
  renderJPCB();renderControlTaller();renderVehiculosTaller();
  if(typeof renderHistorialTaller==='function')renderHistorialTaller();
  if(currentView==='plan')renderPlanView();
  return true;
}

async function _refrescarCtrlSha(){
  // Relee control_taller.json fresco (sello + datos actuales) y mezcla los
  // cambios (ver _mergeOrdenesYBloques) — asi no se pisan cambios guardados por otra
  // sesion (ej. Torre Control) mientras esta pestaña estaba abierta.
  try{
    if(USA_SB){
      // Una sola llamada. Sin el limite de 1 MB de la Contents API y sin el
      // rodeo por Git Data API que ese limite obligaba a hacer mas abajo.
      const rs=await _sbLeer(CTRL_FILE);
      if(!rs.ok)return false;
      if(!rs.existe){
        // Todavia no existe el documento de esta sucursal: es valido crearlo en
        // el primer guardado. Se limpian los guardias para que no comparen
        // contra valores de una lectura anterior.
        _ctrlLecturaOk=true;_ctrlSucursalesServidor=[];_ctrlOrdenesServidor=0;
        ctrlSha='';
        return true;
      }
      ctrlSha=rs.sello||ctrlSha;   // con Supabase, "sha" es el sello (timestamp)
      return _aplicarCtrlFresco(rs.data);
    }
    const r=await fetch(API_BASE+CTRL_FILE,{
      headers:{'Authorization':`token ${GITHUB_TOKEN}`,'Accept':'application/vnd.github.v3+json'}});
    if(r.status===404){
      // El archivo propio de esta sucursal todavia no existe (migracion
      // gradual del 10/08/2026): es valido crearlo en el primer guardado.
      // Se limpian los guardias para que no comparen contra los valores que
      // hayan quedado de una lectura anterior del archivo compartido.
      _ctrlLecturaOk=true;_ctrlSucursalesServidor=[];_ctrlOrdenesServidor=0;
      // El archivo no existe: la SHA que tuvieramos guardada ya no sirve. Si se
      // dejara puesta, el PUT pediria actualizar un archivo inexistente (422) y
      // la sucursal quedaria sin poder guardar hasta recargar la pagina.
      ctrlSha='';
      return true;
    }
    if(!r.ok)return false;
    const j=await r.json();
    ctrlSha=j.sha||ctrlSha;
    let fresco=null;
    if(j.content){
      try{fresco=JSON.parse(decodeURIComponent(escape(atob(j.content.replace(/\\n/g,'')))));}catch(e){fresco=null;}
    }else{
      // INCIDENTE 05/08/2026: la Contents API devuelve content vacio si el archivo
      // pesa mas de 1 MB. Antes esto dejaba fresco={} y el guardado subia SOLO la
      // sucursal actual, borrando las otras 10 y los 46 tecnicos. Ahora se lee el
      // blob por Git Data API, que no tiene limite de tamano.
      try{
        const rr=await fetch(API_BASE.replace('/contents/','/git/')+'ref/heads/main',{
          headers:{'Authorization':`token ${GITHUB_TOKEN}`,'Accept':'application/vnd.github.v3+json'}});
        const commitSha=(await rr.json()).object.sha;
        const rt=await fetch(API_BASE.replace('/contents/','/git/')+'trees/'+commitSha+'?recursive=1',{
          headers:{'Authorization':`token ${GITHUB_TOKEN}`,'Accept':'application/vnd.github.v3+json'}});
        const item=((await rt.json()).tree||[]).find(x=>x.path===CTRL_FILE);
        if(item){
          const rb=await fetch(API_BASE.replace('/contents/','/git/')+'blobs/'+item.sha,{
            headers:{'Authorization':`token ${GITHUB_TOKEN}`,'Accept':'application/vnd.github.v3+json'}});
          const jb=await rb.json();
          fresco=JSON.parse(decodeURIComponent(escape(atob((jb.content||'').replace(/\\n/g,'')))));
          ctrlSha=item.sha||ctrlSha;
        }
      }catch(e){fresco=null;}
    }
    return _aplicarCtrlFresco(fresco);
  }catch(e){return false;}
}

/* FIX CRITICO DE CONCURRENCIA (22/07/2026, ronda 2) — un cambio (mover etapa en el
   JPCB, eliminar una cita, marcar "no asiste", etc.) podia revertirse solo a los
   pocos segundos, y en cambios simultaneos "solo se aplicaba el de uno". Causa
   real: saveCtrl() se llamaba SIN esperar (fire-and-forget) desde el drag&drop y
   otros botones — si el usuario disparaba una segunda accion (otro drag, otro
   click) ANTES de que el primer guardado terminara su ciclo completo (fetch fresco
   -> merge -> re-snapshot del baseline -> PUT), el SEGUNDO guardado arrancaba su
   propio fetch mientras el PRIMERO ya habia avanzado el baseline (_ordenesBaseline)
   al mezclar. Como el baseline ya reflejaba el cambio local (puesto por el primer
   guardado), el merge del SEGUNDO guardado comparaba contra ESE baseline ya
   actualizado -> veia "sin diferencia respecto al baseline" -> tomaba tal cual la
   copia del servidor que su propio fetch (posiblemente aun sin la primera edicion
   ya subida) habia traido, revirtiendo el cambio en memoria Y subiendolo de vuelta
   a GitHub. Esto podia pasar con dos acciones seguidas de UNA misma persona, o con
   dos personas editando casi al mismo tiempo.
   Fix: encolar todas las llamadas a saveCtrl() en una cadena de promesas
   (_ctrlSaveChain) para que nunca haya dos ciclos fetch->merge->PUT corriendo en
   paralelo dentro de la misma pestaña — cada guardado espera a que el anterior
   termine por completo (incluyendo su propio reintento por SHA desactualizada)
   antes de empezar el suyo, asi el baseline siempre esta al dia cuando se compara. */
let _ctrlSaveChain=Promise.resolve();
/* Cuantos guardados hay encolados o corriendo AHORA MISMO en esta pestaña.
   Se incrementa de forma sincrona dentro de saveCtrl() — antes de que arranque
   ningun await — para que el refresco automatico del tablero
   (_pollCambiosTablero, 10/08/2026) sepa que hay trabajo en vuelo y deje pasar
   su turno. Sin esto, el poll llamaba a _refrescarCtrlSha() POR FUERA de la
   cadena y se metia justo en medio del ciclo fetch->merge->PUT de un guardado:
   como cada merge avanza el baseline (_snapshotOrdenes al final de
   _mergeOrdenesYBloques), el segundo merge veia "sin diferencia respecto al
   baseline", tomaba la copia del servidor (todavia sin el cambio, porque el PUT
   no habia llegado) y REVERTIA el cambio en memoria — y el guardado en curso
   subia esa version revertida. Es exactamente el bug del 22/07/2026 que se
   habia resuelto encolando los guardados. */
let _ctrlSavesPendientes=0;
/* Marca si la ultima relectura de control_taller.json fue exitosa. Si NO se pudo
   leer el archivo, no se guarda nada (ver el incidente del 05/08/2026 en
   _refrescarCtrlSha y en _cargar_ctrl_taller). */
let _ctrlLecturaOk=false;
/* Sucursales que el servidor tenia en la ultima lectura exitosa. Se usa como
   guardia antes del PUT: si a la copia local le falta alguna, no se sube. */
let _ctrlSucursalesServidor=[];
/* Cuantas ordenes tenia el servidor para ESTA sucursal en la ultima lectura.
   Guardia contra el caso del 05/08/2026 14:13: un guardado dejo LINDEROS con 1
   orden de 248, borrando 247 con sus tecnicos, etapas y bloques. */
let _ctrlOrdenesServidor=0;
/* Tecnicos que el servidor tenia para ESTA sucursal en la ultima lectura. Se usa
   como respaldo: los tecnicos se configuran en Admin, no en el Planificador, asi
   que una lista local vacia significa "no los cargue", nunca "borralos". */
let _ctrlTecnicosServidor=[];
function saveCtrl(){
  _ctrlSavesPendientes++;
  _ctrlSaveChain=_ctrlSaveChain
    .then(()=>_saveCtrlInterno(false))
    .catch(e=>{console.warn('saveCtrl encolado fallo',e);})
    .then(()=>{_ctrlSavesPendientes=Math.max(0,_ctrlSavesPendientes-1);});
  return _ctrlSaveChain;
}
async function _saveCtrlInterno(_reintento){
  if(!USA_SB){setSaveStatus('Sin permiso para guardar');return;}   // sin vale = sin permiso de edicion
  setSaveStatus('💾 Guardando...');
  const _okLectura=await _refrescarCtrlSha();
  if(!_okLectura){
    // No se pudo leer la version actual del servidor. Guardar igual significaria
    // subir SOLO lo que tiene esta pestaña en memoria y borrar el resto de las
    // sucursales/tecnicos — exactamente el incidente del 05/08/2026.
    setSaveStatus('⛔ No se guardo: no se pudo leer el archivo del servidor');
    alert('No se pudo leer la version actual del Planificador desde el servidor, '
          +'asi que NO se guardo el cambio (para no borrar los datos de las otras '
          +'sucursales).\\n\\nRevisa tu conexion y presiona "Actualizar datos". '
          +'Si el problema sigue, avisa al administrador antes de seguir editando.');
    return;
  }
  const now=new Date();
  const nowStr=now.toLocaleDateString('es-CL')+' '+now.toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'});
  if(!ctrlData)ctrlData={};
  ctrlData.fecha_actualizacion=nowStr;
  if(!ctrlData[SUCURSAL])ctrlData[SUCURSAL]={};
  // Los tecnicos NO se editan desde el Planificador (se configuran en Admin), asi que
  // una lista local vacia casi siempre significa "esta pestaña cargo sin datos", no
  // "borren los tecnicos". Subirla igual fue lo que dejo las sucursales sin tecnicos
  // para asignar el 05/08/2026. Solo se pisa la del servidor si la local tiene algo.
  const _tecServidor=(_ctrlTecnicosServidor&&_ctrlTecnicosServidor.length)
        ?_ctrlTecnicosServidor:((ctrlData[SUCURSAL].tecnicos)||[]);
  ctrlData[SUCURSAL].tecnicos=(Array.isArray(tecnicos)&&tecnicos.length)?tecnicos:_tecServidor;
  if(!Array.isArray(tecnicos)||!tecnicos.length)tecnicos=ctrlData[SUCURSAL].tecnicos;
  ctrlData[SUCURSAL].ordenes=ordenes;
  // Guardia final: nunca subir un archivo al que le falten sucursales que el
  // servidor SI tenia hace un instante (defensa en profundidad del 05/08/2026).
  const _faltan=(_ctrlSucursalesServidor||[]).filter(k=>!(k in ctrlData));
  if(_faltan.length){
    setSaveStatus('⛔ No se guardo: faltaban sucursales');
    alert('No se guardo el cambio porque la copia local perdio estas sucursales: '
          +_faltan.join(', ')+'.\\n\\nRecarga la pagina y vuelve a intentarlo.');
    return;
  }
  // Guardia sobre la PROPIA sucursal: si esta pestaña esta a punto de subir muchas
  // menos ordenes de las que el servidor acaba de mostrar, algo salio mal en la
  // mezcla (05/08/2026 14:13: un guardado dejo LINDEROS con 1 orden de 248). Un
  // borrado normal es de a una o dos ordenes, nunca decenas de golpe.
  const _perdidas=(_ctrlOrdenesServidor||0)-((ordenes||[]).length);
  if(_perdidas>5){
    setSaveStatus('⛔ No se guardo: se perderian '+_perdidas+' ordenes');
    alert('NO se guardo el cambio.\\n\\nEsta pestaña tiene '+((ordenes||[]).length)
          +' ordenes pero el servidor tiene '+_ctrlOrdenesServidor+' en '+SUCURSAL
          +'. Guardar habría borrado '+_perdidas+' ordenes con sus tecnicos y etapas.'
          +'\\n\\nRecarga la pagina (Ctrl+F5) y vuelve a hacer el cambio.');
    return;
  }
  // JSON compacto (sin indentacion): la version indentada pesaba 1.058.920 bytes y
  // cruzo el limite de 1 MB de la Contents API, que es lo que gatillo la perdida de
  // datos del 05/08/2026. Compacto, el mismo contenido pesa ~750 KB.
  if(USA_SB){
    // El JSON viaja como objeto, no como base64: no hay limite de 1 MB que
    // esquivar. El sello cumple el rol del sha (bloqueo optimista): si otro
    // guardado entro primero, Postgres responde 'conflicto' con el sello nuevo
    // y se reintenta una vez sobre esa version.
    const rs=await _sbGuardar(CTRL_FILE,ctrlData,ctrlSha);
    if(rs.ok){
      ctrlSha=rs.sello||ctrlSha;_snapshotOrdenes();_snapshotBloques();setSaveStatus('✅ Guardado');
    }else if(rs.motivo==='conflicto'&&!_reintento){
      if(rs.sello)ctrlSha=rs.sello;
      await _saveCtrlInterno(true);
    }else{
      setSaveStatus('Error: '+(rs.motivo||'desconocido'));
    }
    return;
  }
  const content=btoa(unescape(encodeURIComponent(JSON.stringify(ctrlData))));
  const payload={message:`Taller ${SUCURSAL} - ${USUARIO} ${nowStr}`,content,...(ctrlSha?{sha:ctrlSha}:{})};
  try{
    const r=await fetch(API_BASE+CTRL_FILE,{method:'PUT',
      headers:{'Authorization':`token ${GITHUB_TOKEN}`,'Accept':'application/vnd.github.v3+json','Content-Type':'application/json'},
      body:JSON.stringify(payload)});
    const j=await r.json();
    if(r.ok){ctrlSha=j.content&&j.content.sha||ctrlSha;_snapshotOrdenes();_snapshotBloques();setSaveStatus('✅ Guardado');}
    else if(!_reintento){
      // SHA desactualizada (chocó con otro guardado simultáneo de otra sesión/usuario): reintenta una vez más.
      await _saveCtrlInterno(true);
    }
    else setSaveStatus('Error: '+(j.message||r.status));
  }catch(e){setSaveStatus('Error de red');}
}

function mostrarDetalleCita(el){
  // No mostrar si estaba arrastrando
  if(el.classList.contains('dragging'))return;
  let c;
  try{c=JSON.parse(el.dataset.cita||'{}');}catch(e){return;}
  const pat=(c.patente||'').replace(/\?/g,'').trim()||'—';
  const ingr=c.estado==='finalizado'?'🧍 Servicio finalizado (retirado)':(c.ingresado?'✅ Ingresado al taller':'🚗 Pendiente de ingreso');
  const filas=[
    ['OC / Folio', c.oc||'—'],
    ['Patente',    pat],
    ['Cliente',    c.nombre||c.cliente||'—'],
    ['Modelo',     c.modelo||'—'],
    ['Año',        c.anio||'—'],
    ['Kilómetros', c.km?Number(c.km).toLocaleString('es-CL')+' km':'—'],
    ['Horario',    c.horario||'—'],
    ['Fecha',      c.fecha||'—'],
    ['Servicio',   c.servicio||'—'],
    ['Mantención', c.mantencion||'—'],
    ['Asesor',     c.asesor||'—'],
    ['Sucursal',   c.sucursal||SUCURSAL],
    ['Estado',     ingr],
  ].filter(([,v])=>v&&v!=='—');
  const _noShow=esNoAsiste(c.oc,c.patente);
  document.getElementById('cm-title').textContent=`🚘 ${pat} — ${c.modelo||''}`;
  let _cmHtml=filas.map(([l,v])=>
    `<div class="cm-row"><span class="cm-lbl">${l}</span><span class="cm-val">${v}</span></div>`
  ).join('');
  if(_noShow)_cmHtml=`<div class="cita-noasiste" style="margin-bottom:8px">🚫 Cliente no asiste</div>`+_cmHtml;
  if(PUEDE_EDITAR){
    const _ocEsc=String(c.oc||'').replace(/'/g,"\\'");
    const _patEsc=pat.replace(/'/g,"\\'");
    _cmHtml+=`<div style="margin-top:10px"><button class="cita-noasiste-btn" onclick="toggleNoAsiste('${_ocEsc}','${_patEsc}');cerrarDetalleCita();">${_noShow?'↩️ Reactivar':'🚫 Marcar cliente no asiste'}</button></div>`;
  }
  document.getElementById('cm-body').innerHTML=_cmHtml;
  document.getElementById('cita-modal-overlay').classList.add('open');
}
function cerrarDetalleCita(){
  document.getElementById('cita-modal-overlay').classList.remove('open');
}

/* ══════════════════════════════════════════════════════════════
   PRE-PICKING — tarjeta por cita, con detalle desplegable, tabla
   de repuestos sugeridos (pauta de mantencion x marca/modelo/km,
   ya calculada en el consolidador) y estado Realizado/Pendiente
   persistente (prepicking_estados.json en GitHub, por sucursal +
   fecha + OC — independiente de agenda_hoy.json). 13/07/2026.
   ══════════════════════════════════════════════════════════════ */
const fmtCLP=n=>'$'+Math.round(Number(n||0)).toLocaleString('es-CL');
function ppKey(fecha,oc){return fecha+'__'+oc;}
function getPpEstado(fecha,oc){
  const suc=ppData&&ppData[SUCURSAL];
  const dia=suc&&suc[fecha];
  return(dia&&dia[oc])||'pendiente';
}
async function setPpEstado(fecha,oc,estado){
  if(!ppData)ppData={};
  if(!ppData[SUCURSAL])ppData[SUCURSAL]={};
  if(!ppData[SUCURSAL][fecha])ppData[SUCURSAL][fecha]={};
  ppData[SUCURSAL][fecha][oc]=estado;
  renderPrepickingView();
  await savePrepicking();
}
// Override manual de Marca/Modelo/Version por cita (para cuando el texto de la
// Agenda no matchea bien, o el usuario quiere ver otra motorizacion/ano) — se
// guarda junto al estado Realizado/Pendiente en el mismo prepicking_estados.json,
// bajo una clave separada "__overrides" para no chocar con el formato existente
// (ppData[SUC][fecha][oc] sigue siendo el string de estado). 22/07/2026.
function getPpOverride(fecha,oc){
  const suc=ppData&&ppData[SUCURSAL];
  const ov=suc&&suc.__overrides;
  return (ov&&ov[ppKey(fecha,oc)])||null;
}
async function setPpOverride(fecha,oc,override){
  if(!ppData)ppData={};
  if(!ppData[SUCURSAL])ppData[SUCURSAL]={};
  if(!ppData[SUCURSAL].__overrides)ppData[SUCURSAL].__overrides={};
  const k=ppKey(fecha,oc);
  if(override) ppData[SUCURSAL].__overrides[k]=override;
  else delete ppData[SUCURSAL].__overrides[k];
  renderPrepickingView();
  await savePrepicking();
}
function _cotizModeloObjPorNombre(marcaNombre,modeloNombre){
  if(!COTIZ_PP||!COTIZ_PP.indice) return null;
  const m=(COTIZ_PP.indice.marcas||[]).find(x=>x.nombre===marcaNombre);
  if(!m) return null;
  return (m.modelos||[]).find(md=>md.nombre===modeloNombre)||null;
}
// Maneja el cambio de cualquiera de los 3 selects (Marca/Modelo/Version) del
// Pre-picking: parte del override actual (o de lo auto-detectado si aun no hay
// override) y solo pisa el campo que cambio, reseteando los campos "hijos"
// (cambiar Marca limpia Modelo+Version; cambiar Modelo limpia Version).
async function ppCambiarModeloSel(fecha,oc,campo,valor){
  if(campo==='reset'){ await setPpOverride(fecha,oc,null); return; }
  const cita=(getCitas(fecha)||[]).find(c=>String(c.oc||c.patente)===String(oc));
  let marca='',modelo='',anio='',versionId='';
  const _ovPrev=getPpOverride(fecha,oc);
  if(_ovPrev){ marca=_ovPrev.marca||'';modelo=_ovPrev.modelo||'';anio=_ovPrev.anio||'';versionId=_ovPrev.versionId||''; }
  else if(cita){
    const _autoModelo=_cotizBuscarModelo(String(cita.modelo||''));
    if(_autoModelo){
      for(const m of (COTIZ_PP.indice.marcas||[])){ if((m.modelos||[]).includes(_autoModelo)){marca=m.nombre;break;} }
      modelo=_autoModelo.nombre;
      versionId=(_autoModelo.versiones&&_autoModelo.versiones[0])?_autoModelo.versiones[0].id:'';
    }
  }
  // El selector de Ano (agregado 23/07/2026, a pedido de Cristobal) es solo un
  // filtro visual para acortar la lista de Version cuando un modelo tiene muchas
  // motorizaciones/anos — cambiar Marca o Modelo limpia Ano+Version (empiezan de
  // nuevo); cambiar Ano limpia solo Version (para forzar a elegir de nuevo dentro
  // de las versiones que cubren ese ano).
  if(campo==='marca'){ marca=valor;modelo='';anio='';versionId=''; }
  else if(campo==='modelo'){ modelo=valor;anio='';versionId=''; }
  else if(campo==='anio'){ anio=valor;versionId=''; }
  else if(campo==='version'){ versionId=valor; }
  if(!marca&&!modelo&&!anio&&!versionId){ await setPpOverride(fecha,oc,null); return; }
  await setPpOverride(fecha,oc,{marca,modelo,anio,versionId});
}
async function savePrepicking(_reintento){
  if(!USA_SB){setSaveStatus('Sin permiso para guardar');return;}   // sin vale = sin permiso de edicion
  setSaveStatus('💾 Guardando...');
  if(USA_SB){
    // Releer primero para no pisar lo que hayan guardado otras sucursales:
    // este documento es compartido y cada sucursal escribe su propia clave.
    const rl=await _sbLeer('prepicking_estados.json');
    if(rl.ok&&rl.existe&&rl.data){
      ppSha=rl.sello||ppSha;
      for(const k of Object.keys(rl.data)){if(k!==SUCURSAL)ppData[k]=rl.data[k];}
    }
    const rs=await _sbGuardar('prepicking_estados.json',ppData,ppSha);
    if(rs.ok){
      ppSha=rs.sello||ppSha;setSaveStatus('✅ Guardado');
    }else if(rs.motivo==='conflicto'&&!_reintento){
      if(rs.sello)ppSha=rs.sello;
      await savePrepicking(true);
    }else{
      setSaveStatus('Error: '+(rs.motivo||'desconocido'));
    }
    return;
  }
  try{
    const r0=await fetch(API_BASE+'prepicking_estados.json',{
      headers:{'Authorization':`token ${GITHUB_TOKEN}`,'Accept':'application/vnd.github.v3+json'}});
    if(r0.ok){
      const j0=await r0.json();
      ppSha=j0.sha||ppSha;
      let fresco={};
      if(j0.content){try{fresco=JSON.parse(decodeURIComponent(escape(atob(j0.content.replace(/\\n/g,'')))));}catch(e){fresco={};}}
      for(const k of Object.keys(fresco)){if(k!==SUCURSAL)ppData[k]=fresco[k];}
    }
  }catch(e){}
  const content=btoa(unescape(encodeURIComponent(JSON.stringify(ppData,null,2))));
  const now=new Date();
  const nowStr=now.toLocaleDateString('es-CL')+' '+now.toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'});
  const payload={message:`Pre-picking ${SUCURSAL} - ${USUARIO} ${nowStr}`,content,...(ppSha?{sha:ppSha}:{})};
  try{
    const r=await fetch(API_BASE+'prepicking_estados.json',{method:'PUT',
      headers:{'Authorization':`token ${GITHUB_TOKEN}`,'Accept':'application/vnd.github.v3+json','Content-Type':'application/json'},
      body:JSON.stringify(payload)});
    const j=await r.json();
    if(r.ok){ppSha=j.content&&j.content.sha||ppSha;setSaveStatus('✅ Guardado');}
    else if(!_reintento){await savePrepicking(true);}
    else setSaveStatus('Error: '+(j.message||r.status));
  }catch(e){setSaveStatus('Error de red');}
}

function ppSelectDate(btn){
  document.querySelectorAll('#ppDateTabs .dtab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');ppSelectedDate=btn.dataset.date;renderPrepickingView();
}

function renderPrepickingView(){
  document.getElementById('ppDateTabs').innerHTML=planDates.map((d,i)=>{
    const dow=d.getDay(),fecha=formatDate(d);
    const lbl=i===0?'📅 Hoy':i===1?'📅 Manana':i===2?'📅 Pasado manana':'📅 +'+i+' dias';
    const dayStr=DIAS[dow]+' '+d.getDate()+' '+MESES[d.getMonth()];
    const cls='dtab'+(fecha===ppSelectedDate?' active':'');
    return`<button class="${cls}" data-date="${fecha}" onclick="ppSelectDate(this)">${lbl} — ${dayStr}</button>`;
  }).join('');

  const citas=getCitas(ppSelectedDate).filter(c=>citaArea(c)===currentArea)
    .slice().sort((a,b)=>(a.horario||'').localeCompare(b.horario||''));
  const cont=document.getElementById('ppCards');
  if(!citas.length){cont.innerHTML='<div style="padding:24px;color:#888;text-align:center">Sin citas agendadas para este dia.</div>';return;}

  cont.innerHTML=citas.map(c=>{
    const oc=String(c.oc||c.patente||'');
    const key=ppKey(ppSelectedDate,oc);
    const estado=getPpEstado(ppSelectedDate,oc);
    const pat=(c.patente||'').replace(/\?/g,'').trim()||'--';
    const marcaModelo=String(c.modelo||'').trim();
    const partes=marcaModelo.split(' ');
    const marca=partes[0]||'--';
    const modelo=partes.slice(1).join(' ')||'--';
    const open=(ppOpenKey===key);
    return`<div class="pp-card pp-${estado}" data-key="${key}">
      <div class="pp-head" onclick="togglePpCard('${key}')">
        <span class="pp-hora">${c.horario||'--'}</span>
        <span class="pp-plate">${pat}</span>
        <span class="pp-mmv">${marcaModelo||'--'}${c.anio?' ('+c.anio+')':''}</span>
        <span class="pp-svc">${c.servicio||c.mantencion||'--'}</span>
        <span class="pp-cliente">${c.nombre||c.cliente||''}</span>
        <span class="pp-status-badge ${estado}">${estado==='realizado'?'✅ Realizado':'🕒 Pendiente'}</span>
        <span class="pp-chevron">${open?'▲':'▼'}</span>
      </div>
      <div class="pp-body${open?' open':''}" id="ppbody-${key}">
        ${open?ppDetalleHTML(c,oc,marca,modelo):''}
      </div>
    </div>`;
  }).join('');
}

function togglePpCard(key){
  ppOpenKey=(ppOpenKey===key)?null:key;
  renderPrepickingView();
}

// Descuento rapido del 10% sobre el total del presupuesto de una cita del
// Pre-picking (14/07/2026, a pedido de Cristobal) — no se guarda en GitHub,
// es solo para simular/mostrar el presupuesto con descuento en pantalla y en
// el PDF exportado mientras se decide con el cliente.
function togglePpDescuento(key){
  if(ppDescuentos[key])delete ppDescuentos[key];
  else ppDescuentos[key]=true;
  renderPrepickingView();
}

/* ---- Mini-generador de .xlsx real (ZIP sin compresion + XML OOXML) ----
   El truco anterior de "tabla HTML con extension .xls" hacia que Excel mostrara
   la advertencia "el formato y la extension no coinciden" (reportado por Cristobal,
   14/07/2026) porque el contenido real era HTML, no un archivo Excel valido. Como
   el iframe del Planificador no tiene salida a CDNs externos (no se puede usar
   SheetJS), se arma un .xlsx real a mano: un ZIP (metodo "stored", sin compresion,
   valido segun el spec de ZIP) con las partes XML minimas que pide el formato
   OOXML de Excel — sin ninguna libreria externa, 100% API nativa del navegador
   (TextEncoder + Blob). Excel lo abre sin ninguna advertencia. */
function _crc32Tabla(){
  const t=new Uint32Array(256);
  for(let n=0;n<256;n++){
    let c=n;
    for(let k=0;k<8;k++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);
    t[n]=c>>>0;
  }
  return t;
}
const _CRC32_TABLA=_crc32Tabla();
function _crc32(bytes){
  let crc=0xFFFFFFFF;
  for(let i=0;i<bytes.length;i++)crc=_CRC32_TABLA[(crc^bytes[i])&0xFF]^(crc>>>8);
  return (crc^0xFFFFFFFF)>>>0;
}
function _u16le(n){return [n&0xFF,(n>>8)&0xFF];}
function _u32le(n){return [n&0xFF,(n>>8)&0xFF,(n>>16)&0xFF,(n>>24)&0xFF];}
function _construirZip(archivos){
  // archivos: [{nombre, contenido}] — todos guardados sin compresion (metodo 0)
  const enc=new TextEncoder();
  const locales=[],centrales=[];
  let offset=0;
  archivos.forEach(f=>{
    const nombreB=enc.encode(f.nombre), datosB=enc.encode(f.contenido);
    const crc=_crc32(datosB), size=datosB.length;
    const local=new Uint8Array([
      ..._u32le(0x04034b50), ..._u16le(20), ..._u16le(0x0800), ..._u16le(0),
      ..._u16le(0), ..._u16le(0x21),
      ..._u32le(crc), ..._u32le(size), ..._u32le(size),
      ..._u16le(nombreB.length), ..._u16le(0),
      ...nombreB, ...datosB,
    ]);
    locales.push(local);
    centrales.push(new Uint8Array([
      ..._u32le(0x02014b50), ..._u16le(20), ..._u16le(20), ..._u16le(0x0800), ..._u16le(0),
      ..._u16le(0), ..._u16le(0x21),
      ..._u32le(crc), ..._u32le(size), ..._u32le(size),
      ..._u16le(nombreB.length), ..._u16le(0), ..._u16le(0),
      ..._u16le(0), ..._u16le(0), ..._u32le(0),
      ..._u32le(offset), ...nombreB,
    ]));
    offset+=local.length;
  });
  const centralOffset=offset;
  const centralSize=centrales.reduce((s,c)=>s+c.length,0);
  const fin=new Uint8Array([
    ..._u32le(0x06054b50), ..._u16le(0), ..._u16le(0),
    ..._u16le(archivos.length), ..._u16le(archivos.length),
    ..._u32le(centralSize), ..._u32le(centralOffset), ..._u16le(0),
  ]);
  const total=offset+centralSize+fin.length;
  const out=new Uint8Array(total);
  let pos=0;
  locales.forEach(p=>{out.set(p,pos);pos+=p.length;});
  centrales.forEach(p=>{out.set(p,pos);pos+=p.length;});
  out.set(fin,pos);
  return out;
}
function _xmlEsc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
const _COL_LETRAS=['A','B','C','D','E','F','G','H','I','J'];

/* Exporta el listado completo de citas agendadas del dia/area seleccionado en el
   Pre-picking a un archivo Excel real (.xlsx) — Asesor, Modelo, Placa/Patente, Chasis,
   Kilometraje, Mantencion (segun kilometraje, igual criterio que Control de Taller),
   Nombre Propietario y Servicio (sin Motorizacion). Incluye titulo con Sucursal y
   fecha, encabezado con estilo, columnas anchas y fila superior congelada — mejora
   de diseno a pedido de Cristobal, 14/07/2026. */
function exportarListadoPrepickingExcel(){
  const citas=getCitas(ppSelectedDate).filter(c=>citaArea(c)===currentArea)
    .slice().sort((a,b)=>(a.horario||'').localeCompare(b.horario||''));
  if(!citas.length){toast('No hay citas agendadas para este dia');return;}

  const cols=['Asesor','Modelo','Placa / Patente','Chasis','Kilometraje','Mantencion','Nombre Propietario','Servicio'];
  const nCols=cols.length;
  const ultCol=_COL_LETRAS[nCols-1];

  const dTab=planDates.find(d=>formatDate(d)===ppSelectedDate);
  const fechaLbl=dTab?(DIAS[dTab.getDay()]+' '+dTab.getDate()+' '+MESES[dTab.getMonth()]+' '+dTab.getFullYear()):ppSelectedDate;
  const tituloTxt=`PRE-PICKING — ${SUCURSAL} — ${fechaLbl}`;
  const ahoraStr=new Date().toLocaleDateString('es-CL')+' '+new Date().toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'});
  const subTxt=`Generado ${ahoraStr} · ${citas.length} cita(s) agendada(s)`;

  const filasData=citas.map(c=>{
    const pat=(c.patente||'').replace(/\?/g,'').trim()||'--';
    return [
      c.asesor||'', c.modelo||'', pat, c.vin||'',
      c.km?Number(c.km).toLocaleString('es-CL'):'',
      c.mantencion||'',
      c.nombre||c.cliente||'', c.servicio||c.mantencion||'',
    ];
  });

  const HEADER_ROW=3, FIRST_DATA_ROW=4;
  const celda=(ref,val,s)=>`<c r="${ref}" t="inlineStr" s="${s}"><is><t xml:space="preserve">${_xmlEsc(val)}</t></is></c>`;

  const rowTitulo=`<row r="1" ht="22" customHeight="1">${celda('A1',tituloTxt,1)}</row>`;
  const rowSub=`<row r="2" ht="16" customHeight="1">${celda('A2',subTxt,2)}</row>`;
  const rowHead=`<row r="${HEADER_ROW}">${cols.map((c,i)=>celda(_COL_LETRAS[i]+HEADER_ROW,c,3)).join('')}</row>`;
  const rowsDatos=filasData.map((fila,idx)=>{
    const r=FIRST_DATA_ROW+idx;
    const est=(idx%2===0)?4:5;
    const celdas=fila.map((val,cIdx)=>celda(_COL_LETRAS[cIdx]+r,val,est)).join('');
    return `<row r="${r}">${celdas}</row>`;
  }).join('');

  const colsXml=`<cols>
<col min="1" max="1" width="22" customWidth="1"/>
<col min="2" max="2" width="24" customWidth="1"/>
<col min="3" max="3" width="16" customWidth="1"/>
<col min="4" max="4" width="20" customWidth="1"/>
<col min="5" max="5" width="14" customWidth="1"/>
<col min="6" max="6" width="22" customWidth="1"/>
<col min="7" max="7" width="32" customWidth="1"/>
<col min="8" max="8" width="30" customWidth="1"/>
</cols>`;

  const sheetXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="${HEADER_ROW}" topLeftCell="A${FIRST_DATA_ROW}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
${colsXml}
<sheetData>${rowTitulo}${rowSub}${rowHead}${rowsDatos}</sheetData>
<mergeCells count="2"><mergeCell ref="A1:${ultCol}1"/><mergeCell ref="A2:${ultCol}2"/></mergeCells>
</worksheet>`;

  const stylesXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="4">
<font><sz val="10.5"/><name val="Calibri"/></font>
<font><b/><sz val="14"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><i/><sz val="9.5"/><color rgb="FF667788"/><name val="Calibri"/></font>
<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF0B2E63"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF3F6FA"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFD8DEE3"/></left><right style="thin"><color rgb="FFD8DEE3"/></right><top style="thin"><color rgb="FFD8DEE3"/></top><bottom style="thin"><color rgb="FFD8DEE3"/></bottom></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  const contentTypesXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const rootRelsXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Pre-picking" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  const workbookRelsXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const zipBytes=_construirZip([
    {nombre:'[Content_Types].xml', contenido:contentTypesXml},
    {nombre:'_rels/.rels', contenido:rootRelsXml},
    {nombre:'xl/workbook.xml', contenido:workbookXml},
    {nombre:'xl/_rels/workbook.xml.rels', contenido:workbookRelsXml},
    {nombre:'xl/styles.xml', contenido:stylesXml},
    {nombre:'xl/worksheets/sheet1.xml', contenido:sheetXml},
  ]);

  const blob=new Blob([zipBytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`Prepicking_${SUCURSAL}_${ppSelectedDate}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast(`📊 Excel generado con ${citas.length} cita(s)`);
}

/* ============================================================
   Repuestos/stock del Pre-picking desde el Cotizador de Mantenciones
   ------------------------------------------------------------
   Reemplaza el pipeline viejo (consolidar_OTs.py -> pauta_repuestos.json +
   Stock Repestos Costo.xlsx -> agenda_hoy.json -> cita.repuestos_sugeridos)
   por una lectura directa del bundle ya embebido del modulo "Cotizador de
   Mantenciones" (COTIZ_PP: indice/stock/pautas, ver bootstrap mas arriba),
   manteniendo la misma logica/alcance que tenia Pre-picking antes: repuestos
   de la pauta segun marca/modelo/km, con Stock/Ubicacion acotados a ESTA
   sucursal (si no hay stock aqui, se avisa en que otra bodega si hay) y
   codigos "tambien sirve" (alternativas). 22/07/2026, a pedido de Cristobal.
   Se mantiene un fallback a c.repuestos_sugeridos (pipeline viejo) por si el
   bundle del cotizador aun no cargo o la marca/modelo no esta cubierta ahi. */
function _cotizNormTxt(s){
  return String(s||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
}
function _cotizNormCod(c){
  return c==null?'':String(c).toUpperCase().replace(/[^A-Z0-9]/g,'');
}
function _esServicioMantencionPP(txt){
  // Ademas de "Mantencion" (MANT), se acepta "Revision" (REVIS) — servicios tipo
  // "Revision 30 dias"/"Revision gratuita" son mantenciones programadas reales que
  // SI estan cubiertas por el Cotizador (misma pauta por km), solo que la Agenda
  // las etiqueta con otro texto. Bug real: Hyundai Grand i10 100km "Revision 30
  // dias" tenia pauta en el Cotizador pero Pre-picking la descartaba por el gate
  // de texto. 23/07/2026, a pedido de Cristobal.
  const t=_cotizNormTxt(txt);
  return t.indexOf('MANT')>=0 || t.indexOf('REVIS')>=0;
}
function _cotizBuscarModelo(marcaModeloTexto){
  if(!COTIZ_PP||!COTIZ_PP.indice) return null;
  const txt=_cotizNormTxt(marcaModeloTexto);
  if(!txt) return null;
  let mejorMarca=null, mejorScore=0;
  for(const m of (COTIZ_PP.indice.marcas||[])){
    const nm=_cotizNormTxt(m.nombre);
    if(nm && txt.indexOf(nm)===0 && nm.length>mejorScore){ mejorMarca=m; mejorScore=nm.length; }
  }
  if(!mejorMarca) return null;
  const resto=txt.slice(mejorScore).trim();
  if(!resto) return null;
  // Respaldo sin espacios: la Agenda escribe modelos con guion pegado
  // ("FORD F150"), pero el nombre oficial del Cotizador trae el guion
  // normalizado a espacio ("F-150" -> "F 150") — sin este respaldo la
  // comparacion exacta nunca calza y la pauta se pierde en silencio para
  // esos modelos (mismo bug ya corregido para el tempario en el
  // consolidador, sesion 09/07/2026 — replicado aca 22/07/2026).
  const restoSinEsp=resto.replace(/ /g,'');
  const restoTokens=resto.split(' ').filter(Boolean);
  // Match por PALABRAS (tokens), no por substring crudo — reescrito 23/07/2026 tras
  // confirmar con datos reales de la Agenda que el substring crudo dejaba fuera (o
  // matcheaba MAL) muchos vehiculos que el Cotizador si tiene cubiertos:
  //  - "FORD BRONCO" (Agenda) vs "Bronco Sport" (Cotizador): el texto de la Agenda
  //    es una ABREVIACION del nombre real — antes no matcheaba nada (null).
  //  - "HYUNDAI GRAND CRETA" (Agenda) vs "Creta Grand" (Cotizador): mismas palabras
  //    en OTRO ORDEN — antes matcheaba mal contra el modelo corto "Creta" (pauta
  //    equivocada, silenciosamente) en vez de "Creta Grand".
  // Se prueban 5 niveles de coincidencia (de mas a menos estricto) y se elige el de
  // mayor "tier"; dentro del mismo tier, el modelo con mas palabras (mas especifico).
  let mejorModelo=null, mejorPuntaje=-1;
  for(const mod of (mejorMarca.modelos||[])){
    const nmod=_cotizNormTxt(mod.nombre);
    if(!nmod) continue;
    const nmodSinEsp=nmod.replace(/ /g,'');
    const nmodTokens=nmod.split(' ').filter(Boolean);
    let tier=0;
    if(restoSinEsp===nmodSinEsp) tier=4;                                                   // "F150" == "F 150"
    else if(nmodTokens.length===restoTokens.length && nmodTokens.every(t=>restoTokens.includes(t))) tier=3;  // mismas palabras, cualquier orden
    else if(nmodTokens.every(t=>restoTokens.includes(t))) tier=2;                           // el modelo completo esta dentro del texto (con palabras extra, ej. "RANGER RAPTOR" ⊇ "RANGER")
    else if(restoTokens.every(t=>nmodTokens.includes(t))) tier=1;                           // el texto es una abreviacion del modelo (ej. "BRONCO" ⊂ "BRONCO SPORT")
    else if(resto.indexOf(nmod)>=0 || restoSinEsp.indexOf(nmodSinEsp)>=0) tier=0.5;         // respaldo: substring crudo (compat con el comportamiento anterior)
    if(tier<=0) continue;
    const puntaje=tier*1000 + nmodTokens.length*10 + nmod.length*0.01;
    if(puntaje>mejorPuntaje){ mejorModelo=mod; mejorPuntaje=puntaje; }
  }
  if(!mejorModelo||!mejorModelo.versiones||!mejorModelo.versiones.length) return null;
  return mejorModelo;
}
function _cotizBuscarIntervalo(mejorModelo, kmTexto){
  // Busca el km (exacto, o el mas cercano dentro de 5.000 km) recorriendo
  // TODAS las versiones/motorizaciones del modelo — no solo la primera. Un
  // mismo modelo (ej. Maverick) puede tener varias versiones con tablas de
  // mantencion DISTINTAS (unas parten en 16.000 km, otras en 10.000 km); si
  // solo se miraba la primera version, un kilometraje real que esa version
  // no cubre hacia que se perdiera la pauta (o peor, tomara repuestos de un
  // intervalo "cercano" de la version equivocada). Bug real encontrado en
  // produccion 22/07/2026 (Ford Maverick 10.000 km sin datos porque su
  // primera version solo tenia 16.000/32.000/...).
  if(!COTIZ_PP||!COTIZ_PP.pautas||!mejorModelo) return null;
  const kmNum=parseInt(String(kmTexto||'').replace(/[^0-9]/g,''),10);
  if(!kmNum) return null;
  let cercano=null, mejorDif=Infinity;
  for(const v of (mejorModelo.versiones||[])){
    const pauta=COTIZ_PP.pautas[v.id];
    if(!pauta||!pauta.planes) continue;
    for(const plan of pauta.planes){
      for(const iv of (plan.intervalos||[])){
        if(Number(iv.km)===kmNum) return {pauta,intervalo:iv};
        const dif=Math.abs(Number(iv.km)-kmNum);
        if(dif<=5000 && dif<mejorDif){ mejorDif=dif; cercano={pauta,intervalo:iv}; }
      }
    }
  }
  return cercano;
}
function _cotizItemsParaVersion(versionId, kmTexto){
  // Igual que _cotizBuscarIntervalo pero acotado a UNA sola version — se usa
  // cuando el usuario elige a mano la Version exacta en el selector manual de
  // Pre-picking (en vez de dejar que el sistema recorra todas las versiones
  // del modelo buscando la mas cercana). 22/07/2026.
  if(!COTIZ_PP||!COTIZ_PP.pautas||!versionId) return null;
  const pauta=COTIZ_PP.pautas[versionId];
  if(!pauta||!pauta.planes) return null;
  const kmNum=parseInt(String(kmTexto||'').replace(/[^0-9]/g,''),10);
  let cercano=null, mejorDif=Infinity;
  for(const plan of pauta.planes){
    for(const iv of (plan.intervalos||[])){
      if(kmNum && Number(iv.km)===kmNum) return {pauta,intervalo:iv};
      if(!kmNum) continue;
      const dif=Math.abs(Number(iv.km)-kmNum);
      if(dif<mejorDif){ mejorDif=dif; cercano={pauta,intervalo:iv}; }
    }
  }
  // Sin km reconocible: si la version solo tiene un intervalo, se usa ese.
  if(!cercano){
    const todos=[]; for(const plan of pauta.planes){ for(const iv of (plan.intervalos||[])) todos.push({pauta,intervalo:iv}); }
    if(todos.length===1) cercano=todos[0];
  }
  return cercano;
}
function _cotizStockDe(codigo){
  if(!COTIZ_PP||!COTIZ_PP.stock||!codigo) return null;
  return (COTIZ_PP.stock.items||{})[_cotizNormCod(codigo)]||null;
}
// Respaldo: si el codigo no esta en el bundle chico del Cotizador (~400
// codigos), se busca en el catalogo completo (STOCK_FULL, ~33.000 codigos
// reales de Stock Repestos Costo.xlsx) — amplia la cobertura de stock a
// cualquier repuesto de la pauta, no solo a los que el Cotizador ya trae
// precalculados. 22/07/2026.
function _cotizCodBase(c){
  // Quita el prefijo numerico de familia (ej. "13 XO5W30Q1SP" -> "XO5W30Q1SP")
  // ANTES de normalizar — mismo criterio que usa el consolidador Python al
  // limpiar codigos de Stock Repestos Costo.xlsx. Los codigos de las pautas
  // del Cotizador ya vienen sin ese prefijo, asi que aplicarselo tambien a
  // ellos es un no-op seguro (no hay digitos+espacio que quitar).
  return _cotizNormCod(String(c||'').replace(/^\s*\d+\s+/, ''));
}
function _cotizStockDeCompleto(codigo){
  if(!STOCK_FULL||!codigo) return null;
  const e=STOCK_FULL[_cotizCodBase(codigo)];
  return e?{bodegas:e.bodegas}:null;
}
function _cotizLimpiarCod(c){
  // Mismo criterio que el consolidador (Python, _codigos_relacionados): quita
  // un prefijo numerico de familia (ej. "13 BC4518D334DD" -> "BC4518D334DD")
  // y espacios/guiones, para comparar solo la parte real del codigo.
  return String(c||'').toUpperCase().replace(/^\d+\s+/, '').replace(/[\s\-]/g,'');
}
function _cotizPrefijoComun(a,b){
  let i=0; const n=Math.min(a.length,b.length);
  while(i<n && a[i]===b[i]) i++;
  return i;
}
function _cotizCodigosRelacionados(codBase, codCand, minPrefijo, minRatio){
  minPrefijo=minPrefijo||6; minRatio=minRatio||0.6;
  if(!codBase||!codCand||codBase===codCand) return false;
  const a=_cotizLimpiarCod(codBase), b=_cotizLimpiarCod(codCand);
  if(!a||!b) return false;
  const pref=_cotizPrefijoComun(a,b);
  return pref>=minPrefijo && pref>=a.length*minRatio && pref>=b.length*minRatio;
}
// Busca codigos "relacionados" (mismo criterio que el pipeline viejo del
// consolidador, sesion 14/07/2026: prefijo comun >=6 caracteres Y >=60% del
// largo de AMBOS codigos) contra el catalogo COMPLETO de Stock — a diferencia
// del "alt" precalculado del bundle chico (a lo mas 1 equivalente), esto
// recorre los ~33.000 codigos reales y devuelve hasta `maxAlt` variantes,
// cada una con su propio stock ya calculado para esta sucursal. 22/07/2026.
function _cotizBuscarAlternativasCompletas(codigoOriginal, maxAlt){
  maxAlt=maxAlt||3;
  if(!STOCK_FULL||!codigoOriginal) return [];
  const aLimpio=_cotizLimpiarCod(codigoOriginal);
  const candidatos=[];
  for(const cod in STOCK_FULL){
    if(_cotizCodigosRelacionados(codigoOriginal, cod)) candidatos.push(cod);
  }
  candidatos.sort((x,y)=>_cotizPrefijoComun(aLimpio,_cotizLimpiarCod(y))-_cotizPrefijoComun(aLimpio,_cotizLimpiarCod(x)));
  return candidatos.slice(0,maxAlt).map(cod=>{
    const e=STOCK_FULL[cod];
    const r=_cotizStockEnSucursal({bodegas:e.bodegas});
    return {
      codigo:cod,
      descripcion:e.descripcion||'',
      stock_sucursal:r.stockAqui,
      stock_otro:(!r.hayAqui && r.totalOtro>0)?r.totalOtro:null,
    };
  });
}
function _cotizStockEnSucursal(s){
  // Devuelve el desglose de un item de stock (s = COTIZ_PP.stock.items[cod])
  // para la sucursal actual: cuanto hay aqui, y cuanto suma en total en el
  // resto de bodegas (para el aviso "hay en otra sucursal"). Compartido entre
  // el item principal y sus alternativas/equivalentes.
  const bodegas=Array.isArray(s.bodegas)?s.bodegas:[];
  const normSuc=_cotizNormTxt(SUCURSAL);
  let stockAqui=0, huboBodegaAqui=false, totalOtro=0;
  const otras=[];
  for(const b of bodegas){
    const nB=_cotizNormTxt(b.n);
    if(nB===normSuc || nB.indexOf(normSuc+' ')===0){
      stockAqui+=Number(b.q)||0; huboBodegaAqui=true;
    } else if(Number(b.q)>0){
      otras.push(`${b.n} (${b.q})`);
      totalOtro+=Number(b.q)||0;
    }
  }
  return {hayAqui:huboBodegaAqui&&stockAqui>0, stockAqui:huboBodegaAqui?stockAqui:null, otras, totalOtro};
}
function _cotizItemConStock(it){
  const base={nombre:it.nombre, codigo:it.codigo, cantidad:it.cantidad, precio_unitario:it.precioUnitario};
  // Stock principal: primero el bundle chico del Cotizador (rapido, cubre los
  // ~400 codigos de las pautas); si no esta ahi, respaldo con el catalogo
  // completo (STOCK_FULL) para no quedar en "Sin dato" solo porque el bundle
  // acotado no incluye ese codigo puntual. 22/07/2026.
  const s=_cotizStockDe(it.codigo) || _cotizStockDeCompleto(it.codigo);
  // OJO: antes, si el codigo propio no tenia NINGUN registro de stock (s=null,
  // "Sin dato" en Stock/Ubicacion), la funcion cortaba aca con `alternativas:[]`
  // sin siquiera intentar buscar "tambien sirve" — asi, cualquier modelo cuyos
  // codigos no esten cargados directo en Stock (ej. Ford Territory) se quedaba
  // sin ninguna alternativa sugerida. Ahora se sigue el flujo igual y la
  // busqueda de alternativas (independiente de si el codigo propio tiene stock)
  // corre siempre. 23/07/2026, a pedido de Cristobal.
  const r=s?_cotizStockEnSucursal(s):{hayAqui:false, stockAqui:null, otras:[], totalOtro:0};
  // "Tambien sirve": se busca primero contra el catalogo COMPLETO (33.000
  // codigos reales, misma logica de codigo relacionado del pipeline viejo) —
  // mucho mas amplio que el "alt" precalculado del bundle chico del Cotizador
  // (a lo mas 1 equivalente). Si el catalogo completo aun no cargo o no
  // encuentra nada, cae al "alt" del bundle chico como respaldo. 22/07/2026.
  let alternativas=_cotizBuscarAlternativasCompletas(it.codigo, 3);
  if(!alternativas.length){
    const sBundle=_cotizStockDe(it.codigo);
    if(sBundle && sBundle.alt){
      const descripcion=(sBundle.via==='difuso'?'Equivalente (codigo aproximado)':'Mismo producto, otro formato/envase');
      const sAlt=_cotizStockDe(sBundle.alt);
      if(sAlt){
        const rAlt=_cotizStockEnSucursal(sAlt);
        alternativas=[{codigo:sBundle.alt, descripcion,
          stock_sucursal: rAlt.stockAqui,
          stock_otro: (!rAlt.hayAqui && rAlt.totalOtro>0)?rAlt.totalOtro:null}];
      } else {
        alternativas=[{codigo:sBundle.alt, descripcion, stock_sucursal:null, stock_otro:null}];
      }
    }
  }
  return {
    ...base,
    stock: r.stockAqui,
    ubicacion: r.hayAqui?SUCURSAL:null,
    stock_otro_lugar: (!r.hayAqui && r.otras.length)?r.otras.join(', '):null,
    alternativas,
  };
}
function _cotizItemsParaCita(c, override){
  if(!COTIZ_PP) return null;
  if(!_esServicioMantencionPP(c.servicio||c.mantencion||'')) return null;
  const km=c.mantencion||c.km||'';
  let res=null;
  if(override&&override.versionId){
    // El usuario eligio una Version exacta a mano — se usa esa sola, sin
    // recorrer las demas versiones del modelo. 22/07/2026.
    res=_cotizItemsParaVersion(override.versionId, km);
  } else if(override&&override.modelo){
    // Eligio Marca+Modelo (y opcionalmente Ano) pero no una Version puntual: se
    // recorren todas las versiones de ESE modelo (mismo criterio automatico,
    // pero forzando el modelo elegido en vez del auto-detectado desde el texto
    // de la Agenda). Si ademas eligio Ano, se acota a solo las versiones que
    // cubren ese ano — 23/07/2026, a pedido de Cristobal.
    const modeloObj=_cotizModeloObjPorNombre(override.marca||'', override.modelo);
    if(modeloObj){
      let modeloParaBuscar=modeloObj;
      if(override.anio){
        const versionesAnio=(modeloObj.versiones||[]).filter(v=>
          Array.isArray(v.anios) && v.anios.map(String).includes(String(override.anio)));
        if(versionesAnio.length) modeloParaBuscar={...modeloObj, versiones:versionesAnio};
      }
      res=_cotizBuscarIntervalo(modeloParaBuscar, km);
    }
  } else {
    // Deteccion automatica (sin override): ademas de Marca/Modelo (desde c.modelo),
    // se usa el Ano del vehiculo que ya viaja en la cita (c.anio, campo real de la
    // Agenda) para acotar a las versiones que cubren ese ano — mismo criterio que
    // el override manual, pero automatico. Si el modelo no tiene el dato de Ano
    // cargado (la mayoria de las marcas del Cotizador aun no traen `anios` por
    // version) o el ano de la cita no calza con ninguna, se recorren TODAS las
    // versiones igual que antes (no se pierde pauta por esto). 23/07/2026, a
    // pedido de Cristobal.
    const mejorModelo=_cotizBuscarModelo(String(c.modelo||''));
    if(mejorModelo){
      let modeloParaBuscar=mejorModelo;
      if(c.anio){
        const versionesAnio=(mejorModelo.versiones||[]).filter(v=>
          Array.isArray(v.anios) && v.anios.map(String).includes(String(c.anio)));
        if(versionesAnio.length) modeloParaBuscar={...mejorModelo, versiones:versionesAnio};
      }
      res=_cotizBuscarIntervalo(modeloParaBuscar, km);
    }
  }
  if(!res) return null;
  const items=(res.intervalo.items||[]).filter(it=>it.tipo==='repuesto').map(_cotizItemConStock);
  if(!items.length) return null;
  return {items, horas:Number(res.intervalo.horas)||0, manoObra:Number(res.intervalo.manoObra)||0};
}
/* Punto unico de acceso: cotizador primero (respetando un override manual de
   Marca/Modelo/Version si el usuario eligio uno para esta cita puntual desde
   el selector de Pre-picking), con fallback al pipeline viejo
   (c.repuestos_sugeridos/horas_tempario/mano_obra_monto) si no hay match aun
   (bundle no cargado, marca no cubierta, o servicio no es mantencion). */
function _ppRepuestosDeCita(c, oc, fecha){
  const override=(oc!=null)?getPpOverride(fecha||ppSelectedDate, oc):null;
  const cot=_cotizItemsParaCita(c, override);
  if(cot) return {...cot, fuente:'cotizador'};
  const viejos=Array.isArray(c.repuestos_sugeridos)?c.repuestos_sugeridos:[];
  return {items:viejos, horas:Number(c.horas_tempario)||0, manoObra:Number(c.mano_obra_monto||0), fuente:'consolidador'};
}

// Selector manual de Marca/Modelo/Version/Ano para Pre-picking — agregado
// 22/07/2026 a pedido de Cristobal, ADEMAS de la deteccion automatica (no la
// reemplaza): por defecto todo sigue funcionando igual (auto-deteccion desde
// el texto de la Agenda), pero el usuario puede forzar a mano la version
// exacta cuando el texto no matchea bien o quiere ver otra motorizacion/ano.
function _ppSelectorModeloHTML(c,oc){
  if(!COTIZ_PP||!COTIZ_PP.indice||!COTIZ_PP.indice.marcas||!COTIZ_PP.indice.marcas.length) return '';
  const override=getPpOverride(ppSelectedDate,oc);
  let marcaSel='', modeloSel='', anioSel='', versionSel='';
  if(override){ marcaSel=override.marca||''; modeloSel=override.modelo||''; anioSel=override.anio||''; versionSel=override.versionId||''; }
  else {
    const auto=_cotizBuscarModelo(String(c.modelo||''));
    if(auto){
      for(const m of COTIZ_PP.indice.marcas){ if((m.modelos||[]).includes(auto)){marcaSel=m.nombre;break;} }
      modeloSel=auto.nombre;
    }
  }
  const marcaObj=COTIZ_PP.indice.marcas.find(m=>m.nombre===marcaSel);
  const modeloObj=marcaObj?(marcaObj.modelos||[]).find(md=>md.nombre===modeloSel):null;
  const optMarca=`<option value="">-- Marca --</option>`+COTIZ_PP.indice.marcas.map(m=>
    `<option value="${esc(m.nombre)}"${m.nombre===marcaSel?' selected':''}>${esc(m.nombre)}</option>`).join('');
  const optModelo=marcaObj?(`<option value="">-- Modelo --</option>`+(marcaObj.modelos||[]).map(md=>
    `<option value="${esc(md.nombre)}"${md.nombre===modeloSel?' selected':''}>${esc(md.nombre)}</option>`).join('')):`<option value="">-- Modelo --</option>`;
  // Selector de Ano (nuevo, 23/07/2026, a pedido de Cristobal): lista los anos
  // cubiertos por CUALQUIER version del modelo elegido (union de v.anios de todas
  // las versiones), ordenados de mas reciente a mas antiguo. Es solo un filtro
  // visual para acortar la lista de Version en modelos con muchas motorizaciones —
  // al elegir un Ano, la lista de Version se acota a las versiones que lo cubren.
  let aniosDisponibles=[];
  if(modeloObj){
    const set=new Set();
    for(const v of (modeloObj.versiones||[])){ for(const a of (Array.isArray(v.anios)?v.anios:[])) set.add(String(a)); }
    aniosDisponibles=Array.from(set).sort((a,b)=>Number(b)-Number(a));
  }
  // El Ano de la cita (c.anio, dato real que ya trae la Agenda) se usa para
  // preseleccionar el Ano automaticamente cuando NO hay override manual — mismo
  // criterio que ya aplica _cotizItemsParaCita para acotar la busqueda de la
  // pauta. Si el modelo detectado no tiene ese ano cargado (marca aun sin
  // `anios` por version) o el ano de la cita no calza con ninguno, el select
  // queda en "todos" igual que antes (no se fuerza un valor invalido). 23/07/2026.
  if(!override && c.anio && aniosDisponibles.includes(String(c.anio))) anioSel=String(c.anio);
  const optAnio=modeloObj?(`<option value="">-- Ano (todos) --</option>`+aniosDisponibles.map(a=>
    `<option value="${esc(a)}"${a===anioSel?' selected':''}>${esc(a)}</option>`).join('')):`<option value="">-- Ano --</option>`;
  const versionesFiltradas=modeloObj?(modeloObj.versiones||[]).filter(v=>
    !anioSel || (Array.isArray(v.anios) && v.anios.map(String).includes(anioSel))
  ):[];
  const optVersion=modeloObj?(`<option value="">-- Version (todas) --</option>`+versionesFiltradas.map(v=>{
      const anios=Array.isArray(v.anios)&&v.anios.length?` (${v.anios.join('/')})`:'';
      return `<option value="${esc(v.id)}"${v.id===versionSel?' selected':''}>${esc(v.nombre)}${anios}</option>`;
    }).join('')):`<option value="">-- Version --</option>`;
  const estadoTxt=override?`<span class="pp-modelo-manual">✋ Manual</span>`:`<span class="pp-modelo-auto">🤖 Automatico (desde Agenda)</span>`;
  const btnReset=override?`<button class="pp-btn-reset-modelo" onclick="ppCambiarModeloSel('${ppSelectedDate}','${oc}','reset','')">↩️ Volver a automatico</button>`:'';
  return `<div class="pp-modelo-sel">
    <div class="pp-modelo-sel-tit">🚗 Marca / Modelo / Ano / Version &nbsp;—&nbsp; ${estadoTxt}</div>
    <div class="pp-modelo-sel-row">
      <select onchange="ppCambiarModeloSel('${ppSelectedDate}','${oc}','marca',this.value)">${optMarca}</select>
      <select onchange="ppCambiarModeloSel('${ppSelectedDate}','${oc}','modelo',this.value)">${optModelo}</select>
      <select onchange="ppCambiarModeloSel('${ppSelectedDate}','${oc}','anio',this.value)">${optAnio}</select>
      <select onchange="ppCambiarModeloSel('${ppSelectedDate}','${oc}','version',this.value)">${optVersion}</select>
      ${btnReset}
    </div>
  </div>`;
}
function ppDetalleHTML(c,oc,marca,modelo){
  const _rep=_ppRepuestosDeCita(c,oc,ppSelectedDate);
  const items=_rep.items;
  const filas=[
    ['OC / Folio', oc||'--'],
    ['Patente', (c.patente||'').replace(/\?/g,'').trim()||'--'],
    ['Nombre completo cliente', c.nombre||c.cliente||'--'],
    ['Rut cliente', c.rut||'--'],
    ['Marca', marca],
    ['Modelo', modelo],
    ['Ano', c.anio||'--'],
    ['VIN', c.vin||'--'],
    ['Kilometraje', c.km?Number(c.km).toLocaleString('es-CL')+' km':'--'],
    ['Servicio', c.servicio||'--'],
    ['Mantencion kilometraje', c.mantencion||'--'],
    ['Asesor', c.asesor||'--'],
    ['Sucursal', c.sucursal||SUCURSAL],
    ['Estado agenda', c.estado==='finalizado'?'🧍 Finalizado':(c.ingresado?'🎟️ Ingresado':'🚗 Pendiente de ingreso')],
  ];
  const detGrid=`<div class="pp-det-grid">${filas.map(([l,v])=>
    `<div class="pp-det-row"><span class="pp-lbl">${esc(l)}</span><span class="pp-val">${esc(v)}</span></div>`
  ).join('')}</div>`;
  const selectorModelo=_ppSelectorModeloHTML(c,oc);

  const manoObra=Number(_rep.manoObra||0);
  const _ppKey=ppKey(ppSelectedDate,oc);
  const _conDescuento=!!ppDescuentos[_ppKey];
  const _totalRep=(items||[]).reduce((s,it)=>s+(Number(it.precio_unitario||0)*Number(it.cantidad||0)),0);
  const _totalGral=_totalRep+manoObra;
  const _totalDesc=_totalGral*0.9;
  let tabla;
  if(items&&items.length){
    // Stock/Ubicacion se calculan aqui mismo (_cotizItemConStock) acotados a ESTA
    // sucursal desde el bundle del Cotizador de Mantenciones (COTIZ_PP.stock) — si
    // esta sucursal no tiene stock, se avisa en que otra bodega si hay
    // (it.stock_otro_lugar). Cada repuesto puede traer un codigo "alternativas"
    // (mismo producto equivalente, precomputado en el bundle) que tambien sirve.
    // 22/07/2026: repuestos/stock ahora vienen del Cotizador embebido en vez del
    // pipeline viejo (pauta_repuestos.json + Stock Repestos Costo.xlsx).
    tabla=`<table class="pptable"><thead><tr>
        <th>Nombre / Descripcion repuesto</th><th>Codigo</th><th>Cantidad</th>
        <th>Stock (${esc(SUCURSAL)})</th><th>Ubicacion</th><th>Valor Neto</th></tr></thead><tbody>
      ${items.map(it=>{
        const alts=Array.isArray(it.alternativas)?it.alternativas:[];
        const altsHtml=alts.length?`<div class="pp-alt"><div class="pp-alt-lbl">🔁 Tambien sirve</div>${alts.map(a=>{
            let stCls='no', stTxt='Sin stock';
            if(a.stock_sucursal!=null){ stCls='si'; stTxt=`Stock aqui: ${a.stock_sucursal}`; }
            else if(a.stock_otro!=null){ stCls='otro'; stTxt=`En otra sucursal: ${a.stock_otro}`; }
            return `<div class="pp-alt-item"><b>${esc(a.codigo)}</b>
              <span class="pp-alt-desc">${esc(a.descripcion||'')}</span>
              <span class="pp-alt-stock ${stCls}">${stTxt}</span></div>`;
          }).join('')}</div>`:'';
        // OJO: usar it.stock (truthy, >0) y no it.stock!=null — 0 es un valor valido
        // (hay registro de esa sucursal pero con cero unidades) y en ese caso igual
        // hay que avisar donde SI hay stock, no mostrar la sucursal como si tuviera.
        const ubicCell=it.stock?esc(it.ubicacion||SUCURSAL):
          (it.stock_otro_lugar?`<span style="color:#c87900">Sin stock en ${esc(SUCURSAL)}<br>Hay en: ${esc(it.stock_otro_lugar)}</span>`:'Sin dato');
        return `<tr>
        <td>${esc(it.nombre||'--')}${altsHtml}</td>
        <td>${esc(it.codigo||'--')}</td>
        <td>${esc(it.cantidad||'--')}</td>
        <td>${it.stock!=null?it.stock:'Sin dato'}</td>
        <td>${ubicCell}</td>
        <td>${fmtCLP(it.precio_unitario)}</td>
      </tr>`;
      }).join('')}
      <tr class="pp-mo-row"><td colspan="2">Cantidad de mano de obra</td>
        <td>${(Number(_rep.horas)||0).toFixed(1)} h</td>
        <td colspan="2"></td><td>${fmtCLP(manoObra)}</td></tr>
      <tr class="pp-tot-row"><td colspan="5">TOTAL NETO</td><td>${fmtCLP(_totalGral)}</td></tr>
      ${_conDescuento?`
      <tr class="pp-desc-row"><td colspan="5">Descuento (10%)</td><td>- ${fmtCLP(_totalGral-_totalDesc)}</td></tr>
      <tr class="pp-tot-row pp-tot-desc"><td colspan="5">TOTAL CON DESCUENTO</td><td>${fmtCLP(_totalDesc)}</td></tr>`:''}
    </tbody></table>`;
  } else {
    tabla=`<div style="padding:10px;background:#fff3cd;border-radius:6px;font-size:12px;color:#8a5a00;margin-bottom:12px">
      ⚠️ Sin pauta de repuestos disponible — no es una mantencion por kilometraje reconocida,
      o la marca/modelo/kilometraje no esta cubierto por la pauta cargada.
    </div>`;
  }

  // Se pasa la cita via atributo data-cita (mismo patron ya probado que usa
  // data-cita en las tarjetas de Programacion) y se lee con JSON.parse(el.dataset.cita)
  // en vez de inyectar el JSON como argumento del onclick — con doble comillas
  // escapadas a &quot; el navegador las decodifica ANTES de ejecutar el JS del
  // atributo, dejando codigo invalido en tiempo de ejecucion y el boton sin hacer
  // nada (bug real encontrado en produccion, corregido 13/07/2026).
  const _citaJson=JSON.stringify(c).replace(/'/g,"&#39;");
  return detGrid+selectorModelo+tabla+`<div class="pp-actions">
      <button class="pp-btn-pdf" data-cita='${_citaJson}' data-descuento="${_conDescuento?'1':'0'}" onclick="exportarPresupuestoPDF(this)">📄 Exportar Presupuesto (PDF)</button>
      <button class="pp-btn-desc${_conDescuento?' activo':''}" onclick="togglePpDescuento('${_ppKey}')">${_conDescuento?'✖️ Quitar descuento 10%':'🏷️ Aplicar descuento 10%'}</button>
      <button class="pp-btn-real" onclick="setPpEstado('${ppSelectedDate}','${oc}','realizado')">✅ Marcar Realizado</button>
      <button class="pp-btn-pend" onclick="setPpEstado('${ppSelectedDate}','${oc}','pendiente')">🕒 Marcar Pendiente</button>
    </div>`;
}

/* Exporta el presupuesto como una pagina imprimible (con el logo Curifor) en una
   pestana nueva y dispara el dialogo de impresion del navegador — el usuario elige
   "Guardar como PDF" ahi. No depende de ninguna libreria externa (el iframe del
   Planificador no tiene salida a CDNs externos), asi que este es el camino robusto. */
function exportarPresupuestoPDF(el){
  let c;
  try{c=JSON.parse(el.dataset.cita||'{}');}catch(e){toast('No se pudo generar el presupuesto');return;}
  const conDescuento=el.dataset.descuento==='1';
  const oc=String(c.oc||c.patente||'');
  const pat=(c.patente||'').replace(/\?/g,'').trim()||'--';
  const marcaModelo=String(c.modelo||'').trim();
  const partes=marcaModelo.split(' ');
  const marca=partes[0]||'--';
  const modelo=partes.slice(1).join(' ')||'--';
  const _rep=_ppRepuestosDeCita(c,oc,ppSelectedDate);
  const items=_rep.items;
  const manoObra=Number(_rep.manoObra||0);
  const totalRep=items.reduce((s,it)=>s+(Number(it.precio_unitario||0)*Number(it.cantidad||0)),0);
  const totalGral=totalRep+manoObra;
  const totalDesc=totalGral*0.9;
  const hoy=new Date().toLocaleDateString('es-CL');
  const filas=[
    ['OC / Folio', oc||'--'],['Patente', pat],
    ['Cliente', c.nombre||c.cliente||'--'],['Rut cliente', c.rut||'--'],
    ['Marca', marca],['Modelo', modelo],['VIN', c.vin||'--'],
    ['Kilometraje', c.km?Number(c.km).toLocaleString('es-CL')+' km':'--'],
    ['Servicio', c.servicio||'--'],['Mantencion', c.mantencion||'--'],
    ['Asesor', c.asesor||'--'],['Sucursal', c.sucursal||SUCURSAL],
  ];
  const filasHtml=filas.map(([l,v])=>`<tr><td class="lbl">${esc(l)}</td><td>${esc(v)}</td></tr>`).join('');
  const itemsHtml=items.map(it=>`<tr>
      <td>${esc(it.nombre||'--')}</td><td>${esc(it.codigo||'--')}</td>
      <td style="text-align:center">${esc(it.cantidad||'--')}</td>
      <td style="text-align:right">${fmtCLP(it.precio_unitario)}</td>
      <td style="text-align:right">${fmtCLP(Number(it.precio_unitario||0)*Number(it.cantidad||0))}</td>
    </tr>`).join('');
  const html=`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <title>Presupuesto ${esc(pat)}</title>
    <style>
      *{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;}
      body{padding:28px;color:#222;}
      .hd{display:flex;align-items:center;gap:16px;border-bottom:3px solid #0b2e63;padding-bottom:12px;margin-bottom:18px;}
      .hd img{height:54px;}
      .hd h1{font-size:18px;color:#0b2e63;margin:0;}
      .hd p{margin:2px 0 0;color:#667;font-size:12px;}
      table.det{width:100%;border-collapse:collapse;margin-bottom:18px;}
      table.det td{padding:4px 8px;font-size:12px;border-bottom:1px solid #eee;}
      table.det td.lbl{color:#889;width:180px;font-weight:600;}
      table.rep{width:100%;border-collapse:collapse;margin-bottom:12px;}
      table.rep th{background:#0b2e63;color:#fff;padding:6px 8px;font-size:11px;text-align:left;}
      table.rep td{border:1px solid #ddd;padding:6px 8px;font-size:12px;}
      .tot-row td{font-weight:700;background:#f4f6f8;}
      .foot{margin-top:24px;font-size:10px;color:#999;text-align:center;}
      @media print{.no-print{display:none;}}
    </style></head><body>
    <div class="hd">${LOGO_URI?`<img src="${LOGO_URI}"/>`:''}
      <div><h1>Presupuesto de Mantencion — Curifor S.A</h1>
      <p>Generado ${hoy} · ${SUCURSAL}</p></div></div>
    <table class="det">${filasHtml}</table>
    <table class="rep"><thead><tr><th>Nombre / Descripcion repuesto</th><th>Codigo</th>
      <th>Cantidad</th><th>Valor Unitario</th><th>Subtotal</th></tr></thead><tbody>
      ${itemsHtml||'<tr><td colspan="5" style="text-align:center;color:#888">Sin repuestos sugeridos</td></tr>'}
      <tr class="tot-row"><td colspan="2">Mano de obra</td>
        <td style="text-align:center">${(Number(_rep.horas)||0).toFixed(1)} h</td>
        <td></td><td style="text-align:right">${fmtCLP(manoObra)}</td></tr>
      <tr class="tot-row"><td colspan="4">TOTAL NETO</td><td style="text-align:right">${fmtCLP(totalGral)}</td></tr>
      ${conDescuento?`
      <tr><td colspan="4" style="color:#c0392b">Descuento (10%)</td><td style="text-align:right;color:#c0392b">- ${fmtCLP(totalGral-totalDesc)}</td></tr>
      <tr class="tot-row" style="background:#e8f5e9"><td colspan="4">TOTAL CON DESCUENTO</td><td style="text-align:right">${fmtCLP(totalDesc)}</td></tr>`:''}
    </tbody></table>
    <div class="foot">Curifor S.A — Presupuesto referencial generado desde el Pre-picking del Planificador de Taller.</div>
    <div class="no-print" style="text-align:center;margin-top:16px">
      <button onclick="window.print()" style="padding:8px 20px;font-size:13px;cursor:pointer">🖨️ Imprimir / Guardar como PDF</button>
    </div>
    </body></html>`;
  const w=window.open('','_blank');
  if(!w){toast('El navegador bloqueo la ventana emergente — habilitala para exportar el presupuesto');return;}
  w.document.write(html);
  w.document.close();
}

function loadData(){
  // Datos inyectados desde Python — sin fetch, sin async, carga inmediata
  agendaData = Object.keys(_AGENDA_INIT).length ? _AGENDA_INIT : null;
  ctrlData   = Object.keys(_CTRL_INIT).length   ? _CTRL_INIT   : null;
  ctrlSha    = _CTRL_SHA || null;
  ppData     = Object.keys(_PP_INIT).length     ? _PP_INIT     : {};
  ppSha      = _PP_SHA || null;
  prodData   = Object.keys(_PROD_INIT).length   ? _PROD_INIT   : null;
  asesoresSucursal = getAsesoresSucursal();
  buildOrdenes();
  const _importadas=autoImportarCitas();
  const _reparadas=_repararBloquesMultiDia();
  document.getElementById('loading').style.display='none';
  document.getElementById('main').style.display='block';
  renderJPCB();
  selectedDate=formatDate(planDates[0]);
  renderDateTabs();
  ppSelectedDate=formatDate(planDates[1]); // Pre-picking abre por defecto en "Manana"
  if(_importadas>0||_reparadas>0){
    saveCtrl();
  } else if(PUEDE_EDITAR){
    // No hubo citas nuevas que autoimportar (no dispara ningun saveCtrl), pero igual
    // conviene refrescar una vez al abrir la pagina: trae cambios recientes de otra
    // sesion Y limpia duplicados de patente+OT que hayan quedado guardados de una
    // carrera anterior (ver _dedupOrdenesPorPatenteOT), sin esperar a la primera
    // edicion propia. Solo con PUEDE_EDITAR — un usuario de solo lectura no tiene
    // por que disparar este refresco.
    _refrescarCtrlSha();
  }
}

function buildOrdenes(){
  const s=ctrlData&&ctrlData[SUCURSAL];
  ordenes=s&&s.ordenes?s.ordenes.map(o=>Object.assign({},o)):[];
  tecnicos=s&&s.tecnicos?[...s.tecnicos]:[];
  _snapshotOrdenes();_snapshotBloques();
}
/* Guarda el estado "ya sincronizado" de ordenes/bloques — se usa como punto de
   comparacion para saber que cambio localmente desde la ultima vez que se
   leyo/escribio GitHub, y asi mezclar en vez de pisar los cambios de otros
   usuarios que hayan editado la MISMA sucursal mientras tanto. */
function _snapshotOrdenes(){
  _ordenesBaseline=new Map(ordenes.map(o=>[String(o.id),JSON.stringify(o)]));
}
function _snapshotBloques(){
  const b=(ctrlData&&ctrlData[SUCURSAL]&&ctrlData[SUCURSAL].bloques)||{};
  _bloquesBaseline=new Map(Object.keys(b).map(k=>[k,JSON.stringify(b[k])]));
}
/* ─── Auto-reparacion de bloques multi-dia al cargar la pagina ───
   30/07/2026: antes de este fix, un vehiculo con "Salida (fecha)" varios dias despues
   de "Ingreso (fecha)" solo quedaba con un bloque en el primer dia (bug de
   upsertBloqueDesdeOrden, ver comentario de esa funcion) — y ese bloque ademas dejaba de
   verse apenas esa fecha salia de la ventana visible del Planificador (hoy+4). Ordenes
   que ya quedaron guardadas asi (creadas ANTES del fix) no se corrigen solas con solo
   subir el codigo nuevo — el bloque ya esta persistido en control_taller.json y nada
   vuelve a llamar a upsertBloqueDesdeOrden a menos que alguien edite un campo de esa
   orden a mano. Esta funcion revisa, en cada carga de la pagina, las ordenes activas que
   son multi-dia (tecnico+horarios+fechas completos, con Salida (fecha) 1+ dia despues de
   Ingreso (fecha)) y, si falta el bloque de ALGUNO de los dias que deberia cubrir,
   recalcula toda la orden con upsertBloqueDesdeOrden — asi el caso ya reportado (y
   cualquier otro igual) se autocorrige la primera vez que alguien abre el Planificador
   despues de subir este fix, sin tener que volver a tocar cada orden a mano. No toca
   ordenes de un solo dia (turno normal o cruce de una sola noche) que ya esten bien. */
function _repararBloquesMultiDia(){
  if(!ctrlData||!ctrlData[SUCURSAL])return 0;
  if(!ctrlData[SUCURSAL].bloques)ctrlData[SUCURSAL].bloques={};
  let reparadas=0;
  const conCoflicto=[];
  ordenes.forEach(o=>{
    if(o.cerrada)return;
    const tecOk=o.tecnico!==null&&o.tecnico!==undefined&&o.tecnico!=='';
    if(!tecOk||!o.ingreso_taller||!o.salida_taller||!o.ingreso||!o.salida)return;
    const fIni=parseDateISO(o.ingreso), fSal=parseDateISO(o.salida);
    if(!fIni||!fSal)return;
    const nDias=Math.round((fSal-fIni)/86400000);
    if(nDias<1)return; // no es multi-dia — nada que reparar aca
    const dateStr=isoToDdmmyyyy(o.ingreso);
    const diasSpan=[];
    for(let i=0;i<=nDias;i++)diasSpan.push(addDiasFecha(dateStr,i));
    const prefijo='ct'+o.id;
    const cubreTodos=diasSpan.every(ds=>(ctrlData[SUCURSAL].bloques[ds]||[]).some(b=>b.id===prefijo||String(b.id).startsWith(prefijo+'_')));
    if(!cubreTodos){
      // Con la regla imperativa (30/07/2026) upsertBloqueDesdeOrden puede rechazar la
      // reparacion si, al recalcular, esta orden ahora chocaria con otro vehiculo del
      // mismo tecnico (dato viejo inconsistente) — en ese caso no se fuerza nada, se
      // deja para revision manual y se avisa junto al resto al terminar.
      const res=upsertBloqueDesdeOrden(o);
      if(res&&res.ok===false){conCoflicto.push(o.patente||o.ot||o.id);}
      else{reparadas++;}
    }
  });
  if(conCoflicto.length){
    toast('⚠️ '+conCoflicto.length+' vehiculo(s) con choque de horario detectado al reparar ('+conCoflicto.join(', ')+') — revisar tecnico/horario a mano', 5000);
  }
  return reparadas;
}
function detectTipo(c){const s=(c.servicio||c.mantencion||'').toLowerCase();if(s.includes('recall'))return'recall';if(s.includes('mant')||c.mantencion)return'mant';if(s.includes('diag'))return'diag';if(s.includes('rep'))return'rep';return'ot';}

/* ─── Control de Taller — helpers de fecha/patente ─── */
const normPat=p=>String(p||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase().slice(0,8);
function isoToday(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function ddmmyyyyToIso(s){
  if(!s)return isoToday();
  const p=String(s).split('/');
  if(p.length!==3)return isoToday();
  let anio=p[2].trim();
  if(anio.length===2)anio='20'+anio; // la agenda a veces trae el año en 2 digitos (DD/MM/YY)
  return anio+'-'+p[1].padStart(2,'0')+'-'+p[0].padStart(2,'0');
}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function parseDateISO(s){if(!s)return null;const p=String(s).split('-');if(p.length!==3)return null;return new Date(+p[0],+p[1]-1,+p[2]);}
function calcDiasEnTaller(o){const ini=parseDateISO(o.ingreso);if(!ini)return'--';const fin=o.salida?parseDateISO(o.salida):new Date();if(!fin)return'--';const d=Math.floor((fin-ini)/86400000);return d>=0?d:0;}
function calcDiasFaltantesEta(o){if(!o.eta)return'--';const e=parseDateISO(o.eta);if(!e)return'--';const d=Math.ceil((e-new Date())/86400000);return d;}
function isoToDdmmyyyy(iso){const p=String(iso||'').split('-');if(p.length!==3)return formatDate(planDates[0]);return p[2]+'/'+p[1]+'/'+p[0];}
function isWithinLastDays(iso,days){const d=parseDateISO(iso);if(!d)return false;const diff=(new Date(new Date().toDateString())-d)/86400000;return diff<=days&&diff>=-1;}
function esPatenteExcluida(p){return/^SP\d{4}$/i.test(normPat(p));}
function ctEstadoIcon(o){return o.salida?'🧍':'🎟️';}
function ctEstadoTitle(o){return o.salida?'Retirado ('+o.salida+')':'En taller (ingresado, sin marcar salida)';}
function timeToMin(t){if(!t)return null;const p=String(t).split(':');if(p.length<2)return null;const h=+p[0],m=+p[1];if(isNaN(h)||isNaN(m))return null;return h*60+m;}

/* ─── Turnos que cruzan a la jornada siguiente (ej. ingreso 16:00, salida 10:00 del
   dia siguiente) — 22/07/2026, a pedido de Cristobal. Un turno se considera "overnight"
   cuando Salida Taller es menor o igual a Ingreso Taller: en ese caso ya no cabe en un
   solo dia, y hay que partirlo en 2 bloques (uno en la jornada de ingreso, hasta el
   cierre del dia; otro en la jornada siguiente, desde la apertura hasta la Salida
   Taller real) para que el tecnico lo vea asignado en AMBOS dias en el grid. ─── */
function addDiasFecha(dateStr,n){const d=parseDate(dateStr);d.setDate(d.getDate()+n);return formatDate(d);}
function esCruceNoche(o){
  const i=timeToMin(o.ingreso_taller),f=timeToMin(o.salida_taller);
  return i!==null&&f!==null&&f<=i;
}
/* Fecha+hora real de Salida Taller, agregando el dia siguiente si el turno cruza la
   medianoche — para mostrar en el JPCB/modal/Planificador el dato completo (no solo la
   hora, que por si sola confundiria un turno nocturno con uno diurno). */
function fechaSalidaTallerTexto(o){
  if(!o.salida_taller)return '';
  if(esCruceNoche(o))return addDiasFecha(isoToDdmmyyyy(o.ingreso),1)+' '+o.salida_taller;
  return o.salida_taller;
}

/* ─── Duracion estimada (tempario de mantencion) ───
   Si la orden trae horas_tempario (cruce marca/modelo + km de mantencion contra el
   tempario de mano de obra, calculado en el consolidador desde la cita de Agenda),
   se usa esa duracion para proponer la Salida Taller apenas se asigna tecnico.
   Sigue siendo 100% editable a mano (salida_taller o duracion_min) por si hay
   atrasos — esto solo fija un valor inicial razonable, no un limite.
   NOTA (17/07/2026): Horario Ingreso (hora_rec) y Horario Entrega (hora_compromiso)
   son ahora puramente informativos — vienen de la Agenda / son el compromiso de
   entrega al cliente, y ya NO alimentan el Planificador de Tecnicos ni el Tiempo
   Estimado. Esos dos pasaron a depender de Ingreso Taller / Salida Taller. */
function calcularSalidaTaller(o){
  const ini=timeToMin(o.ingreso_taller);
  if(ini===null)return '';
  const horas=(typeof o.horas_tempario==='number'&&o.horas_tempario>0)?o.horas_tempario:((o.duracion_min||60)/60);
  const dateStr=isoToDdmmyyyy(o.ingreso);
  const end=getEnd(dateStr);
  let fin=Math.min(ini+Math.round(horas*60),end);
  fin=Math.max(fin,Math.min(ini+STEP,end));
  fin=Math.ceil(fin/STEP)*STEP;
  return hhmm(fin);
}
/* Duracion en minutos entre Ingreso Taller y Salida Taller, considerando turnos que
   cruzan a la jornada siguiente (Salida <= Ingreso => se cuenta lo que falta hasta
   medianoche + lo que ya paso desde la apertura del dia siguiente). */
function duracionTallerMin(o){
  const iniM=timeToMin(o.ingreso_taller),finM=timeToMin(o.salida_taller);
  if(iniM===null||finM===null)return null;
  return finM<=iniM?(24*60-iniM)+finM:finM-iniM;
}
function tiempoEstimadoTexto(o){
  const dur=duracionTallerMin(o);
  const cruce=esCruceNoche(o)?' · 🌙 cruza a la jornada siguiente ('+fechaSalidaTallerTexto(o)+')':'';
  if(typeof o.horas_tempario==='number'&&o.horas_tempario>0){
    const extendido=(dur!==null&&dur>Math.round(o.horas_tempario*60)+5);
    return o.horas_tempario.toFixed(1)+' h (tempario)'+(extendido?' · ⏳ extendido':'')+cruce;
  }
  if(dur!==null&&dur>0)return(dur/60).toFixed(1)+' h (manual)'+cruce;
  return '--';
}

/* ─── Regla imperativa (30/07/2026, a pedido de Cristobal): un tecnico NO puede tener
   2 trabajos asignados al mismo tiempo ───
   Antes, si el horario de un vehiculo se cruzaba con otro del mismo tecnico, el sistema
   corria uno en silencio al primer espacio libre (acomodarSinCruce, ahora eliminada).
   Cristobal pidio explicitamente que esto deje de "arreglarse solo": si asignar/editar
   un vehiculo dejaria a un tecnico con 2 trabajos superpuestos, la asignacion se debe
   RECHAZAR por completo (no se guarda nada, se avisa el choque) — hay que elegir otro
   tecnico o ajustar el horario a mano antes de continuar. Esto aplica tanto a asignar/
   editar tecnico y horarios desde Control de Taller o el modal de detalle, como a
   arrastrar una cita de Programacion directo a una celda del grid.

   _calcularSegmentosOrden(o): calcula que dia(s)/horario(s) OCUPARIA una orden con sus
   valores ACTUALES (tecnico, ingreso_taller, salida_taller, ingreso, salida) — sin tocar
   ctrlData ni bloques, solo como consulta. Mismo criterio de siempre: si Salida (fecha)
   es 1+ dia posterior a Ingreso (fecha), un segmento por cada dia del rango (jornada
   completa en los dias intermedios); si no, turno normal de un dia o cruce de una sola
   noche (Salida Taller <= Ingreso Taller). */
function _calcularSegmentosOrden(o){
  const tecOk=o.tecnico!==null&&o.tecnico!==undefined&&o.tecnico!=='';
  const iniRaw=timeToMin(o.ingreso_taller),finRaw=timeToMin(o.salida_taller);
  if(!tecOk||iniRaw===null||finRaw===null||finRaw===iniRaw)return {kind:'none',segmentos:[]};
  const dateStr=isoToDdmmyyyy(o.ingreso);
  const fIni=parseDateISO(o.ingreso), fSal=parseDateISO(o.salida);
  let nDiasSalida=0;
  if(fIni&&fSal)nDiasSalida=Math.round((fSal-fIni)/86400000);

  if(nDiasSalida>=1){
    const diasSpan=[];
    for(let i=0;i<=nDiasSalida;i++)diasSpan.push(addDiasFecha(dateStr,i));
    const segmentos=diasSpan.map((ds,idx)=>{
      const end=getEnd(ds);
      const esPrimero=idx===0, esUltimo=idx===diasSpan.length-1;
      let iniMin=esPrimero?Math.max(START,Math.min(iniRaw,end-STEP)):START;
      iniMin=Math.floor(iniMin/STEP)*STEP;
      let finMin=esUltimo?Math.max(iniMin+STEP,Math.min(finRaw,end)):end;
      finMin=Math.ceil(finMin/STEP)*STEP;
      if(finMin<=iniMin)finMin=Math.min(iniMin+STEP,end);
      return {fecha:ds,ini:iniMin,fin:finMin,esPrimero,esUltimo};
    });
    return {kind:'multi',dateStr,segmentos};
  }

  const dateStr2=addDiasFecha(dateStr,1);
  if(finRaw<iniRaw){
    const end1=getEnd(dateStr);
    let iniMin=Math.max(START,Math.min(iniRaw,end1-STEP));
    iniMin=Math.floor(iniMin/STEP)*STEP;
    const end2=getEnd(dateStr2);
    let finMin2=Math.max(START+STEP,Math.min(finRaw,end2));
    finMin2=Math.ceil(finMin2/STEP)*STEP;
    return {kind:'overnight',dateStr,dateStr2,
      segmentos:[{fecha:dateStr,ini:iniMin,fin:end1},{fecha:dateStr2,ini:START,fin:finMin2}]};
  }

  const end=getEnd(dateStr);
  let iniMin=Math.max(START,Math.min(iniRaw,end-STEP));
  iniMin=Math.floor(iniMin/STEP)*STEP;
  let finMin=Math.max(iniMin+STEP,Math.min(finRaw,end));
  finMin=Math.ceil(finMin/STEP)*STEP;
  return {kind:'same',dateStr,segmentos:[{fecha:dateStr,ini:iniMin,fin:finMin}]};
}

/* Busca si los segmentos de una orden chocan con: (1) otra orden ACTIVA con el mismo
   tecnico (comparando sus propios segmentos calculados en vivo, cubre tambien el caso
   multi-dia), o (2) un bloque suelto ya existente en el grid con ese tecnico ese dia
   (ej. una cita asignada por drag&drop desde Programacion, que no tiene una orden propia
   detras). Se excluyen los bloques/orden de la MISMA orden que se esta evaluando, para
   poder recalcular sin toparse consigo misma. Devuelve null si no hay choque. */
function _buscarChoqueTecnico(o,calc){
  const segmentos=calc.segmentos;
  if(!segmentos.length)return null;
  const tec=+o.tecnico;
  const prefijo='ct'+o.id;

  for(const o2 of ordenes){
    if(o2.id===o.id||o2.cerrada)continue;
    if(o2.tecnico===null||o2.tecnico===undefined||o2.tecnico===''||+o2.tecnico!==tec)continue;
    const calc2=_calcularSegmentosOrden(o2);
    for(const s of segmentos){
      for(const s2 of calc2.segmentos){
        if(s.fecha===s2.fecha&&s.ini<s2.fin&&s.fin>s2.ini){
          return {tipo:'orden',otra:o2,fecha:s.fecha,ini:s2.ini,fin:s2.fin};
        }
      }
    }
  }

  for(const s of segmentos){
    const bls=(ctrlData?.[SUCURSAL]?.bloques?.[s.fecha]||[]);
    for(const b of bls){
      if(+b.tec!==tec)continue;
      if(b.id===prefijo||String(b.id).startsWith(prefijo+'_'))continue;
      const bIni=parseHH(b.ini),bFin=bIni+(b.dur||60);
      if(s.ini<bFin&&s.fin>bIni){
        return {tipo:'bloque',otra:b,fecha:s.fecha,ini:bIni,fin:bFin};
      }
    }
  }
  return null;
}

function _mensajeChoqueTecnico(o,conflicto){
  const tecNom=(o.tecnico!==null&&o.tecnico!==undefined&&tecnicos[+o.tecnico])?tecnicos[+o.tecnico]:'Este tecnico';
  const otraPat=conflicto.otra?.patente||conflicto.otra?.oc||conflicto.otra?.ot||'otro vehiculo';
  return `🚫 ${tecNom} ya tiene asignado ${otraPat} el ${conflicto.fecha} de ${hhmm(conflicto.ini)} a ${hhmm(conflicto.fin)} — un tecnico no puede tener 2 trabajos al mismo tiempo. Elige otro tecnico o ajusta el horario/fecha antes de continuar.`;
}

/* ─── Sincroniza el bloque del Planificador (Tecnico x Hora) con el horario de la orden ───
   Antes de crear/actualizar cualquier bloque, valida la regla de arriba — si hay choque,
   NO TOCA NADA (ni limpia ni crea bloques) y devuelve {ok:false,conflicto} para que el
   llamador revierta el cambio que lo provoco y avise. Si no hay choque, limpia los
   bloques viejos de esta orden en TODAS las fechas (por si el rango de dias/tipo de turno
   cambio) y crea los nuevos segun _calcularSegmentosOrden, devolviendo {ok:true}. */
function upsertBloqueDesdeOrden(o){
  if(!ctrlData)ctrlData={};
  if(!ctrlData[SUCURSAL])ctrlData[SUCURSAL]={tecnicos,ordenes,bloques:{}};
  if(!ctrlData[SUCURSAL].bloques)ctrlData[SUCURSAL].bloques={};

  const prefijo='ct'+o.id;
  const _limpiarTodo=()=>{
    Object.keys(ctrlData[SUCURSAL].bloques).forEach(ds=>{
      ctrlData[SUCURSAL].bloques[ds]=ctrlData[SUCURSAL].bloques[ds].filter(b=>!(b.id===prefijo||String(b.id).startsWith(prefijo+'_')));
    });
  };

  const calc=_calcularSegmentosOrden(o);
  if(!calc.segmentos.length){ _limpiarTodo(); return {ok:true}; }

  const conflicto=_buscarChoqueTecnico(o,calc);
  if(conflicto)return {ok:false,conflicto};

  _limpiarTodo();
  const baseBloque={
    tec:+o.tecnico, oc:o.ot||o.patente, patente:o.patente, cliente:o.cliente||'',
    modelo:o.modelo||'', servicio:o.comentarios||o.servicio||'',
    horas_tempario:(typeof o.horas_tempario==='number'?o.horas_tempario:null),
  };

  if(calc.kind==='multi'){
    const ultimaFecha=calc.segmentos[calc.segmentos.length-1].fecha;
    calc.segmentos.forEach((s,idx)=>{
      if(!ctrlData[SUCURSAL].bloques[s.fecha])ctrlData[SUCURSAL].bloques[s.fecha]=[];
      const bid=(s.esPrimero&&s.esUltimo)?prefijo:(prefijo+'_d'+idx);
      let contInfo='';
      if(!s.esPrimero&&!s.esUltimo)contInfo='🗓️ en taller todo el dia (ingreso '+calc.dateStr+' · salida '+ultimaFecha+')';
      else if(s.esPrimero&&!s.esUltimo)contInfo='🗓️ sigue en taller hasta el '+ultimaFecha;
      else if(s.esUltimo&&!s.esPrimero)contInfo='🗓️ en taller desde el '+calc.dateStr;
      ctrlData[SUCURSAL].bloques[s.fecha].push({...baseBloque,
        id:bid, ini:hhmm(s.ini), dur:s.fin-s.ini, contInfo,
      });
    });
    return {ok:true};
  }

  if(calc.kind==='overnight'){
    if(!ctrlData[SUCURSAL].bloques[calc.dateStr])ctrlData[SUCURSAL].bloques[calc.dateStr]=[];
    if(!ctrlData[SUCURSAL].bloques[calc.dateStr2])ctrlData[SUCURSAL].bloques[calc.dateStr2]=[];
    const[s1,s2]=calc.segmentos;
    ctrlData[SUCURSAL].bloques[calc.dateStr].push({...baseBloque,
      id:prefijo+'_a', ini:hhmm(s1.ini), dur:s1.fin-s1.ini,
      cont:'sigue', contInfo:'🌙 continua en la jornada siguiente ('+calc.dateStr2+' '+o.salida_taller+')',
    });
    ctrlData[SUCURSAL].bloques[calc.dateStr2].push({...baseBloque,
      id:prefijo+'_b', ini:hhmm(s2.ini), dur:s2.fin-s2.ini,
      cont:'viene', contInfo:'🌙 viene de la jornada anterior ('+calc.dateStr+' '+o.ingreso_taller+')',
    });
    return {ok:true};
  }

  // same
  if(!ctrlData[SUCURSAL].bloques[calc.dateStr])ctrlData[SUCURSAL].bloques[calc.dateStr]=[];
  const s=calc.segmentos[0];
  ctrlData[SUCURSAL].bloques[calc.dateStr].push({...baseBloque,
    id:prefijo, ini:hhmm(s.ini), dur:s.fin-s.ini,
  });
  return {ok:true};
}

/* Aplica un cambio de tecnico/horario/fecha (los 5 campos que alimentan el Planificador
   de Tecnicos) validando PRIMERO la regla de arriba. Si hay choque, revierte TODOS los
   campos relacionados a su valor anterior (incluyendo el auto-llenado de Salida Taller
   que pudo haberse disparado) y devuelve {ok:false,mensaje} SIN tocar bloques ni guardar
   — el llamador debe mostrar el mensaje y volver a pintar la UI para que los campos
   reflejen el valor original. Si no hay choque, el bloque ya queda actualizado dentro de
   upsertBloqueDesdeOrden y devuelve {ok:true}. */
function _aplicarCambioAgenda(o,field,val){
  const _snap={tecnico:o.tecnico,ingreso_taller:o.ingreso_taller,salida_taller:o.salida_taller,ingreso:o.ingreso,salida:o.salida};
  o[field]=val;
  const tecOk=o.tecnico!==null&&o.tecnico!==undefined&&o.tecnico!=='';
  if((field==='tecnico'||field==='ingreso_taller')&&tecOk&&o.ingreso_taller&&!o.salida_taller){
    o.salida_taller=calcularSalidaTaller(o);
  }
  const res=upsertBloqueDesdeOrden(o);
  if(res&&res.ok===false){
    const mensaje=_mensajeChoqueTecnico(o,res.conflicto);
    Object.assign(o,_snap);
    return {ok:false,mensaje};
  }
  return {ok:true};
}

/* ─── Control de Taller — importa citas ingresadas de la agenda de hoy ─── */
function autoImportarCitas(){
  const hoyStr=formatDate(planDates[0]);
  const citas=getCitas(hoyStr).filter(c=>c.ingresado);
  let agregadas=0, actualizadas=0;
  citas.forEach(c=>{
    const pat=normPat(c.patente);
    if(!pat)return;
    // Patentes de prueba tipo SP0000 (usadas para probar la Agenda, sin vehiculo real
    // detras) nunca se auto-importan al tablero — ya se excluian de "Vehiculos en
    // Taller" (esPatenteExcluida) pero no de esta funcion, asi que si alguien las
    // eliminaba a mano del JPCB volvian a aparecer solas en la proxima carga de la
    // pagina (la cita seguia "ingresada" en la Agenda). 22/07/2026, a pedido de
    // Cristobal ("esas patentes las eliminé del tablero y volvieron a aparecer").
    if(esPatenteExcluida(pat))return;
    const oc=String(c.oc||'').trim();
    // Si el usuario ya elimino a mano esta combinacion exacta de patente+OT del
    // tablero (eliminarOrdenCT), no se vuelve a crear aunque la cita siga
    // "ingresada" en la Agenda — ver _ordenFueEliminada()/_marcarOrdenEliminada().
    if(_ordenFueEliminada(pat,oc))return;
    // Emparejamiento por patente + Folio OT (no solo patente): una misma patente puede
    // tener 2+ citas activas a la vez con OTs distintas (ej. una de Mantencion y otra de
    // Garantia/Recall/Diagnostico) — cada una debe quedar como su propia orden en Control
    // de Taller/JPCB, no fusionarse en una sola. Si la cita no trae OT (caso raro), se
    // mantiene el comportamiento anterior (match solo por patente) para no duplicar altas
    // manuales sin folio.
    const existente=ordenes.find(o=>normPat(o.patente)===pat &&
      (oc?String(o.ot||'').trim()===oc:!String(o.ot||'').trim()));
    if(existente){
      // Ya existe (creada en una importacion anterior, o por alta manual) — se
      // SINCRONIZA con lo que hoy trae la Agenda para los campos que vienen de ahi
      // (modelo, mantencion, km, asesor, cliente, horario de ingreso): si en la Agenda
      // se corrigio un dato (ej. el modelo estaba mal escrito), el cambio ahora se
      // refleja aca tambien, no solo se rellena cuando esta vacio. Los campos que son
      // 100% de gestion manual del taller (tecnico, etapa, detencion, comentario
      // adicional, numero de caso, N de pedido, ETA, auto de reemplazo, checkboxes
      // ESP/TRA/LAV/PATIO) nunca se tocan aca — siguen siendo responsabilidad exclusiva
      // de quien los edita en Control de Taller.
      let cambio=false;
      if(c.mantencion&&existente.mantencion!==c.mantencion){existente.mantencion=c.mantencion;cambio=true;}
      if(c.modelo&&existente.modelo!==c.modelo){existente.modelo=c.modelo;cambio=true;}
      if(c.km&&existente.km!==c.km){existente.km=c.km;cambio=true;}
      if(c.asesor&&existente.asesor!==c.asesor){existente.asesor=c.asesor;cambio=true;}
      if(!existente.ot&&c.oc){existente.ot=c.oc;cambio=true;}
      const _nomC=c.nombre||c.cliente||'';
      if(_nomC&&existente.cliente!==_nomC){existente.cliente=_nomC;cambio=true;}
      if(c.horario&&existente.hora_rec!==c.horario){existente.hora_rec=c.horario;cambio=true;}
      if(c.vin&&existente.vin!==c.vin){existente.vin=c.vin;cambio=true;}
      if(typeof c.horas_tempario==='number'&&existente.horas_tempario!==c.horas_tempario){existente.horas_tempario=c.horas_tempario;cambio=true;}
      // Comentarios/Motivo (Recall/Mantencion/Diagnostico/etc.) tambien vienen del texto
      // de Servicio de la Agenda — se resincronizan solo cuando ESE texto cambia desde
      // la ultima vez que se importo (guardado en _servicio_src), para no pisar una
      // reclasificacion manual del Motivo que alguien haya hecho a mano en Control de
      // Taller sin que el texto de origen en la Agenda haya cambiado.
      const _svcNow=c.servicio||c.mantencion||'';
      if(_svcNow&&existente._servicio_src!==_svcNow){
        existente.comentarios=_svcNow;
        existente.servicio=_svcNow;
        existente.tipo=detectTipo(c);
        existente._servicio_src=_svcNow;
        cambio=true;
      }
      if(cambio)actualizadas++;
      return;
    }
    const _svcIni=c.servicio||c.mantencion||'';
    const id='a'+Date.now()+Math.random().toString(36).slice(2,6);
    ordenes.push({
      id, patente:pat, cliente:c.nombre||c.cliente||'', modelo:c.modelo||'',
      ot:c.oc||'', km:c.km||'', asesor:c.asesor||'', vin:c.vin||'',
      ingreso:ddmmyyyyToIso(c.fecha), salida:'',
      tecnico:null,
      comentarios:_svcIni, tipo:detectTipo(c), _servicio_src:_svcIni,
      etapa:ETAPAS[0].id, stop:null,
      comentario2:'', numero_caso:'', n_pedido:'', eta:'', auto_reemplazo:'',
      servicio:_svcIni, hora_rec:c.horario||'',
      mantencion:c.mantencion||'', hora_compromiso:'', duracion_min:60,
      ingreso_taller:'', salida_taller:'',
      horas_tempario:(typeof c.horas_tempario==='number'?c.horas_tempario:null),
      reloj_inicio_ts:null, reloj_inicio_txt:'', reloj_fin_ts:null, reloj_fin_txt:'',
      cerrada:false, fecha_cierre:'', estado_campana:'',
      // 23/07/2026, a pedido de Cristobal: toda cita nueva aterriza "sin confirmar" en
      // la columna "Citas <fecha>" del JPCB — recien pasa a Recepcion (y se vuelve
      // visible en Control de Taller/Vehiculos en Taller/grid Tecnico x Hora) cuando
      // alguien confirma "Asiste". Ver citaConfirmada()/marcarAsisteCita().
      estadoCita:'pendiente', fecha_reagenda:'',
    });
    agregadas++;
  });
  // Citas FINALIZADAS (icono persona 🧍 en la agenda = entregado al cliente): el estado
  // de la cita es el indicador final — se le marca Salida (dato informativo) y ademas
  // se cierra sola (pasa al Historial de Taller), asi no se acumulan en Control de
  // Taller/Vehiculos en Taller vehiculos que la Agenda ya dice que se fueron.
  let salidas=0;
  getCitas(hoyStr).filter(c=>c.estado==='finalizado').forEach(c=>{
    const pat=normPat(c.patente);
    if(!pat)return;
    const oc=String(c.oc||'').trim();
    // Igual que en la importacion: si la patente tiene varias ordenes activas (varias
    // OTs), solo se cierra la que corresponde a ESTA cita (misma OT) — no todas las de
    // esa patente, para no cerrar por error la de Mantencion cuando solo la de Garantia
    // ya fue entregada (o viceversa).
    const o=ordenes.find(x=>normPat(x.patente)===pat&&!x.cerrada &&
      (oc?String(x.ot||'').trim()===oc:true));
    if(o){
      if(!(o.salida||'').trim())o.salida=ddmmyyyyToIso(hoyStr);
      _cerrarOrdenInterno(o);
      salidas++;
    }
  });
  return agregadas+actualizadas+salidas;
}

/* ─── Control de Taller — edicion y render ─── */
function editFieldCT(id,field,val){
  const o=byId(id);if(!o)return;
  if(field==='etapa'&&_avanceBloqueadoPorVCU(o,val)){
    alert(`🚫 No se puede avanzar de etapa — falta completar el VCU (Hoja Multipuntos Ford) de ${o.patente}.`);
    renderControlTaller();renderVehiculosTaller();renderJPCB();
    return;
  }
  // Tecnico/Ingreso Taller/Salida Taller/Ingreso (fecha)/Salida (fecha) van por
  // _aplicarCambioAgenda(), que valida la regla imperativa (un tecnico no puede tener
  // 2 trabajos a la vez) ANTES de aplicar el cambio — si hay choque, revierte todo y
  // avisa, sin guardar. El resto de los campos sigue el flujo normal.
  if(['tecnico','ingreso_taller','salida_taller','ingreso','salida'].includes(field)){
    const res=_aplicarCambioAgenda(o,field,val);
    if(!res.ok){
      alert(res.mensaje);
      renderControlTaller();renderVehiculosTaller();renderJPCB();
      return;
    }
    if(currentView==='plan')renderPlanView();
    renderControlTaller();renderVehiculosTaller();renderJPCB();
    saveCtrl();
    return;
  }
  o[field]=val;
  if(field==='etapa')marcarCambioEtapa(o);
  renderControlTaller();
  renderVehiculosTaller();
  renderJPCB();
  saveCtrl();
}
/* Quita del grid Tecnico x Hora TODOS los bloques de una orden (el bloque unico normal
   'ct'+id, el par overnight 'ct'+id+'_a'/'_b', o los N bloques de un rango multi-dia
   'ct'+id+'_d0'/'_d1'/...) — recorre TODAS las fechas con bloques guardados (no solo
   Ingreso/Ingreso+1) para no dejar huerfanos si la orden abarcaba varios dias. Ver
   upsertBloqueDesdeOrden(). */
function _quitarBloquesOrden(o){
  if(!ctrlData?.[SUCURSAL]?.bloques)return;
  const prefijo='ct'+o.id;
  Object.keys(ctrlData[SUCURSAL].bloques).forEach(ds=>{
    ctrlData[SUCURSAL].bloques[ds]=ctrlData[SUCURSAL].bloques[ds].filter(b=>!(b.id===prefijo||String(b.id).startsWith(prefijo+'_')));
  });
}
function eliminarOrdenCT(id){
  const o=byId(id);if(!o)return;
  if(!confirm(`¿Quitar ${o.patente} de Control de Taller? Tambien desaparecera del tablero JPCB.`))return;
  _marcarOrdenEliminada(o.patente,o.ot);
  ordenes=ordenes.filter(x=>x.id!==id);
  _quitarBloquesOrden(o);
  renderControlTaller();renderVehiculosTaller();renderJPCB();
  if(currentView==='plan')renderPlanView();
  saveCtrl();
  toast('Patente eliminada de Control de Taller');
}
/* ─── Cierre de cita — archiva la orden al Historial de Taller ───
   A diferencia de eliminarOrdenCT() (que borra el registro), esto solo la saca de
   los tableros activos (JPCB, Control de Taller, Vehiculos en Taller, Tecnico x
   Hora) y la deja disponible en el Historial. La columna Salida queda como un dato
   informativo aparte — ya no es lo que decide si la orden sigue apareciendo.
   `_cerrarOrdenInterno` hace el trabajo real (sin confirm/toast/re-render, para
   poder reutilizarlo tanto en el cierre manual como en el auto-cierre por Agenda). */
function _cerrarOrdenInterno(o){
  if(o.cerrada)return;
  // Si el reloj de taller quedo corriendo (ej. se finaliza/cierra la cita directo desde
  // "En Proceso", sin pasar formalmente por Lavado/Entrega), se detiene aca — asi el
  // Historial de Taller nunca muestra un reloj "en curso" para una orden ya cerrada.
  if(o.reloj_inicio_ts&&!o.reloj_fin_ts){
    o.reloj_fin_ts=Date.now();
    o.reloj_fin_txt=nowStrCorto();
  }
  o.cerrada=true;
  o.fecha_cierre=isoToday();
  _quitarBloquesOrden(o);
}
function cerrarCita(id){
  const o=byId(id);if(!o)return;
  if(!confirm(`¿Cerrar la cita de ${o.patente}? Desaparecera de JPCB, Control de Taller, Vehiculos en Taller y Tecnico x Hora, y quedara en el Historial de Taller.`))return;
  _cerrarOrdenInterno(o);
  renderControlTaller();renderVehiculosTaller();renderJPCB();
  if(typeof renderHistorialTaller==='function')renderHistorialTaller();
  if(currentView==='plan')renderPlanView();
  saveCtrl();
  toast(`🔒 Cita de ${o.patente} cerrada — pasó al Historial de Taller`);
}
function reabrirCita(id){
  const o=byId(id);if(!o)return;
  if(!confirm(`¿Reabrir la cita de ${o.patente}? Volvera a aparecer en JPCB, Control de Taller y Vehiculos en Taller.`))return;
  o.cerrada=false;
  o.fecha_cierre='';
  o.finalizado_usuario='';
  o.finalizado_fecha='';
  renderControlTaller();renderVehiculosTaller();renderJPCB();
  if(typeof renderHistorialTaller==='function')renderHistorialTaller();
  if(currentView==='plan')renderPlanView();
  saveCtrl();
  toast(`↩️ Cita de ${o.patente} reabierta`);
}
/* Boton "✅ Finalizado" en cada tarjeta del JPCB (24/07/2026, a pedido de Cristobal) —
   mismo permiso limitado que Asiste/No Asiste/Reagenda (PUEDE_CONFIRMAR_CITAS), sin
   requerir el permiso completo de edicion del Planificador. Reutiliza exactamente la
   misma logica de cierre que el boton "🔒 Cerrar" (_cerrarOrdenInterno): la orden pasa
   al Historial de Taller y desaparece de JPCB/Control de Taller/Vehiculos en
   Taller/Tecnico x Hora. Se deja registrado ademas quien y cuando finalizo, para
   mostrarlo en el acumulado de "Finalizados de esta semana" (ver renderFinalizadosSemana). */
function marcarFinalizadoCita(id){
  const o=byId(id);if(!o||o.cerrada)return;
  if(!confirm(`¿Marcar la cita de ${o.patente} como Finalizada? Pasara al Historial de Taller.`))return;
  _cerrarOrdenInterno(o);
  o.finalizado_usuario=USUARIO;
  o.finalizado_fecha=nowStrCorto();
  renderControlTaller();renderVehiculosTaller();renderJPCB();
  if(typeof renderHistorialTaller==='function')renderHistorialTaller();
  if(currentView==='plan')renderPlanView();
  saveCtrl();
  toast(`✅ ${o.patente} finalizado — paso al Historial de Taller`);
}
/* Semana (Lunes-Domingo) de una fecha ISO "AAAA-MM-DD" — usada para que el acumulado
   de "Finalizados de esta semana" se limpie solo al llegar la semana siguiente, sin
   necesidad de ningun proceso de limpieza aparte: la orden sigue con cerrada=true para
   siempre (nunca vuelve a aparecer en las columnas normales del JPCB ni en Control de
   Taller/Vehiculos en Taller) y sigue siempre visible en el Historial de Taller — solo
   deja de calzar con la semana actual en este panel puntual. */
function _lunesSemana(fechaIso){
  if(!fechaIso)return'';
  const partes=fechaIso.split('-').map(Number);
  const y=partes[0],m=partes[1],d=partes[2];
  if(!y||!m||!d)return'';
  const dt=new Date(y,m-1,d);
  const dow=dt.getDay();
  const diff=(dow===0?-6:1-dow);
  dt.setDate(dt.getDate()+diff);
  return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');
}
function esFinalizadoEstaSemana(o){
  if(!o.cerrada||!o.fecha_cierre)return false;
  return _lunesSemana(o.fecha_cierre)===_lunesSemana(isoToday());
}
/* Tarjeta simplificada y de solo informacion para el acumulado de "Finalizados de esta
   semana" — no es arrastrable ni tiene los botones normales del JPCB, solo un boton de
   "↩️ Reabrir" (mismo criterio de permiso que en el Historial de Taller: PUEDE_EDITAR). */
function cardFinalizadaHTML(o){
  const ti=tipoInfo(o);
  return `<div class="card" data-id="${o.id}" style="width:190px;border-left-color:${ti.border};background:${ti.color}">
    <b>${o.patente}</b> <span class="cmeta">${o.cliente||''}</span>
    <div class="cinfo">${o.modelo||''}${o.modelo&&(o.servicio||o.mantencion)?' · ':''}${o.servicio||o.mantencion||ti.label}</div>
    <div class="cmeta">✅ ${o.fecha_cierre||'--'}${o.finalizado_usuario?' · '+esc(o.finalizado_usuario):''}</div>
    ${PUEDE_EDITAR?`<div class="cacts"><button onclick="event.stopPropagation();reabrirCita('${o.id}')">↩️ Reabrir</button></div>`:''}
  </div>`;
}
function renderFinalizadosSemana(){
  const el=document.getElementById('finBoard');
  if(!el)return;
  const cards=ordenes.filter(o=>esFinalizadoEstaSemana(o)&&ordenArea(o)===currentArea);
  const orden=[...cards].sort((a,b)=>(b.fecha_cierre||'').localeCompare(a.fecha_cierre||''));
  if(!orden.length){
    el.innerHTML='<div style="color:#888;font-size:12px;padding:4px">Sin citas finalizadas esta semana.</div>';
    return;
  }
  el.innerHTML=orden.map(cardFinalizadaHTML).join('');
}
function agregarPatenteManual(){
  const pat=normPat(prompt('Patente del vehiculo:')||'');
  if(!pat)return;
  if(ordenes.some(o=>normPat(o.patente)===pat)){alert('Esa patente ya esta en Control de Taller.');return;}
  const id='m'+Date.now()+Math.random().toString(36).slice(2,6);
  ordenes.push({
    id, patente:pat, cliente:'', modelo:'', ot:'', km:'', asesor:'',
    ingreso:isoToday(), salida:'', tecnico:null,
    comentarios:'', tipo:'ot', etapa:ETAPAS[0].id, stop:null,
    comentario2:'', numero_caso:'', n_pedido:'', eta:'', auto_reemplazo:'', servicio:'', hora_rec:'',
    mantencion:'', hora_compromiso:'', duracion_min:60, ingreso_taller:'', salida_taller:'', horas_tempario:null,
    reloj_inicio_ts:null, reloj_inicio_txt:'', reloj_fin_ts:null, reloj_fin_txt:'',
    cerrada:false, fecha_cierre:'', estado_campana:'',
    // Alta manual = el vehiculo ya esta fisicamente en el taller, no pasa por la
    // columna "Citas" (esa es solo para lo que trae la Agenda sin confirmar).
    estadoCita:'asiste', fecha_reagenda:'',
  });
  renderControlTaller();renderVehiculosTaller();renderJPCB();saveCtrl();
  toast(`✅ ${pat} agregado a Control de Taller`);
}

const CT_COLS=28;
function ctTableHead(){
  return `<thead><tr>
    <th>Estado</th><th>Patente</th><th>Modelo</th><th>Mantencion</th><th>OT</th><th>KM</th><th>Asesor</th>
    <th title="Horario que viene de la Agenda — informativo, no alimenta el Planificador de Tecnicos">Horario Ingreso</th>
    <th title="Compromiso de entrega al cliente — informativo, no alimenta el Planificador de Tecnicos">Horario Entrega</th>
    <th>Tiempo Estimado</th>
    <th class="ct-th-taller" title="Ingreso real al taller — alimenta el Planificador de Tecnicos y el Tiempo Estimado">⚙️ Ingreso Taller</th>
    <th class="ct-th-taller" title="Salida real/estimada del taller — alimenta el Planificador de Tecnicos y el Tiempo Estimado">⚙️ Salida Taller</th>
    <th>Ingreso</th><th>Salida</th><th>Dias en taller</th><th>Tecnico</th>
    <th>Comentarios</th><th>Motivo</th><th>Etapa (JPCB)</th><th>Detencion</th><th>Estado Campaña</th>
    <th>Comentario adicional</th><th>Numero de caso</th><th>N° de pedido</th>
    <th>ETA</th><th>Dias faltantes ETA</th><th>Auto de reemplazo</th><th>Acciones</th>
  </tr></thead>`;
}
function ctRowHTML(o){
  const dis=PUEDE_EDITAR?'':'disabled';
  const opcTec=`<option value="">--</option>`+tecnicos.map((t,i)=>`<option value="${i}" ${o.tecnico===i?'selected':''}>${t}</option>`).join('');
  const opcMotivo=Object.entries(TIPOS).map(([k,v])=>`<option value="${k}" ${o.tipo===k?'selected':''}>${v.label}</option>`).join('');
  const opcEtapa=ETAPAS.map(e=>`<option value="${e.id}" ${o.etapa===e.id?'selected':''}>${e.t}</option>`).join('');
  const opcStop=`<option value="">— Sin detencion —</option>`+STOPS.map(s=>`<option value="${s.id}" ${o.stop===s.id?'selected':''}>${s.t}</option>`).join('');
  const opcEstadoCamp=`<option value="">— Sin estado —</option>`+ESTADOS_CAMPANA.map(e=>`<option value="${e.id}" ${o.estado_campana===e.id?'selected':''}>${e.t}</option>`).join('');
  const _asesorActual=(o.asesor||'').trim();
  const _listaAsesores=_asesorActual&&!asesoresSucursal.includes(_asesorActual)?[...asesoresSucursal,_asesorActual]:asesoresSucursal;
  const opcAsesor=`<option value="">--</option>`+_listaAsesores.map(a=>`<option value="${esc(a)}" ${_asesorActual===a?'selected':''}>${esc(a)}</option>`).join('');
  const dias=calcDiasEnTaller(o);
  const diasEta=calcDiasFaltantesEta(o);
  const _et=etapaInfo(o.etapa);
  const _noShow=esNoAsiste(o.ot,o.patente);
  return `<tr style="background:${_noShow?'#f2f2f2':_et.bg}">
    <td style="text-align:center;font-size:15px" title="${esc(ctEstadoTitle(o))}">${ctEstadoIcon(o)}${_noShow?'<br><span class="cita-noasiste" style="font-size:8px">🚫 No asiste</span>':''}</td>
    <td class="ct-pat" style="background:${_noShow?'#f2f2f2':_et.bg};border-left:4px solid ${_noShow?'#b33':_et.color}${_noShow?';text-decoration:line-through':''}">${esc(o.patente)}${esFord(o)?`<br><span class="vcu-chip ${vcuCompleto(o)?'ok':'pend'}" onclick="abrirVCU('${o.id}')" title="Hoja Multipuntos Ford (VCU)">📋 VCU</span>`:''}</td>
    <td><input type="text" class="ct-wide" value="${esc(o.modelo)}" ${dis} onchange="editFieldCT('${o.id}','modelo',this.value)"></td>
    <td><input type="text" class="ct-wide" value="${esc(o.mantencion)}" ${dis} placeholder="ej: 10.000 KMS" onchange="editFieldCT('${o.id}','mantencion',this.value)"></td>
    <td><input type="text" value="${esc(o.ot)}" ${dis} onchange="editFieldCT('${o.id}','ot',this.value)"></td>
    <td><input type="text" value="${esc(o.km)}" ${dis} style="width:60px" onchange="editFieldCT('${o.id}','km',this.value)"></td>
    <td><select ${dis} onchange="editFieldCT('${o.id}','asesor',this.value)" title="Asesores de la Agenda para esta sucursal">${opcAsesor}</select></td>
    <td><input type="time" value="${esc(o.hora_rec)}" ${dis} onchange="editFieldCT('${o.id}','hora_rec',this.value)" title="Viene de la Agenda — informativo, no alimenta el Planificador de Tecnicos"></td>
    <td><input type="time" value="${esc(o.hora_compromiso)}" ${dis} onchange="editFieldCT('${o.id}','hora_compromiso',this.value)" title="Compromiso de entrega al cliente — informativo, no alimenta el Planificador de Tecnicos"></td>
    <td class="ct-dias" title="Calculado desde Ingreso Taller / Salida Taller (y el tempario de mantencion cuando aplica); se puede extender editando Salida Taller">${tiempoEstimadoTexto(o)}</td>
    <td class="ct-td-taller"><input type="time" class="ct-input-taller" value="${esc(o.ingreso_taller)}" ${dis} onchange="editFieldCT('${o.id}','ingreso_taller',this.value)" title="Alimenta el Planificador de Tecnicos y el Tiempo Estimado"></td>
    <td class="ct-td-taller"><input type="time" class="ct-input-taller" value="${esc(o.salida_taller)}" ${dis} onchange="editFieldCT('${o.id}','salida_taller',this.value)" title="Alimenta el Planificador de Tecnicos y el Tiempo Estimado"></td>
    <td><input type="date" value="${esc(o.ingreso)}" ${dis} onchange="editFieldCT('${o.id}','ingreso',this.value)"></td>
    <td><input type="date" value="${esc(o.salida)}" ${dis} onchange="editFieldCT('${o.id}','salida',this.value)"></td>
    <td class="ct-dias">${dias}</td>
    <td><select ${dis} onchange="editFieldCT('${o.id}','tecnico',this.value===''?null:+this.value)">${opcTec}</select></td>
    <td><input type="text" class="ct-wide" value="${esc(o.comentarios)}" ${dis} onchange="editFieldCT('${o.id}','comentarios',this.value)"></td>
    <td><select ${dis} onchange="editFieldCT('${o.id}','tipo',this.value)">${opcMotivo}</select></td>
    <td><select class="et-select" style="background:${_et.color};color:#fff;font-weight:700;border-color:${_et.color}" ${dis} onchange="editFieldCT('${o.id}','etapa',this.value)">${opcEtapa}</select></td>
    <td><select ${dis} onchange="editFieldCT('${o.id}','stop',this.value===''?null:this.value)">${opcStop}</select></td>
    <td><select ${dis} onchange="editFieldCT('${o.id}','estado_campana',this.value)" title="Al elegir Quiebre Stock/Cliente desiste/Falla servidor la orden se oculta del tablero JPCB">${opcEstadoCamp}</select></td>
    <td><input type="text" class="ct-wide" value="${esc(o.comentario2)}" ${dis} onchange="editFieldCT('${o.id}','comentario2',this.value)"></td>
    <td><input type="text" value="${esc(o.numero_caso)}" ${dis} onchange="editFieldCT('${o.id}','numero_caso',this.value)"></td>
    <td><input type="text" value="${esc(o.n_pedido)}" ${dis} onchange="editFieldCT('${o.id}','n_pedido',this.value)"></td>
    <td><input type="date" value="${esc(o.eta)}" ${dis} onchange="editFieldCT('${o.id}','eta',this.value)"></td>
    <td class="ct-dias">${diasEta}</td>
    <td><input type="text" value="${esc(o.auto_reemplazo)}" ${dis} onchange="editFieldCT('${o.id}','auto_reemplazo',this.value)"></td>
    <td style="white-space:nowrap">${PUEDE_EDITAR?`<button class="mbtn" style="padding:2px 6px;font-size:11px" title="Cerrar cita — pasa al Historial de Taller" onclick="cerrarCita('${o.id}')">🔒 Cerrar</button> <button class="mbtn" style="padding:2px 6px;font-size:11px" title="${_noShow?'Reactivar':'Marcar cliente no asiste'}" onclick="toggleNoAsiste('${(o.ot||'').replace(/'/g,"\\'")}','${(o.patente||'').replace(/'/g,"\\'")}')">${_noShow?'↩️':'🚫'} No asiste</button> <button class="ct-del" onclick="eliminarOrdenCT('${o.id}')">🗑</button>`:''}</td>
  </tr>`;
}

function etapaLegendHTML(){
  return ETAPAS.map(e=>`<div class="it"><span class="sw" style="background:${e.bg};border-color:${e.color}"></span>${e.t}</div>`).join('');
}
/* Marca del vehiculo (primera palabra de Modelo, ej. "FORD F150" -> "FORD") — Control
   de Taller/Vehiculos en Taller no guardan la Marca como campo propio, solo Modelo. */
function marcaDeOrden(o){return (o.modelo||'').trim().split(/\s+/)[0]||'Sin marca';}

/* Agrupa las filas por Marca con una barra separadora horizontal entre grupos —
   14/07/2026, a pedido de Cristobal ("alguna barra horizontal que separe por Marcas").
   No reordena dentro de cada marca (respeta el orden ya definido por el caller). */
function ctFilasConMarca(lista){
  let html='', marcaAnt=null;
  const conteos={};
  lista.forEach(o=>{const m=marcaDeOrden(o);conteos[m]=(conteos[m]||0)+1;});
  lista.forEach(o=>{
    const marca=marcaDeOrden(o);
    if(marca!==marcaAnt){
      html+=`<tr class="ct-marca-sep"><td colspan="${CT_COLS}">🚗 ${esc(marca)} (${conteos[marca]})</td></tr>`;
      marcaAnt=marca;
    }
    html+=ctRowHTML(o);
  });
  return html;
}

function renderControlTaller(){
  const g=document.getElementById('ctGrid');
  const leg=document.getElementById('ctLegend');
  if(leg)leg.innerHTML='<b>Color de fila = Etapa:</b>'+etapaLegendHTML();
  const head=ctTableHead();
  // 23/07/2026, a pedido de Cristobal: solo cuentan los vehiculos con asistencia
  // confirmada (citaConfirmada) — las citas todavia sin confirmar viven en la columna
  // "Citas <fecha>" del JPCB, y las marcadas No Asiste/Reagenda quedan fuera de aca
  // tambien (antes seguian viendose con un badge; ahora se sacan por completo).
  const activas=ordenes.filter(o=>!o.cerrada&&citaConfirmada(o)&&ordenArea(o)===currentArea);
  if(!activas.length){
    g.innerHTML=head+`<tbody><tr><td colspan="${CT_COLS}" style="padding:16px;text-align:center;color:#888">Sin vehiculos en Control de Taller. Se agregan solos al confirmar "Asiste" en la columna "Citas" del JPCB, o usa "➕ Agregar patente manual".</td></tr></tbody>`;
    return;
  }
  const orden=[...activas].sort((a,b)=>{
    const ma=marcaDeOrden(a),mb=marcaDeOrden(b);
    if(ma!==mb)return ma.localeCompare(mb);
    return normPat(a.patente).localeCompare(normPat(b.patente));
  });
  g.innerHTML=head+'<tbody>'+ctFilasConMarca(orden)+'</tbody>';
}

/* ─── Vehiculos en Taller — misma tabla, filtrada a los que no estan cerrados.
   La columna Salida es solo informativa (fecha real de retiro) — ya no saca al
   vehiculo de este listado; para eso esta el boton "🔒 Cerrar" (Cierre de cita). */
function renderVehiculosTaller(){
  const g=document.getElementById('vtGrid');
  if(!g)return;
  const leg=document.getElementById('vtLegend');
  if(leg)leg.innerHTML='<b>Color de fila = Etapa:</b>'+etapaLegendHTML();
  const head=ctTableHead();
  const filtradas=ordenes.filter(o=>!o.cerrada&&citaConfirmada(o)&&!esPatenteExcluida(o.patente)&&isWithinLastDays(o.ingreso,60)&&ordenArea(o)===currentArea);
  if(!filtradas.length){
    g.innerHTML=head+`<tbody><tr><td colspan="${CT_COLS}" style="padding:16px;text-align:center;color:#888">Sin vehiculos detenidos en taller dentro de los ultimos 60 dias.</td></tr></tbody>`;
    return;
  }
  const orden=[...filtradas].sort((a,b)=>{
    const ma=marcaDeOrden(a),mb=marcaDeOrden(b);
    if(ma!==mb)return ma.localeCompare(mb);
    return normPat(a.patente).localeCompare(normPat(b.patente));
  });
  g.innerHTML=head+'<tbody>'+ctFilasConMarca(orden)+'</tbody>';
}

/* ─── Historial de Taller — ordenes cerradas con "🔒 Cerrar" (solo lectura + reabrir) ─── */
const HIST_COLS=14;
function histTableHead(){
  return `<thead><tr>
    <th>Patente</th><th>Modelo</th><th>Mantencion</th><th>OT</th><th>Asesor</th><th>Tecnico</th>
    <th>Ingreso</th><th>Salida</th><th>Fecha Cierre</th><th title="Tiempo real desde que entro a En Proceso hasta que paso a Lavado/Entrega">⏱ Reloj Taller</th><th>Etapa (JPCB)</th>
    <th>Comentarios</th><th>Motivo</th><th>Acciones</th>
  </tr></thead>`;
}
function histRowHTML(o){
  const tecNom=o.tecnico!==null&&o.tecnico!==undefined&&tecnicos[o.tecnico]?tecnicos[o.tecnico]:'--';
  const etNom=ETAPAS.find(e=>e.id===o.etapa)?.t||o.etapa||'--';
  const motNom=tipoInfo(o).label;
  return `<tr class="ct-salida">
    <td class="ct-pat">${esc(o.patente)}</td>
    <td>${esc(o.modelo)||'--'}</td>
    <td>${esc(o.mantencion)||'--'}</td>
    <td>${esc(o.ot)||'--'}</td>
    <td>${esc(o.asesor)||'--'}</td>
    <td>${esc(tecNom)}</td>
    <td>${esc(o.ingreso)||'--'}</td>
    <td>${esc(o.salida)||'--'}</td>
    <td>${esc(o.fecha_cierre)||'--'}</td>
    <td>${relojTallerTexto(o)}</td>
    <td>${esc(etNom)}</td>
    <td>${esc(o.comentarios)||'--'}</td>
    <td>${esc(motNom)}</td>
    <td>${PUEDE_EDITAR?`<button class="mbtn" style="padding:2px 6px;font-size:11px" onclick="reabrirCita('${o.id}')">↩️ Reabrir</button>`:''}</td>
  </tr>`;
}
function renderHistorialTaller(){
  const g=document.getElementById('histGrid');
  if(!g)return;
  const head=histTableHead();
  const cerradas=ordenes.filter(o=>o.cerrada&&ordenArea(o)===currentArea);
  if(!cerradas.length){
    g.innerHTML=head+`<tbody><tr><td colspan="${HIST_COLS}" style="padding:16px;text-align:center;color:#888">Sin ordenes cerradas todavia. Usa "🔒 Cerrar" en Control de Taller o Vehiculos en Taller.</td></tr></tbody>`;
    return;
  }
  const orden=[...cerradas].sort((a,b)=>(b.fecha_cierre||'').localeCompare(a.fecha_cierre||''));
  g.innerHTML=head+'<tbody>'+orden.map(histRowHTML).join('')+'</tbody>';
}

/* ─── Produccion Tecnicos (horas facturadas, BDFlexline via consolidador) ───
   Datos inyectados en _PROD_INIT/prodData (mismo mecanismo que agenda/ctrl):
   {fecha_actualizacion, resumen:[{mecanico, sucursal_mecanico, mes:'YYYY-MM',
   total_horas, n_ot}], detalle_producto:[{mecanico, mes, producto, horas,
   cantidad}], detalle_ot:[{mecanico, mes, fecha, nro_ot, producto,
   precio_lista, horas, comi_vta}]}. "resumen" y "detalle_producto" vienen
   agregados desde el consolidador (nunca fila por fila — el historico completo
   de BDFlexline no cabia en un solo blob de GitHub, ver PASO 11); "detalle_ot"
   (agregado 21/07/2026, a pedido de Cristobal) es la excepcion — viene SIN
   agregar, linea por linea tal cual BDFlexline, para poder ver el detalle real
   de Nº OT/Producto/Precio Lista/Total Horas/Comi_Vta por tecnico. Todo ya
   viene filtrado a solo Mano de Obra (producto "MO_...") y tecnicos con RUT
   valido. "resumen" cubre 12 meses (tabla principal + selector);
   "detalle_producto"/"detalle_ot" (drill-down por tecnico) solo los ultimos 3
   meses. Se filtra por la sucursal del Planificador (tolerante a
   tildes/mayusculas via normSuc). Puramente lectura — no guarda nada en
   control_taller.json. 20/07/2026 (detalle_ot: 21/07/2026). */
function _prodMesLabel(mesKey){
  if(mesKey==='Sin fecha')return mesKey;
  const p=(mesKey||'').split('-');
  if(p.length<2)return mesKey||'';
  const mi=parseInt(p[1],10)-1;
  return (MESES[mi]||p[1])+' '+p[0];
}
// FIX 23/07/2026 (ronda 2, a pedido de Cristobal — "estas mostrando personas que ya no
// trabajan desde hace años"): se intento filtrar por el roster de Admin -> Tecnicos
// (Tecnico x Hora), pero Cristobal reporto que con eso "aparecen muy pocos mecanicos
// de los que realmente hay" — ese roster esta pensado para armar el grid de horarios,
// no es una lista completa de todos los que facturan Mano de Obra, y el matching por
// nombre (exacto/substring) fallaba con variantes reales de escritura, excluyendo
// tecnicos activos de verdad. SE QUITO el filtro por roster (ronda 3): el problema real
// de "gente antigua"/horas disparatadas ya se resolvio con el revert de "Sin fecha ->
// mes actual" (los registros viejos/sin fecha ya no se cuelan en el mes en curso, solo
// aparecen si se elige "Sin fecha" a mano) + la exclusion de filas con Total Horas > 24.
// Si en el futuro hace falta sacar a un ex-empleado puntual que SI tenga horas reales
// recientes, hay que resolverlo desde el dato de origen (BDFlexline), no filtrando por
// este roster incompleto.
function _prodRegistrosSucursal(){
  if(!prodData||!Array.isArray(prodData.resumen))return[];
  const target=normSuc(SUCURSAL);
  return prodData.resumen.filter(r=>normSuc(r.sucursal_mecanico||'')===target);
}

/* ─── Feriados de Chile (aproximado) + calculo de jornada esperada del mes ───
   Fijos + Semana Santa (algoritmo de Gauss) + San Pedro y San Pablo (ultimo
   lunes de junio, Ley 19.973) + Encuentro de Dos Mundos (se traslada al lunes
   mas cercano si cae martes/miercoles, o al viernes si cae jueves — Ley
   19.668) + Dia Nacional de los Pueblos Indigenas (aprox. 21 de junio, el
   gobierno lo fija oficialmente cada año y puede variar 20/21/22). NO incluye
   feriados extraordinarios ad-hoc (ej. elecciones) — es una aproximacion para
   medir productividad, no un calendario legal oficial. */
function _pascuaGregoriana(year){
  const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4;
  const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3);
  const h=(19*a+b-d-g+15)%30;
  const i=Math.floor(c/4),k=c%4;
  const l=(32+2*e+2*i-h-k)%7;
  const m=Math.floor((a+11*h+22*l)/451);
  const mes=Math.floor((h+l-7*m+114)/31);
  const dia=((h+l-7*m+114)%31)+1;
  return new Date(year,mes-1,dia);
}
function _feriadosChile(year){
  const set=new Set();
  const add=(y,m,d)=>set.add(`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
  add(year,1,1); add(year,5,1); add(year,5,21); add(year,7,16); add(year,8,15);
  add(year,9,18); add(year,9,19); add(year,10,31); add(year,11,1); add(year,12,8); add(year,12,25);
  const pascua=_pascuaGregoriana(year);
  const vSanto=new Date(pascua);vSanto.setDate(pascua.getDate()-2);
  const sSanto=new Date(pascua);sSanto.setDate(pascua.getDate()-1);
  add(vSanto.getFullYear(),vSanto.getMonth()+1,vSanto.getDate());
  add(sSanto.getFullYear(),sSanto.getMonth()+1,sSanto.getDate());
  {
    let d=new Date(year,5,30);
    while(d.getDay()!==1)d.setDate(d.getDate()-1);
    add(d.getFullYear(),d.getMonth()+1,d.getDate());
  }
  {
    const base=new Date(year,9,12),dow=base.getDay();
    let d=new Date(base);
    if(dow===2)d=new Date(year,9,11);
    else if(dow===3)d=new Date(year,9,10);
    else if(dow===4)d=new Date(year,9,13);
    add(d.getFullYear(),d.getMonth()+1,d.getDate());
  }
  add(year,6,21);
  return set;
}
/* 29/07/2026 (pedido de Cristobal) — Jornada real y productividad acumulada.
   Antes: Lun/Mar 9.75 h y Mie-Vie 8.75 h (horario de puertas abiertas, SIN
   descontar colacion), y el % de productividad se calculaba contra el mes
   COMPLETO — asi, a mitad de mes, todos aparecian con un porcentaje bajisimo
   porque se comparaban las horas vendidas hasta hoy contra la capacidad de
   los 30 dias. Ahora:
     - Cada dia habil descuenta 45 min de colacion:
         Lun/Mar 08:30-18:15 = 9.75 - 0.75 = 9.00 h
         Mie-Vie 08:30-17:15 = 8.75 - 0.75 = 8.00 h
     - El denominador son las HORAS DISPONIBLES ACUMULADAS: horas por dia x
       dias habiles TRANSCURRIDOS (el dia de hoy cuenta completo, confirmado
       por Cristobal). Un mes ya cerrado acumula el mes entero; uno futuro, 0.
     - Si el tecnico esta marcado NO DISPONIBLE (vacaciones/licencia/permiso/
       capacitacion, ver _noDispPeriodos) esos dias habiles NO suman horas
       disponibles — no se le castiga la productividad por dias que no estuvo. */
const PROD_COLACION_H=0.75;
function _prodHorasDia(dow){
  if(dow===0||dow===6)return 0;
  return ((dow===1||dow===2)?9.75:8.75)-PROD_COLACION_H;
}
// Hasta que dia del mes se acumulan horas disponibles.
function _prodDiaTopeMes(mesKey){
  const[y,m]=String(mesKey||'').split('-').map(Number);
  if(!y||!m)return 0;
  const hoy=new Date(),hy=hoy.getFullYear(),hm=hoy.getMonth()+1;
  if(y>hy||(y===hy&&m>hm))return 0;                    // mes futuro
  if(y===hy&&m===hm)return hoy.getDate();              // mes en curso: hasta hoy
  return new Date(y,m,0).getDate();                    // mes cerrado: completo
}
/* Nucleo unico de calculo. `diaMax` null = mes completo. `tec` null = sin
   descontar dias de no disponibilidad. Devuelve tambien lo descontado, para
   poder mostrarlo en pantalla. */
function _prodJornada(mesKey,diaMax,tec){
  const vacio={horas:0,dias:0,horasNoDisp:0,diasNoDisp:0};
  if(!mesKey||mesKey==='Sin fecha')return vacio;
  const[y,m]=mesKey.split('-').map(Number);
  if(!y||!m)return vacio;
  const feriados=_feriadosChile(y);
  const ultimoDia=new Date(y,m,0).getDate();
  const tope=Math.max(0,Math.min(diaMax==null?ultimoDia:diaMax,ultimoDia));
  const periodos=tec?_noDispPeriodos(tec):[];
  let horas=0,dias=0,horasNoDisp=0,diasNoDisp=0;
  for(let d=1;d<=tope;d++){
    const dow=new Date(y,m-1,d).getDay();
    const hDia=_prodHorasDia(dow);
    if(!hDia)continue;
    const iso=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if(feriados.has(iso))continue;
    if(periodos.length&&_prodDiaEnPeriodos(iso,periodos)){horasNoDisp+=hDia;diasNoDisp++;continue;}
    dias++;horas+=hDia;
  }
  return{horas,dias,horasNoDisp,diasNoDisp};
}
// Mes completo (capacidad teorica total) — se usa para proyectar el cierre.
function _prodJornadaMes(mesKey){return _prodJornada(mesKey,null,null);}
// Horas disponibles ACUMULADAS de un tecnico (denominador de la productividad).
function _prodJornadaDisponible(mesKey,tec){
  return _prodJornada(mesKey,_prodDiaTopeMes(mesKey),tec||null);
}

function renderProduccion(){
  const sel=document.getElementById('prodMes');
  if(!sel)return;
  const regsSuc=_prodRegistrosSucursal();
  const _todos=[...new Set(regsSuc.map(r=>r.mes).filter(Boolean))];
  const meses=_todos.filter(m=>m!=='Sin fecha').sort().reverse();
  if(_todos.includes('Sin fecha'))meses.push('Sin fecha');
  const mesesKey=meses.join(',');
  if(sel.dataset.mesesKey!==mesesKey){
    sel.innerHTML=meses.length
      ? meses.map(m=>`<option value="${m}">${esc(_prodMesLabel(m))}</option>`).join('')
      : '<option value="">Sin datos</option>';
    sel.dataset.mesesKey=mesesKey;
    sel.onchange=renderProdTabla;
  }
  renderProdDiagNombres(regsSuc);
  renderProdTabla();
}
// Diagnostico visual (pedido de Cristobal — "en el planificador tecnico x hora estan todos
// los tecnicos, pero en produccion no aparece ni la mitad"): compara la lista de tecnicos
// configurados para esta sucursal (grid Tecnico x Hora, Admin -> Tecnicos) contra los
// nombres reales que trajo BDFlexline para esta misma sucursal (cualquier mes, no solo el
// seleccionado) — usando comparacion normalizada (normSuc: sin tildes, mayusculas). Si un
// tecnico configurado no tiene NINGUNA coincidencia, lo mas probable es que el nombre este
// escrito distinto entre ambos sistemas (son 2 fuentes de datos independientes que nunca se
// cruzan por nombre en ningun otro punto del codigo) — no necesariamente que le falten datos.
// 29/07/2026 — matching por TOKENS (palabras), no por igualdad exacta.
// Desde que el consolidador homologa los nombres de BDFlexline al nombre
// canonico de la nomina ("LOBOS LOYOLA JOSE PATRICIO"), el roster de
// Admin -> Tecnicos sigue escrito en el formato corto/invertido de siempre
// ("JOSE LOBOS LOYOLA") — comparados con === nunca calzarian y el aviso de
// abajo se dispararia para casi todos los tecnicos, aunque sus datos esten
// perfectos. Se replica el criterio de _match_nomina_tecnico() de
// consolidar_OTs.py: palabras de 3+ letras (ignora iniciales sueltas), y hay
// coincidencia si el conjunto mas chico esta contenido en el mas grande
// compartiendo al menos 2 palabras.
function _prodTokensNombre(s){
  return normSuc(s).split(/\\s+/).filter(t=>t.length>=3);
}
function _prodMismoTecnico(a,b){
  const ta=_prodTokensNombre(a), tb=_prodTokensNombre(b);
  if(ta.length<2||tb.length<2)return normSuc(a)===normSuc(b);
  const chico=ta.length<=tb.length?ta:tb, grande=new Set(ta.length<=tb.length?tb:ta);
  const comunes=chico.filter(t=>grande.has(t));
  return comunes.length>=2&&comunes.length===chico.length;
}
function renderProdDiagNombres(regsSuc){
  const el=document.getElementById('prodDiagNombres');
  if(!el)return;
  if(!tecnicos.length||!regsSuc.length){el.innerHTML='';return;}
  const mecanicosReales=[...new Set(regsSuc.map(r=>r.mecanico||'').filter(Boolean))];
  const sinCoincidencia=tecnicos.filter(t=>t&&!mecanicosReales.some(m=>_prodMismoTecnico(t,m)));
  if(!sinCoincidencia.length){el.innerHTML='';return;}
  el.innerHTML=`<div class="prod-det-empty" style="background:#fff8e6;border:1px solid #e8c46b;`
    +`border-radius:6px;padding:8px 10px;margin-bottom:8px;color:#7a5c00;">`
    +`⚠️ ${sinCoincidencia.length} de ${tecnicos.length} técnico(s) configurados en Técnico × Hora `
    +`para esta sucursal no tienen ninguna coincidencia por nombre en Producción Técnicos (BDFlexline): `
    +`<b>${sinCoincidencia.map(esc).join(', ')}</b>. Puede ser que el nombre esté escrito distinto entre `
    +`ambos sistemas, o que ese técnico no tenga Mano de Obra facturada en ningún mes disponible.</div>`;
}
function renderProdStats(filas,mes){
  const el=document.getElementById('prodStats');
  if(!el)return;
  if(!filas.length){el.innerHTML='';return;}
  const totalHoras=filas.reduce((a,f)=>a+f.horas,0);
  const nTec=filas.length;
  const promedio=nTec?totalHoras/nTec:0;
  // La capacidad de la sucursal es la SUMA de las horas disponibles de cada
  // tecnico (no jornada x N), porque cada uno puede tener dias no disponibles
  // distintos — asi el % de la sucursal cuadra con el de las filas de abajo.
  const capacidad=filas.reduce((a,f)=>a+(f.dispHoras||0),0);
  const diasNoDisp=filas.reduce((a,f)=>a+(f.diasNoDisp||0),0);
  const pct=capacidad?(totalHoras/capacidad*100):null;
  const jornadaRef=filas.length?_prodJornadaDisponible(mes,null):{horas:0,dias:0};
  el.innerHTML=`
    <div class="prod-kpi"><b>${totalHoras.toFixed(1)} h</b><span>Total horas vendidas</span></div>
    <div class="prod-kpi"><b>${nTec}</b><span>Técnicos activos</span></div>
    <div class="prod-kpi"><b>${promedio.toFixed(1)} h</b><span>Promedio por técnico</span></div>
    <div class="prod-kpi"><b>${jornadaRef.horas.toFixed(1)} h</b><span>Horas disponibles acumuladas/técnico (${jornadaRef.dias} días hábiles transcurridos)</span></div>
    <div class="prod-kpi"><b>${pct==null?'--':pct.toFixed(0)+'%'}</b><span>Productividad promedio sucursal (${totalHoras.toFixed(1)} / ${capacidad.toFixed(1)} h)</span></div>
    ${diasNoDisp?`<div class="prod-kpi"><b>${diasNoDisp}</b><span>Días no disponibles descontados</span></div>`:''}
  `;
}
function renderProdTabla(){
  const sel=document.getElementById('prodMes');
  const tbody=document.getElementById('prodTbody');
  const totEl=document.getElementById('prodTotalHoras');
  if(!sel||!tbody)return;
  const mes=sel.value;
  const filtro=(document.getElementById('prodBuscarTec').value||'').toLowerCase().trim();
  const regsSuc=_prodRegistrosSucursal();
  const regsMes=mes?regsSuc.filter(r=>r.mes===mes):regsSuc;
  const porTec={};
  regsMes.forEach(r=>{
    const tec=(r.mecanico||'').trim();
    if(!tec)return;
    if(filtro&&!tec.toLowerCase().includes(filtro))return;
    if(!porTec[tec])porTec[tec]={horas:0,nOt:0};
    porTec[tec].horas+=Number(r.total_horas)||0;
    porTec[tec].nOt+=Number(r.n_ot)||0;
  });
  const filas=Object.keys(porTec).map(tec=>{
    const horas=porTec[tec].horas;
    // Denominador propio de cada tecnico: horas disponibles acumuladas, ya
    // descontados sus dias marcados como no disponible.
    const disp=_prodJornadaDisponible(mes,tec);
    const pct=disp.horas?(horas/disp.horas*100):null;
    return{tec,horas,nOt:porTec[tec].nOt,pct,
            dispHoras:disp.horas,dispDias:disp.dias,
            diasNoDisp:disp.diasNoDisp,noDispHoy:_noDispActivoHoy(tec)};
  }).sort((a,b)=>b.horas-a.horas);
  renderProdStats(filas,mes);
  if(!filas.length){
    tbody.innerHTML='<tr><td colspan="5" style="text-align:center;color:#889;padding:16px;">'
      +(prodData?'Sin datos de producción para esta sucursal/mes.'
        :'Aún no se ha cargado Producción Técnicos — corre el consolidador (PASO 11).')+'</td></tr>';
    if(totEl)totEl.textContent='0.0';
    return;
  }
  tbody.innerHTML=filas.map(f=>{
    const tecEsc=esc(f.tec).replace(/'/g,"&#39;");
    // Formato pedido por Cristobal: horas vendidas / horas disponibles acumuladas.
    const frac=`${f.horas.toFixed(1)} / ${f.dispHoras.toFixed(1)} h`;
    const badge=f.noDispHoy?`<span class="nodisp-badge" title="Hoy está marcado como no disponible">🚫 No disponible</span>`:'';
    const btn=PUEDE_DISPONIBILIDAD
      ? `<button class="nodisp-btn" onclick="event.stopPropagation();abrirNoDisponible('${tecEsc}')">🕐 Disponibilidad</button>`
      : (f.diasNoDisp?`<span class="prod-det-empty" style="padding:0">${f.diasNoDisp} día(s) descontado(s)</span>`:'--');
    return `<tr class="prod-row${f.tec===_prodTecSel?' sel':''}" onclick="prodSeleccionarTec('${tecEsc}')">`
      +`<td>${esc(f.tec)} ${badge}</td>`
      +`<td style="text-align:right">${f.horas.toFixed(1)}</td>`
      +`<td style="text-align:right">${f.nOt}</td>`
      +`<td style="text-align:right">${f.pct==null?'--':f.pct.toFixed(0)+'%'}`
      +`<div class="prod-frac">${frac}${f.diasNoDisp?` · −${f.diasNoDisp}d`:''}</div></td>`
      +`<td style="text-align:center">${btn}</td></tr>`;
  }).join('');
  if(totEl)totEl.textContent=filas.reduce((a,f)=>a+f.horas,0).toFixed(1);
  if(_prodTecSel)renderProdDetalle(_prodTecSel,mes);
}
function prodSeleccionarTec(tecEsc){
  // El nombre viaja HTML-escapado desde el onclick (para que comillas/tildes no
  // rompan el atributo) — se revierte al valor real antes de comparar/guardar.
  const tmp=document.createElement('textarea');tmp.innerHTML=tecEsc;const tec=tmp.value;
  _prodTecSel=(_prodTecSel===tec)?null:tec; // clic de nuevo = cierra el panel
  const det=document.getElementById('prodDetalle');
  if(det)det.style.display=_prodTecSel?'block':'none';
  renderProdTabla();
}
// Variante de _prodJornadaMes() acotada a los primeros `diaMax` dias del mes — se usa
// para saber cuanta jornada esperada ya transcurrio "hasta hoy" (o hasta el ultimo dia
// del mes si el mes seleccionado ya es un mes cerrado) y poder proyectar el cierre.
function _prodJornadaHastaFecha(mesKey,diaMax){return _prodJornada(mesKey,diaMax,null);}
// Calcula la serie de horas acumuladas dia a dia (a partir de detalle_ot, ya filtrado por
// tecnico+mes) y proyecta el cierre del mes segun la productividad real hasta hoy (horas
// reales / jornada esperada hasta hoy * jornada esperada total del mes) — mismo criterio
// de "% Productividad" que ya usa el resto del panel (renderProdDetalle/renderProdStats).
// Si el mes seleccionado ya termino (no es el mes en curso), "hasta hoy" = mes completo,
// por lo que la "proyeccion" coincide con el total real (no hay nada que proyectar).
function _prodDatosProyeccion(otsDetalle,mes){
  const out={puntos:[],proyeccion:null,productividad:null,jornadaTotal:{horas:0,dias:0},
             horasAcum:0,diaHoy:0,ultimoDia:0,esMesActual:false};
  if(!mes||mes==='Sin fecha')return out;
  const[y,m]=mes.split('-').map(Number);
  if(!y||!m)return out;
  const ultimoDia=new Date(y,m,0).getDate();
  out.ultimoDia=ultimoDia;
  const hoyReal=new Date();
  out.esMesActual=(hoyReal.getFullYear()===y&&(hoyReal.getMonth()+1)===m);
  out.diaHoy=out.esMesActual?hoyReal.getDate():ultimoDia;

  const porDia={};
  (otsDetalle||[]).forEach(r=>{
    const p=(r.fecha||'').split('/');
    if(p.length!==3)return;
    const d=parseInt(p[0],10);
    if(!d||d<1||d>ultimoDia)return;
    porDia[d]=(porDia[d]||0)+(Number(r.horas)||0);
  });
  let acum=0;
  Object.keys(porDia).map(Number).sort((a,b)=>a-b).forEach(d=>{
    acum+=porDia[d];
    out.puntos.push({dia:d,acumulado:Math.round(acum*100)/100});
  });
  out.horasAcum=Math.round(acum*100)/100;

  out.jornadaTotal=_prodJornadaMes(mes);
  const jornadaHastaHoy=_prodJornadaHastaFecha(mes,out.diaHoy);
  if(jornadaHastaHoy.horas>0){
    out.productividad=out.horasAcum/jornadaHastaHoy.horas;
    out.proyeccion=Math.round(out.productividad*out.jornadaTotal.horas*10)/10;
  }
  return out;
}
// Grafico de puntos (SVG puro, sin librerias externas — el iframe del Planificador no
// tiene salida a CDN) con la evolucion de horas acumuladas en el mes y la proyeccion de
// cierre. Puntos azules = horas reales acumuladas dia a dia; linea punteada gris = jornada
// esperada (referencia lineal); punto naranja = proyeccion de cierre segun productividad.
function _prodSvgProyeccion(proy){
  const W=280,H=170,padL=34,padR=10,padT=10,padB=22;
  const plotW=W-padL-padR,plotH=H-padT-padB;
  const ultimoDia=proy.ultimoDia||30;
  const maxY=Math.max(proy.jornadaTotal.horas||0,proy.horasAcum||0,proy.proyeccion||0,1)*1.12;
  const xPix=d=>padL+((Math.max(1,Math.min(d,ultimoDia))-1)/(Math.max(1,ultimoDia-1)))*plotW;
  const yPix=h=>padT+plotH-(Math.min(h,maxY)/maxY)*plotH;

  if(!proy.puntos.length){
    return '<div class="prod-det-empty">Sin datos suficientes para graficar la proyección del mes.</div>';
  }

  // Linea guia punteada: jornada esperada acumulada de forma pareja de dia 1 a ultimoDia.
  const guiaPts=`${xPix(1)},${yPix(0)} ${xPix(ultimoDia)},${yPix(proy.jornadaTotal.horas||0)}`;

  const puntosSvg=proy.puntos.map(p=>
    `<circle cx="${xPix(p.dia).toFixed(1)}" cy="${yPix(p.acumulado).toFixed(1)}" r="3" fill="#1b6ec2"></circle>`
  ).join('');

  let proyeccionSvg='';
  if(proy.proyeccion!=null){
    const px=xPix(ultimoDia).toFixed(1),py=yPix(proy.proyeccion).toFixed(1);
    proyeccionSvg=`<circle cx="${px}" cy="${py}" r="4.5" fill="#dd6b20" stroke="#fff" stroke-width="1"></circle>`
      +`<text x="${px}" y="${(yPix(proy.proyeccion)-8).toFixed(1)}" text-anchor="end" font-size="9" fill="#dd6b20" font-weight="700">${proy.proyeccion.toFixed(1)} h</text>`;
  }
  // Punto "hoy" (ultimo dato real) destacado, si el mes seleccionado sigue en curso.
  let hoySvg='';
  if(proy.esMesActual&&proy.puntos.length){
    const ultimo=proy.puntos[proy.puntos.length-1];
    hoySvg=`<circle cx="${xPix(ultimo.dia).toFixed(1)}" cy="${yPix(ultimo.acumulado).toFixed(1)}" r="4.5" fill="#0b2e63" stroke="#fff" stroke-width="1"></circle>`;
  }

  const ejeY0=yPix(0).toFixed(1);
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:280px;display:block;">`
    +`<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${ejeY0}" stroke="#cfd6dd"></line>`
    +`<line x1="${padL}" y1="${ejeY0}" x2="${W-padR}" y2="${ejeY0}" stroke="#cfd6dd"></line>`
    +`<polyline points="${guiaPts}" fill="none" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="3,3"></polyline>`
    +puntosSvg+hoySvg+proyeccionSvg
    +`<text x="${padL}" y="${H-6}" font-size="9" fill="#667">Día 1</text>`
    +`<text x="${W-padR}" y="${H-6}" text-anchor="end" font-size="9" fill="#667">Día ${ultimoDia}</text>`
    +`<text x="2" y="${padT+8}" font-size="9" fill="#667">${Math.round(maxY)} h</text>`
    +`</svg>`
    +`<div class="prod-det-empty" style="margin-top:2px;">🔵 Horas acumuladas · 🟠 Proyección al cierre`
    +(proy.productividad!=null?` (productividad ${(proy.productividad*100).toFixed(0)}%)`:'')+'</div>';
}
function renderProdDetalle(tec,mes){
  const el=document.getElementById('prodDetalle');
  if(!el)return;
  const filasResumen=_prodRegistrosSucursal().filter(r=>r.mecanico===tec&&r.mes===mes);
  const horas=filasResumen.reduce((a,r)=>a+(Number(r.total_horas)||0),0);
  const nOt=filasResumen.reduce((a,r)=>a+(Number(r.n_ot)||0),0);
  const disp=_prodJornadaDisponible(mes,tec);
  const pct=disp.horas?(horas/disp.horas*100):null;

  const productos=(prodData&&Array.isArray(prodData.detalle_producto))
    ?prodData.detalle_producto.filter(r=>r.mecanico===tec&&r.mes===mes).sort((a,b)=>b.horas-a.horas)
    :[];

  /* 29/07/2026 (bug reportado por Cristobal con captura) — este era el ULTIMO
     punto que seguia cruzando el roster de Admin -> Tecnicos contra el nombre
     de Produccion Tecnicos por IGUALDAD EXACTA. Desde que el consolidador
     homologa los nombres al canonico de la nomina ("GARCIA OVALLE CRISTIAN
     CLAUDIO") y el roster sigue en formato corto ("CRISTIAN GARCIA"), el
     findIndex devolvia -1 y las 2 secciones que dependen de idxTec
     ("Vehiculos en Taller asignados" y "Tempario vs Tiempo Asignado vs Reloj
     de Taller") aparecian VACIAS aunque el tecnico si tuviera vehiculos
     asignados en el Planificador/JPCB. Se intenta primero el match exacto
     (rapido, y cubre los nombres crudos aun sin homologar) y si no calza se
     cae al match por tokens, el mismo criterio de renderProdDiagNombres y de
     _match_nomina_tecnico() en consolidar_OTs.py. */
  let idxTec=tecnicos.findIndex(t=>normSuc(t)===normSuc(tec));
  if(idxTec<0)idxTec=tecnicos.findIndex(t=>_prodMismoTecnico(t,tec));
  const asignadosTaller=(idxTec>=0)
    ?ordenes.filter(o=>o.tecnico===idxTec&&!o.cerrada)
    :[];

  const tecEsc=esc(tec).replace(/'/g,"&#39;");
  let html=`<div class="prod-det-head">👤 ${esc(tec)} — ${esc(_prodMesLabel(mes))}`
    +`<button class="prod-det-close" onclick="prodSeleccionarTec('${tecEsc}')">✕ cerrar</button></div>`;
  html+=`<div class="prod-kpis-det">`
    +`<div class="prod-kpi"><b>${horas.toFixed(1)} h</b><span>Horas facturadas</span></div>`
    +`<div class="prod-kpi"><b>${nOt}</b><span># OT</span></div>`
    +`<div class="prod-kpi"><b>${disp.horas.toFixed(1)} h</b><span>Horas disponibles acumuladas (${disp.dias} días hábiles)</span></div>`
    +`<div class="prod-kpi"><b>${pct==null?'--':pct.toFixed(0)+'%'}</b>`
    +`<span>Productividad (${horas.toFixed(1)} / ${disp.horas.toFixed(1)} h)</span></div>`
    +(disp.diasNoDisp?`<div class="prod-kpi"><b>${disp.diasNoDisp}</b>`
      +`<span>Días no disponibles (−${disp.horasNoDisp.toFixed(1)} h)</span></div>`:'')
    +`</div>`;

  // Vehiculos en Taller asignados a este tecnico (todas las ordenes activas, no solo las
  // detenidas) — integrado a Produccion Tecnicos a pedido de Cristobal (22/07/2026), para
  // ver de un vistazo la carga real de taller de cada tecnico junto a su produccion
  // facturada. Reutiliza ordenes/STOPS/tipoInfo ya cargados por el Planificador (misma
  // sucursal) — no requiere ningun dato nuevo. Ubicada primero (antes que el detalle de
  // produccion/horas de BDFlexline), a pedido de Cristobal.
  html+='<div class="prod-det-sub">🚗 Vehículos en Taller asignados</div>';
  if(!asignadosTaller.length){
    html+='<div class="prod-det-empty">Sin vehículos en Taller asignados a este técnico.</div>';
  } else {
    html+='<table class="ctgrid prod-mini"><thead><tr>'
      +'<th>Patente</th><th>N° OT</th><th>Modelo</th><th>Servicio</th><th>Detención</th><th>Comentario</th>'
      +'<th>Fecha ingreso Taller</th><th>ETA</th><th>N° caso</th><th>N° pedido</th></tr></thead><tbody>'
      +asignadosTaller.map(o=>{
        const st=o.stop?STOPS.find(s=>s.id===o.stop):null;
        const servicio=o.servicio||o.comentarios||o.mantencion||tipoInfo(o).label||'';
        return `<tr><td>${esc(o.patente)}</td><td>${esc(o.ot)||'--'}</td><td>${esc(o.modelo)}</td><td>${esc(servicio)}</td>`
          +`<td>${esc(st?st.t:'--')}</td><td>${esc(o.comentario2||'')}</td>`
          +`<td>${esc(o.ingreso?isoToDdmmyyyy(o.ingreso)+(o.ingreso_taller?' '+o.ingreso_taller:''):'--')}</td>`
          +`<td>${esc(o.eta)||'--'}</td><td>${esc(o.numero_caso)||'--'}</td><td>${esc(o.n_pedido)||'--'}</td></tr>`;
      }).join('')
      +'</tbody></table>';
  }

  // Tempario vs Tiempo Asignado vs Reloj real de Taller (24/07/2026, a pedido de
  // Cristobal): compara, por cada vehiculo de este tecnico en el mes seleccionado, las 3
  // fuentes de duracion disponibles — el tempario oficial (horas_tempario, del Cotizador
  // de Mantenciones), el tiempo asignado a mano en Control de Taller (Ingreso Taller /
  // Salida Taller, via duracionTallerMin) y el reloj REAL de trabajo en taller (arranca
  // solo al entrar a "En Proceso" y se detiene al pasar a "Lavado"/"Entrega" — ver
  // _actualizarRelojTaller). Se filtra por mes de Ingreso (misma fuente local que
  // "Vehiculos en Taller asignados" de arriba, no depende de BDFlexline).
  const otsRelojMes=(idxTec>=0)
    ?ordenes.filter(o=>o.tecnico===idxTec&&(o.ingreso||'').slice(0,7)===mes)
    :[];
  html+='<div class="prod-det-sub">⏱ Tempario vs Tiempo Asignado vs Reloj de Taller</div>';
  if(!otsRelojMes.length){
    html+='<div class="prod-det-empty">Sin vehículos de este técnico en el mes seleccionado (según fecha de Ingreso).</div>';
  } else {
    html+='<table class="ctgrid prod-mini"><thead><tr>'
      +'<th>Patente</th><th>Servicio</th><th style="text-align:right">Tempario</th>'
      +'<th style="text-align:right">Asignado (Ingreso/Salida Taller)</th><th style="text-align:right">Reloj real</th></tr></thead><tbody>'
      +otsRelojMes.map(o=>{
        const servicio=o.servicio||o.comentarios||o.mantencion||tipoInfo(o).label||'';
        const durAsig=duracionTallerMin(o);
        const txtTemp=(typeof o.horas_tempario==='number'&&o.horas_tempario>0)?o.horas_tempario.toFixed(1)+' h':'--';
        const txtAsig=(durAsig!==null)?(durAsig/60).toFixed(1)+' h':'--';
        return `<tr><td>${esc(o.patente)}</td><td>${esc(servicio)}</td>`
          +`<td style="text-align:right">${txtTemp}</td>`
          +`<td style="text-align:right">${txtAsig}</td>`
          +`<td style="text-align:right">${relojTallerTexto(o)}</td></tr>`;
      }).join('')
      +'</tbody></table>';
  }

  html+='<div class="prod-det-sub">🔧 Detalle por producto (Mano de Obra)</div>';
  if(!productos.length){
    html+='<div class="prod-det-empty">Sin detalle por producto disponible para este mes (el detalle solo cubre los últimos 3 meses).</div>';
  } else {
    html+='<table class="ctgrid prod-mini"><thead><tr><th>Producto</th><th style="text-align:right">Horas</th><th style="text-align:right">Cantidad</th></tr></thead><tbody>'
      +productos.map(p=>`<tr><td>${esc(p.producto)}</td><td style="text-align:right">${(Number(p.horas)||0).toFixed(1)}</td><td style="text-align:right">${p.cantidad}</td></tr>`).join('')
      +'</tbody></table>';
  }

  // Detalle por OT — linea por linea (sin agrupar), tal cual viene de BDFlexline: Nº OT ·
  // Producto · Precio Lista · Total Horas · Comi_Vta. Agregado 21/07/2026 a pedido de
  // Cristobal para replicar la sabana de ejemplo (mismas OT+producto pueden repetirse con
  // horas/comision distintas — cada linea es una transaccion real, no se suman entre si).
  const otsDetalle=(prodData&&Array.isArray(prodData.detalle_ot))
    ?prodData.detalle_ot.filter(r=>r.mecanico===tec&&r.mes===mes)
    :[];
  html+='<div class="prod-det-sub">🧾 Detalle por OT</div>';
  if(!otsDetalle.length){
    html+='<div class="prod-det-empty">Sin detalle por OT disponible para este mes (el detalle solo cubre los últimos 3 meses).</div>';
  } else {
    const tablaOt='<table class="ctgrid prod-mini"><thead><tr>'
      +'<th>Nº OT</th><th>Producto</th><th style="text-align:right">Total Horas</th></tr></thead><tbody>'
      +otsDetalle.map(r=>`<tr><td>${esc(r.nro_ot||'--')}</td><td>${esc(r.producto)}</td>`
        +`<td style="text-align:right">${(Number(r.horas)||0).toFixed(2)}</td></tr>`).join('')
      +'</tbody></table>';
    const proy=_prodDatosProyeccion(otsDetalle,mes);
    html+='<div class="prod-ot-flex">'
      +`<div class="prod-ot-tabla">${tablaOt}</div>`
      +`<div class="prod-ot-chart">${_prodSvgProyeccion(proy)}</div>`
      +'</div>';
  }
  el.innerHTML=html;
}

/* ─── JPCB ─── */
// Timestamp corto (fecha+hora local del navegador) para dejar registro de quien hizo el
// ultimo cambio de etapa — solo visual/informativo, no es un log de auditoria formal.
function nowStrCorto(){
  const n=new Date();
  return n.toLocaleDateString('es-CL')+' '+n.toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'});
}
// Se llama cada vez que se cambia la Etapa de una orden (drag&drop en el tablero, el
// selector de Control de Taller, o el selector del modal de detalle) — deja registrado
// quien fue y cuando, para mostrarlo directo en la tarjeta del JPCB.
function marcarCambioEtapa(o){
  o.etapa_usuario=USUARIO;
  o.etapa_fecha=nowStrCorto();
  _actualizarRelojTaller(o);
}
/* ─── Reloj de Taller (24/07/2026, a pedido de Cristobal) ───
   Mide el tiempo REAL de trabajo en el taller: arranca la primera vez que la orden
   entra a "En Proceso" y se detiene la primera vez que pasa a "Lavado" o "Entrega" —
   pero SOLO si alcanzo a pasar por En Proceso primero (los botones rapidos "📥
   Recepcion"/"🧼 Lavado directo", que saltan etapas, nunca arrancan el reloj por si
   solos: si una orden llega a Lavado sin haber pasado por En Proceso, el reloj queda
   sin datos — `relojTallerTexto` devuelve "--"). Se engancha directo dentro de
   `marcarCambioEtapa(o)`, el punto unico que YA se llama en los 5 lugares donde cambia
   `o.etapa` (drag&drop del JPCB, el selector de Etapa de Control de Taller/Vehiculos en
   Taller, el selector del modal de detalle, y los botones rapidos de Recepcion/Lavado)
   — no hace falta tocar cada uno por separado. Una vez arrancado o detenido, no se
   vuelve a tocar (si la orden retrocede a En Proceso de nuevo, el reloj YA iniciado no
   se reinicia — sigue siendo el tiempo desde la primera vez que entro a trabajarse). */
function _actualizarRelojTaller(o){
  if(o.etapa==='en_proceso'&&!o.reloj_inicio_ts){
    o.reloj_inicio_ts=Date.now();
    o.reloj_inicio_txt=nowStrCorto();
  } else if((o.etapa==='lavado'||o.etapa==='entrega')&&o.reloj_inicio_ts&&!o.reloj_fin_ts){
    o.reloj_fin_ts=Date.now();
    o.reloj_fin_txt=nowStrCorto();
  }
}
// Minutos transcurridos del reloj de taller — null si nunca arranco (nunca paso por "En
// Proceso"). Si arranco pero aun no se detiene (sigue "En Proceso"/"En Prueba"), calcula
// contra el momento actual (reloj "en vivo").
function relojTallerMin(o){
  if(!o.reloj_inicio_ts)return null;
  const fin=o.reloj_fin_ts||Date.now();
  return Math.max(0,Math.round((fin-o.reloj_inicio_ts)/60000));
}
function relojTallerTexto(o){
  const min=relojTallerMin(o);
  if(min===null)return'--';
  const txt=(min/60).toFixed(1)+' h';
  return o.reloj_fin_ts?txt:(txt+' · ⏱ en curso');
}
// Agregar/editar un comentario directo desde la tarjeta del tablero (sin tener que ir a
// Control de Taller) — reutiliza el mismo campo `comentario2` ("Comentario adicional")
// que ya existe en la tabla, asi ambos lugares muestran siempre lo mismo.
function agregarComentarioTablero(id){
  const o=byId(id);if(!o)return;
  const txt=prompt(`Comentario para ${o.patente}:`,o.comentario2||'');
  if(txt===null)return;
  o.comentario2=txt.trim();
  o.comentario2_usuario=USUARIO;
  o.comentario2_fecha=nowStrCorto();
  renderJPCB();saveCtrl();
  toast(o.comentario2?'💬 Comentario guardado':'💬 Comentario eliminado');
}
// Botones rapidos "Recepcion" y "Lavado" (23/07/2026, a pedido de Cristobal) — mueven la
// orden DIRECTO a la Etapa correspondiente sin pasar por el resto del flujo (una cita
// puede recepcionarse o lavarse fuera de orden, ej. lavado antes de entrar a taller).
// Ademas de mover la Etapa, dejan una marca PERSISTENTE (recepcionado/lavado_hecho, con
// usuario y fecha) que se mantiene aunque la orden avance despues a otra Etapa — asi
// siempre queda visible que el vehiculo YA fue recepcionado / YA paso por lavado, sin
// importar en que Etapa este ahora.
function marcarRecepcionado(id){
  const o=byId(id);if(!o)return;
  o.etapa='ingreso_taller';
  o.stop=null;
  o.recepcionado=true;
  o.recepcion_usuario=USUARIO;
  o.recepcion_fecha=nowStrCorto();
  marcarCambioEtapa(o);
  renderJPCB();saveCtrl();
  toast(`📥 ${o.patente} recepcionado — pasa a Ingreso a Taller`);
}
function marcarLavado(id){
  const o=byId(id);if(!o)return;
  o.etapa='lavado';
  o.stop=null;
  o.lavado_hecho=true;
  o.lavado_usuario=USUARIO;
  o.lavado_fecha=nowStrCorto();
  marcarCambioEtapa(o);
  renderJPCB();saveCtrl();
  toast(`🧼 ${o.patente} enviado a Lavado`);
}
function cardHTML(o){
  const ti=tipoInfo(o);
  const sStop=o.stop?STOPS.find(s=>s.id===o.stop)?.t||'':'';
  const tecNom=o.tecnico!==null&&o.tecnico!==undefined&&tecnicos[o.tecnico]?tecnicos[o.tecnico]:'';
  const _noShow=esNoAsiste(o.ot,o.patente);
  const _idxEt=ETAPAS.findIndex(e=>e.id===o.etapa);
  const _mostrarVCU=esFord(o)&&_idxEt>=IDX_EN_PROCESO;
  const _vcuOk=_mostrarVCU?vcuCompleto(o):false;
  const _esReagenda=_noShow&&o.estadoCita==='reagenda';
  // Boton "Finalizado" — mismo permiso que Asiste/No Asiste/Reagenda (PUEDE_CONFIRMAR_CITAS,
  // ya incluye a los editores completos). Reutiliza _cerrarOrdenInterno via
  // marcarFinalizadoCita(): la orden pasa al Historial de Taller igual que "🔒 Cerrar".
  const _btnFinalizarCita=PUEDE_CONFIRMAR_CITAS?`<button title="Marcar como Finalizado — pasa al Historial de Taller" onclick="event.stopPropagation();marcarFinalizadoCita('${o.id}')">✅ Finalizado</button>`:'';
  return `<div class="card${_noShow?' no-asiste':''}" draggable="${PUEDE_EDITAR}" data-id="${o.id}" style="border-left-color:${ti.border};background:${_noShow?'#f2f2f2':ti.color}">
    ${_esReagenda?`<div class="cita-reagenda">🔁 Reagendado para ${esc(o.fecha_reagenda||'--')}</div>`:(_noShow?`<div class="cita-noasiste">🚫 Cliente no asiste</div>`:'')}
    ${sStop?`<span class="cbadge">⛔ ${sStop}</span><br>`:''}<b>${o.patente}</b> <span class="cmeta">${o.cliente||''}</span>
    <div><span class="cot">🧾 OT ${esc(o.ot||'--')}</span></div>
    <div class="cinfo">${o.modelo||''}${o.modelo&&(o.servicio||o.mantencion)?' · ':''}${o.servicio||o.mantencion||ti.label}</div>
    ${o.hora_rec?`<div class="cmeta">🕐 Ingreso: ${o.hora_rec}</div>`:''}
    ${o.hora_compromiso?`<div class="centrega">⏰ Entrega: ${o.hora_compromiso}</div>`:''}
    ${esCruceNoche(o)?`<div class="centrega">🌙 Sale del taller: ${fechaSalidaTallerTexto(o)}</div>`:''}
    ${tecNom?`<div class="cmeta">🔧 ${tecNom}</div>`:''}
    ${o.etapa_usuario?`<div class="cmeta" title="Ultimo cambio de etapa">👤 ${esc(o.etapa_usuario)} · ${o.etapa_fecha||''}</div>`:''}
    ${o.comentario2?`<div class="ccoment">💬 ${esc(o.comentario2)}</div>`:''}
    ${_mostrarVCU?`<div class="vcu-badge ${_vcuOk?'ok':'pend'}" onclick="event.stopPropagation();abrirVCU('${o.id}')">📋 VCU ${_vcuOk?'✅':'⚠️ Falta'}</div>`:''}
    ${o.recepcionado?`<div class="qbadge recepcion">📥 Recepcionado</div>`:''}
    ${o.lavado_hecho?`<div class="qbadge lavado">🧼 Lavado</div>`:''}
    ${PUEDE_EDITAR?`<div class="cacts">
      ${STOPS.map(s=>`<button title="${s.t}" onclick="event.stopPropagation();setStop('${o.id}','${s.id}')">⛔</button>`).join('')}
      ${o.stop?`<button onclick="event.stopPropagation();clearStop('${o.id}')">✅</button>`:''}
      <button title="Agregar/editar comentario" onclick="event.stopPropagation();agregarComentarioTablero('${o.id}')">💬</button>
      <button title="${_noShow?'Reactivar':'Marcar cliente no asiste'}" onclick="event.stopPropagation();toggleNoAsiste('${(o.ot||'').replace(/'/g,"\\'")}','${(o.patente||'').replace(/'/g,"\\'")}')">${_noShow?'↩️':'🚫'}</button>
      ${o.etapa!=='ingreso_taller'?`<button title="Marcar Recepcion → pasa directo a Ingreso Taller" onclick="event.stopPropagation();marcarRecepcionado('${o.id}')">📥</button>`:''}
      ${o.etapa!=='lavado'?`<button title="Enviar directo a Lavado" onclick="event.stopPropagation();marcarLavado('${o.id}')">🧼</button>`:''}
      ${_btnFinalizarCita}
      <button onclick="event.stopPropagation();abrirDetalle('${o.id}')">✏️</button>
    </div>`:(PUEDE_CONFIRMAR_CITAS?`<div class="cacts">${_btnFinalizarCita}<button onclick="event.stopPropagation();abrirDetalle('${o.id}')">👁</button></div>`:`<div class="cacts"><button onclick="event.stopPropagation();abrirDetalle('${o.id}')">👁</button></div>`)}
  </div>`;
}
/* Fila de titulos "responsable" sobre el tablero JPCB (Asesor/Torre Control/Tecnico/
   Asesor) — cada bloque mide exactamente el ancho de las columnas que agrupa (.col es
   flex:0 0 160px con gap 8px en .kanban), asi queda alineado sin depender de un layout
   de tabla. Puramente informativo — no toca ninguna logica de datos ni de columnas. */
function renderJPCBGrupos(){
  const el=document.getElementById('jpcbGroups');
  if(!el)return;
  el.innerHTML=GRUPOS_RESPONSABLE.map(g=>{
    const n=g.ids.length;
    const w=n*160+(n-1)*8;
    return `<div class="kg-block" style="flex-basis:${w}px;width:${w}px">${esc(g.label)}</div>`;
  }).join('');
}
function renderJPCB(){
  renderJPCBGrupos();
  // "Citas <fecha>" (23/07/2026) — primera columna: citas de la Agenda aun SIN
  // confirmar (estadoCita==='pendiente'). No es una Etapa real, no tiene data-etapa
  // (no se puede soltar una tarjeta arrastrada ahi), y sus tarjetas usan
  // cardCitaPendienteHTML() (3 botones) en vez de cardHTML().
  const _citasPend=ordenes.filter(o=>o.estadoCita==='pendiente'&&!o.cerrada&&ordenArea(o)===currentArea);
  const _fechaCitasTxt=(typeof planDates!=='undefined'&&planDates[0])?formatDate(planDates[0]):'';
  const _colCitas=`<div class="col"><div class="col-head" style="background:#0b7d43">📅 Citas ${_fechaCitasTxt}<br><span class="cnt">(${_citasPend.length})</span></div>
      <div class="drop">${_citasPend.map(cardCitaPendienteHTML).join('')}</div></div>`;
  // "No asiste" es una columna propia (no una Etapa mas) — las ordenes marcadas se
  // sacan de su columna habitual y se agrupan aca, para no mezclarlas con el resto
  // del flujo (14/07/2026, a pedido de Cristobal). El campo o.etapa no se toca —
  // al reactivar el cliente, la orden vuelve a aparecer en la etapa que ya tenia.
  const _noAsisteCards=ordenes.filter(o=>esNoAsiste(o.ot,o.patente)&&!o.cerrada&&ordenArea(o)===currentArea);
  const _colNoAsiste=`<div class="col"><div class="col-head" style="background:#7a1f1f">🚫 No asiste<br><span class="cnt">(${_noAsisteCards.length})</span></div>
      <div class="drop">${_noAsisteCards.map(cardHTML).join('')}</div></div>`;
  const _colsEtapas=ETAPAS.map(et=>{
    // Tambien se ocultan del JPCB las ordenes con Estado Campaña de "salida"
    // (Quiebre Stock/Cliente desiste/Falla servidor) — siguen visibles en Control de
    // Taller/Vehiculos en Taller, solo dejan de aparecer en el tablero. Y las que aun
    // no fueron confirmadas (citaConfirmada, ver comentario de arriba) — esas viven
    // en la columna "Citas" hasta que alguien presione Asiste.
    const cards=ordenes.filter(o=>o.etapa===et.id&&!o.stop&&!o.cerrada&&citaConfirmada(o)&&
      !_ESTADOS_CAMPANA_OCULTAN_JPCB.includes(o.estado_campana)&&
      ordenArea(o)===currentArea);
    return`<div class="col"><div class="col-head" style="background:${et.color}">${et.t}<br><span class="cnt">(${cards.length})</span></div>
      <div class="drop" data-etapa="${et.id}">${cards.map(cardHTML).join('')}</div></div>`;
  }).join('');
  document.getElementById('jpcbBoard').innerHTML=_colCitas+_colNoAsiste+_colsEtapas;
  document.getElementById('stopBoard').innerHTML=STOPS.map(s=>{
    const cards=ordenes.filter(o=>o.stop===s.id&&!o.cerrada&&ordenArea(o)===currentArea);
    return`<div class="col"><div class="col-head" style="background:#b33">${s.t}<br><span class="cnt">(${cards.length})</span></div>
      <div class="drop stop-drop" data-stop="${s.id}">${cards.map(cardHTML).join('')}</div></div>`;
  }).join('');
  renderFinalizadosSemana();
  wireDnD();
}
function wireDnD(){
  if(!PUEDE_EDITAR)return;
  document.querySelectorAll('.card[draggable="true"]').forEach(el=>{
    el.addEventListener('dragstart',e=>{e.dataTransfer.setData('cid',el.dataset.id);el.classList.add('dragging');});
    el.addEventListener('dragend',()=>el.classList.remove('dragging'));
  });
  document.querySelectorAll('.drop[data-etapa]').forEach(z=>{
    z.addEventListener('dragover',e=>{e.preventDefault();z.classList.add('over');});
    z.addEventListener('dragleave',()=>z.classList.remove('over'));
    z.addEventListener('drop',e=>{e.preventDefault();z.classList.remove('over');const o=byId(e.dataTransfer.getData('cid'));if(o){
      if(_avanceBloqueadoPorVCU(o,z.dataset.etapa)){
        alert(`🚫 No se puede avanzar de etapa — falta completar el VCU (Hoja Multipuntos Ford) de ${o.patente}.`);
        return;
      }
      o.etapa=z.dataset.etapa;o.stop=null;marcarCambioEtapa(o);renderJPCB();saveCtrl();}});
  });
  document.querySelectorAll('.stop-drop[data-stop]').forEach(z=>{
    z.addEventListener('dragover',e=>{e.preventDefault();z.classList.add('over');});
    z.addEventListener('dragleave',()=>z.classList.remove('over'));
    z.addEventListener('drop',e=>{e.preventDefault();z.classList.remove('over');const o=byId(e.dataTransfer.getData('cid'));if(o){o.stop=z.dataset.stop;renderJPCB();saveCtrl();}});
  });
}
function setStop(id,sid){const o=byId(id);if(o){o.stop=sid;renderJPCB();saveCtrl();}}
function clearStop(id){const o=byId(id);if(o){o.stop=null;renderJPCB();saveCtrl();}}

/* ─── Planificador — Date tabs ─── */
function renderDateTabs(){
  document.getElementById('dateTabs').innerHTML=planDates.map((d,i)=>{
    const dow=d.getDay(),fecha=formatDate(d);
    const lbl=i===0?'📅 Hoy':i===1?'📅 Manana':i===2?'📅 Pasado manana':'📅 +'+i+' dias';
    const dayStr=DIAS[dow]+' '+d.getDate()+' '+MESES[d.getMonth()];
    const cls='dtab'+(i===0?' active':'');
    return`<button class="${cls}" data-date="${fecha}" onclick="selectDate(this)">${lbl} — ${dayStr}</button>`;
  }).join('');
}
function selectDate(btn){
  document.querySelectorAll('.dtab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');selectedDate=btn.dataset.date;renderPlanView();
}

/* ─── Planificador — Render ─── */
function renderPlanView(){renderProgramacion(selectedDate);renderPlanificador(selectedDate);renderLegend(selectedDate);}

function normSuc(s){return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().trim();}
function getCitas(dateStr){
  if(!agendaData)return[];
  let suc=null;
  if(agendaData.sucursales){
    // Match tolerante a mayusculas/tildes: la Agenda a veces usa un nombre distinto
    // al del PBI para la misma sucursal (ej. "Chillán Viejo" vs "CHILLAN VIEJO").
    if(agendaData.sucursales[SUCURSAL]!==undefined){
      suc=agendaData.sucursales[SUCURSAL];
    } else {
      const target=normSuc(SUCURSAL);
      const key=Object.keys(agendaData.sucursales).find(k=>normSuc(k)===target);
      suc=key?agendaData.sucursales[key]:null;
    }
  } else {
    suc=agendaData[SUCURSAL];
  }
  if(!suc)return[];
  if(Array.isArray(suc))return suc;
  return suc[dateStr]||[];
}
function getBloques(dateStr){return ctrlData?.[SUCURSAL]?.bloques?.[dateStr]||[];}

/* ─── "Eliminada del tablero" — evita que autoImportarCitas() vuelva a crear una
   orden que el usuario borro a mano (eliminarOrdenCT), sin importar la patente. La
   cita de la Agenda puede seguir "ingresada" indefinidamente (ej. el reporte no se
   actualiza, o el vehiculo sigue fisicamente ahi aunque ya no se quiera gestionar) —
   antes, cualquier orden eliminada volvia a aparecer sola en la siguiente carga de
   la pagina. Se identifica por patente + Folio OT (misma clave que usa el matching
   de autoImportarCitas), asi si el MISMO vehiculo vuelve mas adelante con una OT
   nueva, esa SI se importa normal — solo queda bloqueada la combinacion exacta que
   se elimino. Se guarda en ctrlData[SUCURSAL].eliminadas (objeto clave -> true),
   viaja en el mismo control_taller.json. 22/07/2026, a pedido de Cristobal ("no
   solamente es eso [las de prueba], porque hay otras patentes y sigue pasando lo
   mismo independiente de la patente"). */
function _ordenEliminadaKey(pat,ot){return normPat(pat)+'|'+String(ot||'').trim();}
function _eliminadasMap(){
  if(!ctrlData)ctrlData={};
  if(!ctrlData[SUCURSAL])ctrlData[SUCURSAL]={};
  if(!ctrlData[SUCURSAL].eliminadas)ctrlData[SUCURSAL].eliminadas={};
  return ctrlData[SUCURSAL].eliminadas;
}
function _marcarOrdenEliminada(pat,ot){
  _eliminadasMap()[_ordenEliminadaKey(pat,ot)]=true;
}
function _ordenFueEliminada(pat,ot){
  return !!_eliminadasMap()[_ordenEliminadaKey(pat,ot)];
}

/* ─── "Cliente no asiste" — marca disponible en toda la app (Programacion, JPCB,
   Control de Taller, Vehiculos en Taller) para el mismo caso/cita, sin importar donde
   se marque. Se identifica por Folio OT (OC) — la misma clave que ya usa el resto del
   codigo para emparejar una cita de la Agenda con su orden en Control de Taller/JPCB.
   Se guarda en ctrlData[SUCURSAL].no_show (objeto oc -> {usuario,fecha}), que viaja
   dentro del mismo control_taller.json que ya se guarda con saveCtrl() — no requiere
   ningun archivo ni endpoint nuevo. Si la cita no trae OC (caso raro), se usa la patente
   como respaldo. */
function _noShowMap(){
  if(!ctrlData)ctrlData={};
  if(!ctrlData[SUCURSAL])ctrlData[SUCURSAL]={};
  if(!ctrlData[SUCURSAL].no_show)ctrlData[SUCURSAL].no_show={};
  return ctrlData[SUCURSAL].no_show;
}

/* --- Disponibilidad de tecnicos (29/07/2026, pedido de Cristobal) ---------
   Periodos en que un tecnico NO esta disponible (vacaciones, licencia,
   permiso, capacitacion). Esos dias habiles no suman horas disponibles al
   denominador de la productividad — ver _prodJornada().
   Se guarda en el MISMO control_taller.json que ya usa el Planificador:
     ctrlData[SUCURSAL].no_disponible = { "NOMBRE NORMALIZADO": [
        {desde:"AAAA-MM-DD", hasta:"AAAA-MM-DD", motivo:"", usuario:"", fecha:""} ] }
   La clave es el nombre normalizado (normSuc) del mecanico tal como aparece en
   Produccion Tecnicos, para que sobreviva a diferencias de tilde/mayuscula. */
function _noDispMap(){
  if(!ctrlData)ctrlData={};
  if(!ctrlData[SUCURSAL])ctrlData[SUCURSAL]={};
  if(!ctrlData[SUCURSAL].no_disponible)ctrlData[SUCURSAL].no_disponible={};
  return ctrlData[SUCURSAL].no_disponible;
}
function _noDispPeriodos(tec){
  const arr=_noDispMap()[normSuc(tec)];
  return Array.isArray(arr)?arr.filter(p=>p&&p.desde):[];
}
// Las fechas son ISO (AAAA-MM-DD): la comparacion de strings ya ordena bien.
function _prodDiaEnPeriodos(iso,periodos){
  return periodos.some(p=>iso>=p.desde&&iso<=(p.hasta||p.desde));
}
function _noDispActivoHoy(tec){
  return _prodDiaEnPeriodos(isoToday(),_noDispPeriodos(tec));
}
function agregarNoDisponible(tec,desde,hasta,motivo){
  if(!PUEDE_DISPONIBILIDAD)return;
  if(!desde)return;
  if(hasta&&hasta<desde){const t=desde;desde=hasta;hasta=t;}
  const m=_noDispMap(),k=normSuc(tec);
  if(!Array.isArray(m[k]))m[k]=[];
  m[k].push({desde:desde,hasta:hasta||desde,motivo:motivo||'',
              usuario:USUARIO,fecha:nowStrCorto()});
  saveCtrl();renderProdTabla();
}
function quitarNoDisponible(tec,idx){
  if(!PUEDE_DISPONIBILIDAD)return;
  const m=_noDispMap(),k=normSuc(tec);
  if(!Array.isArray(m[k]))return;
  m[k].splice(idx,1);
  if(!m[k].length)delete m[k];
  saveCtrl();renderProdTabla();
}
const NODISP_MOTIVOS=['Vacaciones','Licencia médica','Permiso','Capacitación','Otro'];
let _noDispTec=null;
function abrirNoDisponible(tecEsc){
  if(!PUEDE_DISPONIBILIDAD)return;
  const tmp=document.createElement('textarea');tmp.innerHTML=tecEsc;_noDispTec=tmp.value;
  renderNoDisponible();
  const ov=document.getElementById('nodisp-modal-overlay');
  if(ov)ov.style.display='flex';
}
function cerrarNoDisponible(){
  const ov=document.getElementById('nodisp-modal-overlay');
  if(ov)ov.style.display='none';
  _noDispTec=null;
}
function renderNoDisponible(){
  const el=document.getElementById('nodispBody');
  if(!el||!_noDispTec)return;
  const tec=_noDispTec,tecEsc=esc(tec).replace(/'/g,"&#39;");
  const periodos=_noDispPeriodos(tec);
  const activo=_noDispActivoHoy(tec);
  let html=`<div class="prod-det-head">🕐 Disponibilidad — ${esc(tec)}`
    +`<button class="prod-det-close" onclick="cerrarNoDisponible()">✕ cerrar</button></div>`;
  html+=`<div class="prod-det-empty" style="margin-bottom:8px">`
    +(activo?`🚫 <b>Hoy está marcado como NO disponible.</b>`
            :`✅ <b>Hoy está disponible.</b>`)
    +` Los días hábiles dentro de los períodos de abajo no suman horas disponibles`
    +` al calcular su productividad.</div>`;
  html+=`<div class="prod-det-sub">Períodos no disponibles</div>`;
  if(!periodos.length){
    html+=`<div class="prod-det-empty">Sin períodos registrados — el técnico cuenta con jornada completa todos los días hábiles.</div>`;
  } else {
    html+='<table class="ctgrid prod-mini"><thead><tr><th>Desde</th><th>Hasta</th><th>Motivo</th><th>Registrado por</th><th></th></tr></thead><tbody>';
    periodos.forEach((p,i)=>{
      html+=`<tr><td>${esc(p.desde)}</td><td>${esc(p.hasta||p.desde)}</td>`
        +`<td>${esc(p.motivo||'--')}</td>`
        +`<td style="font-size:11px;color:#778">${esc(p.usuario||'')}<br>${esc(p.fecha||'')}</td>`
        +`<td style="text-align:center"><button class="ct-del" title="Quitar período"`
        +` onclick="quitarNoDisponible('${tecEsc}',${i});renderNoDisponible();">🗑</button></td></tr>`;
    });
    html+='</tbody></table>';
  }
  html+=`<div class="prod-det-sub" style="margin-top:10px">Agregar período</div>`
    +`<div class="nodisp-form">`
    +`<label>Desde <input type="date" id="nodispDesde" class="prod-input"></label>`
    +`<label>Hasta <input type="date" id="nodispHasta" class="prod-input"></label>`
    +`<label>Motivo <select id="nodispMotivo" class="prod-select">`
    +NODISP_MOTIVOS.map(mv=>`<option value="${esc(mv)}">${esc(mv)}</option>`).join('')
    +`</select></label>`
    +`<button class="nodisp-btn add" onclick="guardarNoDisponible('${tecEsc}')">➕ Marcar no disponible</button>`
    +`</div>`;
  el.innerHTML=html;
}
function guardarNoDisponible(tecEsc){
  const tmp=document.createElement('textarea');tmp.innerHTML=tecEsc;const tec=tmp.value;
  const d=document.getElementById('nodispDesde'),h=document.getElementById('nodispHasta'),
        mo=document.getElementById('nodispMotivo');
  const desde=d?d.value:'',hasta=h?h.value:'';
  if(!desde){alert('Selecciona al menos la fecha "Desde".');return;}
  agregarNoDisponible(tec,desde,hasta||desde,mo?mo.value:'');
  renderNoDisponible();
}
function _noShowKey(oc,pat){const k=String(oc||'').trim();return k||('PAT:'+normPat(pat||''));}
function esNoAsiste(oc,pat){return !!_noShowMap()[_noShowKey(oc,pat)];}
function toggleNoAsiste(oc,pat){
  const key=_noShowKey(oc,pat);
  if(!key||key==='PAT:')return;
  const m=_noShowMap();
  if(m[key]){
    delete m[key];
    toast(`↩️ ${pat||oc} vuelve a estar activo`);
  }else{
    m[key]={usuario:USUARIO,fecha:nowStrCorto()};
    toast(`🚫 ${pat||oc} marcado como "Cliente no asiste"`);
  }
  if(currentView==='plan')renderPlanView();
  renderControlTaller();renderVehiculosTaller();renderJPCB();
  saveCtrl();
}

/* ─── "Citas <fecha>" — etapa nueva del JPCB (23/07/2026, a pedido de Cristobal): las
   citas de la Agenda aterrizan aca SIN CONFIRMAR (no en Recepcion como antes) y recien
   pasan al flujo normal (Recepcion, Control de Taller, Vehiculos en Taller, grid
   Tecnico x Hora) cuando alguien confirma "Asiste". Se reutiliza el mismo mapa de
   "Cliente no asiste" (_noShowMap) para No Asiste/Reagenda, asi la columna "🚫 No
   asiste" del JPCB (y el resto de la app que ya usa esNoAsiste()) no necesita tocarse.
   citaConfirmada() es el gate unico: una orden solo cuenta como "en el taller" si
   estadoCita==='asiste' (o no tiene el campo — ordenes viejas/alta manual, retrocompat)
   Y ademas no esta marcada "no asiste" por ningun mecanismo (nuevo o el ya existente). */
function citaConfirmada(o){
  return (o.estadoCita||'asiste')==='asiste' && !esNoAsiste(o.ot,o.patente);
}
function _marcarNoShowInterno(oc,pat,extra){
  const key=_noShowKey(oc,pat);
  if(!key||key==='PAT:')return;
  _noShowMap()[key]=Object.assign({usuario:USUARIO,fecha:nowStrCorto()},extra||{});
}
function marcarAsisteCita(id){
  const o=byId(id);if(!o)return;
  o.estadoCita='asiste';
  o.fecha_reagenda='';
  const key=_noShowKey(o.ot,o.patente);
  if(key&&key!=='PAT:')delete _noShowMap()[key];
  if(currentView==='plan')renderPlanView();
  renderControlTaller();renderVehiculosTaller();renderJPCB();
  saveCtrl();
  toast(`✅ ${o.patente} confirmado — pasa a Recepcion`);
}
function marcarNoAsisteCita(id){
  const o=byId(id);if(!o)return;
  o.estadoCita='no_asiste';
  o.fecha_reagenda='';
  _marcarNoShowInterno(o.ot,o.patente,{tipo:'no_asiste'});
  if(currentView==='plan')renderPlanView();
  renderControlTaller();renderVehiculosTaller();renderJPCB();
  saveCtrl();
  toast(`🚫 ${o.patente} marcado como "Cliente no asiste"`);
}
function marcarReagendaCita(id){
  const o=byId(id);if(!o)return;
  const actual=o.fecha_reagenda||'';
  const fecha=prompt('Nueva fecha de reagendamiento (DD/MM/AAAA):',actual);
  if(fecha===null)return;
  const f=fecha.trim();
  if(!f){alert('Debes ingresar la fecha de reagendamiento.');return;}
  o.estadoCita='reagenda';
  o.fecha_reagenda=f;
  _marcarNoShowInterno(o.ot,o.patente,{tipo:'reagenda',fecha_reagenda:f});
  if(currentView==='plan')renderPlanView();
  renderControlTaller();renderVehiculosTaller();renderJPCB();
  saveCtrl();
  toast(`🔁 ${o.patente} reagendado para ${f}`);
}
/* Tarjeta de la columna "Citas <fecha>" — misma info de siempre (cardHTML) pero con
   3 botones grandes en vez de las acciones normales; no es arrastrable (no forma
   parte del flujo de Etapas todavia). */
function cardCitaPendienteHTML(o){
  const ti=tipoInfo(o);
  return `<div class="card cita-pend" data-id="${o.id}" style="background:${ti.color}">
    <b>${o.patente}</b> <span class="cmeta">${o.cliente||''}</span>
    <div><span class="cot">🧾 OT ${esc(o.ot||'--')}</span></div>
    <div class="cinfo">${o.modelo||''}${o.modelo&&(o.servicio||o.mantencion)?' · ':''}${o.servicio||o.mantencion||ti.label}</div>
    ${o.hora_rec?`<div class="cmeta">🕐 Ingreso: ${o.hora_rec}</div>`:''}
    ${o.asesor?`<div class="cmeta">🧑 ${esc(o.asesor)}</div>`:''}
    ${PUEDE_CONFIRMAR_CITAS?`<div class="cacts-cita">
      <button class="btn-asiste" onclick="event.stopPropagation();marcarAsisteCita('${o.id}')">✅ Asiste</button>
      <button class="btn-noasiste" onclick="event.stopPropagation();marcarNoAsisteCita('${o.id}')">🚫 No Asiste</button>
      <button class="btn-reagenda" onclick="event.stopPropagation();marcarReagendaCita('${o.id}')">🔁 Reagenda</button>
    </div>`:''}
  </div>`;
}

/* ─── Lista de asesores de esta sucursal, armada desde la Agenda Curifor (no un
   catalogo fijo) — junta los valores unicos del campo asesor de todas las citas
   (todas las fechas que trae agendaData para esta sucursal), asi el desplegable
   de Asesor en Control de Taller siempre refleja quien atiende realmente aqui.
   22/07/2026: si un asesor real todavia no aparece en ninguna cita de la Agenda para
   esta sucursal (ej. recien contratado, o la Agenda aun no trae ninguna cita suya en
   la ventana descargada), se puede agregar a mano con "➕ Agregar asesor" — queda
   guardado en ctrlData[SUCURSAL].asesores_extra (viaja en control_taller.json, mismo
   archivo de siempre) y se suma SIEMPRE a la lista de aca en adelante, sin depender
   de que la Agenda lo traiga. */
function getAsesoresSucursal(){
  const set=new Set();
  if(agendaData&&agendaData.sucursales){
    let suc=agendaData.sucursales[SUCURSAL];
    if(suc===undefined){
      const target=normSuc(SUCURSAL);
      const key=Object.keys(agendaData.sucursales).find(k=>normSuc(k)===target);
      suc=key?agendaData.sucursales[key]:null;
    }
    if(suc){
      const addFrom=arr=>(arr||[]).forEach(c=>{const a=(c.asesor||'').trim();if(a)set.add(a);});
      if(Array.isArray(suc))addFrom(suc);
      else Object.values(suc).forEach(addFrom);
    }
  }
  (ctrlData?.[SUCURSAL]?.asesores_extra||[]).forEach(a=>{const n=(a||'').trim();if(n)set.add(n);});
  return[...set].sort((a,b)=>a.localeCompare(b));
}
function agregarAsesorManual(){
  const nombre=(prompt('Nombre del asesor a agregar (para esta sucursal):')||'').trim();
  if(!nombre)return;
  if(!ctrlData)ctrlData={};
  if(!ctrlData[SUCURSAL])ctrlData[SUCURSAL]={};
  if(!Array.isArray(ctrlData[SUCURSAL].asesores_extra))ctrlData[SUCURSAL].asesores_extra=[];
  if(!ctrlData[SUCURSAL].asesores_extra.some(a=>normSuc(a)===normSuc(nombre))){
    ctrlData[SUCURSAL].asesores_extra.push(nombre);
  }
  asesoresSucursal=getAsesoresSucursal();
  renderControlTaller();renderVehiculosTaller();
  saveCtrl();
  toast(`✅ "${nombre}" agregado a la lista de asesores de ${SUCURSAL}`);
}
function isTomorrow(dateStr){return dateStr===formatDate(planDates[1]);}

function renderProgramacion(dateStr){
  const citas=getCitas(dateStr).filter(c=>citaArea(c)===currentArea);
  const bloques=getBloques(dateStr).filter(b=>detectArea(b.servicio)===currentArea);
  const asignadosOc=new Set(bloques.map(b=>String(b.oc)));
  const el=document.getElementById('progList');
  if(!citas.length){el.innerHTML='<div style="padding:20px 10px;color:#888;text-align:center;font-size:12px">Sin citas agendadas para este dia</div>';return;}
  // Conteo de citas por patente en el dia completo (todas las asesores): sirve para
  // avisar cuando una patente tiene mas de una OT agendada (ej. Mantencion + Garantia/
  // Recall del mismo vehiculo) y para agruparlas visualmente una bajo la otra.
  const patCounts={};
  citas.forEach(c=>{const p=(c.patente||'').replace(/\?/g,'').trim().toUpperCase();if(p)patCounts[p]=(patCounts[p]||0)+1;});
  const groups={};
  // Se ordena por patente primero (para que las citas de un mismo vehiculo con distinta
  // OT queden siempre adyacentes, una bajo la otra) y dentro de cada patente por horario.
  [...citas].sort((a,b)=>{
    const pa=(a.patente||'').replace(/\?/g,'').trim().toUpperCase();
    const pb=(b.patente||'').replace(/\?/g,'').trim().toUpperCase();
    if(pa!==pb)return pa.localeCompare(pb);
    return(a.horario||'').localeCompare(b.horario||'');
  }).forEach(c=>{const a=c.asesor||'Sin asignar';if(!groups[a])groups[a]=[];groups[a].push(c);});
  let html='';
  for(const[asesor,cs]of Object.entries(groups)){
    html+=`<div class="prog-group"><div class="prog-asesor">👤 ${asesor} (${cs.length})</div>`;
    html+=cs.map(c=>{
      const oc=String(c.oc||c.patente||'');
      const asig=asignadosOc.has(oc);
      const ingr=c.ingresado||false;
      const ico=c.estado==='finalizado'?'🧍':(ingr?'🎟️':'🚗');
      const tip=ingr?'Ingreso al taller':'Pendiente de ingreso';
      const _noShow=esNoAsiste(c.oc,c.patente);
      const ac=(asig?' asignado':'')+(_noShow?' no-asiste':'');
      const _patClean=(c.patente||'').replace(/\?/g,'').trim()||'--';
      const _citaJson=JSON.stringify(c).replace(/'/g,"&#39;");
      // Color segun tipo de servicio (Recall/Mantencion/Diagnostico/Reparacion/Otro) —
      // mismo criterio y paleta que ya usan JPCB y Control de Taller (TIPOS/detectTipo),
      // asi el color significa lo mismo en toda la app.
      const _ti=TIPOS[detectTipo(c)]||TIPOS.ot;
      const _multi=patCounts[_patClean.toUpperCase()]>1;
      // El fondo de color por tipo solo se aplica si la cita NO esta ya asignada a un
      // tecnico — el fondo verde de "asignado" (clase .asignado) sigue teniendo prioridad
      // visual en ese caso. El borde izquierdo de color, en cambio, se muestra siempre
      // (inline, gana sobre la clase) para que el tipo de servicio se reconozca de un
      // vistazo incluso en tarjetas ya asignadas.
      const _bgStyle=(asig||_noShow)?'':`background:${_ti.color};`;
      const _ocEsc=oc.replace(/'/g,"\\'");
      const _patEsc=_patClean.replace(/'/g,"\\'");
      return`<div class="cita-card${ac}" draggable="${PUEDE_EDITAR&&!asig}" data-oc="${oc}" data-fecha="${dateStr}" data-cita='${_citaJson}' title="Clic para ver detalle · ${tip} · ${_ti.label}" onclick="mostrarDetalleCita(this)" style="border-left:4px solid ${_ti.border};${_bgStyle}">
        ${_noShow?`<div class="cita-noasiste">🚫 Cliente no asiste</div>`:''}
        ${_multi?`<div style="font-size:9px;font-weight:700;color:#5a3d00;background:#ffe9b3;border-radius:2px;padding:1px 4px;display:inline-block;margin-bottom:2px">🔗 ${patCounts[_patClean.toUpperCase()]} OT del vehiculo</div>`:''}
        <div class="cita-top"><span class="cita-hora">${c.horario||'--'}</span><span class="cita-status" title="${tip}">${ico}</span></div>
        <div class="cita-tipo" style="font-size:9px;font-weight:700;color:${_ti.border}">${_ti.label}</div>
        <div class="cita-plate">${_patClean}</div>
        <div class="cita-info">${c.modelo||''}${c.anio?' ('+c.anio+')':''}</div>
        <div class="cita-svc">${c.servicio||c.mantencion||'--'}</div>
        <div class="cita-cliente">${c.nombre||c.cliente||''}</div>
        ${(c.sucursal&&c.sucursal!==SUCURSAL)?`<div style="font-size:9px;color:#fff;background:#555;border-radius:2px;padding:1px 4px;display:inline-block;margin-top:2px">${c.sucursal}</div>`:''}
        ${asig?'<div class="cita-asig">✅ Asignado</div>':''}
        ${PUEDE_EDITAR?`<button class="cita-noasiste-btn" onclick="event.stopPropagation();toggleNoAsiste('${_ocEsc}','${_patEsc}')">${_noShow?'↩️ Reactivar':'🚫 No asiste'}</button>`:''}
      </div>`;
    }).join('');
    html+='</div>';
  }
  el.innerHTML=html;
  if(PUEDE_EDITAR)el.querySelectorAll('.cita-card[draggable="true"]').forEach(c=>{
    c.addEventListener('dragstart',e=>{e.dataTransfer.setData('plan_oc',c.dataset.oc);e.dataTransfer.setData('plan_fecha',c.dataset.fecha);c.classList.add('dragging');});
    c.addEventListener('dragend',()=>c.classList.remove('dragging'));
  });
}

function renderPlanificador(dateStr){
  const END=getEnd(dateStr);const g=document.getElementById('planGrid');
  let html='<thead><tr><th class="corner">Tecnico \ Hora</th>';
  for(let m=START;m<END;m+=STEP)html+=`<th class="time">${hhmm(m)}</th>`;
  html+='</tr></thead><tbody>';
  tecnicos.forEach((t,ti)=>{
    html+=`<tr><th class="tec">${t}</th>`;
    for(let m=START;m<END;m+=STEP)html+=`<td class="slot" data-tec="${ti}" data-min="${m}" data-fecha="${dateStr}"></td>`;
    html+='</tr>';
  });
  if(!tecnicos.length)html+=`<tr><td colspan="999" style="padding:24px;color:#888;text-align:center">Sin tecnicos configurados. El Admin puede agregarlos en Administracion → Tecnicos.</td></tr>`;
  g.innerHTML=html+'</tbody>';
  getBloques(dateStr).filter(b=>detectArea(b.servicio)===currentArea).forEach(b=>{
    const sm=parseHH(b.ini||'08:30');
    const cell=g.querySelector(`td[data-tec="${b.tec}"][data-min="${sm}"]`);
    if(!cell)return;
    const totalDur=b.dur||60;
    const span=Math.max(Math.round(totalDur/STEP),1);
    const div=document.createElement('div');
    div.className='gblock';div.dataset.bid=b.id;
    div.style.width=(span*COLW-3)+'px';
    // Si el bloque trae horas_tempario, la barra se pinta en 2 colores: la porcion
    // que corresponde al tempario (azul) y la que la excede — asignada/extendida a
    // mano, por ejemplo por un atraso (ambar). Sin tempario, se ve como antes.
    // El dato se busca en vivo (no solo el guardado en el bloque al crearlo): asi,
    // bloques viejos (creados antes de que existiera este campo, o antes de re-correr
    // la consolidacion) se pintan solos apenas la orden/cita asociada tenga el dato,
    // sin que haya que reasignar el bloque a mano.
    const ordenAsoc=ordenes.find(o=>{const bb='ct'+o.id;return bb===b.id||String(b.id).startsWith(bb+'_');});
    let bHoras=(typeof b.horas_tempario==='number'&&b.horas_tempario>0)?b.horas_tempario:null;
    if(bHoras===null){
      if(ordenAsoc&&typeof ordenAsoc.horas_tempario==='number'&&ordenAsoc.horas_tempario>0){
        bHoras=ordenAsoc.horas_tempario;
      } else {
        const citaAsoc=getCitas(dateStr).find(c=>String(c.oc||c.patente)===String(b.oc));
        if(citaAsoc&&typeof citaAsoc.horas_tempario==='number'&&citaAsoc.horas_tempario>0)bHoras=citaAsoc.horas_tempario;
      }
    }
    // Horario Entrega (compromiso con el cliente) — puramente informativo en el grid,
    // no se usa para calcular ni acomodar el bloque, solo se muestra si existe.
    const horaEntregaB=ordenAsoc?.hora_compromiso||'';
    const entregaInfo=horaEntregaB?`<div class="gentrega">⏰ Entrega: ${horaEntregaB}</div>`:'';
    let tempInfo='';
    const tempMin=bHoras?Math.round(bHoras*60):null;
    if(tempMin!==null){
      if(tempMin<totalDur){
        const pct=Math.max(0,Math.min(100,(tempMin/totalDur)*100));
        div.style.background=`linear-gradient(to right, #bcd4f0 0%, #bcd4f0 ${pct}%, #ffdca8 ${pct}%, #ffdca8 100%)`;
        tempInfo=`<div class="gtemp" title="Tempario ${bHoras.toFixed(1)}h · asignado ${(totalDur/60).toFixed(1)}h">⏳ ${bHoras.toFixed(1)}h/${(totalDur/60).toFixed(1)}h</div>`;
      } else {
        div.style.background='#bcd4f0';
        tempInfo=`<div class="gtemp" title="Tempario ${bHoras.toFixed(1)}h">⏳ ${bHoras.toFixed(1)}h</div>`;
      }
    }
    // Turno que cruza a la jornada siguiente (ver upsertBloqueDesdeOrden): b.cont/'sigue'
    // marca el bloque de la jornada de ingreso (banda hasta el cierre del dia), b.cont
    // ==='viene' marca el bloque de la jornada siguiente (banda desde la apertura) — se
    // avisa con un badge para que quede claro que es el mismo vehiculo, no uno nuevo.
    const contInfo=b.contInfo?`<div class="gtemp" style="background:#4a2a6b;color:#fff" title="${esc(b.contInfo)}">${b.contInfo}</div>`:'';
    div.innerHTML=`<b>${b.patente||b.oc||'--'}</b><div style="font-size:10px;color:#445;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${b.modelo||''}</div><div class="gtime">${b.ini}—${hhmm(sm+totalDur)}</div>${tempInfo}${entregaInfo}${contInfo}
      ${PUEDE_EDITAR?`<button class="rm-btn" onclick="event.stopPropagation();removeBloque('${b.id}','${dateStr}')">✕</button>`:''}`;
    div.addEventListener('click',()=>abrirDetalleBloque(b));
    cell.appendChild(div);
  });
  if(!PUEDE_EDITAR)return;
  g.querySelectorAll('td.slot').forEach(td=>{
    td.addEventListener('dragover',e=>{e.preventDefault();td.classList.add('over');});
    td.addEventListener('dragleave',()=>td.classList.remove('over'));
    td.addEventListener('drop',e=>{
      e.preventDefault();td.classList.remove('over');
      const oc=e.dataTransfer.getData('plan_oc');
      const fecha=e.dataTransfer.getData('plan_fecha');
      if(oc)asignarCita(oc,+td.dataset.tec,+td.dataset.min,fecha||dateStr);
    });
  });
}

function renderLegend(dateStr){
  const _tiposLeg=Object.values(TIPOS).map(t=>
    `<div class="it"><span class="sw" style="background:${t.color};border-color:${t.border}"></span> ${t.label}</div>`
  ).join('');
  document.getElementById('planLegend').innerHTML=`<b>Estado:</b>
    <div class="it"><span style="font-size:15px">🎟️</span> Ingreso al taller</div>
    <div class="it"><span style="font-size:15px">🚗</span> Pendiente de ingreso</div>
    <div class="it"><span style="font-size:15px">🧍</span> Servicio finalizado</div>
    <div class="it"><span class="sw" style="background:#d6dce5;border-color:#1b6ec2"></span> Asignado a tecnico (sin dato de tempario)</div>
    <div class="it"><span class="sw" style="background:#bcd4f0;border-color:#1b6ec2"></span> Dentro del tiempo del tempario</div>
    <div class="it"><span class="sw" style="background:#ffdca8;border-color:#c87900"></span> Excede el tempario (ajuste manual/atraso)</div>
    <b style="margin-left:14px">Tipo de servicio:</b>
    ${_tiposLeg}`;
}

function asignarCita(oc,tec,min,dateStr){
  const citas=getCitas(dateStr);
  const cita=citas.find(c=>String(c.oc||c.patente)===String(oc));
  // 23/07/2026, a pedido de Cristobal: no se puede agendar en el grid Tecnico x Hora
  // una cita cuya orden todavia no confirmo asistencia (o esta marcada No Asiste/
  // Reagenda) — primero hay que confirmar "Asiste" en la columna "Citas" del JPCB.
  const _ordenCita=ordenes.find(o=>String(o.ot||o.patente)===String(oc)&&!o.cerrada);
  if(_ordenCita&&!citaConfirmada(_ordenCita)){
    alert(`🚫 ${cita?.patente||oc} todavia no confirma asistencia — confirma "Asiste" en la columna "Citas" del JPCB antes de asignarle horario.`);
    return;
  }
  if(!ctrlData)ctrlData={};
  if(!ctrlData[SUCURSAL])ctrlData[SUCURSAL]={tecnicos,ordenes,bloques:{}};
  if(!ctrlData[SUCURSAL].bloques)ctrlData[SUCURSAL].bloques={};
  if(!ctrlData[SUCURSAL].bloques[dateStr])ctrlData[SUCURSAL].bloques[dateStr]=[];
  const durMin=(typeof cita?.horas_tempario==='number'&&cita.horas_tempario>0)?Math.round(cita.horas_tempario*60):60;
  const end=getEnd(dateStr);
  let finMin=Math.min(min+durMin,end);
  if(finMin<=min)finMin=Math.min(min+STEP,end);
  // Regla imperativa (30/07/2026): un tecnico no puede tener 2 trabajos a la vez — se
  // valida ANTES de tocar nada, excluyendo el propio bloque de esta cita (si ya tenia
  // uno asignado antes) para poder reasignarla/moverla sin toparse consigo misma.
  const otrosDelTec=(ctrlData[SUCURSAL].bloques[dateStr]||[]).filter(b=>+b.tec===+tec&&String(b.oc)!==String(oc));
  const conflicto=otrosDelTec.find(b=>{const bIni=parseHH(b.ini),bFin=bIni+(b.dur||60);return min<bFin&&finMin>bIni;});
  if(conflicto){
    alert(`🚫 ${tecnicos[tec]||'Este tecnico'} ya tiene asignado ${conflicto.patente||conflicto.oc||'otro vehiculo'} el ${dateStr} de ${conflicto.ini} a ${hhmm(parseHH(conflicto.ini)+(conflicto.dur||60))} — un tecnico no puede tener 2 trabajos al mismo tiempo.`);
    return;
  }
  ctrlData[SUCURSAL].bloques[dateStr]=ctrlData[SUCURSAL].bloques[dateStr].filter(b=>String(b.oc)!==String(oc));
  const id='b'+Date.now()+Math.random().toString(36).slice(2,5);
  ctrlData[SUCURSAL].bloques[dateStr].push({id,tec,ini:hhmm(min),dur:finMin-min,oc:String(oc),
    patente:cita?.patente||oc,cliente:cita?.nombre||cita?.cliente||'',
    modelo:cita?.modelo||'',servicio:cita?.servicio||cita?.mantencion||'',
    horas_tempario:(typeof cita?.horas_tempario==='number'?cita.horas_tempario:null)});
  renderPlanView();saveCtrl();
  toast(`✅ ${cita?.patente||oc} → ${tecnicos[tec]||'T'+tec} a las ${hhmm(min)}`);
}
function removeBloque(bid,dateStr){
  if(!ctrlData?.[SUCURSAL]?.bloques?.[dateStr])return;
  ctrlData[SUCURSAL].bloques[dateStr]=ctrlData[SUCURSAL].bloques[dateStr].filter(b=>b.id!==bid);
  renderPlanView();saveCtrl();toast('Asignacion quitada');
}
function deleteBloque(id){
  if(!ctrlData?.[SUCURSAL]?.bloques)return;
  for(const[date,bls]of Object.entries(ctrlData[SUCURSAL].bloques)){
    const idx=bls.findIndex(b=>b.id===id);if(idx>-1){bls.splice(idx,1);break;}
  }
  closeModal();renderPlanView();saveCtrl();toast('Asignacion quitada');
}

function abrirDetalle(id){
  const o=byId(id);if(!o)return;
  const ti=tipoInfo(o);
  const etNom=ETAPAS.find(e=>e.id===o.etapa)?.t||o.etapa||'--';
  const stNom=o.stop?STOPS.find(s=>s.id===o.stop)?.t||'--':'--';
  const tecNom=o.tecnico!==null&&o.tecnico!==undefined&&tecnicos[o.tecnico]?tecnicos[o.tecnico]:'Sin asignar';
  const _noShow=esNoAsiste(o.ot,o.patente);
  document.getElementById('modal-title').textContent=`Orden — ${o.patente} — OT ${o.ot||'--'} — ${o.modelo||''}`;
  document.getElementById('modal-del-btn').style.display='none';modalBloqueId=null;
  let body=`${_noShow?`<div class="cita-noasiste" style="margin-bottom:8px">🚫 Cliente no asiste</div>`:''}<div class="det-g">
    <div><b>N° OT / OC:</b> <span class="cot">🧾 ${esc(o.ot||'--')}</span></div><div><b>Patente:</b> ${o.patente}</div>
    <div><b>Modelo:</b> ${o.modelo||'--'}</div><div><b>Cliente:</b> ${o.cliente||'--'}</div>
    <div><b>Asesor:</b> ${o.asesor||'--'}</div>
    <div><b>Servicio:</b> ${o.servicio||ti.label}</div><div><b>Etapa:</b> ${etNom}</div>
    <div><b>Detencion:</b> ${stNom}</div><div><b>Tecnico:</b> ${tecNom}</div>
    <div><b>Tiempo estimado:</b> ${tiempoEstimadoTexto(o)}</div><div><b>Mantencion:</b> ${o.mantencion||'--'}</div>
    <div><b>Horario Ingreso (Agenda):</b> ${o.hora_rec||'--'}</div><div><b>Ingreso Taller:</b> ${o.ingreso_taller||'--'}</div>
    <div><b>Salida Taller:</b> ${esCruceNoche(o)?'🌙 '+fechaSalidaTallerTexto(o):(o.salida_taller||'--')}</div><div></div>
    <div><b>Ingreso (fecha):</b> ${o.ingreso||'--'}</div><div><b>Salida (fecha):</b> ${o.salida||'--'}</div>
    <div><b>ETA:</b> ${o.eta||'--'}</div><div><b>Dias faltantes ETA:</b> ${calcDiasFaltantesEta(o)}</div>
    <div><b>Ultimo cambio de etapa:</b> ${o.etapa_usuario?esc(o.etapa_usuario)+' · '+(o.etapa_fecha||''):'--'}</div><div></div>
  </div>
  ${o.hora_compromiso?`<div style="margin-top:8px"><span class="centrega">⏰ Horario de Entrega (compromiso): ${o.hora_compromiso}</span></div>`:''}
  ${esFord(o)?`<div style="margin-top:8px"><span class="vcu-badge ${vcuCompleto(o)?'ok':'pend'}" onclick="abrirVCU('${o.id}')">📋 VCU (Hoja Multipuntos Ford) ${vcuCompleto(o)?'✅ Completo':'⚠️ Pendiente de completar'}</span></div>`:''}
  ${o.recepcionado||o.lavado_hecho?`<div style="margin-top:8px">
    ${o.recepcionado?`<span class="qbadge recepcion">📥 Recepcionado — ${esc(o.recepcion_usuario||'')} · ${o.recepcion_fecha||''}</span>`:''}
    ${o.lavado_hecho?`<span class="qbadge lavado">🧼 Lavado — ${esc(o.lavado_usuario||'')} · ${o.lavado_fecha||''}</span>`:''}
  </div>`:''}
  <div style="margin-top:8px"><b>Comentario del tablero:</b><br>
    <span style="white-space:pre-wrap">${o.comentario2?esc(o.comentario2):'--'}</span>
    ${o.comentario2&&o.comentario2_usuario?`<div class="cmeta" style="margin-top:2px">— ${esc(o.comentario2_usuario)} · ${o.comentario2_fecha||''}</div>`:''}
  </div>`;
  if(PUEDE_EDITAR){
    const opcTec=`<option value="">Sin asignar</option>`+tecnicos.map((t,i)=>`<option value="${i}" ${o.tecnico===i?'selected':''}>${t}</option>`).join('');
    const opcEt=ETAPAS.map(e=>`<option value="${e.id}" ${o.etapa===e.id?'selected':''}>${e.t}</option>`).join('');
    body+=`<hr>
    <div style="margin-bottom:8px"><b>Tecnico:</b><select onchange="editField('${o.id}','tecnico',this.value===''?null:+this.value)" style="margin-left:8px">${opcTec}</select></div>
    <div style="margin-bottom:8px"><b>Horario Ingreso (Agenda):</b><input type="time" value="${o.hora_rec||''}" onchange="editField('${o.id}','hora_rec',this.value)" style="margin-left:8px" title="Mismo campo/alcance que 'Horario Ingreso' en Control de Taller — informativo, no alimenta el Planificador de Tecnicos"></div>
    <div style="margin-bottom:8px"><b>Horario Entrega (compromiso):</b><input type="time" value="${o.hora_compromiso||''}" onchange="editField('${o.id}','hora_compromiso',this.value)" style="margin-left:8px" title="Mismo campo/alcance que 'Horario Entrega' en Control de Taller — informativo, no alimenta el Planificador de Tecnicos"></div>
    <div style="margin-bottom:8px"><b>Ingreso Taller:</b><input type="time" value="${o.ingreso_taller||''}" onchange="editField('${o.id}','ingreso_taller',this.value)" style="margin-left:8px" title="Alimenta el Planificador de Tecnicos y el Tiempo Estimado"></div>
    <div style="margin-bottom:8px"><b>Salida Taller:</b><input type="time" value="${o.salida_taller||''}" onchange="editField('${o.id}','salida_taller',this.value)" style="margin-left:8px" title="Alimenta el Planificador de Tecnicos y el Tiempo Estimado. Si la hora de salida es menor o igual a la de ingreso, se interpreta como turno que cruza a la jornada siguiente."></div>
    <div style="margin-bottom:8px"><b>Duracion (min):</b><input type="number" value="${o.duracion_min||60}" min="30" max="480" step="30" onchange="editField('${o.id}','duracion_min',+this.value)" style="margin-left:8px;width:80px"></div>
    <div style="margin-bottom:8px"><b>Ingreso (fecha):</b><input type="date" value="${o.ingreso||''}" onchange="editField('${o.id}','ingreso',this.value)" style="margin-left:8px" title="Mismo campo/alcance que 'Ingreso' en Control de Taller — alimenta el Planificador de Tecnicos"></div>
    <div style="margin-bottom:8px"><b>Salida (fecha):</b><input type="date" value="${o.salida||''}" onchange="editField('${o.id}','salida',this.value)" style="margin-left:8px" title="Mismo campo/alcance que 'Salida' en Control de Taller — solo informativo"></div>
    <div style="margin-bottom:8px"><b>ETA:</b><input type="date" value="${o.eta||''}" onchange="editField('${o.id}','eta',this.value)" style="margin-left:8px" title="Mismo campo/alcance que 'ETA' en Control de Taller"></div>
    <div style="margin-bottom:8px"><b>Etapa:</b><select onchange="cambiarEtapaDesdeModal('${o.id}',this.value)" style="margin-left:8px">${opcEt}</select></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <button onclick="closeModal();agregarComentarioTablero('${o.id}')">💬 Agregar/editar comentario</button>
      <button onclick="closeModal();toggleNoAsiste('${(o.ot||'').replace(/'/g,"\\'")}','${(o.patente||'').replace(/'/g,"\\'")}')">${_noShow?'↩️ Reactivar':'🚫 Marcar cliente no asiste'}</button>
      ${o.etapa!=='ingreso_taller'?`<button onclick="closeModal();marcarRecepcionado('${o.id}')">📥 Marcar Recepcion → Ingreso Taller</button>`:''}
      ${o.etapa!=='lavado'?`<button onclick="closeModal();marcarLavado('${o.id}')">🧼 Enviar a Lavado</button>`:''}
      <button onclick="closeModal();cerrarCita('${o.id}')">✅ Finalizar</button>
      <button style="color:#b33" onclick="closeModal();eliminarOrdenCT('${o.id}')">🗑 Eliminar cita del tablero</button>
    </div>`;
  }
  document.getElementById('modal-body').innerHTML=body;
  document.getElementById('modal-overlay').classList.add('open');
}
function abrirDetalleBloque(b){
  document.getElementById('modal-title').textContent=`Cita — ${b.patente||b.oc||'--'}`;
  document.getElementById('modal-del-btn').style.display=PUEDE_EDITAR?'block':'none';
  modalBloqueId=b.id;
  document.getElementById('modal-body').innerHTML=`<div class="det-g">
    <div><b>OC / Folio:</b> ${b.oc||'--'}</div><div><b>Patente:</b> ${b.patente||'--'}</div>
    <div><b>Cliente:</b> ${b.cliente||'--'}</div><div><b>Modelo:</b> ${b.modelo||'--'}</div>
    <div><b>Servicio:</b> ${b.servicio||'--'}</div><div><b>Tecnico:</b> ${tecnicos[b.tec]||'--'}</div>
    <div><b>Hora inicio:</b> ${b.ini||'--'}</div><div><b>Duracion:</b> ${b.dur||60} min</div>
  </div>${PUEDE_EDITAR?'<hr><div style="font-size:12px;color:#888">Usa 🗑 Quitar para liberar este slot.</div>':''}`;
  document.getElementById('modal-overlay').classList.add('open');
}
function closeModal(){document.getElementById('modal-overlay').classList.remove('open');}
function editField(id,field,val){
  const o=byId(id);if(!o)return;
  // Tecnico/Ingreso Taller/Salida Taller/Ingreso (fecha)/Salida (fecha): regla
  // imperativa — un tecnico no puede tener 2 trabajos a la vez. Si hay choque, se
  // revierte todo y se vuelve a pintar el modal para que los campos muestren el valor
  // original (el select/input ya habia mostrado la eleccion nueva del usuario).
  if(['tecnico','ingreso_taller','salida_taller','ingreso','salida'].includes(field)){
    const res=_aplicarCambioAgenda(o,field,val);
    if(!res.ok){
      alert(res.mensaje);
      abrirDetalle(id);
      return;
    }
    saveCtrl();
    if(currentView==='plan')renderPlanView();
    return;
  }
  o[field]=val;
  if(field==='etapa')marcarCambioEtapa(o);
  saveCtrl();
  if(currentView==='plan')renderPlanView();
}
// Cambio de Etapa desde el select del modal de detalle — a diferencia de editField()
// directo, este primero verifica el bloqueo por VCU (Ford, etapa > En Proceso). Si esta
// bloqueado, avisa y vuelve a pintar el modal (revierte visualmente el select) sin
// aplicar el cambio; si esta permitido, aplica el cambio normal y cierra el modal.
function cambiarEtapaDesdeModal(id,val){
  const o=byId(id);if(!o)return;
  if(_avanceBloqueadoPorVCU(o,val)){
    alert(`🚫 No se puede avanzar de etapa — falta completar el VCU (Hoja Multipuntos Ford) de ${o.patente}.`);
    abrirDetalle(id);
    return;
  }
  editField(id,'etapa',val);
  closeModal();
  renderJPCB();
}

// =============================================================
// VCU — render / guardado / PDF (ver VCU_SCHEMA mas arriba)
// =============================================================
function _vcuFieldById(id){
  for(const sec of VCU_SCHEMA){
    const f=sec.fields.find(x=>x.id===id);
    if(f)return f;
  }
  return null;
}
// Mapa de coordenadas (% del ancho/alto de cada imagen real) — estimado visualmente
// campo por campo sobre las 2 paginas reales del PDF de Ford. p:1 = pagina 1 (Asesor +
// Tecnico primera mitad), p:2 = pagina 2 (Neumaticos + Diagnostico + Firmas).
const VCU_POS={
  fecha:{p:1,type:'text',x:12.2,y:21.1,w:17.0},
  or:{p:1,type:'text',x:34.8,y:21.1,w:14.5},
  linea:{p:1,type:'text',x:12.2,y:22.9,w:11.5},
  modelo:{p:1,type:'text',x:29.8,y:22.9,w:19.5},
  vin:{p:1,type:'text',x:16.2,y:24.7,w:32.5},
  fl_fugas:{p:1,type:'sino',six:22.35,siy:38.6,nox:27.25,noy:38.6,cmb:47.4},
  fl_aceite_motor:{p:1,type:'sino',six:9.18,siy:42.9,nox:10.59,noy:42.9},
  fl_fluido_freno:{p:1,type:'sino',six:9.18,siy:44.9,nox:10.59,noy:44.9},
  fl_embrague:{p:1,type:'sino',six:9.18,siy:46.8,nox:10.59,noy:46.8},
  fl_dir_hid:{p:1,type:'sino',six:20.95,siy:42.9,nox:22.41,noy:42.9},
  fl_limpiaparab:{p:1,type:'sino',six:20.95,siy:44.9,nox:22.41,noy:44.9},
  fl_lineas_comb:{p:1,type:'sino',six:20.95,siy:46.8,nox:22.41,noy:46.8},
  fl_transmision:{p:1,type:'sino',six:34.14,siy:42.9,nox:35.73,noy:42.9},
  fl_refrigerante:{p:1,type:'sino',six:34.14,siy:44.9,nox:35.73,noy:44.9},
  fl_diferencial:{p:1,type:'sino',six:34.14,siy:46.8,nox:35.73,noy:46.8},
  plumillas:{p:1,type:'sino',six:34.5,siy:52.4,nox:37.75,noy:52.4,cmb:47.4},
  luces:{p:1,type:'sino',six:8.9,siy:57.4,nox:10.4,noy:57.4,cmb:47.4},
  parabrisas:{p:1,type:'sino',six:8.9,siy:59.3,nox:10.4,noy:59.3,cmb:47.4},
  cristales:{p:1,type:'sino',six:8.9,siy:61.2,nox:10.4,noy:61.2,cmb:47.4},
  bat_estado:{p:1,type:'semaforo',x:8.9,y:64.5,cmb:47.4},
  // Grafico triangular "Nivel de carga de Bateria": va de 0% (vertice, punta baja) a
  // 100% (extremo derecho, mas alto) — x0/x100 son los limites horizontales reales del
  // grafico medidos sobre la imagen, yBase es la linea base (0% de altura) y yTop es la
  // altura del extremo derecho (100%). La marca se dibuja como una linea vertical que
  // interpola la altura segun el % elegido, igual que haria un tecnico a mano.
  bat_nivel_carga:{p:1,type:'trislider',x0:21.5,x100:42.5,yBase:76.8,yTop:72.35},
  bat_cca_real:{p:1,type:'text',x:8.75,y:74.9,w:7.5},
  bat_cca_fabrica:{p:1,type:'text',x:38.5,y:74.9,w:9.0},
  bat_recuperacion:{p:1,type:'sino',six:47.75,siy:76.9,nox:49.3,noy:76.9},
  cod_verificacion:{p:1,type:'radio',o1x:30.0,o1y:81.4,o2x:39.5,o2y:81.4},
  cod_relenti:{p:1,type:'radio',o1x:30.0,o1y:83.3,o2x:39.5,o2y:83.3},
  mangueras_motor:{p:1,type:'semaforo',x:52.0,y:27.0,cmb:90.4},
  mangueras_refrig:{p:1,type:'semaforo',x:52.0,y:29.9,cmb:90.4},
  correa_accesorios:{p:1,type:'semaforo',x:52.0,y:32.5,cmb:90.4},
  frenos_sistema:{p:1,type:'semaforo',x:52.0,y:36.7,cmb:90.4},
  suspension:{p:1,type:'semaforo',x:52.0,y:41.0,cmb:90.4},
  direccion:{p:1,type:'semaforo',x:52.0,y:43.6,cmb:90.4},
  escape:{p:1,type:'semaforo',x:52.0,y:47.8,cmb:90.4},
  tren_motriz_del:{p:1,type:'semaforo',x:52.0,y:51.9,cmb:90.4},
  tren_motriz_tra:{p:1,type:'semaforo',x:52.0,y:54.6,cmb:90.4},
  ac_funcionamiento:{p:1,type:'semaforo',x:52.0,y:58.8,cmb:90.4},
  ac_filtro_cabina:{p:1,type:'semaforo',x:52.0,y:61.2,cmb:90.4},
  filtro_aire:{p:1,type:'semaforo',x:52.0,y:65.3,cmb:90.4},
  filtro_combustible:{p:1,type:'semaforo',x:52.0,y:67.8,cmb:90.4},
  parte_inferior_obs:{p:1,type:'textarea',x:52.4,y:82.3,w:38.8,h:7.2},
  reinicio_aceite:{p:2,type:'check',x:6.5,y:26.0},
  comentarios:{p:2,type:'textarea',x:5.5,y:28.3,w:17.0,h:32.4},
  ndi_labrado:{p:2,type:'semaforo_num',x:23.0,y:27.4,vx:47.5,vy:27.4,vw:3.5},
  ndi_desgaste:{p:2,type:'text',x:30.0,y:28.7,w:15},
  ndi_presion:{p:2,type:'semaforo_num',x:23.0,y:30.1,vx:51.5,vy:30.1,vw:3.0},
  ndi_pastillas:{p:2,type:'semaforo_num',x:23.0,y:31.4,vx:47.5,vy:31.4,vw:3.5},
  ndi_disco:{p:2,type:'semaforo_num',x:23.0,y:32.8,vx:47.5,vy:32.8,vw:3.5},
  ndd_labrado:{p:2,type:'semaforo_num',x:60.0,y:27.4,vx:87.75,vy:27.4,vw:3.5},
  ndd_desgaste:{p:2,type:'text',x:67.0,y:28.7,w:15},
  ndd_presion:{p:2,type:'semaforo_num',x:60.0,y:30.1,vx:91.5,vy:30.1,vw:3.0},
  ndd_pastillas:{p:2,type:'semaforo_num',x:60.0,y:31.4,vx:87.75,vy:31.4,vw:3.5},
  ndd_disco:{p:2,type:'semaforo_num',x:60.0,y:32.8,vx:87.75,vy:32.8,vw:3.5},
  nti_labrado:{p:2,type:'semaforo_num',x:23.0,y:42.6,vx:47.5,vy:42.6,vw:3.5},
  nti_desgaste:{p:2,type:'text',x:30.0,y:45.1,w:15},
  nti_presion:{p:2,type:'semaforo_num',x:23.0,y:47.7,vx:51.5,vy:47.7,vw:3.0},
  nti_pastillas:{p:2,type:'semaforo_num',x:23.0,y:50.1,vx:47.5,vy:50.1,vw:3.5},
  nti_tambor:{p:2,type:'semaforo_num',x:23.0,y:52.4,vx:47.5,vy:52.4,vw:3.5},
  ntd_labrado:{p:2,type:'semaforo_num',x:60.0,y:42.6,vx:87.75,vy:42.6,vw:3.5},
  ntd_desgaste:{p:2,type:'text',x:67.0,y:45.1,w:15},
  ntd_presion:{p:2,type:'semaforo_num',x:60.0,y:47.7,vx:91.5,vy:47.7,vw:3.0},
  ntd_pastillas:{p:2,type:'semaforo_num',x:60.0,y:50.1,vx:87.75,vy:50.1,vw:3.5},
  ntd_tambor:{p:2,type:'semaforo_num',x:60.0,y:52.4,vx:87.75,vy:52.4,vw:3.5},
  nrep_presion:{p:2,type:'semaforo_num',x:60.0,y:59.4,vx:87.5,vy:59.4,vw:3.0},
  diag_sintoma:{p:2,type:'textarea',x:5.5,y:66.3,w:28,h:13.5},
  diag_componente:{p:2,type:'textarea',x:34.0,y:66.3,w:28,h:13.5},
  diag_causa_raiz:{p:2,type:'textarea',x:64.5,y:66.3,w:28,h:13.5},
  // Firmas: se autocompletan desde el Asesor/Tecnico ya asignados a la orden en
  // Control de Taller (no hay que volver a tipearlos) — ver prefill en vcuFormHTML.
  nombre_asesor:{p:2,type:'text',x:9.5,y:95.9,w:38},
  nombre_tecnico:{p:2,type:'text',x:56.5,y:95.9,w:38},
};
const VCU_OF_CW=1.05, VCU_OF_CH=1.35; // tamano estandar de casilla, % ancho/alto imagen
// Mueve en vivo la linea marcadora del grafico triangular "Nivel de carga de Bateria"
// mientras se arrastra el control deslizante — misma interpolacion que usa fieldMark()
// en el PDF, para que lo que se ve en pantalla sea igual a lo impreso.
function _vcuBatMarkerUpdate(el){
  const pos=VCU_POS[el.dataset.vcu];
  if(!pos)return;
  const v=Math.max(0,Math.min(100,Number(el.value)||0));
  const x=pos.x0+(pos.x100-pos.x0)*(v/100);
  const yTop=pos.yBase-(pos.yBase-pos.yTop)*(v/100);
  const marker=el.nextElementSibling;
  if(marker){
    marker.style.left=x+'%';
    marker.style.top=yTop+'%';
    marker.style.height=(pos.yBase-yTop)+'%';
  }
  const lbl=marker?marker.nextElementSibling:null;
  if(lbl){lbl.style.left=x+'%';lbl.style.top=(yTop-1.2)+'%';lbl.textContent=v+'%';}
}
function _vcuOverlayField(f,datos){
  const pos=VCU_POS[f.id];
  if(!pos)return '';
  const v=datos[f.id]!==undefined&&datos[f.id]!==null?datos[f.id]:'';
  const dis=PUEDE_EDITAR?'':'disabled';
  const CW=VCU_OF_CW, CH=VCU_OF_CH;
  const cmbHTML=(y)=>{
    if(pos.cmb===undefined)return '';
    const cv=!!datos[f.id+'_cambiado'];
    return '<input type="checkbox" class="vcuf-of-box" title="Cambiado" style="left:'+pos.cmb+'%;top:'+y+'%;width:'+CW+'%;height:'+CH+'%" data-vcu="'+f.id+'_cambiado" '+(cv?'checked':'')+' '+dis+'>';
  };
  if(pos.type==='sino'){
    return '<input type="radio" class="vcuf-of-box" title="SI" style="left:'+pos.six+'%;top:'+pos.siy+'%;width:'+CW+'%;height:'+CH+'%" name="vcuf_'+f.id+'" data-vcu="'+f.id+'" value="si" '+(v==='si'?'checked':'')+' '+dis+'>'
      +'<input type="radio" class="vcuf-of-box" title="NO" style="left:'+pos.nox+'%;top:'+pos.noy+'%;width:'+CW+'%;height:'+CH+'%" name="vcuf_'+f.id+'" data-vcu="'+f.id+'" value="no" '+(v==='no'?'checked':'')+' '+dis+'>'
      +cmbHTML(pos.siy);
  }
  if(pos.type==='semaforo'||pos.type==='semaforo_num'){
    const dx=1.6;
    let html='<input type="radio" class="vcuf-of-box vcuf-of-verde" title="Verificado y aprobado" style="left:'+pos.x+'%;top:'+pos.y+'%;width:'+CW+'%;height:'+CH+'%" name="vcuf_'+f.id+'" data-vcu="'+f.id+'" value="verde" '+(v==='verde'?'checked':'')+' '+dis+'>'
      +'<input type="radio" class="vcuf-of-box vcuf-of-amarillo" title="Puede requerir atencion en el futuro" style="left:'+(pos.x+dx)+'%;top:'+pos.y+'%;width:'+CW+'%;height:'+CH+'%" name="vcuf_'+f.id+'" data-vcu="'+f.id+'" value="amarillo" '+(v==='amarillo'?'checked':'')+' '+dis+'>'
      +'<input type="radio" class="vcuf-of-box vcuf-of-rojo" title="Requiere atencion inmediata" style="left:'+(pos.x+2*dx)+'%;top:'+pos.y+'%;width:'+CW+'%;height:'+CH+'%" name="vcuf_'+f.id+'" data-vcu="'+f.id+'" value="rojo" '+(v==='rojo'?'checked':'')+' '+dis+'>'
      +cmbHTML(pos.y);
    if(pos.type==='semaforo_num'){
      const vn=datos[f.id+'_valor']!==undefined&&datos[f.id+'_valor']!==null?datos[f.id+'_valor']:'';
      html+='<input type="text" class="vcuf-of-text" style="left:'+pos.vx+'%;top:'+pos.vy+'%;width:'+pos.vw+'%;text-align:right" data-vcu="'+f.id+'_valor" value="'+esc(vn)+'" '+dis+'>';
    }
    return html;
  }
  if(pos.type==='radio'){
    const opts=f.opts||[];
    let html='';
    if(opts[0])html+='<input type="radio" class="vcuf-of-box" title="'+esc(opts[0][1]||'')+'" style="left:'+pos.o1x+'%;top:'+pos.o1y+'%;width:'+CW+'%;height:'+CH+'%" name="vcuf_'+f.id+'" data-vcu="'+f.id+'" value="'+opts[0][0]+'" '+(v===opts[0][0]?'checked':'')+' '+dis+'>';
    if(opts[1])html+='<input type="radio" class="vcuf-of-box" title="'+esc(opts[1][1]||'')+'" style="left:'+pos.o2x+'%;top:'+pos.o2y+'%;width:'+CW+'%;height:'+CH+'%" name="vcuf_'+f.id+'" data-vcu="'+f.id+'" value="'+opts[1][0]+'" '+(v===opts[1][0]?'checked':'')+' '+dis+'>';
    return html;
  }
  if(pos.type==='check'){
    return '<input type="checkbox" class="vcuf-of-box" style="left:'+pos.x+'%;top:'+pos.y+'%;width:'+CW+'%;height:'+CH+'%" data-vcu="'+f.id+'" '+(v?'checked':'')+' '+dis+'>';
  }
  if(pos.type==='textarea'){
    return '<textarea class="vcuf-of-textarea" style="left:'+pos.x+'%;top:'+pos.y+'%;width:'+pos.w+'%;height:'+pos.h+'%" data-vcu="'+f.id+'" '+dis+'>'+esc(v)+'</textarea>';
  }
  if(pos.type==='date'){
    return '<input type="date" class="vcuf-of-text" style="left:'+pos.x+'%;top:'+pos.y+'%;width:'+pos.w+'%" data-vcu="'+f.id+'" value="'+esc(v)+'" '+dis+'>';
  }
  if(pos.type==='trislider'){
    const vv=(v!==''&&v!==undefined&&v!==null)?Math.max(0,Math.min(100,Number(v)||0)):0;
    const mx=pos.x0+(pos.x100-pos.x0)*(vv/100);
    const myTop=pos.yBase-(pos.yBase-pos.yTop)*(vv/100);
    const mh=pos.yBase-myTop;
    return '<input type="range" class="vcuf-of-range" min="0" max="100" style="left:'+pos.x0+'%;top:'+(pos.yBase+0.8)+'%;width:'+(pos.x100-pos.x0)+'%" data-vcu="'+f.id+'" value="'+vv+'" oninput="_vcuBatMarkerUpdate(this)" '+dis+'>'
      +'<div class="vcuf-bat-marker" style="left:'+mx+'%;top:'+myTop+'%;height:'+mh+'%"></div>'
      +'<div class="vcuf-bat-marker-lbl" style="left:'+mx+'%;top:'+(myTop-1.2)+'%">'+vv+'%</div>';
  }
  return '<input type="text" class="vcuf-of-text'+(v?'':' vcuf-of-empty')+'" style="left:'+pos.x+'%;top:'+pos.y+'%;width:'+pos.w+'%" data-vcu="'+f.id+'" value="'+esc(v)+'" '+dis+'>';
}
function vcuFormHTML(o){
  const datos=vcuDatos(o);
  if(!datos.or)datos.or=o.ot||'';
  if(!datos.modelo)datos.modelo=o.modelo||'';
  if(!datos.vin)datos.vin=o.vin||'';
  if(!datos.nombre_asesor)datos.nombre_asesor=o.asesor||'';
  if(!datos.nombre_tecnico){
    const _tn=(o.tecnico!==null&&o.tecnico!==undefined&&tecnicos[o.tecnico])?tecnicos[o.tecnico]:'';
    if(_tn)datos.nombre_tecnico=_tn;
  }
  if(!datos.fecha)datos.fecha=isoToday();
  let camposP1='',camposP2='';
  for(const sec of VCU_SCHEMA){
    for(const f of sec.fields){
      const pos=VCU_POS[f.id];
      if(!pos)continue;
      const html=_vcuOverlayField(f,datos);
      if(pos.p===1)camposP1+=html; else camposP2+=html;
    }
  }
  return ''
    +'<div class="vcuf-overlay-wrap"><img src="'+VCU_IMG_P1+'" alt="VCU Ford pagina 1">'+camposP1+'</div>'
    +'<div class="vcuf-overlay-wrap"><img src="'+VCU_IMG_P2+'" alt="VCU Ford pagina 2">'+camposP2+'</div>';
}
let vcuOrdenId=null;
function abrirVCU(id){
  const o=byId(id);if(!o)return;
  vcuOrdenId=id;
  document.getElementById('vcu-modal-title').textContent=`📋 VCU — Hoja Multipuntos Ford — ${o.patente} — ${o.modelo||''}`;
  document.getElementById('vcu-modal-body').innerHTML=vcuFormHTML(o);
  const est=vcuEstado(o);
  document.getElementById('vcu-modal-estado').textContent=est&&est.completo?`✅ Completo — ${est.tecnico||''} · ${est.fecha||''}`:'⚠️ Pendiente de completar. Todos los campos con * son obligatorios.';
  document.getElementById('vcu-modal-overlay').classList.add('open');
}
function cerrarVCU(){document.getElementById('vcu-modal-overlay').classList.remove('open');vcuOrdenId=null;}
function _vcuLeerFormulario(){
  const datos={};
  document.querySelectorAll('#vcu-modal-body [data-vcu]').forEach(el=>{
    const key=el.dataset.vcu;
    if(el.type==='checkbox')datos[key]=el.checked;
    else if(el.type==='radio'){if(el.checked)datos[key]=el.value;}
    else datos[key]=el.value;
  });
  return datos;
}
function vcuGuardar(marcarCompleto){
  if(!PUEDE_EDITAR){toast('Modo solo lectura — no se puede editar el VCU');return;}
  const o=byId(vcuOrdenId);if(!o)return;
  const datos=_vcuLeerFormulario();
  if(marcarCompleto){
    const faltan=vcuFaltantes(datos);
    if(faltan.length){
      alert(`Faltan ${faltan.length} campo(s) obligatorio(s) por completar:\\n\\n`+faltan.slice(0,15).map(f=>'• '+f.label).join('\\n')+(faltan.length>15?`\\n... y ${faltan.length-15} mas`:''));
      return;
    }
  }
  const m=_vcuMap();
  const prev=m[o.id];
  m[o.id]={datos,completo:marcarCompleto?true:!!(prev&&prev.completo),tecnico:USUARIO,fecha:nowStrCorto()};
  saveCtrl();
  renderJPCB();renderControlTaller();renderVehiculosTaller();
  const est=m[o.id];
  document.getElementById('vcu-modal-estado').textContent=est.completo?`✅ Completo — ${est.tecnico||''} · ${est.fecha||''}`:'⚠️ Pendiente de completar. Todos los campos con * son obligatorios.';
  toast(marcarCompleto?'✅ VCU marcado como completo':'💾 Borrador de VCU guardado');
}
function _vcuLabelValor(f,datos){
  const v=datos[f.id];
  if(f.type==='sino')return v==='si'?'SI':v==='no'?'NO':'--';
  if(f.type==='semaforo'){
    const map={verde:'🟢 Verificado y aprobado',amarillo:'🟡 Atencion en el futuro',rojo:'🔴 Atencion inmediata'};
    return map[v]||'--';
  }
  if(f.type==='semaforo_num'){
    const map={verde:'🟢',amarillo:'🟡',rojo:'🔴'};
    const val=datos[f.id+'_valor']||'--';
    return `${map[v]||'⚪'} ${val}`;
  }
  if(f.type==='radio'){
    const opt=(f.opts||[]).find(([val])=>val===v);
    return opt?opt[1]:'--';
  }
  if(f.type==='check')return v?'Si':'No';
  if(f.type==='trislider')return(v!==undefined&&v!==null&&String(v).trim()!=='')?`${v}%`:'--';
  return(v!==undefined&&v!==null&&String(v).trim()!=='')?v:'--';
}
function vcuDescargarPDF(){
  const o=byId(vcuOrdenId);if(!o)return;
  // El admin puede descargar el VCU aunque falten campos obligatorios por completar
  // (a pedido de Cristobal, 15/07/2026) — el resto de los usuarios sigue necesitando
  // marcarlo como completo antes de poder descargarlo.
  const esAdmin=(USUARIO||'').toLowerCase()==='cjerez@curifor.com';
  const est=vcuEstado(o);
  if(!esAdmin&&(!est||!est.completo)){
    alert('🚫 Para descargar el VCU primero hay que completar todos los campos obligatorios y guardarlo como "completo".');
    return;
  }
  _generarPdfVCU(o, est||{datos:_vcuLeerFormulario(),tecnico:USUARIO,fecha:nowStrCorto()});
}
function _generarPdfVCU(o,est){
  // Igual que el formulario en pantalla: se dibuja ENCIMA de la imagen real del PDF
  // de Ford (no una recreacion), esta vez con marcas/texto estaticos listos para
  // imprimir en vez de inputs editables. Reutiliza el mismo VCU_POS de coordenadas.
  const datos=est.datos||{};
  const CW=VCU_OF_CW, CH=VCU_OF_CH;
  const mark=(x,y)=>'<div class="vcu-pdf-mark" style="left:'+x+'%;top:'+y+'%;width:'+CW+'%;height:'+CH+'%">&#10003;</div>';
  const txt=(x,y,w,val,align)=>'<div class="vcu-pdf-text" style="left:'+x+'%;top:'+y+'%;width:'+(w||10)+'%;'+(align?('text-align:'+align+';'):'')+'">'+esc(val||'')+'</div>';
  const area=(x,y,w,h,val)=>'<div class="vcu-pdf-area" style="left:'+x+'%;top:'+y+'%;width:'+w+'%;height:'+h+'%">'+esc(val||'').replace(/\\n/g,'<br>')+'</div>';

  function cmbMark(f,y){
    const pos=VCU_POS[f.id];
    if(!pos||pos.cmb===undefined)return '';
    return datos[f.id+'_cambiado']?mark(pos.cmb,y):'';
  }

  function fieldMark(f){
    const pos=VCU_POS[f.id];
    if(!pos)return '';
    const v=datos[f.id];
    if(pos.type==='sino'){
      let html='';
      if(v==='si')html+=mark(pos.six,pos.siy);
      else if(v==='no')html+=mark(pos.nox,pos.noy);
      html+=cmbMark(f,pos.siy);
      return html;
    }
    if(pos.type==='semaforo'||pos.type==='semaforo_num'){
      const dx=1.6;
      let html='';
      if(v==='verde')html+=mark(pos.x,pos.y);
      else if(v==='amarillo')html+=mark(pos.x+dx,pos.y);
      else if(v==='rojo')html+=mark(pos.x+2*dx,pos.y);
      if(pos.type==='semaforo_num'){
        html+=txt(pos.vx,pos.vy,pos.vw,datos[f.id+'_valor'],'right');
      }
      html+=cmbMark(f,pos.y);
      return html;
    }
    if(pos.type==='radio'){
      const opts=f.opts||[];
      if(opts[0]&&v===opts[0][0])return mark(pos.o1x,pos.o1y);
      if(opts[1]&&v===opts[1][0])return mark(pos.o2x,pos.o2y);
      return '';
    }
    if(pos.type==='check'){
      return v?mark(pos.x,pos.y):'';
    }
    if(pos.type==='textarea'){
      return area(pos.x,pos.y,pos.w,pos.h,v);
    }
    if(pos.type==='trislider'){
      if(v===undefined||v===null||v==='')return '';
      const vv=Math.max(0,Math.min(100,Number(v)||0));
      const bx=pos.x0+(pos.x100-pos.x0)*(vv/100);
      const byTop=pos.yBase-(pos.yBase-pos.yTop)*(vv/100);
      const bh=pos.yBase-byTop;
      return '<div class="vcu-pdf-batline" style="left:'+bx+'%;top:'+byTop+'%;height:'+bh+'%"></div>'
        +'<div class="vcu-pdf-batlbl" style="left:'+bx+'%;top:'+(byTop-1.0)+'%">'+vv+'%</div>';
    }
    return txt(pos.x,pos.y,pos.w,v);
  }

  let camposP1='',camposP2='';
  for(const sec of VCU_SCHEMA){
    for(const f of sec.fields){
      const pos=VCU_POS[f.id];
      if(!pos)continue;
      const html=fieldMark(f);
      if(pos.p===1)camposP1+=html; else camposP2+=html;
    }
  }

  const CSS='@page{size:landscape;margin:0;}'
    +'*{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;}'
    +'body{margin:0;padding:0;background:#e9edf1;}'
    +'.vcu-pdf-meta{text-align:center;font-size:11px;color:#556;padding:6px 4px;}'
    +'.vcu-pdf-page{position:relative;width:100%;max-width:1400px;margin:0 auto 16px;line-height:0;background:#fff;}'
    +'.vcu-pdf-page img{display:block;width:100%;height:auto;}'
    +'.vcu-pdf-mark{position:absolute;display:flex;align-items:center;justify-content:center;font-weight:900;color:#000;font-size:1.15vw;line-height:1;}'
    +'.vcu-pdf-text{position:absolute;font-size:1.05vw;font-weight:700;color:#111;line-height:1.15;white-space:nowrap;overflow:hidden;}'
    +'.vcu-pdf-area{position:absolute;font-size:0.92vw;font-weight:600;color:#111;line-height:1.25;overflow:hidden;}'
    +'.vcu-pdf-batline{position:absolute;width:.3%;background:#000;}'
    +'.vcu-pdf-batlbl{position:absolute;font-size:.9vw;font-weight:700;color:#000;transform:translate(-50%,-100%);white-space:nowrap;}'
    +'@media print{body{background:#fff;}.vcu-pdf-page{page-break-after:always;max-width:none;}.vcu-pdf-page:last-child{page-break-after:auto;}.no-print{display:none;}}';

  const meta='<div class="vcu-pdf-meta">Generado '+esc(new Date().toLocaleDateString('es-CL'))+' &middot; Sucursal '+esc(SUCURSAL)+' &middot; Completado por '+esc(est.tecnico||'')+' el '+esc(est.fecha||'')+' &middot; Patente '+esc(o.patente)+'</div>';

  const htmlDoc='<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>VCU '+esc(o.patente)+'</title><style>'+CSS+'</style></head><body>'
    +meta
    +'<div class="vcu-pdf-page"><img src="'+VCU_IMG_P1+'" alt="VCU Ford pagina 1">'+camposP1+'</div>'
    +'<div class="vcu-pdf-page"><img src="'+VCU_IMG_P2+'" alt="VCU Ford pagina 2">'+camposP2+'</div>'
    +'<div class="no-print" style="text-align:center;margin:14px 0;"><button onclick="window.print()" style="padding:8px 20px;font-size:13px;cursor:pointer">Imprimir / Guardar como PDF</button></div>'
    +'</body></html>';

  const w=window.open('','_blank');
  if(!w){toast('El navegador bloqueo la ventana emergente — habilitala para descargar el VCU');return;}
  w.document.write(htmlDoc);
  w.document.close();
}

/* ------------------------------------------------------------------
   KEEP-ALIVE de la sesion — ELIMINADO al portar a Next (13/08/2026)
   ----------------------------------------------------------------
   Existia porque el tablero vivia dentro de un iframe de Streamlit: Torre de
   Control trabajaba horas ahi adentro y la pagina contenedora no veia ninguna
   actividad, asi que la conexion quedaba ociosa, se cortaba, y al reconectar
   Streamlit abria sesion nueva y los devolvia al login. El ping cada 4 minutos
   a /_stcore/health mantenia viva esa conexion.

   Aca no aplica y ademas molestaba: ese endpoint es de Streamlit, no existe en
   Next, y cada ping devolvia un 404 en la consola. La sesion ahora es una
   cookie firmada de 12 horas que no depende de que haya trafico.
------------------------------------------------------------------- */

/* ------------------------------------------------------------------
   REFRESCO SILENCIOSO DEL TABLERO (10/08/2026)
   --------------------------------------------
   Hasta ahora el tablero solo traia los cambios de otra persona cuando
   TU guardabas algo: si un asesor marcaba "Asiste" y vos no tocabas
   nada, no lo veias aparecer.

   Esto pregunta cada 30 s si cambio algo EN TU SUCURSAL (ahora que cada
   una tiene su propio archivo). La clave es que **no repinta nada si no
   hubo cambios**: se compara la SHA del archivo contra la que ya
   teniamos y, si es la misma, la funcion termina sin tocar la pantalla.
   Solo cuando alguien guardo algo de verdad se mezcla (campo a campo,
   con las mismas protecciones de siempre) y se repinta, avisando abajo.

   Nunca interrumpe: si hay un formulario abierto, estas escribiendo en
   un campo, arrastrando una tarjeta o hay un guardado en curso, deja
   pasar el turno y reintenta al siguiente.
------------------------------------------------------------------- */
let _pollOcupado=false;
let _ctrlEtag='';
function _tableroOcupado(){
  try{
    // Hay un guardado encolado o en curso: NO se toca nada hasta que termine.
    // Este chequeo es la mitad del fix del 11/08/2026 (la otra mitad es encolar
    // el refresco en la misma cadena _ctrlSaveChain, mas abajo).
    if(_ctrlSavesPendientes>0) return true;
    // Formularios/modales abiertos (detalle de orden, cita, VCU, disponibilidad)
    if(document.querySelector('.overlay.open, #cita-modal-overlay.open, '
       +'#vcu-modal-overlay.open, #nodisp-modal-overlay.open')) return true;
    // El usuario esta escribiendo o eligiendo algo
    const a=document.activeElement;
    if(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return true;
    // Arrastrando una tarjeta
    if(document.querySelector('.dragging')) return true;
    // Pestaña en segundo plano: no gastamos llamadas ni repintamos a ciegas
    if(document.hidden) return true;
  }catch(e){}
  return false;
}

async function _pollCambiosTablero(){
  if(_pollOcupado||_tableroOcupado())return;
  _pollOcupado=true;
  try{
    // Peticion CONDICIONAL (If-None-Match): si el archivo no cambio, GitHub
    // responde 304 sin cuerpo — no baja los ~286 KB del archivo y, ademas, un
    // 304 NO descuenta cuota del token (que se comparte con todos los modulos y
    // con los guardados del propio tablero). Sin esto, cada pestaña abierta
    // gastaba 120 llamadas/hora solo para comparar una SHA.
    const _h={'Authorization':`token ${GITHUB_TOKEN}`,'Accept':'application/vnd.github.v3+json'};
    if(_ctrlEtag)_h['If-None-Match']=_ctrlEtag;
    const r=await fetch(API_BASE+CTRL_FILE,{headers:_h,cache:'no-store'});
    if(r.status===304)return;            // nada cambio: la pantalla no se toca
    if(!r.ok)return;
    try{const _et=r.headers.get('etag');if(_et)_ctrlEtag=_et;}catch(e){}
    const j=await r.json();
    // Misma SHA = nadie guardo nada desde la ultima vez -> NO se toca la pantalla
    if(!j.sha||j.sha===ctrlSha)return;
    // Hubo un cambio real: se vuelve a chequear que no este ocupado (el usuario
    // pudo abrir algo, o pudo salir un guardado, mientras esperabamos la respuesta).
    if(_tableroOcupado())return;
    const _antes=(ordenes||[]).length;
    // El refresco se ENCOLA en la misma cadena que los guardados: nunca puede
    // haber dos ciclos de merge corriendo a la vez (ver _ctrlSavesPendientes).
    let ok=false;
    _ctrlSaveChain=_ctrlSaveChain
      .then(async()=>{ if(!_tableroOcupado()) ok=await _refrescarCtrlSha(); })
      .catch(e=>{console.warn('refresco encolado fallo',e);});
    await _ctrlSaveChain;
    if(ok){
      const _dif=(ordenes||[]).length-_antes;
      toast(_dif>0 ? ('🔄 Se agregaron '+_dif+' orden(es) desde otra sesion')
           :(_dif<0 ? ('🔄 Se quitaron '+Math.abs(_dif)+' orden(es) desde otra sesion')
                    : '🔄 Tablero actualizado con cambios de otra sesion'));
    }
  }catch(e){ /* sin conexion: se reintenta al siguiente turno */ }
  finally{ _pollOcupado=false; }
}
setInterval(_pollCambiosTablero, 30000);

loadData();
