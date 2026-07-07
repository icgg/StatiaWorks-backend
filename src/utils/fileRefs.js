// Reference counting for stored files. Deduplication means one physical file
// can back many rows (a seeker's profile résumé, several applications, an
// employer logo). Before the cleanup cron deletes a file it must confirm no
// live row still points at that URL.

import { db } from '../db/knex.js'

// True if `url` is still referenced by any seeker résumé, application
// résumé/cover, or employer logo. null/empty URLs are treated as unreferenced.
export async function isUrlReferenced(url) {
  if (!url) return false

  const [seeker, app, logo] = await Promise.all([
    db('seekers').where({ resume_url: url }).first('id'),
    db('applications')
      .where({ resume_url: url })
      .orWhere({ cover_url: url })
      .first('id'),
    db('employers').where({ logo_url: url }).first('id'),
  ])

  return Boolean(seeker || app || logo)
}
