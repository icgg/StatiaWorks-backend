// On-demand invoice/receipt PDF generation (Puppeteer, HTML -> PDF).
//
// A paid invoice is rendered to a PDF and streamed to the employer in a new tab
// (see invoice.controller.downloadInvoicePdf). Nothing is stored — the document
// is built fresh on each request. The invoice is numbered by the employer's own
// invoice sequence (their i-th invoice), passed in as `ordinal`, so the internal
// DB id is never printed.
//
// A single headless browser is launched lazily and reused across requests.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer'
import { money, displayDate, describe } from '../utils/invoices.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Read + base64-encode the logo once. Puppeteer's setContent can't resolve
// filesystem-relative <img src> paths, so the asset is embedded as a data: URI.
// This is the brand's light-surface ("White") treatment from the Ascent brand
// sheet, so it drops straight onto the white invoice paper.
let logoDataUri = ''
function getLogoDataUri() {
  if (logoDataUri) return logoDataUri
  try {
    const buf = fs.readFileSync(path.join(__dirname, 'assets', 'logo.png'))
    logoDataUri = `data:image/png;base64,${buf.toString('base64')}`
  } catch {
    logoDataUri = '' // no logo — the header still renders the wordmark text
  }
  return logoDataUri
}

// Lazily launch and reuse one browser instance.
let browserPromise = null
function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
    // If launch fails, clear the cached promise so the next call retries.
    browserPromise.catch(() => {
      browserPromise = null
    })
  }
  return browserPromise
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const PAYMENT_METHOD_LABEL = {
  mcb: 'MCB bank transfer',
  stripe: 'Card (Stripe)',
}

// Build the invoice HTML. `invoice` is a raw DB row; `employer` is req.employer.
// Exported for testing/preview; the route renders it via renderInvoicePdf.
export function invoiceHtml({ invoice, employer, ordinal }) {
  const logo = getLogoDataUri()
  const amount = money(invoice.amount)
  const paidOn = displayDate(invoice.paid_at) || '—'
  const method = PAYMENT_METHOD_LABEL[invoice.payment_method] || invoice.payment_method || '—'
  const lineDesc = invoice.description || describe(invoice.plan_interval)

  const contactName = [employer.fname, employer.lname].filter(Boolean).join(' ')
  const billToLines = [
    employer.company,
    contactName,
    [employer.address, employer.city].filter(Boolean).join(', '),
  ].filter(Boolean)

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body {
        font-family: 'Helvetica Neue', Arial, sans-serif;
        background: #ffffff;
        color: #103D5D;
        font-size: 13px;
        line-height: 1.5;
        padding: 56px 60px;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 40px;
      }
      .doc-title {
        font-size: 26px;
        font-weight: 700;
        letter-spacing: -0.01em;
        margin: 0;
      }
      .logo { height: 40px; width: auto; display: block; }
      .logo-fallback { font-family: 'Archivo', 'Helvetica Neue', Arial, sans-serif; font-size: 24px; font-weight: 800; color: #103D5D; }
      .logo-fallback em { color: #0E7C7B; font-style: normal; }
      .meta { margin-bottom: 36px; }
      .meta-row { display: flex; margin: 3px 0; }
      .meta-label {
        width: 130px;
        color: #6b7a88;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .meta-value { font-weight: 600; }
      .bill-to {
        margin-bottom: 30px;
        color: #34485a;
      }
      .bill-to .meta-label { margin-bottom: 4px; width: auto; }
      table.charges {
        width: 100%;
        border-collapse: collapse;
        margin-top: 8px;
      }
      table.charges th {
        text-align: left;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #6b7a88;
        border-bottom: 2px solid #103D5D;
        padding: 8px 4px;
      }
      table.charges th.right, table.charges td.right { text-align: right; }
      table.charges td {
        padding: 12px 4px;
        border-bottom: 1px solid #e3ddd0;
      }
      .totals {
        margin-top: 16px;
        display: flex;
        justify-content: flex-end;
      }
      .totals-box { width: 240px; }
      .total-row { display: flex; justify-content: space-between; padding: 6px 4px; }
      .total-row.grand {
        border-top: 2px solid #103D5D;
        margin-top: 4px;
        font-weight: 700;
        font-size: 15px;
      }
      .paid-stamp {
        display: inline-block;
        margin-top: 4px;
        color: #0E7C7B;
        border: 2px solid #0E7C7B;
        border-radius: 6px;
        padding: 4px 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        font-size: 12px;
      }
      .foot {
        margin-top: 56px;
        padding-top: 16px;
        border-top: 1px solid #e3ddd0;
        color: #6b7a88;
        font-size: 11px;
      }
    </style>
  </head>
  <body>
    <div class="top">
      <h1 class="doc-title">Payment Invoice</h1>
      ${
        logo
          ? `<img class="logo" src="${logo}" alt="StatiaWorks" />`
          : `<div class="logo-fallback">Statia<em>Works</em></div>`
      }
    </div>

    <div class="meta">
      <div class="meta-row"><span class="meta-label">Invoice No.</span><span class="meta-value">${escapeHtml(ordinal)}</span></div>
      <div class="meta-row"><span class="meta-label">Date Paid</span><span class="meta-value">${escapeHtml(paidOn)}</span></div>
      <div class="meta-row"><span class="meta-label">Payment method</span><span class="meta-value">${escapeHtml(method)}</span></div>
    </div>

    ${
      billToLines.length
        ? `<div class="bill-to">
             <div class="meta-label">Billed to</div>
             ${billToLines.map((l) => `<div>${escapeHtml(l)}</div>`).join('')}
           </div>`
        : ''
    }

    <table class="charges">
      <thead>
        <tr>
          <th>Description</th>
          <th class="right">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${escapeHtml(lineDesc)}</td>
          <td class="right">${escapeHtml(amount)}</td>
        </tr>
      </tbody>
    </table>

    <div class="totals">
      <div class="totals-box">
        <div class="total-row"><span>Subtotal</span><span>${escapeHtml(amount)}</span></div>
        <div class="total-row grand"><span>Total paid</span><span>${escapeHtml(amount)}</span></div>
        <div style="text-align:right;"><span class="paid-stamp">Paid</span></div>
      </div>
    </div>

    <div class="foot">
      StatiaWorks — the local job board for Sint Eustatius. This receipt was generated for a
      verified MCB bank transfer. Thank you for hiring on Statia.
    </div>
  </body>
</html>`
}

// Render a paid invoice to a PDF Buffer.
export async function renderInvoicePdf({ invoice, employer, ordinal }) {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setContent(invoiceHtml({ invoice, employer, ordinal }), {
      waitUntil: 'networkidle0',
    })
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    })
    // page.pdf() returns a Uint8Array (Puppeteer v23+); wrap it in a Buffer so
    // Express's res.send() streams it as binary instead of JSON-serialising it.
    return Buffer.from(pdf)
  } finally {
    await page.close()
  }
}
