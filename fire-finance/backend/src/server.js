const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const compression = require('compression')
const rateLimit = require('express-rate-limit')
const passport = require('passport')
require('dotenv').config()

const { initializeDatabase } = require('./config/database')
const { initializeRedis } = require('./config/redis')
const { initializeLogger } = require('./config/logger')
const { initializePassport } = require('./config/passport')
const { initializePlaid } = require('./config/plaid')
const errorHandler = require('./middleware/errorHandler')
const notFound = require('./middleware/notFound')

// Import routes
const authRoutes = require('./routes/auth')
const userRoutes = require('./routes/users')
const accountRoutes = require('./routes/accounts')
const transactionRoutes = require('./routes/transactions')
const budgetRoutes = require('./routes/budgets')
const billRoutes = require('./routes/bills')
const goalRoutes = require('./routes/goals')
const reportRoutes = require('./routes/reports')
const plaidRoutes = require('./routes/plaid')
const collaborationRoutes = require('./routes/collaboration')
const notificationRoutes = require('./routes/notifications')
const businessRoutes = require('./routes/business')
const investmentRoutes = require('./routes/investments')

const app = express()
const logger = initializeLogger()

// Initialize configurations
async function initializeApp() {
  try {
    // Initialize database
    await initializeDatabase()
    logger.info('Database initialized successfully')

    // Initialize Redis
    await initializeRedis()
    logger.info('Redis initialized successfully')

    // Initialize Plaid
    await initializePlaid()
    logger.info('Plaid initialized successfully')

    // Initialize Passport
    initializePassport(passport)
    logger.info('Passport initialized successfully')

    // Security middleware
    app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "wss:", "https:"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }))

    // Rate limiting
    const limiter = rateLimit({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    })
    app.use(limiter)

    // CORS configuration
    const corsOptions = {
      origin: [
        process.env.FRONTEND_WEB_URL || 'http://localhost:3000',
        'capacitor://localhost',
        'ionic://localhost',
        'http://localhost',
        'http://localhost:8080',
        'http://localhost:8100',
      ],
      credentials: true,
      optionsSuccessStatus: 200,
    }
    app.use(cors(corsOptions))

    // Body parsing middleware
    app.use(express.json({ limit: '10mb' }))
    app.use(express.urlencoded({ extended: true, limit: '10mb' }))

    // Compression
    app.use(compression())

    // Passport middleware
    app.use(passport.initialize())

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
      })
    })

    // API routes
    app.use('/api/auth', authRoutes)
    app.use('/api/users', userRoutes)
    app.use('/api/accounts', accountRoutes)
    app.use('/api/transactions', transactionRoutes)
    app.use('/api/budgets', budgetRoutes)
    app.use('/api/bills', billRoutes)
    app.use('/api/goals', goalRoutes)
    app.use('/api/reports', reportRoutes)
    app.use('/api/plaid', plaidRoutes)
    app.use('/api/collaboration', collaborationRoutes)
    app.use('/api/notifications', notificationRoutes)
    app.use('/api/business', businessRoutes)
    app.use('/api/investments', investmentRoutes)

    // Error handling middleware
    app.use(notFound)
    app.use(errorHandler)

    // Start server
    const PORT = process.env.PORT || 3000
    const server = app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Fire Finance API server running on port ${PORT}`)
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`)
    })

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully')
      server.close(() => {
        logger.info('Process terminated')
        process.exit(0)
      })
    })

    process.on('SIGINT', () => {
      logger.info('SIGINT received, shutting down gracefully')
      server.close(() => {
        logger.info('Process terminated')
        process.exit(0)
      })
    })

  } catch (error) {
    logger.error('Failed to initialize application:', error)
    process.exit(1)
  }
}

// Initialize the application
initializeApp()

module.exports = app