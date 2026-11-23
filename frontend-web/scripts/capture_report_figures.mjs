import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = path.resolve(__dirname, '../../docs/screenshots')
const WEB_URL = 'http://127.0.0.1:5173'
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

const browser = await chromium.launch({ executablePath: EDGE_PATH, headless: true })
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await context.newPage()
page.setDefaultTimeout(20000)

console.log('Capturing figures for Form, Validation and Security report...')

async function snap(elementOrPage, filename) {
  const targetPath = path.join(OUTPUT_DIR, filename)
  await elementOrPage.screenshot({ path: targetPath })
  console.log(`Saved: ${filename}`)
}

// FIG 1: Admin Login Interface
await page.goto(`${WEB_URL}/login`, { waitUntil: 'domcontentloaded' })
await page.getByLabel('Email address').fill('admin@cims.edu')
await page.getByLabel('Password', { exact: true }).fill('CimsDemo123!')
await page.waitForTimeout(400)
const loginCard = page.locator('.auth-shell').first()
if (await loginCard.isVisible()) {
  await snap(loginCard, 'fig1_admin_login.png')
} else {
  await snap(page, 'fig1_admin_login.png')
}

// FIG 2: Login Interface displaying error message for invalid credentials
await page.getByLabel('Password', { exact: true }).fill('WrongPassword!')
await page.getByRole('button', { name: 'Sign in securely' }).click()
await page.getByRole('alert').waitFor({ timeout: 10000 }).catch(() => {})
await page.waitForTimeout(500)
if (await loginCard.isVisible()) {
  await snap(loginCard, 'fig2_login_error.png')
} else {
  await snap(page, 'fig2_login_error.png')
}

// FIG 3: Analyst / User Login Interface (Shows Analyst role selected / filled)
await page.getByLabel('Email address').fill('maya.analyst@cims.edu')
await page.getByLabel('Password', { exact: true }).fill('CimsDemo123!')
await page.waitForTimeout(400)
if (await loginCard.isVisible()) {
  await snap(loginCard, 'fig3_analyst_login.png')
} else {
  await snap(page, 'fig3_analyst_login.png')
}

// Now sign in as Admin to capture forms and dashboards
await page.getByLabel('Email address').fill('admin@cims.edu')
await page.getByLabel('Password', { exact: true }).fill('CimsDemo123!')
await page.getByRole('button', { name: 'Sign in securely' }).click()
await page.waitForURL('**/dashboard', { timeout: 20000 })
await page.waitForTimeout(600)

// FIG 4: Role-Based SOC Dashboard Overview
await snap(page, 'fig4_dashboard_rbac.png')

// FIG 5: Incident Reporting Form (Modal Dialog)
await page.goto(`${WEB_URL}/incidents`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(500)
await page.getByRole('button', { name: 'Report incident' }).first().click()
const createDialog = page.getByRole('dialog', { name: 'Report a security incident' })
await createDialog.waitFor({ timeout: 15000 })
await page.waitForTimeout(400)
await snap(createDialog, 'fig5_incident_form.png')

// FIG 6: Form Validation displaying error message (Title too short)
await createDialog.getByRole('button', { name: 'Submit incident' }).click()
await createDialog.getByText('Enter at least 3 characters.').waitFor({ timeout: 5000 }).catch(() => {})
await page.waitForTimeout(400)
await snap(createDialog, 'fig6_form_validation.png')

// FIG 7: Form demonstrating AI-assisted severity suggestion
await createDialog.getByLabel('Title').fill('Ransomware payload detected on finance share')
await createDialog.getByLabel('Description').fill('Multiple systems encrypted with suspicious ransom note left in corporate finance file share.')
await createDialog.getByLabel('Incident type').selectOption({ index: 1 })
const generateBtn = createDialog.getByRole('button', { name: 'Generate suggestion' })
if (await generateBtn.isVisible()) {
  await generateBtn.click()
  await createDialog.getByText(/Suggested/i).waitFor({ timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(600)
}
await snap(createDialog, 'fig7_ai_severity.png')

// Close modal
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

// FIG 8: Incident Assignment & Lifecycle Response Tab
await page.goto(`${WEB_URL}/incidents/1`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(500)
const responseTab = page.getByRole('tab', { name: /Response/ })
if (await responseTab.isVisible()) {
  await responseTab.click()
  await page.waitForTimeout(500)
}
await snap(page, 'fig8_analyst_assignment.png')

// FIG 9: Security Log Telemetry Form (MongoDB integration)
await page.goto(`${WEB_URL}/security-logs`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(500)
await page.getByRole('button', { name: 'Add log' }).click()
const logDialog = page.getByRole('dialog', { name: 'Add security log' })
await logDialog.waitFor({ timeout: 15000 })
await page.waitForTimeout(400)
await snap(logDialog, 'fig9_security_log_form.png')

// FIG 10: Input Validation Error for Invalid IP Address
await logDialog.getByLabel(/^Source IP/).fill('999.300.1.1')
await logDialog.getByLabel(/^Destination IP/).fill('10.0.0.1')
await logDialog.getByLabel(/^Source\s*\*?$/).fill('React E2E Sensor')
await logDialog.getByLabel(/^Event type\s*\*?$/).fill('react_browser_event')
await logDialog.getByLabel(/^Description\s*\*?$/).fill('Testing invalid IP format validation')
await logDialog.getByRole('button', { name: 'Create log' }).click()
await page.waitForTimeout(800)
await snap(logDialog, 'fig10_ip_validation.png')

// Close modal
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

// FIG 11: Cryptographic SHA-256 Audit Log Ledger
await page.goto(`${WEB_URL}/audit`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(600)
await snap(page, 'fig11_audit_logs.png')

// FIG 12: Cryptographic Audit Chain Verification (Integrity Valid: 100% Verified)
const verifyBtn = page.getByRole('button', { name: 'Verify chain' })
if (await verifyBtn.isVisible()) {
  await verifyBtn.click()
  await page.getByText(/consistent|valid|verified/i).waitFor({ timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(600)
}
await snap(page, 'fig12_audit_verify.png')

await browser.close()
console.log('All 12 figures successfully captured!')
