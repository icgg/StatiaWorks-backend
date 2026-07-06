// Application status has one canonical column value but two audience views.
// Canonical: 'submitted' | 'approved' | 'rejected' | 'withdrawn'.

// Employer pill: what the company sees on an applicant.
//   submitted -> 'new', approved -> 'approved', rejected -> 'rejected'.
export function employerPill(status) {
  return status === 'submitted' ? 'new' : status
}

// Employer action ('new'|'approved'|'rejected') -> canonical status.
export function canonicalFromApplicantAction(action) {
  return action === 'new' ? 'submitted' : action
}

// Seeker tab bucket. `jobLive` = the posting still exists and is open; a gone /
// closed posting archives an otherwise-live application.
//   submitted -> 'active', approved|rejected -> 'reviewed', withdrawn -> 'archived'.
export function seekerTab(status, jobLive = true) {
  if (status === 'withdrawn') return 'archived'
  if (status === 'approved' || status === 'rejected') return 'reviewed'
  // submitted
  return jobLive ? 'active' : 'archived'
}

// Human-readable stage label shown on the seeker's application card.
export function seekerStage(status, jobLive = true) {
  switch (status) {
    case 'approved':
      return 'Offer extended'
    case 'rejected':
      return 'Not selected'
    case 'withdrawn':
      return 'Withdrawn'
    case 'submitted':
      return jobLive ? 'Submitted' : 'Listing closed'
    default:
      return 'Submitted'
  }
}
