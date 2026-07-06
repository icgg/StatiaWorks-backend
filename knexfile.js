// Knex configuration. Reads the DB connection from the shared env config so
// there is one source of truth for both the running app and the CLI
// (migrations / seeds).

import { dbConnection } from './src/config/env.js'

/** @type {import('knex').Knex.Config} */
const config = {
  client: 'pg',
  connection: dbConnection,
  pool: { min: 0, max: 10 },
  migrations: {
    directory: './src/db/migrations',
    extension: 'js',
  },
  seeds: {
    directory: './src/db/seeds',
    extension: 'js',
  },
}

export default config
