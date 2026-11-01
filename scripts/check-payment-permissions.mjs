// Run from the project root:  node scripts/check-payment-permissions.mjs
// Checks that the payments page and docs/permission-matrix.md agree:
// delete payment = gym owner only, edit payment = owner + manager.
import { readFileSync, existsSync } from 'node:fs'

let failed = 0
const check = (name, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) failed++
}

const page = readFileSync('app/dashboard/payments/page.tsx', 'utf8')

const del = page.match(/const canDelete\s*=\s*([^\n\r]+)/)
check('page defines canDelete', !!del)
if (del) {
  const roles = [...del[1].matchAll(/'([a-z_]+)'/g)].map(m => m[1]).sort()
  check('canDelete = gym_owner (+ super_admin) only', roles.includes('gym_owner') &&
    !roles.includes('manager') && !roles.includes('receptionist'))
}
const edit = page.match(/const canManage\s*=\s*([^\n\r]+)/)
check('canManage (edit) = gym_owner + manager', !!edit && /gym_owner/.test(edit[1]) && /manager/.test(edit[1]) && !/receptionist/.test(edit[1]))
check('delete is a soft delete (deleted_at update)', /\.update\(\{ deleted_at:/.test(page))
check('no hard .delete() on payments', !/\.from\('payments'\)\s*\.delete\(/.test(page))
check('delete button is wrapped in canDelete', /\{canDelete && \(\s*<button[\s\S]{0,200}?setDeleteTarget/.test(page))

const doc = 'docs/permission-matrix.md'
if (existsSync(doc)) {
  const line = readFileSync(doc, 'utf8').split(/\r?\n/).find(l => /DeletePayment/i.test(l))
  check('permission-matrix.md has a DeletePayment row', !!line)
  if (line) {
    check('matrix: DeletePayment = owner only', /owner/i.test(line) && !/manager|receptionist/i.test(line))
    console.log('   matrix row:', line.trim())
  }
} else {
  console.log('SKIP  docs/permission-matrix.md not found')
}

process.exit(failed ? 1 : 0)
