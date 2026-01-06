const express = require('express')
const { v4: uuidv4 } = require('uuid')
const { getDatabase } = require('../config/database')
const { authenticateJWT, authorize, checkHouseholdMembership } = require('../middleware/auth')
const logger = require('../config/logger')
const { generatePDF } = require('../utils/pdfUtils')

const router = express.Router()

/**
 * Create business client
 */
router.post('/clients', authenticateJWT, async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      address,
      type = 'individual',
      taxId,
      notes,
      tags = []
    } = req.body

    if (!name) {
      return res.status(400).json({ error: 'Client name is required' })
    }

    const db = getDatabase()

    const [client] = await db('business_clients')
      .insert({
        id: uuidv4(),
        user_id: req.user.id,
        name,
        email,
        phone,
        address: JSON.stringify(address || {}),
        type,
        tax_id: taxId,
        notes,
        tags: JSON.stringify(tags),
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning(['id', 'name', 'email', 'type', 'created_at'])

    logger.info(`Business client created: ${client.id}`)

    res.status(201).json({
      message: 'Business client created successfully',
      client
    })

  } catch (error) {
    logger.error('Create business client error:', error)
    res.status(500).json({ error: 'Failed to create business client' })
  }
})

/**
 * Get business clients with filtering
 */
router.get('/clients', authenticateJWT, async (req, res) => {
  try {
    const { type, tags, search, page = 1, limit = 50 } = req.query
    const offset = (page - 1) * limit

    const db = getDatabase()

    let query = db('business_clients')
      .where({ user_id: req.user.id, is_active: true })
      .orderBy('name', 'asc')

    // Apply filters
    if (type) {
      query = query.where('type', type)
    }
    if (tags) {
      const tagList = tags.split(',')
      query = query.whereRaw('tags::jsonb ?| array[?]', [tagList])
    }
    if (search) {
      query = query.where(function() {
        this.where('name', 'ilike', `%${search}%`)
          .orWhere('email', 'ilike', `%${search}%`)
          .orWhere('phone', 'ilike', `%${search}%`)
      })
    }

    const totalQuery = query.clone()
    const totalResult = await totalQuery.count('* as count').first()
    const total = parseInt(totalResult.count)

    const clients = await query.limit(limit).offset(offset)

    // Parse JSON fields
    clients.forEach(client => {
      client.address = JSON.parse(client.address || '{}')
      client.tags = JSON.parse(client.tags || '[]')
    })

    res.json({
      clients,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })

  } catch (error) {
    logger.error('Get business clients error:', error)
    res.status(500).json({ error: 'Failed to get business clients' })
  }
})

/**
 * Create business invoice
 */
router.post('/invoices', authenticateJWT, async (req, res) => {
  try {
    const {
      clientId,
      items,
      issueDate,
      dueDate,
      terms,
      notes,
      taxRate = 0,
      discount = 0
    } = req.body

    if (!clientId || !items || items.length === 0) {
      return res.status(400).json({ error: 'Client and items are required' })
    }

    const db = getDatabase()

    // Calculate totals
    let subtotal = 0
    items.forEach(item => {
      item.total = (item.quantity || 1) * item.rate
      subtotal += item.total
    })

    const taxAmount = subtotal * (taxRate / 100)
    const discountAmount = subtotal * (discount / 100)
    const total = subtotal + taxAmount - discountAmount

    const invoiceNumber = await generateInvoiceNumber(db)

    const [invoice] = await db('business_invoices')
      .insert({
        id: uuidv4(),
        user_id: req.user.id,
        client_id: clientId,
        invoice_number: invoiceNumber,
        issue_date: issueDate,
        due_date: dueDate,
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        discount,
        discount_amount: discountAmount,
        total,
        balance: total,
        terms,
        notes,
        status: 'draft',
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning(['id', 'invoice_number', 'total', 'status'])

    // Add invoice items
    for (const item of items) {
      await db('business_invoice_items').insert({
        id: uuidv4(),
        invoice_id: invoice.id,
        description: item.description,
        quantity: item.quantity || 1,
        rate: item.rate,
        total: item.total,
        created_at: new Date()
      })
    }

    logger.info(`Business invoice created: ${invoice.id}`)

    res.status(201).json({
      message: 'Invoice created successfully',
      invoice
    })

  } catch (error) {
    logger.error('Create invoice error:', error)
    res.status(500).json({ error: 'Failed to create invoice' })
  }
})

/**
 * Send invoice to client
 */
router.post('/invoices/:invoiceId/send', authenticateJWT, async (req, res) => {
  try {
    const { invoiceId } = req.params

    const db = getDatabase()

    const invoice = await db('business_invoices')
      .where({ id: invoiceId, user_id: req.user.id })
      .first()

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' })
    }

    if (invoice.status !== 'draft') {
      return res.status(400).json({ error: 'Only draft invoices can be sent' })
    }

    // Update status
    await db('business_invoices')
      .where({ id: invoiceId })
      .update({
        status: 'sent',
        sent_at: new Date(),
        updated_at: new Date()
      })

    // Generate PDF
    const pdfBuffer = await generateInvoicePDF(invoiceId, req.user.id)

    // Send email with PDF attachment
    const client = await db('business_clients')
      .where({ id: invoice.client_id })
      .first()

    await sendInvoiceEmail(client, invoice, pdfBuffer)

    logger.info(`Invoice sent: ${invoiceId}`)

    res.json({ message: 'Invoice sent successfully' })

  } catch (error) {
    logger.error('Send invoice error:', error)
    res.status(500).json({ error: 'Failed to send invoice' })
  }
})

/**
 * Record invoice payment
 */
router.post('/invoices/:invoiceId/payment', authenticateJWT, async (req, res) => {
  try {
    const { invoiceId } = req.params
    const { amount, paymentDate, method, reference } = req.body

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid payment amount is required' })
    }

    const db = getDatabase()

    const invoice = await db('business_invoices')
      .where({ id: invoiceId, user_id: req.user.id })
      .first()

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' })
    }

    if (invoice.status === 'paid') {
      return res.status(400).json({ error: 'Invoice is already paid' })
    }

    // Record payment
    await db('business_payments').insert({
      id: uuidv4(),
      invoice_id: invoiceId,
      amount,
      payment_date: paymentDate,
      method,
      reference,
      created_at: new Date()
    })

    // Update invoice balance
    const newBalance = invoice.balance - amount
    let newStatus = invoice.status
    
    if (newBalance <= 0) {
      newStatus = 'paid'
    } else if (newBalance < invoice.total) {
      newStatus = 'partial'
    }

    await db('business_invoices')
      .where({ id: invoiceId })
      .update({
        balance: Math.max(0, newBalance),
        status: newStatus,
        updated_at: new Date()
      })

    logger.info(`Payment recorded for invoice ${invoiceId}: ${amount}`)

    res.json({ 
      message: 'Payment recorded successfully',
      newBalance: Math.max(0, newBalance),
      status: newStatus
    })

  } catch (error) {
    logger.error('Record payment error:', error)
    res.status(500).json({ error: 'Failed to record payment' })
  }
})

/**
 * Create business expense
 */
router.post('/expenses', authenticateJWT, async (req, res) => {
  try {
    const {
      category,
      amount,
      date,
      description,
      vendor,
      clientId,
      projectId,
      isBillable = false,
      isReimbursable = false,
      receiptUrl,
      taxDeductible = true,
      notes,
      tags = []
    } = req.body

    if (!category || !amount || !date) {
      return res.status(400).json({ error: 'Category, amount, and date are required' })
    }

    const db = getDatabase()

    const [expense] = await db('business_expenses')
      .insert({
        id: uuidv4(),
        user_id: req.user.id,
        category,
        amount,
        date,
        description,
        vendor,
        client_id: clientId,
        project_id: projectId,
        is_billable: isBillable,
        is_reimbursable: isReimbursable,
        receipt_url: receiptUrl,
        tax_deductible: taxDeductible,
        notes,
        tags: JSON.stringify(tags),
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning(['id', 'category', 'amount', 'date', 'description'])

    logger.info(`Business expense created: ${expense.id}`)

    res.status(201).json({
      message: 'Business expense created successfully',
      expense
    })

  } catch (error) {
    logger.error('Create business expense error:', error)
    res.status(500).json({ error: 'Failed to create business expense' })
  }
})

/**
 * Get business dashboard summary
 */
router.get('/dashboard', authenticateJWT, async (req, res) => {
  try {
    const { startDate, endDate } = req.query
    const db = getDatabase()

    const dateRange = {
      start: startDate ? new Date(startDate) : new Date(new Date().getFullYear(), 0, 1),
      end: endDate ? new Date(endDate) : new Date()
    }

    // Revenue summary
    const revenue = await db('business_invoices')
      .where({ user_id: req.user.id, status: 'paid' })
      .whereBetween('paid_at', [dateRange.start, dateRange.end])
      .sum('total as total_revenue')
      .first()

    // Outstanding invoices
    const outstanding = await db('business_invoices')
      .where({ user_id: req.user.id })
      .whereIn('status', ['sent', 'partial'])
      .sum('balance as total_outstanding')
      .first()

    // Expenses
    const expenses = await db('business_expenses')
      .where({ user_id: req.user.id })
      .whereBetween('date', [dateRange.start, dateRange.end])
      .sum('amount as total_expenses')
      .first()

    // Profit
    const totalRevenue = revenue.total_revenue || 0
    const totalExpenses = expenses.total_expenses || 0
    const profit = totalRevenue - totalExpenses

    // Top clients by revenue
    const topClients = await db('business_invoices')
      .join('business_clients', 'business_invoices.client_id', 'business_clients.id')
      .where({ 'business_invoices.user_id': req.user.id, 'business_invoices.status': 'paid' })
      .whereBetween('business_invoices.paid_at', [dateRange.start, dateRange.end])
      .groupBy('business_clients.id', 'business_clients.name')
      .select(
        'business_clients.id',
        'business_clients.name',
        db.raw('SUM(business_invoices.total) as total_revenue')
      )
      .orderBy('total_revenue', 'desc')
      .limit(5)

    // Expense categories
    const expenseCategories = await db('business_expenses')
      .where({ user_id: req.user.id })
      .whereBetween('date', [dateRange.start, dateRange.end])
      .groupBy('category')
      .select('category', db.raw('SUM(amount) as total_amount'))
      .orderBy('total_amount', 'desc')

    res.json({
      summary: {
        totalRevenue,
        totalExpenses,
        profit,
        profitMargin: totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0,
        outstandingBalance: outstanding.total_outstanding || 0,
        invoiceCount: await db('business_invoices').where({ user_id: req.user.id }).count('* as count').first().then(r => r.count),
        clientCount: await db('business_clients').where({ user_id: req.user.id, is_active: true }).count('* as count').first().then(r => r.count)
      },
      topClients,
      expenseCategories
    })

  } catch (error) {
    logger.error('Business dashboard error:', error)
    res.status(500).json({ error: 'Failed to get business dashboard' })
  }
})

/**
 * Generate tax reports
 */
router.get('/tax-report', authenticateJWT, async (req, res) => {
  try {
    const { year = new Date().getFullYear() } = req.query
    const db = getDatabase()

    // Income
    const income = await db('business_invoices')
      .where({ user_id: req.user.id, status: 'paid' })
      .whereRaw('EXTRACT(YEAR FROM paid_at) = ?', [year])
      .sum('total as total_income')
      .first()

    // Expenses by category
    const expenses = await db('business_expenses')
      .where({ user_id: req.user.id, tax_deductible: true })
      .whereRaw('EXTRACT(YEAR FROM date) = ?', [year])
      .groupBy('category')
      .select('category', db.raw('SUM(amount) as total_amount'))
      .orderBy('total_amount', 'desc')

    // 1099-MISC eligible payments
    const contractorPayments = await db('business_expenses')
      .where({ user_id: req.user.id, category: 'contractors' })
      .whereRaw('EXTRACT(YEAR FROM date) = ?', [year])
      .sum('amount as total_contractor_payments')
      .first()

    // Mileage deduction
    const mileage = await db('mileage_logs')
      .where({ user_id: req.user.id })
      .whereRaw('EXTRACT(YEAR FROM date) = ?', [year])
      .sum('deduction_amount as total_mileage_deduction')
      .first()

    // Equipment depreciation (simplified)
    const equipmentExpenses = await db('business_expenses')
      .where({ user_id: req.user.id, category: 'equipment' })
      .whereRaw('EXTRACT(YEAR FROM date) = ?', [year])
      .sum('amount as total_equipment')
      .first()

    const totalIncome = income.total_income || 0
    const totalExpenses = expenses.reduce((sum, exp) => sum + exp.total_amount, 0)
    const netProfit = totalIncome - totalExpenses

    res.json({
      year,
      income: {
        total: totalIncome,
        details: [] // Could break down by client
      },
      expenses: {
        total: totalExpenses,
        categories: expenses,
        equipment: equipmentExpenses.total_equipment || 0,
        mileage: mileage.total_mileage_deduction || 0
      },
      deductions: {
        homeOffice: 0, // Calculate based on home office percentage
        equipment: (equipmentExpenses.total_equipment || 0) * 0.2, // Simplified 5-year depreciation
        mileage: mileage.total_mileage_deduction || 0,
        other: totalExpenses - (equipmentExpenses.total_equipment || 0)
      },
      netProfit,
      quarterlyEstimates: {
        q1: Math.max(0, netProfit * 0.25 * 0.153), // Simplified SE tax calculation
        q2: Math.max(0, netProfit * 0.25 * 0.153),
        q3: Math.max(0, netProfit * 0.25 * 0.153),
        q4: Math.max(0, netProfit * 0.25 * 0.153)
      },
      form1099Required: (contractorPayments.total_contractor_payments || 0) >= 600
    })

  } catch (error) {
    logger.error('Tax report error:', error)
    res.status(500).json({ error: 'Failed to generate tax report' })
  }
})

// Helper functions
async function generateInvoiceNumber(db) {
  const year = new Date().getFullYear()
  const prefix = `INV${year}`
  
  const lastInvoice = await db('business_invoices')
    .where('invoice_number', 'like', `${prefix}%`)
    .orderBy('invoice_number', 'desc')
    .first()

  let sequence = 1
  if (lastInvoice) {
    const lastNumber = parseInt(lastInvoice.invoice_number.replace(prefix, ''))
    sequence = lastNumber + 1
  }

  return `${prefix}${sequence.toString().padStart(4, '0')}`
}

async function generateInvoicePDF(invoiceId, userId) {
  // Implementation would use a PDF library like puppeteer or pdf-lib
  // For now, return empty buffer
  return Buffer.alloc(0)
}

async function sendInvoiceEmail(client, invoice, pdfBuffer) {
  // Implementation would send email with PDF attachment
  // Using existing email service
}

module.exports = router