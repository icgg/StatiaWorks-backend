// Salary bridges the DB (salary_min / salary_max numerics) and the frontend
// (a pre-formatted display string like '$2,600 – $3,200 / mo'). The job creator
// builds the display string; we parse it into columns for storage/filtering and
// can reformat from columns on read. To guarantee round-trip fidelity (incl.
// "Salary not disclosed") the original display string is also kept in form_data.

// Match the frontend's fmtMoney (Number.toLocaleString('en-US')).
function fmtMoney(n) {
  if (n === null || n === undefined || n === '' || Number.isNaN(Number(n))) return ''
  const num = Number(n)
  if (!num) return ''
  return '$' + num.toLocaleString('en-US')
}

// { min, max, period, disclosed } → display string (mirrors salaryDisplay).
export function formatSalary({ min, max, period = 'mo', disclosed = true } = {}) {
  if (!disclosed) return 'Salary not disclosed'
  const lo = fmtMoney(min)
  const hi = fmtMoney(max)
  const per = `/ ${period}`
  if (lo && hi) return `${lo} – ${hi} ${per}`
  if (lo || hi) return `${lo || hi} ${per}`
  return ''
}

// Display string → { min, max, period, disclosed }. `min`/`max` are numbers or
// null; used to populate the salary_min / salary_max columns.
export function parseSalary(display) {
  const s = String(display || '').trim()
  if (!s || /not disclosed/i.test(s)) {
    return { min: null, max: null, period: 'mo', disclosed: false }
  }
  const perMatch = s.match(/\/\s*(mo|hr|yr)/i)
  const period = perMatch ? perMatch[1].toLowerCase() : 'mo'
  const nums = s.match(/[\d,]+(?:\.\d+)?/g) || []
  const toNum = (t) => {
    const n = Number(String(t).replace(/,/g, ''))
    return Number.isNaN(n) ? null : n
  }
  const min = nums[0] != null ? toNum(nums[0]) : null
  const max = nums[1] != null ? toNum(nums[1]) : min
  return { min, max, period, disclosed: true }
}
