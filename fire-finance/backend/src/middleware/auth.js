const passport = require('passport')
const { getDatabase } = require('../config/database')
const logger = require('../config/logger')

// JWT Authentication middleware
const authenticateJWT = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, async (err, user, info) => {
    if (err) {
      logger.error('JWT authentication error:', err)
      return res.status(500).json({ error: 'Authentication error' })
    }

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized - Invalid or expired token' })
    }

    // Check if user is still active
    if (!user.is_active) {
      return res.status(401).json({ error: 'Account is deactivated' })
    }

    // Check if account is locked
    if (user.locked_until && new Date() < new Date(user.locked_until)) {
      return res.status(401).json({ error: 'Account is temporarily locked' })
    }

    req.user = user
    next()
  })(req, res, next)
}

// Local authentication middleware (for login)
const authenticateLocal = (req, res, next) => {
  passport.authenticate('local', { session: false }, (err, user, info) => {
    if (err) {
      logger.error('Local authentication error:', err)
      return res.status(500).json({ error: 'Authentication error' })
    }

    if (!user) {
      return res.status(401).json({ error: info?.message || 'Invalid email or password' })
    }

    req.user = user
    next()
  })(req, res, next)
}

// Role-based authorization middleware
const authorize = (roles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    // If no roles specified, allow any authenticated user
    if (roles.length === 0) {
      return next()
    }

    // Check if user has required role
    if (roles.includes(req.user.role)) {
      return next()
    }

    return res.status(403).json({ error: 'Insufficient permissions' })
  }
}

// Household membership check
const checkHouseholdMembership = (requiredPermission = 'read') => {
  return async (req, res, next) => {
    try {
      const userId = req.user.id
      const householdId = req.params.householdId || req.body.householdId

      if (!householdId) {
        return res.status(400).json({ error: 'Household ID is required' })
      }

      const db = getDatabase()
      const membership = await db('household_members')
        .where({ user_id: userId, household_id: householdId, is_active: true })
        .first()

      if (!membership) {
        return res.status(403).json({ error: 'Not a member of this household' })
      }

      // Check permissions
      if (requiredPermission === 'write' && membership.permissions === 'read_only') {
        return res.status(403).json({ error: 'Read-only access for this household' })
      }

      if (requiredPermission === 'full' && membership.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' })
      }

      req.householdMembership = membership
      next()
    } catch (error) {
      logger.error('Household membership check error:', error)
      return res.status(500).json({ error: 'Internal server error' })
    }
  }
}

// MFA verification middleware
const requireMFA = async (req, res, next) => {
  try {
    if (!req.user.mfa_enabled) {
      return res.status(400).json({ error: 'MFA is not enabled for this user' })
    }

    const { mfa_token } = req.headers
    if (!mfa_token) {
      return res.status(401).json({ error: 'MFA token required' })
    }

    const speakeasy = require('speakeasy')
    const verified = speakeasy.totp.verify({
      secret: req.user.mfa_secret,
      encoding: 'base32',
      token: mfa_token,
      window: 2, // Allow 2 time steps for clock drift
    })

    if (!verified) {
      // Check recovery codes
      const db = getDatabase()
      const recoveryCodes = JSON.parse(req.user.mfa_recovery_codes || '[]')
      const usedCodeIndex = recoveryCodes.indexOf(mfa_token)

      if (usedCodeIndex !== -1) {
        // Remove used recovery code
        recoveryCodes.splice(usedCodeIndex, 1)
        await db('users').where({ id: req.user.id }).update({
          mfa_recovery_codes: JSON.stringify(recoveryCodes),
        })
      } else {
        return res.status(401).json({ error: 'Invalid MFA token' })
      }
    }

    next()
  } catch (error) {
    logger.error('MFA verification error:', error)
    return res.status(500).json({ error: 'MFA verification failed' })
  }
}

// Rate limiting for specific endpoints
const rateLimitByUser = (maxRequests = 10, windowMs = 15 * 60 * 1000) => {
  const requests = new Map()

  return (req, res, next) => {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const now = Date.now()
    const userRequests = requests.get(userId) || []
    
    // Remove old requests
    const validRequests = userRequests.filter(time => now - time < windowMs)
    
    if (validRequests.length >= maxRequests) {
      return res.status(429).json({ error: 'Too many requests' })
    }

    validRequests.push(now)
    requests.set(userId, validRequests)
    next()
  }
}

// Session timeout check
const checkSessionTimeout = (req, res, next) => {
  const sessionTimeout = parseInt(process.env.SESSION_TIMEOUT_MINUTES) || 60
  const lastActivity = req.user.last_login
  
  if (lastActivity) {
    const lastActivityTime = new Date(lastActivity).getTime()
    const now = Date.now()
    const timeoutMs = sessionTimeout * 60 * 1000

    if (now - lastActivityTime > timeoutMs) {
      return res.status(401).json({ error: 'Session expired' })
    }
  }

  next()
}

module.exports = {
  authenticateJWT,
  authenticateLocal,
  authorize,
  checkHouseholdMembership,
  requireMFA,
  rateLimitByUser,
  checkSessionTimeout,
}