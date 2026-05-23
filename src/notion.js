// notion.js — всі запити через /api/notion проксі

const DB = {
  shifts:       import.meta.env.VITE_DB_SHIFTS,
  staff:        import.meta.env.VITE_DB_STAFF,
  advances:     import.meta.env.VITE_DB_ADVANCES,
  bonuses:      import.meta.env.VITE_DB_BONUSES,
  fixedStaff:   import.meta.env.VITE_DB_FIXED_STAFF,
  debts:        import.meta.env.VITE_DB_DEBTS,
  debtPayments: import.meta.env.VITE_DB_DEBT_PAYMENTS,
  settings:     import.meta.env.VITE_DB_SETTINGS,
  logs:         import.meta.env.VITE_DB_LOGS,
}

// ── Базовий запит ──────────────────────────────────────────
async function nr(path, method = 'POST', body = null) {
  const r = await fetch('/api/notion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, method, body }),
  })
  if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Помилка') }
  return r.json()
}

export const queryDB     = (id, filter, sorts) => nr(`/databases/${id}/query`, 'POST', { ...(filter?{filter}:{}), ...(sorts?{sorts}:{}), page_size: 100 })
export const createPage  = (id, props)         => nr('/pages', 'POST', { parent: { database_id: id }, properties: props })
export const updatePage  = (id, props)         => nr(`/pages/${id}`, 'PATCH', { properties: props })

// ── Хелпери ────────────────────────────────────────────────
const p = {
  text:   v => v?.rich_text?.[0]?.plain_text || v?.title?.[0]?.plain_text || '',
  num:    v => v?.number ?? 0,
  date:   v => v?.date?.start || '',
  select: v => v?.select?.name || '',
}

export function monthRange(year, month) {
  const y = year  || new Date().getFullYear()
  const m = month ?? new Date().getMonth()
  const start = `${y}-${String(m+1).padStart(2,'0')}-01`
  const end   = new Date(y, m+1, 0).toISOString().slice(0,10)
  return { start, end }
}

function dateFilter(field, year, month) {
  const { start, end } = monthRange(year, month)
  return { and: [
    { property: field, date: { on_or_after: start } },
    { property: field, date: { on_or_before: end } },
  ]}
}

// ── Налаштування (бонуси) ──────────────────────────────────
export const DEFAULT_CFG = {
  minDaysForBonus:  19,
  bonusPerLongDay:  100,
  bonusSaturday:    300,
  premiumDays:      21,
  premiumAmount:    4000,
  longDayHours:     10,
  longDaysNeeded:   10,
}

export async function fetchSettings() {
  try {
    const r = await queryDB(DB.settings)
    if (!r.results?.length) return DEFAULT_CFG
    const q = r.results[0].properties
    return {
      minDaysForBonus:  p.num(q['Мін. днів для бонусів'])  || DEFAULT_CFG.minDaysForBonus,
      bonusPerLongDay:  p.num(q['Бонус за день 10+ год'])  || DEFAULT_CFG.bonusPerLongDay,
      bonusSaturday:    p.num(q['Бонус за суботу'])        || DEFAULT_CFG.bonusSaturday,
      premiumDays:      p.num(q['Днів для премії'])        || DEFAULT_CFG.premiumDays,
      premiumAmount:    p.num(q['Сума премії'])            || DEFAULT_CFG.premiumAmount,
      longDayHours:     p.num(q['Годин для довгого дня'])  || DEFAULT_CFG.longDayHours,
      longDaysNeeded:   p.num(q['Потрібно довгих днів'])   || DEFAULT_CFG.longDaysNeeded,
      pageId: r.results[0].id,
    }
  } catch { return DEFAULT_CFG }
}

export async function saveSettings(pageId, cfg) {
  const props = {
    'Мін. днів для бонусів':  { number: cfg.minDaysForBonus },
    'Бонус за день 10+ год':  { number: cfg.bonusPerLongDay },
    'Бонус за суботу':        { number: cfg.bonusSaturday },
    'Днів для премії':        { number: cfg.premiumDays },
    'Сума премії':            { number: cfg.premiumAmount },
    'Годин для довгого дня':  { number: cfg.longDayHours },
    'Потрібно довгих днів':   { number: cfg.longDaysNeeded },
  }
  if (pageId) return updatePage(pageId, props)
  return createPage(DB.settings, { 'Назва': { title: [{ text: { content: 'Налаштування' } }] }, ...props })
}

// ── Завантажити всі дані за місяць ────────────────────────
export async function fetchAllData(year, month) {
  const df = f => dateFilter(f, year, month)
  const [shifts, staff, advances, bonuses, fixedStaff, debts, debtPayments, settings] =
    await Promise.all([
      queryDB(DB.shifts,       df('Дата')),
      queryDB(DB.staff),
      queryDB(DB.advances,     df('Дата')),
      queryDB(DB.bonuses,      df('Дата')),
      queryDB(DB.fixedStaff),
      queryDB(DB.debts,        { property:'Залишок боргу', number:{ greater_than:0 } }),
      queryDB(DB.debtPayments, df('Дата')),
      fetchSettings(),
    ])
  return {
    shifts:       shifts.results.map(parseShift),
    staff:        staff.results.map(parseStaff),
    advances:     advances.results.map(parseAdvance),
    bonuses:      bonuses.results.map(parseBonus),
    fixedStaff:   fixedStaff.results.map(parseFixed),
    debts:        debts.results.map(parseDebt),
    debtPayments: debtPayments.results.map(parseDP),
    cfg:          settings,
  }
}

// ── Парсери ────────────────────────────────────────────────
function parseShift(r) {
  const q = r.properties
  return { id:r.id, tgId:p.num(q['ID']), name:p.text(q['ПІБ']), date:p.date(q['Дата']),
    hours:p.num(q['Години']), packs:p.num(q['Кількість збитих пачок']),
    rateHour:p.num(q['Ставка в год.']), ratePack:p.num(q['Ставка за збиту пачку']) }
}
function parseStaff(r) {
  const q = r.properties
  return { id:r.id, tgId:p.num(q['ID']), name:p.text(q['ПІБ']),
    rateHour:p.num(q['Ставка в годину']), ratePack:p.num(q['Ставка за пачку']) }
}
function parseAdvance(r) {
  const q = r.properties
  return { id:r.id, tgId:p.num(q['ID']), name:p.text(q['ПІБ']), date:p.date(q['Дата']), amount:p.num(q['Сума авансу']) }
}
function parseBonus(r) {
  const q = r.properties
  return { id:r.id, tgId:p.num(q['ID']), name:p.text(q['ПІБ']), date:p.date(q['Дата']),
    amount:p.num(q['Сума премії']), reason:p.text(q['Причина']) }
}
function parseFixed(r) {
  const q = r.properties
  return { id:r.id, tgId:p.num(q['ID']), name:p.text(q['ПІБ']),
    salary:p.num(q['Фіксована зарплата']), role:p.text(q['Посада']) }
}
function parseDebt(r) {
  const q = r.properties
  return { id:r.id, tgId:p.num(q['ID']), name:p.text(q['ПІБ']),
    total:p.num(q['Сума боргу']), remaining:p.num(q['Залишок боргу']) }
}
function parseDP(r) {
  const q = r.properties
  return { id:r.id, tgId:p.num(q['ID']), name:p.text(q['ПІБ']), date:p.date(q['Дата']), amount:p.num(q['Сума виплати']) }
}

// ── Запис зміни ────────────────────────────────────────────
export async function saveShift({ tgId, name, rateHour, ratePack, date, hours, packs }) {
  return createPage(DB.shifts, {
    'ПІБ':                       { title:[{ text:{ content:name } }] },
    'ID':                        { number:tgId },
    'Дата':                      { date:{ start:date } },
    'Години':                    { number:hours },
    'Кількість збитих пачок':    { number:packs },
    'Ставка в год.':             { number:rateHour },
    'Ставка за збиту пачку':     { number:ratePack },
    'Виробіток з годин':         { number:hours*rateHour },
    'Виробіток зі збитих пачок': { number:packs*ratePack },
  })
}

// ── Запис премії ───────────────────────────────────────────
export async function saveBonusRecord({ tgId, name, date, amount, reason }) {
  return createPage(DB.bonuses, {
    'ПІБ':         { title:[{ text:{ content:name } }] },
    'ID':          { number:tgId },
    'Дата':        { date:{ start:date } },
    'Сума премії': { number:amount },
    'Причина':     { rich_text:[{ text:{ content:reason||'' } }] },
  })
}

// ── Оновити ставки ─────────────────────────────────────────
export async function updateStaffRates(pageId, { rateHour, ratePack }) {
  const props = {}
  if (rateHour !== undefined) props['Ставка в годину'] = { number: Number(rateHour) }
  if (ratePack !== undefined) props['Ставка за пачку'] = { number: Number(ratePack) }
  return updatePage(pageId, props)
}

export async function updateFixedSalary(pageId, salary) {
  return updatePage(pageId, { 'Фіксована зарплата': { number: Number(salary) } })
}

// ── Лог дій ────────────────────────────────────────────────
export async function writeLog({ tgId, name, action, details }) {
  try {
    await createPage(DB.logs, {
      'Дія':      { title:[{ text:{ content:action } }] },
      'ID':       { number:tgId },
      'ПІБ':      { rich_text:[{ text:{ content:name } }] },
      'Деталі':   { rich_text:[{ text:{ content:details||'' } }] },
      'Дата':     { date:{ start:new Date().toISOString() } },
    })
  } catch(e) { console.warn('Log failed:', e.message) }
}

// ── Перевірка доступу ──────────────────────────────────────
export async function checkAccess(tgId) {
  if (!tgId) return { allowed:false }
  const [s, f] = await Promise.all([
    queryDB(DB.staff,      { property:'ID', number:{ equals:tgId } }),
    queryDB(DB.fixedStaff, { property:'ID', number:{ equals:tgId } }),
  ])
  const sp = s.results?.[0], fp = f.results?.[0]
  if (!sp && !fp) return { allowed:false }
  const page = sp || fp
  return { allowed:true, type:fp?'fixed':'shift', name:p.text(page.properties['ПІБ']), tgId, pageId:page.id }
}

// ── Розрахунок зарплати ────────────────────────────────────
function isSat(d) { return new Date(d).getDay()===6 }
function isSun(d) { return new Date(d).getDay()===0 }

export function calcSalary(tgId, data) {
  const { shifts, staff, advances, bonuses, debts, debtPayments, cfg } = data
  const si = staff.find(s=>s.tgId===tgId)||{}
  const myShifts = shifts.filter(s=>s.tgId===tgId)

  // Групуємо по днях
  const dayMap = {}
  myShifts.forEach(s => {
    if (!dayMap[s.date]) dayMap[s.date] = { hours:0, packs:0, ids:[] }
    dayMap[s.date].hours += s.hours
    dayMap[s.date].packs += s.packs
    dayMap[s.date].ids.push(s.id)
  })
  const days = Object.entries(dayMap)
    .map(([date,v])=>({date,...v}))
    .sort((a,b)=>a.date.localeCompare(b.date))

  const totalHours = days.reduce((s,d)=>s+d.hours,0)
  const totalPacks = days.reduce((s,d)=>s+d.packs,0)
  const workDays   = days.filter(d=>!isSun(d.date)).length
  const longDays   = days.filter(d=>d.hours>=cfg.longDayHours&&!isSun(d.date)).length
  const saturdays  = days.filter(d=>isSat(d.date)).length

  const rateHour = myShifts[0]?.rateHour||si.rateHour||0
  const ratePack = myShifts[0]?.ratePack||si.ratePack||0

  const earnHours   = totalHours*rateHour
  const earnPacks   = totalPacks*ratePack
  const base        = earnHours+earnPacks
  const bonusActive = workDays>=cfg.minDaysForBonus
  const bonusLong   = bonusActive&&longDays>=cfg.longDaysNeeded ? longDays*cfg.bonusPerLongDay : 0
  const bonusSat    = bonusActive ? saturdays*cfg.bonusSaturday : 0
  const premium     = workDays>=cfg.premiumDays ? cfg.premiumAmount : 0
  const manualBonus = bonuses.filter(b=>b.tgId===tgId).reduce((s,b)=>s+b.amount,0)
  const totalAdv    = advances.filter(a=>a.tgId===tgId).reduce((s,a)=>s+a.amount,0)
  const debtPaid    = debtPayments.filter(p=>p.tgId===tgId).reduce((s,p)=>s+p.amount,0)
  const debtInfo    = debts.find(d=>d.tgId===tgId)
  const gross       = base+bonusLong+bonusSat+premium+manualBonus
  const final       = gross-totalAdv-debtPaid

  // Підказки
  const daysToBonus    = Math.max(0,cfg.minDaysForBonus-workDays)
  const longToBonus    = bonusActive ? Math.max(0,cfg.longDaysNeeded-longDays) : cfg.longDaysNeeded
  const daysToPremium  = Math.max(0,cfg.premiumDays-workDays)
  const potentialBonus = bonusActive ? (longDays>=cfg.longDaysNeeded?bonusLong:0)+bonusSat : 0

  // Останній день внесення
  const lastEntry = days.length ? days[days.length-1].date : null
  const daysSinceEntry = lastEntry
    ? Math.floor((new Date()-new Date(lastEntry))/(1000*60*60*24))
    : 99

  return {
    tgId, name:si.name||'', rateHour, ratePack, staffPageId:si.id,
    totalHours, totalPacks, workDays, longDays, saturdays, days,
    earnHours, earnPacks, base, bonusActive,
    bonusLong, bonusSat, premium, manualBonus, gross,
    totalAdv, debtPaid, debtRemaining:debtInfo?.remaining||0, final,
    daysToBonus, longToBonus, daysToPremium, potentialBonus,
    lastEntry, daysSinceEntry,
    bonuses: bonuses.filter(b=>b.tgId===tgId),
    advances: advances.filter(a=>a.tgId===tgId),
  }
}

export function calcAllWorkers(data) {
  const ids = [...new Set(data.shifts.map(s=>s.tgId).filter(Boolean))]
  // Додаємо тих хто є в staff але не має змін цього місяця
  data.staff.forEach(s => { if (!ids.includes(s.tgId)) ids.push(s.tgId) })

  const shiftWorkers = ids.map(id => ({
    type:'shift', ...calcSalary(id, data),
    name: data.staff.find(s=>s.tgId===id)?.name || data.shifts.find(s=>s.tgId===id)?.name || `ID ${id}`,
  }))
  const fixedWorkers = data.fixedStaff.map(w => {
    const totalAdv = data.advances.filter(a=>a.tgId===w.tgId).reduce((s,a)=>s+a.amount,0)
    const debtPaid = data.debtPayments.filter(p=>p.tgId===w.tgId).reduce((s,p)=>s+p.amount,0)
    return {
      type:'fixed', tgId:w.tgId, name:w.name, role:w.role, staffPageId:w.id,
      gross:w.salary, final:w.salary-totalAdv-debtPaid,
      totalAdv, debtPaid, debtRemaining:data.debts.find(d=>d.tgId===w.tgId)?.remaining||0,
      totalHours:0,totalPacks:0,workDays:0,longDays:0,saturdays:0,
      earnHours:0,earnPacks:0,base:0,bonusLong:0,bonusSat:0,premium:0,manualBonus:0,
      bonusActive:false,daysToBonus:0,longToBonus:0,daysToPremium:0,days:[],
      bonuses:[],advances:data.advances.filter(a=>a.tgId===w.tgId),
      daysSinceEntry:99,
    }
  })
  return [...shiftWorkers, ...fixedWorkers]
}
