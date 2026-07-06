// The single shared Knex instance used by every controller. Configured from the
// same knexfile the CLI uses, so app queries and migrations share a connection
// definition.

import knexLib from 'knex'
import config from '../../knexfile.js'

export const db = knexLib(config)

export default db
