import { useState, useEffect, useCallback } from 'react'
import { fetchAllData, calcAllWorkers, calcSalary, saveShift, saveBonusRecord,
         updateStaffRates, updateFixedSalary, saveSettings, checkAccess,
         writeLog, monthRange, DEFAULT_CFG } from './notion.js'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const OWNER_IDS = (import.meta.env.VITE_OWNER_IDS||'').split(',').map(x=>Number(x.trim())).filter(Boolean)
const MONTHS_UA = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень']

// ── Colors ─────────────────────────────────────────────────
const C = {
  bg:'#0b1017',surface:'#111820',surface2:'#161f2a',
  border:'rgba(56,189,248,0.12)',border2:'rgba(56,189,248,0.06)',
  accent:'#38bdf8',gold:'#f59e0b',green:'#22c55e',
  red:'#f87171',muted:'#4a6070',text:'#e2f0f9',dim:'#6b8fa8',purple:'#a78bfa',
  w:['#38bdf8','#22c55e','#f59e0b','#a78bfa','#fb7185','#34d399','#60a5fa','#f472b6'],
}
const fmt  = n => Math.round(n||0).toLocaleString('uk-UA')
const fmtH = n => Number(n||0).toFixed(1)
const todayStr = () => new Date().toISOString().slice(0,10)
const inp = {background:'rgba(255,255,255,0.05)',border:`1px solid ${C.border}`,borderRadius:8,color:C.text,padding:'11px 14px',fontSize:15,fontFamily:'inherit',width:'100%',outline:'none',WebkitAppearance:'none'}

// ── UI Primitives ──────────────────────────────────────────
const Card = ({children,top,style={}}) =>
  <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:'16px 18px',...(top?{borderTop:`2px solid ${top}`}:{}),overflowX:'hidden',...style}}>{children}</div>

const Lbl = ({children,style={}}) =>
  <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:'uppercase',marginBottom:6,...style}}>{children}</div>

const SecTitle = ({children,right}) =>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
    <div style={{fontSize:10,color:C.accent,letterSpacing:2,textTransform:'uppercase'}}>{children}</div>
    {right}
  </div>

const Row = ({label,value,color=C.text,bold=false,last=false,sub}) =>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',padding:'8px 0',borderBottom:last?'none':`1px solid ${C.border}`,fontSize:13}}>
    <div><span style={{color:C.dim}}>{label}</span>{sub&&<div style={{fontSize:10,color:C.muted}}>{sub}</div>}</div>
    <span style={{color,fontWeight:bold?700:400,marginLeft:8,textAlign:'right'}}>{value}</span>
  </div>

const Prog = ({val,max,color}) =>
  <div style={{height:5,borderRadius:3,background:`${color}22`,overflow:'hidden'}}>
    <div style={{height:'100%',width:`${Math.min(100,(val/Math.max(max,1))*100)}%`,background:color,borderRadius:3,transition:'width .4s'}}/>
  </div>

const Badge = ({children,color=C.accent}) =>
  <span style={{display:'inline-block',padding:'2px 8px',borderRadius:4,background:`${color}22`,color,fontSize:11,fontWeight:600}}>{children}</span>

function Sheet({onClose,title,children}) {
  return <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',display:'flex',alignItems:'flex-end',zIndex:200}}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:'16px 16px 0 0',padding:'20px 20px 44px',width:'100%',maxHeight:'92vh',overflowY:'auto'}}>
      <div style={{width:40,height:4,background:C.muted,borderRadius:2,margin:'0 auto 16px'}}/>
      {title&&<div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:18}}>{title}</div>}
      {children}
    </div>
  </div>
}

function Header({title,sub,onRefresh,onBack,right}) {
  return <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:'12px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:10}}>
    <div style={{display:'flex',alignItems:'center',gap:8}}>
      {onBack&&<button onClick={onBack} style={{background:'transparent',border:`1px solid ${C.border}`,color:C.accent,borderRadius:8,padding:'5px 10px',fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>←</button>}
      <div>
        <div style={{fontSize:14,fontWeight:700,color:C.accent,letterSpacing:1}}>{title}</div>
        {sub&&<div style={{fontSize:10,color:C.muted}}>{sub}</div>}
      </div>
    </div>
    <div style={{display:'flex',gap:8,alignItems:'center'}}>
      {right}
      {onRefresh&&<button onClick={onRefresh} style={{background:'transparent',border:`1px solid ${C.border}`,color:C.accent,borderRadius:8,padding:'6px 10px',fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>↻</button>}
    </div>
  </div>
}

function Spinner() {
  return <div style={{minHeight:'100vh',background:C.bg,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:16}}>
    <div style={{fontSize:40}}>🪵</div>
    <style>{`@keyframes sl{0%{transform:translateX(-200%)}100%{transform:translateX(400%)}}`}</style>
    <div style={{color:C.accent,fontSize:11,letterSpacing:3}}>ЗАВАНТАЖЕННЯ...</div>
    <div style={{width:120,height:2,background:C.border,borderRadius:2,overflow:'hidden'}}>
      <div style={{height:'100%',width:'40%',background:C.accent,borderRadius:2,animation:'sl 1s ease-in-out infinite'}}/>
    </div>
  </div>
}

function MonthPicker({year,month,onChange}) {
  const now = new Date()
  return <div style={{display:'flex',gap:6,overflowX:'auto',paddingBottom:4}}>
    {Array.from({length:6},(_,i)=>{
      const d = new Date(now.getFullYear(), now.getMonth()-5+i)
      const y = d.getFullYear(), m = d.getMonth()
      const active = y===year&&m===month
      return <button key={i} onClick={()=>onChange(y,m)} style={{whiteSpace:'nowrap',padding:'6px 12px',borderRadius:20,border:`1px solid ${active?C.accent:C.border}`,background:active?'rgba(56,189,248,0.1)':'transparent',color:active?C.accent:C.muted,cursor:'pointer',fontSize:11,fontFamily:'inherit',flexShrink:0}}>
        {MONTHS_UA[m].slice(0,3)} {y!==now.getFullYear()?y:''}
      </button>
    })}
  </div>
}

const TTip = ({active,payload,label}) => {
  if (!active||!payload?.length) return null
  return <div style={{background:'#1a2535',border:`1px solid ${C.border}`,borderRadius:8,padding:'10px 14px',fontSize:11}}>
    <div style={{color:C.accent,marginBottom:4}}>{label}</div>
    {payload.map((p,i)=><div key={i} style={{color:p.color||C.text}}>{p.name}: {fmt(p.value)} грн</div>)}
  </div>
}

// ================================================================
// ФОРМА ВНЕСЕННЯ ЗМІН
// ================================================================
function ShiftForm({worker,allWorkers,isOwner,onClose,onSaved,tgId,tgName}) {
  const [selId,   setSelId]   = useState(worker?.tgId||tgId)
  const [type,    setType]    = useState('hours')
  const [date,    setDate]    = useState(todayStr())
  const [hours,   setHours]   = useState('')
  const [packs,   setPacks]   = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error,   setError]   = useState(null)
  const [result,  setResult]  = useState(null)

  const sel = isOwner ? (allWorkers.find(w=>w.tgId===Number(selId))||worker) : worker

  async function submit(e) {
    e.preventDefault()
    const h = type==='packs'?0:parseFloat(hours)||0
    const p = type==='hours'?0:parseFloat(packs)||0
    if (!h&&!p) return
    try {
      setLoading(true); setError(null)
      await saveShift({tgId:sel.tgId,name:sel.name,rateHour:sel.rateHour||0,ratePack:sel.ratePack||0,date,hours:h,packs:p})
      await writeLog({tgId:isOwner?tgId:sel.tgId,name:isOwner?tgName:sel.name,
        action:`Внесено зміну за ${sel.name}`,details:`${date}: ${h} год, ${p} пачок`})
      const earned = h*(sel.rateHour||0)+p*(sel.ratePack||0)
      setResult({hours:h,packs:p,earned,date})
      setSuccess(true)
      setTimeout(()=>{onSaved();onClose()},3000)
    } catch(e){setError(e.message)} finally{setLoading(false)}
  }

  const earn = (parseFloat(hours)||0)*(sel?.rateHour||0)+(parseFloat(packs)||0)*(sel?.ratePack||0)

  if (success&&result) return <Sheet onClose={onClose} title="✅ Зміну внесено!">
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div style={{background:'rgba(34,197,94,0.08)',border:`1px solid rgba(34,197,94,0.2)`,borderRadius:12,padding:16}}>
        <div style={{fontSize:11,color:C.muted,marginBottom:8}}>📅 {result.date}</div>
        {result.hours>0&&<Row label="Годин відпрацьовано" value={`${fmtH(result.hours)} год`} color={C.accent}/>}
        {result.packs>0&&<Row label="Збито пачок" value={`${result.packs} шт`} color={C.gold}/>}
        <Row label="Зароблено за зміну" value={`${fmt(result.earned)} грн`} color={C.green} bold last/>
      </div>
      <div style={{fontSize:12,color:C.dim,textAlign:'center'}}>Дані збережено в систему ✓</div>
    </div>
  </Sheet>

  return <Sheet onClose={onClose} title="⏱ Внести зміну">
    <form onSubmit={submit} style={{display:'flex',flexDirection:'column',gap:14}}>
      {isOwner&&<div><Lbl>РОБІТНИК</Lbl>
        <select value={selId} onChange={e=>setSelId(e.target.value)} style={{...inp,cursor:'pointer'}}>
          {allWorkers.filter(w=>w.type==='shift').map(w=><option key={w.tgId} value={w.tgId}>{w.name}</option>)}
        </select></div>}
      <div><Lbl>ТИП ЗМІНИ</Lbl>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
          {[['hours','⏱ Години'],['packs','📦 Пачки'],['mixed','⏱📦 Змішана']].map(([k,l])=>
            <button key={k} type="button" onClick={()=>setType(k)} style={{padding:'10px 4px',borderRadius:8,border:`1px solid ${type===k?C.accent:C.border}`,background:type===k?'rgba(56,189,248,0.1)':'transparent',color:type===k?C.accent:C.dim,cursor:'pointer',fontSize:11,fontFamily:'inherit',fontWeight:type===k?700:400}}>{l}</button>
          )}
        </div></div>
      <div><Lbl>ДАТА</Lbl><input type="date" value={date} max={todayStr()} onChange={e=>setDate(e.target.value)} style={inp}/></div>
      {type!=='packs'&&<div><Lbl>ГОДИНИ</Lbl>
        <input type="number" inputMode="decimal" step="0.5" min="0" max="24" value={hours} onChange={e=>setHours(e.target.value)} placeholder="напр. 8 або 10.5" style={inp}/>
        {hours&&(sel?.rateHour||0)>0&&<div style={{fontSize:11,color:C.accent,marginTop:4}}>= {fmt(parseFloat(hours)*(sel?.rateHour||0))} грн</div>}
      </div>}
      {type!=='hours'&&<div><Lbl>ПАЧКИ</Lbl>
        <input type="number" inputMode="numeric" min="0" value={packs} onChange={e=>setPacks(e.target.value)} placeholder="напр. 12" style={inp}/>
        {packs&&(sel?.ratePack||0)>0&&<div style={{fontSize:11,color:C.gold,marginTop:4}}>= {fmt(parseFloat(packs)*(sel?.ratePack||0))} грн</div>}
      </div>}
      {earn>0&&<div style={{background:'rgba(34,197,94,0.08)',border:`1px solid rgba(34,197,94,0.2)`,borderRadius:10,padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{fontSize:12,color:C.dim}}>Заробіток за зміну</span>
        <span style={{fontSize:18,fontWeight:700,color:C.green}}>{fmt(earn)} грн</span>
      </div>}
      {error&&<div style={{color:C.red,fontSize:12,padding:'8px 12px',background:`${C.red}11`,borderRadius:8}}>⚠ {error}</div>}
      <button type="submit" disabled={loading} style={{background:C.accent,color:'#000',border:'none',borderRadius:10,padding:14,fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'inherit',opacity:loading?.7:1}}>
        {loading?'Збереження...':'Зберегти зміну'}
      </button>
    </form>
  </Sheet>
}

// ================================================================
// ФОРМА ПРЕМІЇ
// ================================================================
function BonusForm({worker,allWorkers,onClose,onSaved,tgId,tgName}) {
  const [selId,   setSelId]   = useState(worker?.tgId)
  const [date,    setDate]    = useState(todayStr())
  const [amount,  setAmount]  = useState('')
  const [reason,  setReason]  = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error,   setError]   = useState(null)
  const sel = allWorkers.find(w=>w.tgId===Number(selId))||worker

  async function submit(e) {
    e.preventDefault()
    if (!amount) return
    try {
      setLoading(true); setError(null)
      await saveBonusRecord({tgId:sel.tgId,name:sel.name,date,amount:parseFloat(amount),reason})
      await writeLog({tgId,name:tgName,action:`Премія для ${sel.name}`,details:`${fmt(amount)} грн — ${reason||'без причини'}`})
      setSuccess(true)
      setTimeout(()=>{onSaved();onClose()},1400)
    } catch(e){setError(e.message)} finally{setLoading(false)}
  }

  return <Sheet onClose={onClose} title="🏆 Нарахувати премію">
    <form onSubmit={submit} style={{display:'flex',flexDirection:'column',gap:14}}>
      <div><Lbl>РОБІТНИК</Lbl>
        <select value={selId} onChange={e=>setSelId(e.target.value)} style={{...inp,cursor:'pointer'}}>
          {allWorkers.map(w=><option key={w.tgId} value={w.tgId}>{w.name}</option>)}
        </select></div>
      <div><Lbl>ДАТА</Lbl><input type="date" value={date} max={todayStr()} onChange={e=>setDate(e.target.value)} style={inp}/></div>
      <div><Lbl>СУМА (грн)</Lbl>
        <div style={{display:'flex',gap:8,marginBottom:10}}>
          {[200,300,500,1000].map(a=><button key={a} type="button" onClick={()=>setAmount(String(a))} style={{flex:1,padding:'8px 0',borderRadius:8,border:`1px solid ${amount===String(a)?C.gold:C.border}`,background:amount===String(a)?'rgba(245,158,11,0.15)':'transparent',color:amount===String(a)?C.gold:C.dim,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>{a}</button>)}
        </div>
        <input type="number" inputMode="numeric" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="або введи вручну" style={inp}/>
      </div>
      <div><Lbl>ПРИЧИНА</Lbl><input type="text" value={reason} onChange={e=>setReason(e.target.value)} placeholder="За перевиконання плану" style={inp}/></div>
      {amount>0&&<div style={{background:'rgba(245,158,11,0.08)',border:`1px solid rgba(245,158,11,0.2)`,borderRadius:10,padding:'12px 16px',display:'flex',justifyContent:'space-between'}}>
        <span style={{fontSize:12,color:C.dim}}>{sel?.name}</span>
        <span style={{fontSize:18,fontWeight:700,color:C.gold}}>+{fmt(parseFloat(amount)||0)} грн</span>
      </div>}
      {error&&<div style={{color:C.red,fontSize:12,padding:'8px 12px',background:`${C.red}11`,borderRadius:8}}>⚠ {error}</div>}
      {success&&<div style={{color:C.green,fontSize:13,textAlign:'center'}}>✅ Премію нараховано!</div>}
      <button type="submit" disabled={loading||success} style={{background:C.gold,color:'#000',border:'none',borderRadius:10,padding:14,fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'inherit',opacity:loading?.7:1}}>
        {loading?'Збереження...':'Нарахувати'}
      </button>
    </form>
  </Sheet>
}

// ================================================================
// ФОРМА СТАВОК
// ================================================================
function RatesForm({worker,onClose,onSaved,tgId,tgName}) {
  const isFixed = worker.type==='fixed'
  const [val,     setVal]     = useState(isFixed?(worker.gross||''):(worker.rateHour||''))
  const [valPack, setValPack] = useState(worker.ratePack||'')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error,   setError]   = useState(null)

  async function submit(e) {
    e.preventDefault()
    try {
      setLoading(true); setError(null)
      if (isFixed) {
        await updateFixedSalary(worker.staffPageId, val)
      } else {
        await updateStaffRates(worker.staffPageId, {
          rateHour: val!==''?val:undefined,
          ratePack: valPack!==''?valPack:undefined,
        })
      }
      await writeLog({tgId,name:tgName,action:`Змінено ставки ${worker.name}`,details:isFixed?`Фікс: ${val} грн`:`Год: ${val}, Пачка: ${valPack}`})
      setSuccess(true)
      setTimeout(()=>{onSaved();onClose()},1200)
    } catch(e){setError(e.message)} finally{setLoading(false)}
  }

  return <Sheet onClose={onClose} title={`✏️ Ставки — ${worker.name}`}>
    <form onSubmit={submit} style={{display:'flex',flexDirection:'column',gap:14}}>
      {isFixed
        ? <div><Lbl>ФІКСОВАНА ЗАРПЛАТА (грн/міс)</Lbl><input type="number" value={val} onChange={e=>setVal(e.target.value)} placeholder={`Зараз: ${worker.gross||'—'}`} style={inp}/></div>
        : <>
          <div><Lbl>СТАВКА ЗА ГОДИНУ (грн)</Lbl><input type="number" value={val} onChange={e=>setVal(e.target.value)} placeholder={`Зараз: ${worker.rateHour||'—'}`} style={inp}/></div>
          <div><Lbl>СТАВКА ЗА ПАЧКУ (грн)</Lbl><input type="number" value={valPack} onChange={e=>setValPack(e.target.value)} placeholder={`Зараз: ${worker.ratePack||'—'}`} style={inp}/></div>
        </>}
      {error&&<div style={{color:C.red,fontSize:12,padding:'8px 12px',background:`${C.red}11`,borderRadius:8}}>⚠ {error}</div>}
      <button type="submit" disabled={loading||success} style={{background:success?C.green:C.accent,color:'#000',border:'none',borderRadius:10,padding:14,fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
        {loading?'Збереження...':success?'✓ Збережено!':'Зберегти'}
      </button>
    </form>
  </Sheet>
}

// ================================================================
// ФОРМА НАЛАШТУВАНЬ БОНУСІВ
// ================================================================
function SettingsForm({cfg,onClose,onSaved,tgId,tgName}) {
  const [form,    setForm]    = useState({...cfg})
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error,   setError]   = useState(null)
  const set = (k,v) => setForm(f=>({...f,[k]:Number(v)}))

  async function submit(e) {
    e.preventDefault()
    try {
      setLoading(true); setError(null)
      await saveSettings(cfg.pageId, form)
      await writeLog({tgId,name:tgName,action:'Змінено налаштування бонусів',details:JSON.stringify(form)})
      setSuccess(true)
      setTimeout(()=>{onSaved();onClose()},1200)
    } catch(e){setError(e.message)} finally{setLoading(false)}
  }

  const fields = [
    {k:'minDaysForBonus', l:'Мін. днів для активації бонусів'},
    {k:'longDayHours',    l:'Годин для "довгого дня"'},
    {k:'longDaysNeeded',  l:'Потрібно довгих днів для бонусу'},
    {k:'bonusPerLongDay', l:'Бонус за кожен довгий день (грн)'},
    {k:'bonusSaturday',   l:'Бонус за суботу (грн)'},
    {k:'premiumDays',     l:'Днів для премії'},
    {k:'premiumAmount',   l:'Сума премії (грн)'},
  ]

  return <Sheet onClose={onClose} title="⚙️ Налаштування бонусів">
    <form onSubmit={submit} style={{display:'flex',flexDirection:'column',gap:12}}>
      {fields.map(f=><div key={f.k}><Lbl>{f.l}</Lbl><input type="number" value={form[f.k]||''} onChange={e=>set(f.k,e.target.value)} style={inp}/></div>)}
      {error&&<div style={{color:C.red,fontSize:12,padding:'8px 12px',background:`${C.red}11`,borderRadius:8}}>⚠ {error}</div>}
      <button type="submit" disabled={loading||success} style={{background:success?C.green:C.purple,color:'#fff',border:'none',borderRadius:10,padding:14,fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'inherit',marginTop:4}}>
        {loading?'Збереження...':success?'✓ Збережено!':'Зберегти налаштування'}
      </button>
    </form>
  </Sheet>
}

// ================================================================
// РОЗГОРТАННЯ ДНІВ
// ================================================================
function DaysExpand({days,rateHour,ratePack}) {
  const [open, setOpen] = useState(false)
  if (!days?.length) return null
  return <div>
    <button onClick={()=>setOpen(o=>!o)} style={{width:'100%',background:'rgba(56,189,248,0.05)',border:`1px solid ${C.border}`,borderRadius:8,padding:'10px 14px',color:C.accent,cursor:'pointer',fontSize:12,fontFamily:'inherit',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <span>📅 Подивитись по днях ({days.length} днів)</span>
      <span>{open?'▲':'▼'}</span>
    </button>
    {open&&<div style={{marginTop:8,display:'flex',flexDirection:'column',gap:6}}>
      {days.map(d=>{
        const earn = d.hours*(rateHour||0)+d.packs*(ratePack||0)
        const isLong = d.hours>=10
        return <div key={d.date} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:'10px 14px',fontSize:12}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
            <span style={{color:isLong?C.gold:C.dim}}>{d.date} {isLong?'⭐':''}</span>
            <span style={{color:C.green,fontWeight:600}}>{fmt(earn)} грн</span>
          </div>
          <div style={{display:'flex',gap:12,fontSize:11,color:C.muted}}>
            {d.hours>0&&<span>⏱ {fmtH(d.hours)} год</span>}
            {d.packs>0&&<span>📦 {d.packs} пачок</span>}
          </div>
        </div>
      })}
    </div>}
  </div>
}

// ================================================================
// ДЕТАЛІ РОБІТНИКА (власник дивиться)
// ================================================================
function WorkerDetail({w,allWorkers,onBack,onRefresh,tgId,tgName,cfg}) {
  const [modal, setModal] = useState(null)

  const hoursChart = (w.days||[]).map(d=>({
    day:d.date.slice(8),
    normal:d.hours<(cfg?.longDayHours||10)?d.hours:0,
    long:d.hours>=(cfg?.longDayHours||10)?d.hours:0,
  }))

  return <div style={{minHeight:'100vh',background:C.bg,paddingBottom:40}}>
    <Header title={w.name} sub={w.type==='fixed'?(w.role||'Фіксована'):'Погодинний + пачки'} onBack={onBack}
      right={<button onClick={()=>setModal('rates')} style={{background:'transparent',border:`1px solid ${C.border}`,color:C.accent,borderRadius:6,padding:'4px 10px',fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>✏️ Ставки</button>}/>

    <div style={{padding:'16px 16px 0',display:'flex',flexDirection:'column',gap:14}}>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        <Card top={C.accent}><Lbl>До виплати</Lbl><div style={{fontSize:22,fontWeight:700,color:C.accent}}>{fmt(w.final)} ₴</div></Card>
        <Card top={C.green}><Lbl>Нараховано</Lbl><div style={{fontSize:18,fontWeight:700,color:C.green}}>{fmt(w.gross)} ₴</div></Card>
      </div>

      {w.daysSinceEntry>=2&&w.type==='shift'&&<div style={{background:`${C.red}11`,border:`1px solid ${C.red}33`,borderRadius:10,padding:'10px 14px',fontSize:12,color:C.red}}>
        ⚠ Не вносив дані {w.daysSinceEntry} дні(в)! Останній запис: {w.lastEntry||'—'}
      </div>}

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        <button onClick={()=>setModal('shift')} style={{background:'rgba(56,189,248,0.1)',border:`1px solid ${C.accent}`,color:C.accent,borderRadius:10,padding:'12px',fontSize:13,cursor:'pointer',fontFamily:'inherit',fontWeight:700}}>⏱ Внести зміну</button>
        <button onClick={()=>setModal('bonus')} style={{background:'rgba(245,158,11,0.1)',border:`1px solid ${C.gold}`,color:C.gold,borderRadius:10,padding:'12px',fontSize:13,cursor:'pointer',fontFamily:'inherit',fontWeight:700}}>🏆 Премія</button>
      </div>

      {w.type==='shift'&&<>
        {hoursChart.length>0&&<Card>
          <SecTitle>ГОДИНИ ПО ДНЯХ  ⭐=10+ год</SecTitle>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={hoursChart} barSize={12} margin={{left:-24}}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border2}/>
              <XAxis dataKey="day" stroke={C.muted} fontSize={9}/>
              <YAxis stroke={C.muted} fontSize={9} domain={[0,14]}/>
              <Tooltip formatter={v=>`${v} год`} contentStyle={{background:'#1a2535',border:`1px solid ${C.border}`,borderRadius:8,fontSize:11}}/>
              <Bar dataKey="normal" name="Год." stackId="a" fill={C.accent}/>
              <Bar dataKey="long" name="10+" stackId="a" fill={C.gold} radius={[3,3,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </Card>}

        <Card>
          <SecTitle>ПРОГРЕС</SecTitle>
          {[
            {l:'Робочі дні', val:w.workDays, max:cfg?.premiumDays||21, c:C.accent, s:`${w.workDays}/${cfg?.premiumDays||21}`},
            {l:'Довгих днів', val:w.longDays, max:cfg?.longDaysNeeded||10, c:C.gold, s:`${w.longDays}/${cfg?.longDaysNeeded||10}`},
            {l:'Суботи', val:w.saturdays, max:4, c:C.purple, s:`${w.saturdays} шт`},
          ].map(p=><div key={p.l} style={{marginBottom:11}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:4,fontSize:12}}>
              <span style={{color:C.dim}}>{p.l}</span><span style={{color:p.c,fontWeight:600}}>{p.s}</span>
            </div>
            <Prog val={p.val} max={p.max} color={p.c}/>
          </div>)}
          <div style={{marginTop:6,fontSize:12,display:'flex',flexDirection:'column',gap:5}}>
            {!w.bonusActive?<span style={{color:C.gold}}>⏳ До активації бонусів: ще {w.daysToBonus} дні</span>:<span style={{color:C.green}}>✅ Бонуси активні!</span>}
            {w.bonusActive&&w.longToBonus>0?<span style={{color:C.gold}}>⏳ До бонусу 10+ год: ще {w.longToBonus} днів</span>:w.bonusActive?<span style={{color:C.green}}>✅ Бонус довгих днів: +{fmt(w.bonusLong)} грн</span>:null}
            {w.daysToPremium>0?<span style={{color:C.purple}}>🏆 До премії: ще {w.daysToPremium} дні</span>:<span style={{color:C.green}}>🏆 Премія: +{fmt(w.premium)} грн</span>}
          </div>
        </Card>
      </>}

      <Card>
        <SecTitle>РОЗБИВКА</SecTitle>
        {w.type==='shift'&&<>
          <Row label={`Погодинно (${fmtH(w.totalHours)} × ${fmt(w.rateHour)} грн)`} value={`${fmt(w.earnHours)} грн`}/>
          <Row label={`Пачки (${w.totalPacks} × ${fmt(w.ratePack)} грн)`} value={`${fmt(w.earnPacks)} грн`}/>
          {w.bonusLong>0&&<Row label={`Бонус 10+ год (${w.longDays}×)`} value={`+${fmt(w.bonusLong)} грн`} color={C.gold}/>}
          {w.bonusSat>0&&<Row label={`Бонус суботи (${w.saturdays}×)`} value={`+${fmt(w.bonusSat)} грн`} color={C.gold}/>}
          {w.premium>0&&<Row label="Премія" value={`+${fmt(w.premium)} грн`} color={C.green}/>}
          {w.manualBonus>0&&<Row label="Ручні премії" value={`+${fmt(w.manualBonus)} грн`} color={C.green}/>}
        </>}
        {w.type==='fixed'&&<Row label="Фіксована ставка" value={`${fmt(w.gross)} грн`}/>}
        <Row label="Нараховано" value={`${fmt(w.gross)} грн`} bold/>
        {w.totalAdv>0&&<Row label="Аванси" value={`-${fmt(w.totalAdv)} грн`} color={C.red}/>}
        {w.debtPaid>0&&<Row label="Виплата боргу" value={`-${fmt(w.debtPaid)} грн`} color={C.red}/>}
        <div style={{display:'flex',justifyContent:'space-between',paddingTop:12}}>
          <span style={{color:C.muted,fontSize:12,letterSpacing:1}}>ДО ВИПЛАТИ</span>
          <span style={{fontSize:22,fontWeight:700,color:C.accent}}>{fmt(w.final)} ₴</span>
        </div>
        {w.debtRemaining>0&&<div style={{marginTop:10,padding:'8px 12px',background:`${C.red}11`,border:`1px solid ${C.red}33`,borderRadius:8,fontSize:12,color:C.red}}>⚠ Залишок боргу: {fmt(w.debtRemaining)} грн</div>}
      </Card>

      {w.type==='shift'&&w.days?.length>0&&<Card>
        <SecTitle>ДЕТАЛІ ПО ДНЯХ</SecTitle>
        <DaysExpand days={w.days} rateHour={w.rateHour} ratePack={w.ratePack}/>
      </Card>}

      {w.advances?.length>0&&<Card>
        <SecTitle>АВАНСИ</SecTitle>
        {w.advances.map((a,i)=><Row key={i} label={a.date} value={`${fmt(a.amount)} грн`} color={C.gold} last={i===w.advances.length-1}/>)}
      </Card>}

      {w.bonuses?.length>0&&<Card>
        <SecTitle>РУЧНІ ПРЕМІЇ</SecTitle>
        {w.bonuses.map((b,i)=><Row key={i} label={b.date} value={`+${fmt(b.amount)} грн`} color={C.green} sub={b.reason} last={i===w.bonuses.length-1}/>)}
      </Card>}
    </div>

    {modal==='shift'&&<ShiftForm worker={w} allWorkers={allWorkers} isOwner onClose={()=>setModal(null)} onSaved={onRefresh} tgId={tgId} tgName={tgName}/>}
    {modal==='bonus'&&<BonusForm worker={w} allWorkers={allWorkers} onClose={()=>setModal(null)} onSaved={onRefresh} tgId={tgId} tgName={tgName}/>}
    {modal==='rates'&&<RatesForm worker={w} onClose={()=>setModal(null)} onSaved={onRefresh} tgId={tgId} tgName={tgName}/>}
  </div>
}

// ================================================================
// ФІНАНСОВА СТАТИСТИКА
// ================================================================
function FinanceView({workers,onBack}) {
  const totalGross = workers.reduce((s,w)=>s+(w.gross||0),0)
  const totalFinal = workers.reduce((s,w)=>s+(w.final||0),0)
  const totalAdv   = workers.reduce((s,w)=>s+(w.totalAdv||0),0)
  const totalDebt  = workers.reduce((s,w)=>s+(w.debtPaid||0),0)

  return <div style={{minHeight:'100vh',background:C.bg,paddingBottom:40}}>
    <Header title="💰 Фінанси" onBack={onBack}/>
    <div style={{padding:'16px 16px 0',display:'flex',flexDirection:'column',gap:14}}>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        {[
          {l:'Нараховано всього', v:fmt(totalGross)+' грн', c:C.accent},
          {l:'До виплати', v:fmt(totalFinal)+' грн', c:C.green},
          {l:'Видано авансів', v:fmt(totalAdv)+' грн', c:C.gold},
          {l:'Погашено боргів', v:fmt(totalDebt)+' грн', c:C.purple},
        ].map((k,i)=><Card key={i} top={k.c}><Lbl>{k.l}</Lbl><div style={{fontSize:16,fontWeight:700,color:k.c}}>{k.v}</div></Card>)}
      </div>

      <Card>
        <SecTitle>ПО ПРАЦІВНИКАХ</SecTitle>
        {workers.map((w,i)=><div key={w.tgId||i} style={{marginBottom:14}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:6,fontSize:13}}>
            <span style={{color:C.w[i%C.w.length],fontWeight:600}}>{w.name}</span>
            <span style={{color:C.accent,fontWeight:700}}>{fmt(w.final)} ₴</span>
          </div>
          <Prog val={w.gross} max={totalGross} color={C.w[i%C.w.length]}/>
          <div style={{display:'flex',gap:12,marginTop:4,fontSize:10,color:C.muted}}>
            <span>Нарах: {fmt(w.gross)} грн</span>
            {w.totalAdv>0&&<span>Аванс: -{fmt(w.totalAdv)} грн</span>}
            {w.debtPaid>0&&<span>Борг: -{fmt(w.debtPaid)} грн</span>}
          </div>
        </div>)}
      </Card>
    </div>
  </div>
}

// ================================================================
// OWNER DASHBOARD
// ================================================================
function OwnerDashboard({workers,onRefresh,tgId,tgName,cfg}) {
  const [view,   setView]   = useState('main')
  const [detail, setDetail] = useState(null)
  const [modal,  setModal]  = useState(null)
  const [selYear, setSelYear] = useState(new Date().getFullYear())
  const [selMonth,setSelMonth]= useState(new Date().getMonth())

  const totalFOP   = workers.reduce((s,w)=>s+(w.final||0),0)
  const totalGross = workers.reduce((s,w)=>s+(w.gross||0),0)
  const totalAdv   = workers.reduce((s,w)=>s+(w.totalAdv||0),0)
  const alertWorkers = workers.filter(w=>w.type==='shift'&&w.daysSinceEntry>=2)

  const chart = workers.map((w,i)=>({
    name:w.name.split(' ').slice(-1)[0],
    base:(w.earnHours||0)+(w.earnPacks||0)||(w.type==='fixed'?w.gross:0),
    bonus:(w.bonusLong||0)+(w.bonusSat||0)+(w.premium||0)+(w.manualBonus||0),
  }))

  if (view==='finance') return <FinanceView workers={workers} onBack={()=>setView('main')}/>
  if (detail) return <WorkerDetail w={detail} allWorkers={workers} onBack={()=>setDetail(null)} onRefresh={()=>{setDetail(null);onRefresh(selYear,selMonth)}} tgId={tgId} tgName={tgName} cfg={cfg}/>

  return <div style={{minHeight:'100vh',background:C.bg,paddingBottom:40}}>
    <Header title="🪵 ПИЛОРАМА" sub={`${MONTHS_UA[selMonth]} ${selYear}`} onRefresh={()=>onRefresh(selYear,selMonth)}
      right={<button onClick={()=>setModal('settings')} style={{background:'transparent',border:`1px solid ${C.border}`,color:C.purple,borderRadius:8,padding:'6px 10px',fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>⚙️</button>}/>

    <div style={{padding:'16px 16px 0',display:'flex',flexDirection:'column',gap:14}}>
      <MonthPicker year={selYear} month={selMonth} onChange={(y,m)=>{setSelYear(y);setSelMonth(m);onRefresh(y,m)}}/>

      {alertWorkers.length>0&&<div style={{background:`${C.red}11`,border:`1px solid ${C.red}33`,borderRadius:10,padding:'10px 14px',fontSize:12,color:C.red}}>
        ⚠ Не вносили дані 2+ дні: {alertWorkers.map(w=>w.name.split(' ')[0]).join(', ')}
      </div>}

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        <Card top={C.accent}><Lbl>До виплати</Lbl><div style={{fontSize:20,fontWeight:700,color:C.accent}}>{fmt(totalFOP)} ₴</div></Card>
        <Card top={C.green}><Lbl>Нараховано</Lbl><div style={{fontSize:18,fontWeight:700,color:C.green}}>{fmt(totalGross)} ₴</div></Card>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
        <button onClick={()=>setModal('shift')} style={{background:'rgba(56,189,248,0.1)',border:`1px solid ${C.accent}`,color:C.accent,borderRadius:10,padding:'12px 8px',fontSize:12,cursor:'pointer',fontFamily:'inherit',fontWeight:700}}>⏱ Зміна</button>
        <button onClick={()=>setModal('bonus')} style={{background:'rgba(245,158,11,0.1)',border:`1px solid ${C.gold}`,color:C.gold,borderRadius:10,padding:'12px 8px',fontSize:12,cursor:'pointer',fontFamily:'inherit',fontWeight:700}}>🏆 Премія</button>
        <button onClick={()=>setView('finance')} style={{background:'rgba(34,197,94,0.1)',border:`1px solid ${C.green}`,color:C.green,borderRadius:10,padding:'12px 8px',fontSize:12,cursor:'pointer',fontFamily:'inherit',fontWeight:700}}>💰 Фінанси</button>
      </div>

      <Card>
        <SecTitle>НАРАХУВАННЯ</SecTitle>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={chart} barSize={14} margin={{left:-24}}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border2}/>
            <XAxis dataKey="name" stroke={C.muted} fontSize={10}/>
            <YAxis stroke={C.muted} fontSize={9} tickFormatter={v=>`${v/1000}к`}/>
            <Tooltip content={<TTip/>}/>
            <Bar dataKey="base" name="Ставка" stackId="a" fill={C.accent}/>
            <Bar dataKey="bonus" name="Бонуси" stackId="a" fill={C.gold} radius={[3,3,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card>
        <SecTitle>ПЕРСОНАЛ</SecTitle>
        {workers.map((w,i)=><button key={w.tgId||i} onClick={()=>setDetail(w)} style={{width:'100%',background:'rgba(255,255,255,0.02)',border:`1px solid ${w.daysSinceEntry>=2?C.red:C.border}`,borderRadius:10,padding:'12px 14px',marginBottom:8,cursor:'pointer',textAlign:'left',fontFamily:'inherit'}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:w.type==='shift'?6:0}}>
            <div>
              <span style={{color:C.w[i%C.w.length],fontWeight:600,fontSize:13}}>{w.name}</span>
              {w.type==='fixed'&&<span style={{marginLeft:8,fontSize:10,color:C.purple,background:`${C.purple}22`,padding:'1px 6px',borderRadius:4}}>{w.role||'фікс.'}</span>}
              {w.daysSinceEntry>=2&&w.type==='shift'&&<span style={{marginLeft:6,fontSize:10,color:C.red}}>⚠</span>}
            </div>
            <span style={{color:C.accent,fontWeight:700,fontSize:13}}>{fmt(w.final)} ₴</span>
          </div>
          {w.type==='shift'&&<>
            <Prog val={w.workDays} max={cfg?.premiumDays||21} color={C.w[i%C.w.length]}/>
            <div style={{display:'flex',justifyContent:'space-between',marginTop:4,fontSize:10,color:C.muted}}>
              <span>{w.workDays} днів · {fmtH(w.totalHours)} год</span>
              <span>{w.longDays} довгих · {w.totalPacks} пачок</span>
            </div>
          </>}
          {w.debtRemaining>0&&<div style={{marginTop:5,fontSize:10,color:C.red}}>⚠ Борг: {fmt(w.debtRemaining)} грн</div>}
        </button>)}
      </Card>
    </div>

    {modal==='shift'    &&<ShiftForm   worker={workers[0]||{}} allWorkers={workers} isOwner onClose={()=>setModal(null)} onSaved={()=>onRefresh(selYear,selMonth)} tgId={tgId} tgName={tgName}/>}
    {modal==='bonus'    &&<BonusForm   worker={workers[0]||{}} allWorkers={workers} onClose={()=>setModal(null)} onSaved={()=>onRefresh(selYear,selMonth)} tgId={tgId} tgName={tgName}/>}
    {modal==='settings' &&<SettingsForm cfg={cfg} onClose={()=>setModal(null)} onSaved={()=>onRefresh(selYear,selMonth)} tgId={tgId} tgName={tgName}/>}
  </div>
}

// ================================================================
// WORKER VIEW
// ================================================================
function WorkerView({tgId,data,onRefresh,access}) {
  const w = calcSalary(tgId, data)
  const cfg = data.cfg
  const [modal, setModal] = useState(null)
  const [year,  setYear]  = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth())

  const hoursChart = (w.days||[]).map(d=>({
    day:d.date.slice(8),
    normal:d.hours<(cfg?.longDayHours||10)?d.hours:0,
    long:d.hours>=(cfg?.longDayHours||10)?d.hours:0,
  }))

  return <div style={{minHeight:'100vh',background:C.bg,paddingBottom:40}}>
    <Header title={`🪵 ${w.name||'Мій кабінет'}`} onRefresh={()=>onRefresh(year,month)}/>

    <div style={{padding:'16px 16px 0',display:'flex',flexDirection:'column',gap:14}}>
      <MonthPicker year={year} month={month} onChange={(y,m)=>{setYear(y);setMonth(m);onRefresh(y,m)}}/>

      {/* Головні цифри */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        <Card top={C.accent}><Lbl>До виплати</Lbl><div style={{fontSize:22,fontWeight:700,color:C.accent}}>{fmt(w.final)} ₴</div></Card>
        <Card top={C.green}><Lbl>Нараховано</Lbl><div style={{fontSize:18,fontWeight:700,color:C.green}}>{fmt(w.gross)} ₴</div></Card>
      </div>

      {/* Ставки */}
      <Card>
        <SecTitle>МОЇ СТАВКИ</SecTitle>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          <div style={{background:'rgba(56,189,248,0.06)',borderRadius:8,padding:'10px 12px'}}>
            <div style={{fontSize:10,color:C.muted,marginBottom:4}}>ЗА ГОДИНУ</div>
            <div style={{fontSize:20,fontWeight:700,color:C.accent}}>{w.rateHour||'—'}</div>
            <div style={{fontSize:10,color:C.muted}}>грн</div>
          </div>
          <div style={{background:'rgba(245,158,11,0.06)',borderRadius:8,padding:'10px 12px'}}>
            <div style={{fontSize:10,color:C.muted,marginBottom:4}}>ЗА ПАЧКУ</div>
            <div style={{fontSize:20,fontWeight:700,color:C.gold}}>{w.ratePack||'—'}</div>
            <div style={{fontSize:10,color:C.muted}}>грн</div>
          </div>
        </div>
      </Card>

      {/* Кнопка внесення */}
      <button onClick={()=>setModal('shift')} style={{background:'rgba(56,189,248,0.1)',border:`1px solid ${C.accent}`,color:C.accent,borderRadius:10,padding:'14px',fontSize:14,cursor:'pointer',fontFamily:'inherit',fontWeight:700}}>
        ⏱ Внести зміну
      </button>

      {/* Графік */}
      {hoursChart.length>0&&<Card>
        <SecTitle>ГОДИНИ ПО ДНЯХ  ⭐=10+</SecTitle>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={hoursChart} barSize={12} margin={{left:-24}}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border2}/>
            <XAxis dataKey="day" stroke={C.muted} fontSize={9}/>
            <YAxis stroke={C.muted} fontSize={9} domain={[0,14]}/>
            <Tooltip formatter={v=>`${v} год`} contentStyle={{background:'#1a2535',border:`1px solid ${C.border}`,borderRadius:8,fontSize:11}}/>
            <Bar dataKey="normal" name="Год." stackId="a" fill={C.accent}/>
            <Bar dataKey="long" name="10+" stackId="a" fill={C.gold} radius={[3,3,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </Card>}

      {/* Прогрес + підказки */}
      <Card>
        <SecTitle>ПРОГРЕС І БОНУСИ</SecTitle>
        {[
          {l:'Робочі дні', val:w.workDays, max:cfg?.premiumDays||21, c:C.accent, s:`${w.workDays}/${cfg?.premiumDays||21}`},
          {l:'Довгих днів (10+ год)', val:w.longDays, max:cfg?.longDaysNeeded||10, c:C.gold, s:`${w.longDays}/${cfg?.longDaysNeeded||10}`},
          {l:'Суботи', val:w.saturdays, max:4, c:C.purple, s:`${w.saturdays} шт`},
        ].map(p=><div key={p.l} style={{marginBottom:11}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:4,fontSize:12}}>
            <span style={{color:C.dim}}>{p.l}</span><span style={{color:p.c,fontWeight:600}}>{p.s}</span>
          </div>
          <Prog val={p.val} max={p.max} color={p.c}/>
        </div>)}

        <div style={{marginTop:10,display:'flex',flexDirection:'column',gap:8,fontSize:12}}>
          {!w.bonusActive
            ? <div style={{color:C.gold,background:`${C.gold}11`,borderRadius:8,padding:'8px 12px'}}>⏳ До активації бонусів: ще <b>{w.daysToBonus} дні</b></div>
            : <div style={{color:C.green,background:`${C.green}11`,borderRadius:8,padding:'8px 12px'}}>✅ Бонуси активні!</div>}

          {w.bonusActive&&w.longToBonus>0
            ? <div style={{color:C.gold,background:`${C.gold}11`,borderRadius:8,padding:'8px 12px'}}>⭐ До бонусу 10+ год: ще <b>{w.longToBonus} днів</b> по 10+ год<br/><span style={{fontSize:11,color:C.muted}}>Вже зароблено: {fmt(w.bonusLong)} грн</span></div>
            : w.bonusActive&&<div style={{color:C.green,background:`${C.green}11`,borderRadius:8,padding:'8px 12px'}}>⭐ Бонус за довгі дні: <b>+{fmt(w.bonusLong)} грн</b> ({w.longDays} днів × {fmt(cfg?.bonusPerLongDay||100)} грн)</div>}

          {w.bonusActive&&w.saturdays>0&&<div style={{color:C.purple,background:`${C.purple}11`,borderRadius:8,padding:'8px 12px'}}>
            📅 Бонус за суботи: <b>+{fmt(w.bonusSat)} грн</b> ({w.saturdays} субот × {fmt(cfg?.bonusSaturday||300)} грн)
          </div>}

          {w.daysToPremium>0
            ? <div style={{color:C.purple,background:`${C.purple}11`,borderRadius:8,padding:'8px 12px'}}>🏆 До премії {fmt(cfg?.premiumAmount||4000)} грн: ще <b>{w.daysToPremium} дні</b></div>
            : <div style={{color:C.green,background:`${C.green}11`,borderRadius:8,padding:'8px 12px'}}>🏆 Премія нарахована: <b>+{fmt(w.premium)} грн</b></div>}

          {w.bonusActive&&(w.bonusSat>0||w.bonusLong>0)&&w.daysToBonus>0===false&&
            <div style={{color:C.dim,fontSize:11,textAlign:'center'}}>Загалом бонусів: {fmt((w.bonusLong||0)+(w.bonusSat||0))} грн</div>}
        </div>
      </Card>

      {/* Розбивка */}
      <Card>
        <SecTitle>РОЗБИВКА ЗАРПЛАТИ</SecTitle>
        <Row label={`Погодинно (${fmtH(w.totalHours)} год × ${fmt(w.rateHour)} грн)`} value={`${fmt(w.earnHours)} грн`}/>
        <Row label={`Пачки (${w.totalPacks} шт × ${fmt(w.ratePack)} грн)`} value={`${fmt(w.earnPacks)} грн`}/>
        {w.bonusLong>0&&<Row label="Бонус 10+ год" value={`+${fmt(w.bonusLong)} грн`} color={C.gold}/>}
        {w.bonusSat>0&&<Row label="Бонус суботи" value={`+${fmt(w.bonusSat)} грн`} color={C.gold}/>}
        {w.premium>0&&<Row label="Премія" value={`+${fmt(w.premium)} грн`} color={C.green}/>}
        {w.manualBonus>0&&<Row label="Ручні премії" value={`+${fmt(w.manualBonus)} грн`} color={C.green}/>}
        <Row label="Нараховано" value={`${fmt(w.gross)} грн`} bold/>
        {w.totalAdv>0&&<Row label="Аванси" value={`-${fmt(w.totalAdv)} грн`} color={C.red}/>}
        {w.debtPaid>0&&<Row label="Виплата боргу" value={`-${fmt(w.debtPaid)} грн`} color={C.red}/>}
        <div style={{display:'flex',justifyContent:'space-between',paddingTop:12}}>
          <span style={{color:C.muted,fontSize:12}}>ДО ВИПЛАТИ</span>
          <span style={{fontSize:22,fontWeight:700,color:C.accent}}>{fmt(w.final)} ₴</span>
        </div>
        {w.debtRemaining>0&&<div style={{marginTop:10,padding:'8px 12px',background:`${C.red}11`,border:`1px solid ${C.red}33`,borderRadius:8,fontSize:12,color:C.red}}>⚠ Залишок боргу: {fmt(w.debtRemaining)} грн</div>}
      </Card>

      {/* Деталі по днях */}
      {w.days?.length>0&&<Card>
        <SecTitle>МОЇ ДНІ</SecTitle>
        <DaysExpand days={w.days} rateHour={w.rateHour} ratePack={w.ratePack}/>
      </Card>}
    </div>

    {modal==='shift'&&<ShiftForm worker={w} allWorkers={[w]} isOwner={false} onClose={()=>setModal(null)} onSaved={()=>onRefresh(year,month)} tgId={tgId} tgName={w.name}/>}
  </div>
}

// ================================================================
// MAIN APP
// ================================================================
export default function App() {
  const [state,   setState]   = useState('loading')
  const [error,   setError]   = useState(null)
  const [data,    setData]    = useState(null)
  const [workers, setWorkers] = useState([])
  const [isOwner, setIsOwner] = useState(false)
  const [tgId,    setTgId]    = useState(null)
  const [tgName,  setTgName]  = useState('')
  const [access,  setAccess]  = useState(null)

  const load = useCallback(async (year, month) => {
    try {
      setState('loading'); setError(null)
      const tg = window.Telegram?.WebApp
      tg?.ready(); tg?.expand()
      tg?.setHeaderColor?.('#0b1017')
      tg?.setBackgroundColor?.('#0b1017')

      const uid  = tg?.initDataUnsafe?.user?.id || null
      const uname = tg?.initDataUnsafe?.user?.first_name || 'Власник'
      setTgId(uid); setTgName(uname)

      const owner = OWNER_IDS.includes(uid)
      setIsOwner(owner)

      const y = year  ?? new Date().getFullYear()
      const m = month ?? new Date().getMonth()
      const allData = await fetchAllData(y, m)
      setData(allData)

      if (owner) {
        setWorkers(calcAllWorkers(allData))
        setState('owner')
      } else {
        const acc = await checkAccess(uid)
        setAccess(acc)
        setState(acc.allowed ? 'worker' : 'denied')
      }
    } catch(e) { setError(e.message); setState('error') }
  }, [])

  useEffect(()=>{ load() },[])

  if (state==='loading') return <Spinner/>

  if (state==='error') return (
    <div style={{minHeight:'100vh',background:C.bg,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:14,padding:24}}>
      <div style={{fontSize:36}}>⚠️</div>
      <div style={{color:C.red,fontSize:14,fontWeight:700}}>Помилка підключення</div>
      <div style={{color:C.dim,fontSize:12,textAlign:'center',maxWidth:300,lineHeight:1.6}}>{error}</div>
      <button onClick={()=>load()} style={{background:C.accent,color:'#000',border:'none',borderRadius:8,padding:'10px 24px',fontSize:13,cursor:'pointer',fontFamily:'inherit',fontWeight:700}}>Спробувати знову</button>
    </div>
  )

  if (state==='denied') return (
    <div style={{minHeight:'100vh',background:C.bg,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:14,padding:24}}>
      <div style={{fontSize:48}}>🔒</div>
      <div style={{color:C.red,fontSize:15,fontWeight:700}}>Доступ закрито</div>
      <div style={{color:C.dim,fontSize:13,textAlign:'center',maxWidth:280,lineHeight:1.7}}>Тебе ще не додано до системи.<br/>Зверніться до власника.</div>
      {tgId&&<div style={{background:'rgba(56,189,248,0.06)',border:`1px solid ${C.border}`,borderRadius:8,padding:'10px 16px',fontSize:11,color:C.muted,textAlign:'center'}}>
        Твій Telegram ID:<br/><span style={{color:C.accent,fontSize:15,fontWeight:700}}>{tgId}</span><br/>
        <span style={{fontSize:10}}>(надішли власнику)</span>
      </div>}
    </div>
  )

  if (state==='owner') return <OwnerDashboard workers={workers} onRefresh={load} tgId={tgId} tgName={tgName} cfg={data?.cfg||DEFAULT_CFG}/>
  if (state==='worker') return <WorkerView tgId={tgId} data={data} onRefresh={load} access={access}/>
  return null
}
