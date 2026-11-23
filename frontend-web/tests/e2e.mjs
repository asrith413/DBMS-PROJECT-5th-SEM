import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const WEB_URL = process.env.CIMS_E2E_WEB_URL || 'http://127.0.0.1:5173'
const API_URL = process.env.CIMS_E2E_API_URL || '/api'
const EDGE_PATH = process.env.CIMS_E2E_BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

const credentials = {
  ADMIN: process.env.CIMS_E2E_ADMIN_EMAIL,
  ANALYST: process.env.CIMS_E2E_ANALYST_EMAIL,
  REPORTER: process.env.CIMS_E2E_REPORTER_EMAIL,
  password: process.env.CIMS_E2E_PASSWORD,
}

for (const [key, value] of Object.entries(credentials)) {
  if (!value) throw new Error(`Missing required E2E environment value: ${key}`)
}

const browser = await chromium.launch({ executablePath: EDGE_PATH, headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
const page = await context.newPage()
page.setDefaultTimeout(30000)
page.setDefaultNavigationTimeout(90000)
const consoleErrors = []
const pageErrors = []

page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})
page.on('pageerror', (error) => pageErrors.push(error.message))

async function login(email, password = credentials.password) {
  await page.goto(`${WEB_URL}/login`, { waitUntil: 'domcontentloaded' })
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in securely' }).click()
  await page.waitForURL('**/dashboard', { timeout: 30000 })
  await page.getByRole('heading', { name: 'SOC operational overview' }).waitFor()
}

async function logout() {
  const openNav = page.getByRole('button', { name: 'Open navigation' })
  if (await openNav.isVisible()) {
    await openNav.click()
  }
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.waitForURL('**/login')
  const stored = await page.evaluate(() => ({
    token: sessionStorage.getItem('cims_access_token'),
    user: sessionStorage.getItem('cims_current_user'),
  }))
  assert.equal(stored.token, null)
  assert.equal(stored.user, null)
}

async function assertHeading(name) {
  await page.getByRole('heading', { name, exact: true }).waitFor({ timeout: 30000 })
}

async function visit(path, heading) {
  await page.goto(`${WEB_URL}${path}`)
  await assertHeading(heading)
}

async function clickSidebar(label) {
  await page.getByRole('link', { name: label, exact: true }).click()
}

const suffix = Date.now()
const incidentTitle = `React E2E incident ${suffix}`
const updatedTitle = `${incidentTitle} reviewed`

try {
  // Login validation and real invalid-credential handling.
  await page.goto(`${WEB_URL}/login`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Sign in securely' }).click()
  await page.getByText('Enter your email address.').waitFor()
  await page.getByText('Enter your password.').waitFor()
  await page.getByLabel('Email address').fill(credentials.REPORTER)
  await page.getByLabel('Password', { exact: true }).fill('deliberately-invalid-password')
  await page.getByRole('button', { name: 'Sign in securely' }).click()
  await page.getByRole('alert').waitFor()
  assert.match(await page.getByRole('alert').innerText(), /incorrect email or password/i)

  // REPORTER: real login, role navigation, client validation, ML suggestion, incident creation, redaction, logout.
  await login(credentials.REPORTER)
  assert.equal(await page.getByRole('link', { name: 'Assets', exact: true }).count(), 0)
  assert.equal(await page.getByRole('link', { name: 'Reports', exact: true }).count(), 0)
  await clickSidebar('Incidents')
  await assertHeading('Incident management')
  await page.getByRole('button', { name: 'Report incident' }).first().click()
  const createDialog = page.getByRole('dialog', { name: 'Report a security incident' })
  await createDialog.getByRole('button', { name: 'Submit incident' }).click()
  await createDialog.getByText('Enter at least 3 characters.').waitFor()
  await createDialog.getByLabel('Title').fill(incidentTitle)
  await createDialog.getByLabel('Description').fill('A real React browser integration incident created through the reporter interface.')
  await createDialog.getByLabel('Incident type').selectOption({ index: 1 })
  await createDialog.getByRole('button', { name: 'Generate suggestion' }).click()
  await createDialog.getByText('Suggested').waitFor({ timeout: 30000 })
  const mediumSeverity = await createDialog.getByLabel('Final severity').locator('option').filter({ hasText: 'Medium' }).getAttribute('value')
  await createDialog.getByLabel('Final severity').selectOption(mediumSeverity)
  await createDialog.getByRole('button', { name: 'Submit incident' }).click()
  await page.waitForURL(/\/incidents\/\d+$/, { timeout: 30000 })
  const incidentId = Number(page.url().split('/').at(-1))
  assert.ok(Number.isInteger(incidentId) && incidentId > 0)
  await page.getByText('Reporter access: this incident is read-only').waitFor()
  await page.getByRole('tab', { name: /Evidence/ }).click()
  await page.getByRole('heading', { name: 'Operational evidence is redacted', exact: true }).waitFor()
  await logout()

  // ANALYST: role navigation and unassigned incident concealment.
  await login(credentials.ANALYST)
  await page.getByRole('link', { name: 'Security Logs', exact: true }).waitFor()
  await page.getByRole('link', { name: 'Assets', exact: true }).waitFor()
  assert.equal(await page.getByRole('link', { name: 'Analysts', exact: true }).count(), 0)
  assert.equal(await page.getByRole('link', { name: 'Reports', exact: true }).count(), 0)
  await page.goto(`${WEB_URL}/reports`)
  await page.waitForURL('**/dashboard')
  await page.goto(`${WEB_URL}/incidents/${incidentId}`)
  await page.getByRole('heading', { name: 'Incident not found or inaccessible', level: 1 }).waitFor()
  await logout()

  // ADMIN: route coverage, assignment, incident update, status transition, action, evidence, Mongo log, audit verification.
  await login(credentials.ADMIN)
  for (const [path, heading] of [
    ['/dashboard', 'SOC operational overview'],
    ['/incidents', 'Incident management'],
    ['/security-logs', 'Security Logs'],
    ['/analysts', 'Analyst Roster'],
    ['/assets', 'Asset Inventory'],
    ['/threat-actors', 'Threat Actor Directory'],
    ['/audit', 'Audit Trail'],
    ['/reports', 'Reports'],
  ]) {
    await visit(path, heading)
  }

  await page.goto(`${WEB_URL}/incidents/${incidentId}`)
  await page.getByRole('heading', { name: incidentTitle }).waitFor()
  await page.getByRole('tab', { name: /Response/ }).click()
  const analystId = await page.evaluate(async ({ apiUrl, email }) => {
    const token = sessionStorage.getItem('cims_access_token')
    const response = await fetch(`${apiUrl}/analysts`, { headers: { Authorization: `Bearer ${token}` } })
    if (!response.ok) throw new Error(`Analyst lookup failed: ${response.status}`)
    const analysts = await response.json()
    return analysts.find((item) => item.user.email === email)?.user_id
  }, { apiUrl: API_URL, email: credentials.ANALYST })
  assert.ok(analystId)
  await page.getByLabel('Analyst').selectOption(String(analystId))
  await page.getByRole('button', { name: 'Assign', exact: true }).click()
  await page.getByText(/incident advanced to Assigned/i).waitFor({ timeout: 30000 })

  await page.getByRole('tab', { name: /Overview/ }).click()
  await page.getByRole('button', { name: 'Edit case' }).click()
  await page.getByLabel('Title').fill(updatedTitle)
  await page.getByRole('button', { name: 'Save changes' }).click()
  await page.getByRole('heading', { name: updatedTitle }).waitFor({ timeout: 30000 })
  await page.getByRole('button', { name: 'Advance to Under Investigation' }).click()
  await page.getByRole('button', { name: 'Advance status' }).click()
  await page.getByText(/advanced to Under Investigation/i).waitFor({ timeout: 30000 })

  await page.getByRole('tab', { name: /Response/ }).click()
  await page.getByLabel('New investigation action').fill(`React E2E investigation action ${suffix}`)
  await page.getByRole('button', { name: 'Add action' }).click()
  await page.getByText(/Investigation action recorded/i).waitFor({ timeout: 30000 })

  await page.getByRole('tab', { name: /Evidence/ }).click()
  const assetSelect = page.getByLabel('Asset')
  if (await assetSelect.locator('option').count() > 1) {
    await assetSelect.selectOption({ index: 1 })
    await page.getByLabel('Impact type').fill('React E2E association')
    await page.getByRole('button', { name: 'Link asset' }).click()
    await page.getByText(/Asset associated/i).waitFor({ timeout: 30000 })
  }
  const actorSelect = page.getByLabel('Threat actor')
  if (await actorSelect.locator('option').count() > 1) {
    await actorSelect.selectOption({ index: 1 })
    await page.getByRole('button', { name: 'Link actor' }).click()
    await page.getByText(/Threat actor linked/i).waitFor({ timeout: 30000 })
  }

  await visit('/security-logs', 'Security Logs')
  await page.getByRole('button', { name: 'Add log' }).click()
  const logDialog = page.getByRole('dialog', { name: 'Add security log' })
  await logDialog.getByLabel(/^Active incident/).selectOption(String(incidentId))
  await logDialog.getByLabel(/^Source\s*\*?$/).fill('React E2E Sensor')
  await logDialog.getByLabel(/^Event type\s*\*?$/).fill('react_browser_event')
  await logDialog.getByLabel(/^Description\s*\*?$/).fill('MongoDB security log created through the React interface.')
  await logDialog.getByRole('button', { name: 'Create log' }).click()
  await page.getByText(/Security log added/i).waitFor({ timeout: 30000 })

  // ANALYST: verify assigned incident visibility and permitted investigation action.
  await logout()
  await login(credentials.ANALYST)
  await page.goto(`${WEB_URL}/incidents/${incidentId}`)
  await page.getByRole('heading', { name: updatedTitle }).waitFor({ timeout: 30000 })
  await page.getByRole('tab', { name: /Response/ }).click()
  await page.getByLabel('New investigation action').fill(`Analyst investigation note ${suffix}`)
  await page.getByRole('button', { name: 'Add action' }).click()
  await page.getByText(/Investigation action recorded/i).waitFor({ timeout: 30000 })
  await logout()

  // ADMIN: Audit trail records, hash-chain verification, and evidence inspection modal.
  await login(credentials.ADMIN)
  await visit('/audit', 'Audit Trail')
  await page.locator('.data-table tbody tr').first().waitFor({ timeout: 30000 })
  await page.getByText(/\d+ records? returned/).waitFor()
  await page.getByRole('button', { name: 'Verify chain' }).click()
  await page.getByText('Hash chain is internally consistent').waitFor({ timeout: 30000 })
  await page.locator('.data-table tbody tr').first().getByRole('button', { name: 'Evidence' }).click()
  const evidenceModal = page.getByRole('dialog', { name: 'Audit record evidence' })
  await evidenceModal.getByText('Complete chain hashes').waitFor({ timeout: 15000 })
  await page.keyboard.press('Escape')

  // Actual 404 handling.
  await page.goto(`${WEB_URL}/incidents/999999999`)
  await page.getByRole('heading', { name: 'Incident not found or inaccessible', level: 1 }).waitFor()

  // Invalid token handling: API 401 clears session and returns to login.
  await page.evaluate(() => sessionStorage.setItem('cims_access_token', 'invalid.token.value'))
  await page.reload()
  await page.waitForURL('**/login', { timeout: 30000 })

  // Responsive behaviour checks across specified viewports.
  // 1. Desktop: 1920 × 1080
  await page.setViewportSize({ width: 1920, height: 1080 })
  await login(credentials.ADMIN)
  await visit('/dashboard', 'SOC operational overview')
  await page.locator('.recharts-responsive-container').first().waitFor({ timeout: 30000 })
  await page.getByRole('button', { name: 'Collapse navigation' }).click()
  await page.getByRole('button', { name: 'Expand navigation' }).waitFor()
  await page.getByRole('button', { name: 'Expand navigation' }).click()
  let dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
  }))
  assert.ok(dimensions.body <= dimensions.viewport + 1, 'Desktop body overflow')
  assert.ok(dimensions.document <= dimensions.viewport + 1, 'Desktop document overflow')

  // 2. Laptop: 1366 × 768
  await page.setViewportSize({ width: 1366, height: 768 })
  await visit('/incidents', 'Incident management')
  await page.locator('.table-shell').waitFor()
  dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
  }))
  assert.ok(dimensions.body <= dimensions.viewport + 1, 'Laptop body overflow')
  assert.ok(dimensions.document <= dimensions.viewport + 1, 'Laptop document overflow')

  // 3. Tablet: 768 × 1024
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.goto(`${WEB_URL}/dashboard`)
  await page.getByRole('button', { name: 'Open navigation' }).waitFor()
  await page.getByRole('button', { name: 'Open navigation' }).click()
  const tabletClose = page.getByRole('button', { name: 'Close navigation' }).first()
  await tabletClose.waitFor()
  await tabletClose.click()
  await page.waitForTimeout(300)
  dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
  }))
  assert.ok(dimensions.body <= dimensions.viewport + 1, `Tablet body overflow: ${dimensions.body} > ${dimensions.viewport}`)
  assert.ok(dimensions.document <= dimensions.viewport + 1, `Tablet document overflow: ${dimensions.document} > ${dimensions.viewport}`)

  // 4. Mobile: 390 × 844
  await page.setViewportSize({ width: 390, height: 844 })
  await visit('/security-logs', 'Security Logs')
  await page.locator('.divide-y article').first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(300)
  dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
  }))
  assert.ok(dimensions.body <= dimensions.viewport + 1, 'Mobile body overflow')
  assert.ok(dimensions.document <= dimensions.viewport + 1, 'Mobile document overflow')

  await logout()

  const unexpectedConsoleErrors = consoleErrors.filter(
    (msg) => !msg.includes('401') && !msg.includes('404') && !msg.includes('status of 401') && !msg.includes('status of 404'),
  )

  assert.deepEqual(pageErrors, [], `Page errors: ${pageErrors.join(' | ')}`)
  assert.deepEqual(unexpectedConsoleErrors, [], `Console errors: ${unexpectedConsoleErrors.join(' | ')}`)

  console.log(JSON.stringify({
    result: 'passed',
    incident_created: true,
    incident_updated: true,
    role_checks: ['ADMIN', 'ANALYST', 'REPORTER'],
    analyst_assigned_visibility_verified: true,
    analyst_investigation_action_verified: true,
    mongo_log_created: true,
    audit_records_verified: true,
    audit_modal_verified: true,
    audit_verified: true,
    logout_verified: true,
    invalid_token_verified: true,
    invalid_form_verified: true,
    responsive_viewports_verified: ['1920x1080', '1366x768', '768x1024', '390x844'],
    console_errors: unexpectedConsoleErrors.length,
    page_errors: pageErrors.length,
  }, null, 2))
} finally {
  await browser.close()
}
