const knex = require('knex')
const knexConfig = require('../../knexfile')
const logger = require('./logger')

let db = null

const initializeDatabase = async () => {
  try {
    // Initialize Knex with the appropriate configuration
    const environment = process.env.NODE_ENV || 'development'
    db = knex(knexConfig[environment])

    // Test the connection
    await db.raw('SELECT 1')
    logger.info('Database connection established successfully')

    // Run migrations if in production
    if (environment === 'production') {
      await db.migrate.latest()
      logger.info('Database migrations completed')
    }

    return db
  } catch (error) {
    logger.error('Database initialization failed:', error)
    throw error
  }
}

const getDatabase = () => {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.')
  }
  return db
}

const closeDatabase = async () => {
  if (db) {
    await db.destroy()
    db = null
    logger.info('Database connection closed')
  }
}

module.exports = {
  initializeDatabase,
  getDatabase,
  closeDatabase,
}