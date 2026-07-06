// Tiny helper to generate a bcrypt hash for the admin password.
// Usage:  npm run hash -- "yourpassword"

import bcrypt from 'bcryptjs'

const pw = process.argv[2]
if (!pw) {
  console.error('Usage: npm run hash -- "yourpassword"')
  process.exit(1)
}

const hash = await bcrypt.hash(pw, 10)
console.log(hash)
