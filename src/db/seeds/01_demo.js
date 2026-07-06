// Seed a coherent, demoable dataset that mirrors the frontend dummy data:
//   • the admin account set (accounts.js) — drives the admin panel + flagging
//   • the demo employer "Golden Rock Dive Center" with its posts + applicants
//     (employer.js) — the employer you log into
//   • the public job board (jobs.js) across several island employers
//   • the demo seeker "Maria Rijsdijk" with her application tracker
//     (applications.js) — the seeker you log into
//
// All seeded accounts share the demo password below so any of them can be used
// to log in during testing.

import { hashPassword } from '../../utils/password.js'

const DEMO_PASSWORD = 'password123'
const SAMPLE = '/sample-document.pdf' // frontend public asset (Open/Download work)

const DAY = 86400000
const iso = (d) => new Date(d).toISOString().slice(0, 10)
const daysAgo = (n) => iso(Date.now() - n * DAY)
const daysFromNow = (n) => iso(Date.now() + n * DAY)
const tsAgo = (n) => new Date(Date.now() - n * DAY).toISOString()
const tsFromNow = (n) => new Date(Date.now() + n * DAY).toISOString()

// --------------------------------------------------------------------------
// Employers (established + near-duplicate suspects + the extra board owners).
// plan: 'trial' | 'active' | 'lapsed'; status: 'active' | 'suspended' | 'pending'.
// --------------------------------------------------------------------------
const EMPLOYERS = [
  { company: 'Golden Rock Dive Center', fname: 'Elena', lname: 'Doncker', email: 'hiring@goldenrockdive.com', phone: '+599 318 2043', plan: 'trial', status: 'active', createdDaysAgo: 420, trialEndsInDays: 24, address: 'Bay Road 12', city: 'Oranjestad', logo: '/logos/logo.png' },
  { company: 'Duggins Supermarket', fname: 'Raymond', lname: 'Berkel', email: 'jobs@dugginssupermarket.com', phone: '+599 318 1120', plan: 'active', status: 'active', createdDaysAgo: 310 },
  { company: 'The Old Gin House', fname: 'Charlotte', lname: 'Vlaun', email: 'careers@oldginhouse.com', phone: '+599 318 2200', plan: 'active', status: 'active', createdDaysAgo: 520 },
  { company: 'Scubaqua Dive Center', fname: 'Marlon', lname: 'Suares', email: 'people@scubaqua.com', phone: '+599 318 3312', plan: 'active', status: 'active', createdDaysAgo: 260 },
  { company: 'Queen Beatrix Medical Center', fname: 'Grace', lname: 'Hodge', email: 'hr@queenbeatrixmc.com', phone: '+599 318 4410', plan: 'active', status: 'active', createdDaysAgo: 380 },
  { company: 'STUCO Utility Company', fname: 'Dwight', lname: 'Lopes', email: 'admin@stucostatia.com', phone: '+599 318 5500', plan: 'active', status: 'active', createdDaysAgo: 500 },
  { company: 'Statia Lodge', fname: 'Priya', lname: 'Ramdin', email: 'stay@statialodge.com', phone: '+599 318 6601', plan: 'active', status: 'active', createdDaysAgo: 190 },
  { company: 'Windward Construction', fname: 'Kevin', lname: 'Brown', email: 'build@windwardconstruction.com', phone: '+599 318 7788', plan: 'lapsed', status: 'active', createdDaysAgo: 240 },
  { company: 'Mega D Supermarket', fname: 'Ingrid', lname: 'Pompier', email: 'shop@megadstatia.com', phone: '+599 318 8899', plan: 'active', status: 'active', createdDaysAgo: 205 },
  // Near-duplicate suspects (feed the abuse-flagging engine).
  { company: 'Golden Rock Diving Centre', fname: 'R.', lname: 'Gould', email: 'recruit@goldenrock-diving.com', phone: '+599 318 9001', plan: 'trial', status: 'active', createdDaysAgo: 2, trialEndsInDays: 28 },
  { company: 'GoldenRock Dive Co.', fname: 'Goldie', lname: 'Rock', email: 'info@goldrockdive.co', phone: '+599 318 9002', plan: 'trial', status: 'pending', createdDaysAgo: 5, trialEndsInDays: 25 },
  { company: "Duggin's Super Market", fname: 'D.', lname: 'Martin', email: 'hiring@duggins-supermarket.net', phone: '+599 318 9003', plan: 'trial', status: 'active', createdDaysAgo: 1, trialEndsInDays: 29 },
  { company: 'Old Gin House Hotel', fname: 'O.', lname: 'Ginhouse', email: 'front.desk@oldginhousehotel.com', phone: '+599 318 9004', plan: 'trial', status: 'active', createdDaysAgo: 4, trialEndsInDays: 26 },
  // Extra owners so every public-board posting has a real employer.
  { company: 'Public Entity St. Eustatius', fname: 'Nadia', lname: 'Berkel', email: 'hr@statiagov.com', phone: '+599 318 7000', plan: 'active', status: 'active', createdDaysAgo: 600 },
  { company: 'GTI Statia Terminal', fname: 'Frank', lname: 'Merkman', email: 'careers@gtistatia.com', phone: '+599 318 7100', plan: 'active', status: 'active', createdDaysAgo: 450 },
  { company: 'Golden Rock School', fname: 'Miriam', lname: 'Redan', email: 'office@goldenrockschool.com', phone: '+599 318 7200', plan: 'active', status: 'active', createdDaysAgo: 700 },
]

// --------------------------------------------------------------------------
// Standalone seeker accounts (admin list). The demo seeker Maria is first.
// --------------------------------------------------------------------------
const SEEKERS = [
  { fname: 'Maria', lname: 'Rijsdijk', email: 'maria.rijsdijk@gmail.com', phone: '+599 318 4472', city: 'Oranjestad', country: 'Bonaire, Sint Eustatius and Saba', island: 'Sint Eustatius', status: 'active', createdDaysAgo: 46, resume_url: SAMPLE },
  { fname: 'Jerome', lname: 'Spanner', email: 'jerome.spanner@gmail.com', status: 'active', createdDaysAgo: 30 },
  { fname: 'Anisha', lname: 'Courtar', email: 'anisha.courtar@outlook.com', status: 'active', createdDaysAgo: 12 },
  { fname: 'Tyrell', lname: 'Woodley', email: 'tyrell.woodley@gmail.com', status: 'pending', createdDaysAgo: 3 },
  { fname: 'Sasha', lname: 'Beaumont', email: 'sasha.b@yahoo.com', status: 'active', createdDaysAgo: 6 },
  { fname: 'Devon', lname: 'Richardson', email: 'devon.rich@gmail.com', status: 'suspended', createdDaysAgo: 70 },
  { fname: 'Kimberly', lname: 'Simmons', email: 'kim.simmons@gmail.com', status: 'active', createdDaysAgo: 1 },
]

// --------------------------------------------------------------------------
// Golden Rock's own posts + applicants (employer.js). Applicants become real
// seeker accounts (by email) so the FK holds; their snapshot lives in form_data.
// --------------------------------------------------------------------------
const screen = (a, b, c) => ({ workAuthorized: a, residesOnStatia: b, willingToRelocate: c })
const GOLDEN_ROCK_POSTS = [
  {
    title: 'PADI Dive Instructor', sector: 'Tourism & Dive', type: 'Full-time',
    salary: '$2,600 – $3,200 / mo', postedDaysAgo: 3, status: 'active', deadlineInDays: 18,
    apply: { requireCv: true, requireCoverLetter: false, allowCoverMessage: true, questions: [
      { id: 'q_dob', label: 'Date of birth', kind: 'date', preset: 'dob' },
      { id: 'q_gender', label: 'Gender', kind: 'choice', preset: 'gender', options: ['Female', 'Male', 'Non-binary', 'Prefer not to say'] },
      { id: 'q_start', label: 'How soon could you start?', kind: 'text' },
    ] },
    applicants: [
      { fname: 'Denzel', lname: 'Lopes', email: 'denzel.lopes@gmail.com', phone: '+599 416 8891', address: 'Concordia 5, Oranjestad, St. Eustatius', appliedDaysAgo: 1, status: 'submitted', headline: 'PADI Divemaster · 4 yrs on-island', screening: screen('Yes', 'Yes', 'Not applicable'), customAnswers: { q_dob: '1990-06-14', q_gender: 'Male', q_start: 'Within 2 weeks' }, coverMessage: "I've guided the Statia marine park for four seasons and hold a current OWSI.", resume: true, cover: true },
      { fname: 'Priya', lname: 'Sewnandan', email: 'priya.sewnandan@outlook.com', phone: '+599 522 1170', address: 'White Wall Road 14, St. Eustatius', appliedDaysAgo: 2, status: 'submitted', headline: 'Dive instructor · relocating from Bonaire', screening: screen('Yes', 'No', 'Yes'), customAnswers: { q_dob: '1993-11-02', q_gender: 'Female', q_start: 'Immediately' }, coverMessage: 'Instructor with 900+ logged dives across the Dutch Caribbean.', resume: true },
      { fname: 'Marcus', lname: 'Hey', email: 'marcus.hey@gmail.com', phone: '+599 318 7745', address: 'Rosemary Lane 3, Oranjestad, St. Eustatius', appliedDaysAgo: 5, status: 'approved', headline: 'Rescue Diver working toward Instructor', screening: screen('Yes', 'Yes', 'Not applicable'), customAnswers: { q_dob: '1997-01-28', q_gender: 'Male', q_start: 'Next month' }, resume: true },
      { fname: 'Tessa', lname: 'Brown', email: 'tessa.brown@gmail.com', phone: '+599 416 3320', address: 'Golden Rock, St. Eustatius', appliedDaysAgo: 6, status: 'rejected', headline: 'Open Water Diver · no teaching cert yet', screening: screen('Yes', 'Yes', 'Not applicable'), customAnswers: { q_dob: '2000-09-09', q_gender: 'Prefer not to say', q_start: 'Immediately' }, resume: true },
    ],
  },
  {
    title: 'Dive Boat Captain', sector: 'Marine & Port', type: 'Full-time',
    salary: '$3,000 – $3,600 / mo', postedDaysAgo: 8, status: 'active', deadlineInDays: 5,
    applicants: [
      { fname: 'Roberto', lname: 'Silva', email: 'roberto.silva@gmail.com', phone: '+599 522 9004', address: 'Lower Town, St. Eustatius', appliedDaysAgo: 3, status: 'submitted', headline: 'Licensed captain · 12 yrs small-craft', screening: screen('Yes', 'Yes', 'Not applicable'), coverMessage: 'Local captain with a spotless safety record and STCW certification.', resume: true },
      { fname: 'Anouk', lname: 'de Windt', email: 'anouk.dewindt@gmail.com', phone: '+599 318 5561', address: 'Cherry Tree, St. Eustatius', appliedDaysAgo: 7, status: 'approved', headline: 'Boat handler · dive-charter background', screening: screen('Yes', 'Yes', 'Not applicable'), resume: true },
    ],
  },
  {
    title: 'Reservations & Front Desk', sector: 'Hospitality', type: 'Part-time',
    salary: '$14 – $18 / hr', postedDaysAgo: 12, status: 'active', deadlineInDays: null,
    applicants: [
      { fname: 'Shanice', lname: 'Gibbs', email: 'shanice.gibbs@gmail.com', phone: '+599 416 2218', address: 'Oranjestad, St. Eustatius', appliedDaysAgo: 4, status: 'submitted', headline: 'Front-desk & bookings · 3 yrs hospitality', screening: screen('Yes', 'Yes', 'Not applicable'), coverMessage: 'Friendly and organised — I handle bookings, calls, and walk-ins with a smile.', resume: true },
    ],
  },
  {
    title: 'Divemaster', sector: 'Tourism & Dive', type: 'Contract',
    salary: '$2,200 – $2,600 / mo', postedDaysAgo: 60, status: 'closed', closedDaysAgo: 9, deadlineInDays: null,
    applicants: [
      { fname: 'Kevin', lname: 'Richardson', email: 'kevin.richardson@gmail.com', phone: '+599 522 4432', address: 'Golden Rock, St. Eustatius', appliedDaysAgo: 40, status: 'approved', headline: 'Divemaster · hired for the season', screening: screen('Yes', 'Yes', 'Not applicable'), resume: true },
      { fname: 'Ingrid', lname: 'Sneek', email: 'ingrid.sneek@gmail.com', phone: '+599 318 9987', address: 'Concordia, St. Eustatius', appliedDaysAgo: 45, status: 'rejected', headline: 'Open Water · seeking first dive role', screening: screen('No', 'No', 'Yes'), resume: true },
    ],
  },
  {
    title: 'Retail Assistant — Dive Shop', sector: 'Retail', type: 'Part-time',
    salary: '$13 – $15 / hr', postedDaysAgo: 74, status: 'closed', closedDaysAgo: 20, deadlineInDays: null,
    applicants: [
      { fname: 'Omar', lname: 'Blake', email: 'omar.blake@gmail.com', phone: '+599 416 6640', address: 'Oranjestad, St. Eustatius', appliedDaysAgo: 70, status: 'rejected', headline: 'Retail associate · gear enthusiast', screening: screen('Yes', 'Yes', 'Not applicable'), resume: true },
    ],
  },
]

// --------------------------------------------------------------------------
// Public-board postings owned by the other island employers (jobs.js). Rich
// content is stored in form_data so JobView renders fully.
// --------------------------------------------------------------------------
const PUBLIC_JOBS = [
  { company: 'The Old Gin House', title: 'Line Cook', sector: 'Hospitality', type: 'Full-time', salary: '$2,000 – $2,400 / mo', postedDaysAgo: 2, deadlineInDays: 6,
    description: 'The Old Gin House, Statia’s landmark waterfront hotel and restaurant, is hiring a Line Cook to join its kitchen brigade. You’ll cook fresh, island-sourced dishes for hotel guests and locals alike, working the line through busy dinner service.\n\nThis is a hands-on role for a cook who takes pride in consistency and can hold their station when the dining room fills up.',
    responsibilities: ['Prep and cook dishes to spec across your assigned station', 'Keep the line stocked, clean, and ready through service', 'Follow food-safety and hygiene standards at all times', 'Support the kitchen team during busy covers and events'],
    requirements: ['Prior line-cook or kitchen experience in a busy restaurant', 'Solid knife skills and knowledge of basic cooking methods', 'Able to work evenings, weekends, and holidays', 'Reliable, calm under pressure, and a team player'],
    aboutCompany: 'The Old Gin House is a historic waterfront hotel and restaurant in Lower Town, known for warm hospitality and a menu that leans on fresh local produce and seafood.' },
  { company: 'Duggins Supermarket', title: 'Retail Associate', sector: 'Retail', type: 'Part-time', salary: '$13 – $16 / hr', postedDaysAgo: 3, deadlineInDays: null,
    description: 'Duggins Supermarket is looking for a friendly, dependable Retail Associate to help keep the island’s busiest grocery store running. You’ll greet customers, run the register, and keep shelves stocked and tidy.\n\nThis part-time role is a great fit for someone who enjoys people and wants flexible hours close to home.',
    responsibilities: ['Serve customers at the register and answer questions', 'Restock shelves and rotate stock to keep it fresh', 'Keep aisles, displays, and checkout areas clean', 'Help receive and price incoming deliveries'],
    requirements: ['Friendly, punctual, and comfortable on your feet', 'Basic numeracy and cash-handling ability', 'Weekend and evening availability', 'Retail experience welcome but not required'],
    aboutCompany: 'Duggins Supermarket is a family-run grocery store in Oranjestad and a daily stop for much of the island.' },
  { company: 'Public Entity St. Eustatius', title: 'Administrative Assistant', sector: 'Government', type: 'Full-time', salary: '$2,300 – $2,800 / mo', postedDaysAgo: 4, deadlineInDays: null,
    description: 'The Public Entity St. Eustatius is seeking an organized Administrative Assistant to support a busy department at Fort Oranje. You’ll handle correspondence, schedule meetings, and keep records in order.\n\nThis is a stable, full-time civil-service role for someone detail-oriented who enjoys keeping things running smoothly.',
    responsibilities: ['Manage calendars, meetings, and departmental correspondence', 'Maintain files and records accurately and confidentially', 'Draft letters, minutes, and simple reports', 'Greet visitors and handle phone and email enquiries'],
    requirements: ['Strong organisation and written-communication skills', 'Comfortable with office software (documents, spreadsheets, email)', 'Fluent in English; Dutch is an advantage', 'Discretion when handling confidential information'],
    aboutCompany: 'The Public Entity St. Eustatius is the island’s local government, delivering public services to the community from its offices at Fort Oranje.' },
  { company: 'GTI Statia Terminal', title: 'Terminal Operator', sector: 'Marine & Port', type: 'Full-time', salary: '$3,000 – $3,900 / mo', postedDaysAgo: 5, deadlineInDays: null,
    description: 'GTI Statia Terminal, the island’s oil-storage and transshipment facility, is hiring a Terminal Operator. You’ll operate and monitor equipment for the safe transfer and storage of product, working rotating shifts as part of the operations team.\n\nSafety is the first priority in this role — precision and vigilance matter every shift.',
    responsibilities: ['Operate pumps, valves, and metering systems during transfers', 'Monitor tanks, gauges, and control panels for safe operation', 'Carry out routine inspections and log readings', 'Follow all safety, environmental, and emergency procedures'],
    requirements: ['Technical or vocational background (mechanical/process an advantage)', 'Willingness to work rotating shifts, including nights', 'Strong commitment to safety and procedure', 'Physically able to work outdoors and at heights'],
    aboutCompany: 'GTI Statia Terminal operates a major oil-storage and transshipment terminal at Tumble Down Dick Bay, one of the island’s largest private employers.' },
  { company: 'Queen Beatrix Medical Center', title: 'Registered Nurse', sector: 'Healthcare', type: 'Full-time', salary: '$3,200 – $4,100 / mo', postedDaysAgo: 6, deadlineInDays: null,
    description: 'The Queen Beatrix Medical Center is looking for a Registered Nurse to join the team at Statia’s hospital. You’ll provide direct patient care across a small but broad-scope facility, working alongside doctors and support staff.\n\nIsland healthcare asks nurses to be versatile — this role suits someone who thrives with variety and responsibility.',
    responsibilities: ['Assess, plan, and deliver patient care across departments', 'Administer medication and treatments safely and accurately', 'Keep clear, up-to-date patient records', 'Support emergency care and coordinate with the medical team'],
    requirements: ['Registered Nurse qualification and valid registration', 'Clinical experience across general or acute care', 'Calm, compassionate, and adaptable under pressure', 'Fluent in English; Dutch or Papiamento a plus'],
    aboutCompany: 'The Queen Beatrix Medical Center is the island’s hospital in Oranjestad, providing primary and emergency care to the Statia community.' },
  { company: 'Golden Rock School', title: 'Primary School Teacher', sector: 'Education', type: 'Full-time', salary: '$2,700 – $3,300 / mo', postedDaysAgo: 8, deadlineInDays: null,
    description: 'Golden Rock School is seeking a dedicated Primary School Teacher to lead a classroom for the coming school year. You’ll plan lessons, teach core subjects, and help young islanders build a strong foundation.\n\nThis is a rewarding, full-time role for an educator who wants to make a real difference in a small-island community.',
    responsibilities: ['Plan and deliver engaging lessons across core subjects', 'Assess progress and give constructive feedback', 'Create a safe, positive, and inclusive classroom', 'Communicate regularly with parents and colleagues'],
    requirements: ['Teaching qualification for primary education', 'Experience with primary-age children', 'Patience, creativity, and strong classroom management', 'Fluent in English; Dutch is an advantage'],
    aboutCompany: 'Golden Rock School is a primary school serving families across the island, focused on nurturing curious, confident young learners.' },
  { company: 'STUCO Utility Company', title: 'Licensed Electrician', sector: 'Trades & Construction', type: 'Contract', salary: '$24 – $32 / hr', postedDaysAgo: 11, deadlineInDays: null,
    description: 'STUCO, Statia’s utility company, is hiring a Licensed Electrician on contract to support the island’s power network. You’ll install, maintain, and repair electrical systems and equipment, working both in the field and at the plant.\n\nReliable power keeps the island running — this role is central to that mission.',
    responsibilities: ['Install, inspect, and repair electrical systems and equipment', 'Diagnose faults and carry out preventive maintenance', 'Work safely with low- and medium-voltage systems', 'Respond to outages and support restoration work'],
    requirements: ['Recognised electrician licence or certification', 'Proven electrical-installation and maintenance experience', 'Strong grasp of electrical safety standards', 'Able to be on call for outage response'],
    aboutCompany: 'STUCO is the utility company responsible for generating and distributing electricity across St. Eustatius from its plant at Cherry Tree.' },
]

// Maria's application tracker (applications.js), mapped to seeded jobs by title.
// canonical status + whether the seeker has "seen" the review (drives the dot).
const MARIA_APPS = [
  { title: 'Retail Associate', status: 'submitted', appliedDaysAgo: 4, cover: true },
  { title: 'Administrative Assistant', status: 'submitted', appliedDaysAgo: 1, cover: true },
  { title: 'Line Cook', status: 'submitted', appliedDaysAgo: 6, cover: false },
  { title: 'PADI Dive Instructor', status: 'approved', appliedDaysAgo: 12, reviewedDaysAgo: 5, seen: true, cover: true },
  { title: 'Registered Nurse', status: 'approved', appliedDaysAgo: 15, reviewedDaysAgo: 3, seen: false, cover: true },
  { title: 'Primary School Teacher', status: 'approved', appliedDaysAgo: 20, reviewedDaysAgo: 2, seen: false, cover: true },
  { title: 'Terminal Operator', status: 'rejected', appliedDaysAgo: 18, reviewedDaysAgo: 7, seen: true, cover: false },
  { title: 'Licensed Electrician', status: 'withdrawn', appliedDaysAgo: 22, cover: false },
  { title: 'Divemaster', status: 'submitted', appliedDaysAgo: 34, cover: true }, // job is closed → "Listing closed"
]

export async function seed(knex) {
  // Clear in FK-safe order and reset id sequences for predictable ids.
  await knex('applications').del()
  await knex('jobs').del()
  await knex('employers').del()
  await knex('seekers').del()
  await knex('accounts').del()
  for (const seq of ['accounts_id_seq', 'employers_id_seq', 'seekers_id_seq', 'jobs_id_seq', 'applications_id_seq']) {
    await knex.raw(`ALTER SEQUENCE IF EXISTS ?? RESTART WITH 1`, [seq])
  }

  const pw = await hashPassword(DEMO_PASSWORD)

  // Helper: create an account + return its id.
  async function makeAccount(email, status, createdDaysAgo, lastActiveDaysAgo, accountType) {
    const [row] = await knex('accounts')
      .insert({
        email,
        password_hash: pw,
        verified: status !== 'pending',
        status,
        account_type: accountType,
        created_at: tsAgo(createdDaysAgo ?? 30),
        last_logged_in: lastActiveDaysAgo != null ? tsAgo(lastActiveDaysAgo) : null,
      })
      .returning('id')
    return row.id
  }

  // ---- Employers ----
  const employerIdByCompany = {}
  for (const e of EMPLOYERS) {
    const accountId = await makeAccount(e.email, e.status, e.createdDaysAgo, 1, 'employer')
    const paid = e.plan === 'active'
    const trial = e.plan === 'trial'
    const [emp] = await knex('employers')
      .insert({
        company: e.company,
        fname: e.fname,
        lname: e.lname,
        phone: e.phone,
        address: e.address || null,
        city: e.city || null,
        logo_url: e.logo || null,
        account_id: accountId,
        paid,
        trial,
        flagged: false,
        alerts_enabled: true,
        trial_end_date: trial ? tsFromNow(e.trialEndsInDays ?? 30) : null,
        next_payment_date: paid ? daysFromNow(30) : trial ? daysFromNow(e.trialEndsInDays ?? 30) : daysAgo(3),
      })
      .returning('id')
    employerIdByCompany[e.company] = emp.id
  }

  // ---- Seekers (standalone) ----
  const seekerIdByEmail = {}
  for (const s of SEEKERS) {
    const accountId = await makeAccount(s.email, s.status, s.createdDaysAgo, 1, 'seeker')
    const [row] = await knex('seekers')
      .insert({
        fname: s.fname,
        lname: s.lname,
        phone: s.phone || null,
        city: s.city || null,
        country: s.country || null,
        island: s.island || null,
        resume_url: s.resume_url || null,
        account_id: accountId,
      })
      .returning('id')
    seekerIdByEmail[s.email] = row.id
  }

  // Ensure a seeker exists for an applicant (create a lightweight account if new).
  async function ensureSeeker(a) {
    if (seekerIdByEmail[a.email]) return seekerIdByEmail[a.email]
    const accountId = await makeAccount(a.email, 'active', a.appliedDaysAgo + 5, a.appliedDaysAgo, 'seeker')
    const [row] = await knex('seekers')
      .insert({ fname: a.fname, lname: a.lname, phone: a.phone || null, resume_url: SAMPLE, account_id: accountId })
      .returning('id')
    seekerIdByEmail[a.email] = row.id
    return row.id
  }

  // ---- Jobs: Golden Rock posts (with applicants) ----
  const jobIdByTitle = {}
  const grId = employerIdByCompany['Golden Rock Dive Center']
  for (const p of GOLDEN_ROCK_POSTS) {
    const [min, max, period, disclosed] = parseSalaryTuple(p.salary)
    const formData = {
      salary: p.salary,
      salaryPeriod: period,
      salaryDisclosed: disclosed,
      apply: p.apply || { requireCv: true, requireCoverLetter: false, allowCoverMessage: true, questions: [] },
    }
    const [job] = await knex('jobs')
      .insert({
        title: p.title,
        sector: p.sector,
        employment_type: p.type,
        salary_min: min,
        salary_max: max,
        deadline: p.deadlineInDays != null ? daysFromNow(p.deadlineInDays) : null,
        employer_id: grId,
        date_posted: daysAgo(p.postedDaysAgo),
        status: p.status,
        closed_at: p.status === 'closed' ? tsAgo(p.closedDaysAgo ?? 0) : null,
        form_data: formData,
      })
      .returning('id')
    jobIdByTitle[p.title] = job.id

    for (const a of p.applicants) {
      const seekerId = await ensureSeeker(a)
      await knex('applications').insert({
        seeker_id: seekerId,
        job_id: job.id,
        status: a.status,
        date_applied: daysAgo(a.appliedDaysAgo),
        reviewed_at: a.status === 'approved' || a.status === 'rejected' ? tsAgo(Math.max(0, a.appliedDaysAgo - 1)) : null,
        seeker_seen: true,
        resume_url: a.resume ? SAMPLE : null,
        cover_url: a.cover ? SAMPLE : null,
        form_data: {
          fname: a.fname, lname: a.lname, email: a.email, phone: a.phone, address: a.address,
          headline: a.headline, coverMessage: a.coverMessage || '',
          screening: a.screening, customAnswers: a.customAnswers || {},
        },
      })
    }
  }

  // ---- Jobs: the rest of the public board (other employers) ----
  for (const j of PUBLIC_JOBS) {
    const employerId = employerIdByCompany[j.company]
    const [min, max, period, disclosed] = parseSalaryTuple(j.salary)
    const [row] = await knex('jobs').insert({
      title: j.title,
      sector: j.sector,
      employment_type: j.type,
      salary_min: min,
      salary_max: max,
      deadline: j.deadlineInDays != null ? daysFromNow(j.deadlineInDays) : null,
      employer_id: employerId,
      date_posted: daysAgo(j.postedDaysAgo),
      status: 'active',
      form_data: {
        salary: j.salary, salaryPeriod: period, salaryDisclosed: disclosed,
        description: j.description, responsibilities: j.responsibilities,
        requirements: j.requirements, aboutCompany: j.aboutCompany,
        apply: { requireCv: true, requireCoverLetter: false, allowCoverMessage: true, questions: [] },
      },
    }).returning('id')
    jobIdByTitle[j.title] = row.id
  }

  // ---- Maria's applications ----
  const mariaId = seekerIdByEmail['maria.rijsdijk@gmail.com']
  const mariaSnapshot = { fname: 'Maria', lname: 'Rijsdijk', email: 'maria.rijsdijk@gmail.com', phone: '+599 318 4472', address: 'Oranjestad, Sint Eustatius', headline: 'Hospitality & admin · Statia-based', screening: screen('Yes', 'Yes', 'Not applicable'), customAnswers: {} }
  for (const m of MARIA_APPS) {
    const jobId = jobIdByTitle[m.title]
    if (!jobId) continue
    // Skip if Maria is already an applicant on this job (avoid PK clash).
    const exists = await knex('applications').where({ seeker_id: mariaId, job_id: jobId }).first()
    if (exists) continue
    await knex('applications').insert({
      seeker_id: mariaId,
      job_id: jobId,
      status: m.status,
      date_applied: daysAgo(m.appliedDaysAgo),
      reviewed_at: m.reviewedDaysAgo != null ? tsAgo(m.reviewedDaysAgo) : null,
      seeker_seen: m.seen ?? true,
      resume_url: SAMPLE,
      cover_url: m.cover ? SAMPLE : null,
      form_data: mariaSnapshot,
    })
  }

  console.log('[seed] done — demo password for all accounts:', DEMO_PASSWORD)
}

// Local salary parse (min, max, period, disclosed) — avoids importing the util
// into the seed (keeps the seed self-contained).
function parseSalaryTuple(display) {
  const s = String(display || '').trim()
  if (!s || /not disclosed/i.test(s)) return [null, null, 'mo', false]
  const per = s.match(/\/\s*(mo|hr|yr)/i)
  const period = per ? per[1].toLowerCase() : 'mo'
  const nums = (s.match(/[\d,]+(?:\.\d+)?/g) || []).map((t) => Number(t.replace(/,/g, '')))
  return [nums[0] ?? null, nums[1] ?? nums[0] ?? null, period, true]
}
