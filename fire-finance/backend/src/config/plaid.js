const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid')
const logger = require('./logger')

let plaidClient = null

const initializePlaid = () => {
  try {
    const configuration = new Configuration({
      basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
          'PLAID-SECRET': process.env.PLAID_SECRET,
        },
      },
    })

    plaidClient = new PlaidApi(configuration)
    logger.info(`Plaid initialized for environment: ${process.env.PLAID_ENV || 'sandbox'}`)
    return plaidClient
  } catch (error) {
    logger.error('Failed to initialize Plaid:', error)
    throw error
  }
}

const getPlaidClient = () => {
  if (!plaidClient) {
    throw new Error('Plaid client not initialized. Call initializePlaid() first.')
  }
  return plaidClient
}

// Create Plaid link token
const createLinkToken = async (userId, householdId) => {
  try {
    const client = getPlaidClient()
    const response = await client.linkTokenCreate({
      user: {
        client_user_id: userId,
      },
      client_name: 'Fire Finance',
      products: ['transactions', 'auth', 'identity', 'investments', 'liabilities'],
      country_codes: ['US'],
      language: 'en',
      webhook: `${process.env.API_URL}/api/plaid/webhook`,
      redirect_uri: `${process.env.FRONTEND_WEB_URL}/plaid/callback`,
      account_filters: {
        depository: {
          account_subtypes: ['checking', 'savings'],
        },
        credit: {
          account_subtypes: ['credit card'],
        },
        loan: {
          account_subtypes: ['student', 'mortgage'],
        },
        investment: {
          account_subtypes: ['401k', 'brokerage'],
        },
      },
    })

    return response.data
  } catch (error) {
    logger.error('Error creating Plaid link token:', error)
    throw error
  }
}

// Exchange public token for access token
const exchangePublicToken = async (publicToken) => {
  try {
    const client = getPlaidClient()
    const response = await client.itemPublicTokenExchange({
      public_token: publicToken,
    })

    return response.data
  } catch (error) {
    logger.error('Error exchanging Plaid public token:', error)
    throw error
  }
}

// Get accounts
const getAccounts = async (accessToken) => {
  try {
    const client = getPlaidClient()
    const response = await client.accountsGet({
      access_token: accessToken,
    })

    return response.data
  } catch (error) {
    logger.error('Error getting Plaid accounts:', error)
    throw error
  }
}

// Get transactions
const getTransactions = async (accessToken, startDate, endDate, accountIds = null) => {
  try {
    const client = getPlaidClient()
    const request = {
      access_token: accessToken,
      start_date: startDate,
      end_date: endDate,
    }

    if (accountIds) {
      request.account_ids = accountIds
    }

    let allTransactions = []
    let hasMore = true
    let offset = 0
    const count = 500

    while (hasMore) {
      const response = await client.transactionsGet({
        ...request,
        count,
        offset,
      })

      allTransactions = allTransactions.concat(response.data.transactions)
      hasMore = allTransactions.length < response.data.total_transactions
      offset += count
    }

    return {
      transactions: allTransactions,
      accounts: response.data.accounts,
      total_transactions: response.data.total_transactions,
    }
  } catch (error) {
    logger.error('Error getting Plaid transactions:', error)
    throw error
  }
}

// Get investment holdings
const getInvestmentHoldings = async (accessToken) => {
  try {
    const client = getPlaidClient()
    const response = await client.investmentsHoldingsGet({
      access_token: accessToken,
    })

    return response.data
  } catch (error) {
    logger.error('Error getting Plaid investment holdings:', error)
    throw error
  }
}

// Get liabilities
const getLiabilities = async (accessToken) => {
  try {
    const client = getPlaidClient()
    const response = await client.liabilitiesGet({
      access_token: accessToken,
    })

    return response.data
  } catch (error) {
    logger.error('Error getting Plaid liabilities:', error)
    throw error
  }
}

// Remove item
const removeItem = async (accessToken) => {
  try {
    const client = getPlaidClient()
    await client.itemRemove({
      access_token: accessToken,
    })

    return true
  } catch (error) {
    logger.error('Error removing Plaid item:', error)
    throw error
  }
}

// Webhook verification
const verifyWebhook = (requestBody, signature, secret) => {
  const crypto = require('crypto')
  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(requestBody, 'utf8')
  const expectedSignature = hmac.digest('hex')

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
}

module.exports = {
  initializePlaid,
  getPlaidClient,
  createLinkToken,
  exchangePublicToken,
  getAccounts,
  getTransactions,
  getInvestmentHoldings,
  getLiabilities,
  removeItem,
  verifyWebhook,
}