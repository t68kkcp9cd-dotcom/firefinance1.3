const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const speakeasy = require('speakeasy')
const QRCode = require('qrcode')
const { v4: uuidv4 } = require('uuid')
const { getDatabase } = require('../config/database')
const { authenticateLocal, requireMFA, checkSessionTimeout } = require('../middleware/auth')
const { checkUserCap, canAddUserToHousehold, sendUserLimitAlerts } = require('../middleware/userCap')
const logger = require('../config/logger')
const { sendEmail } = require('../services/emailService')
const { sendSMS } = require('../services/smsService')

const router = express.Router()

// Generate JWT tokens
const generateTokens = (user) => {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
  }

  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: '15m',
  })

  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: '7d',
  })

  return { accessToken, refreshToken }
}

// Register new user
router.post('/register', checkUserCap, async (req, res) => {
  try {
    const { email, username, password, firstName, lastName, phone, inviteCode } = req.body

    // Validate input
    if (!email || !username || !password || !firstName || !lastName) {
      return res.status(400).json({ error: 'All required fields must be provided' })
    }

    // Check password strength
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' })
    }

    const db = getDatabase()

    // Check if user already exists
    const existingUser = await db('users')
      .where({ email: email.toLowerCase() })
      .orWhere({ username })
      .first()

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this email or username' })
    }

    // Hash password
    const saltRounds = 12
    const passwordHash = await bcrypt.hash(password, saltRounds)

    // Create user
    const [newUser] = await db('users')
      .insert({
        email: email.toLowerCase(),
        username,
        password_hash: passwordHash,
        first_name: firstName,
        last_name: lastName,
        phone,
        role: 'user',
        is_active: true,
      })
      .returning(['id', 'email', 'username', 'first_name', 'last_name', 'role', 'created_at'])

    // Create default household for the user
    const [household] = await db('households')
      .insert({
        name: `${firstName}'s Household`,
        description: 'Default household',
        owner_id: newUser.id,
        is_active: true,
      })
      .returning(['id', 'name'])

    // Add user as admin to their household
    await db('household_members').insert({
      household_id: household.id,
      user_id: newUser.id,
      role: 'admin',
      permissions: 'full',
      can_invite: true,
    })

    // Generate email verification token
    const verificationToken = jwt.sign(
      { userId: newUser.id, type: 'email_verification' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    )

    // Send welcome email with verification link
    await sendEmail({
      to: newUser.email,
      subject: 'Welcome to Fire Finance! Please verify your email',
      template: 'welcome',
      data: {
        firstName: newUser.first_name,
        verificationToken,
        appUrl: process.env.FRONTEND_WEB_URL,
      },
    })

    // Check if approaching user limit and alert admins
    if (req.userCount >= req.maxUsers - 1) {
      await sendUserLimitAlerts(household.id, req.userCount + 1, req.maxUsers)
    }

    logger.info(`New user registered: ${newUser.email}`)

    res.status(201).json({
      message: 'User registered successfully. Please check your email for verification.',
      user: {
        id: newUser.id,
        email: newUser.email,
        username: newUser.username,
        firstName: newUser.first_name,
        lastName: newUser.last_name,
        role: newUser.role,
        household: household,
      },
    })
  } catch (error) {
    logger.error('Registration error:', error)
    res.status(500).json({ error: 'Registration failed' })
  }
})

// Login
router.post('/login', authenticateLocal, async (req, res) => {
  try {
    const { mfa_token } = req.body
    const user = req.user

    // Check if MFA is enabled and required
    if (user.mfa_enabled) {
      if (!mfa_token) {
        return res.status(401).json({
          error: 'MFA_REQUIRED',
          message: 'Multi-factor authentication is required',
        })
      }

      // Verify MFA token
      const verified = speakeasy.totp.verify({
        secret: user.mfa_secret,
        encoding: 'base32',
        token: mfa_token,
        window: 2,
      })

      if (!verified) {
        // Check recovery codes
        const db = getDatabase()
        const recoveryCodes = JSON.parse(user.mfa_recovery_codes || '[]')
        const usedCodeIndex = recoveryCodes.indexOf(mfa_token)

        if (usedCodeIndex !== -1) {
          // Remove used recovery code
          recoveryCodes.splice(usedCodeIndex, 1)
          await db('users').where({ id: user.id }).update({
            mfa_recovery_codes: JSON.stringify(recoveryCodes),
          })
        } else {
          return res.status(401).json({ error: 'Invalid MFA token' })
        }
      }
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user)

    // Store refresh token in database
    const db = getDatabase()
    await db('user_refresh_tokens').insert({
      id: uuidv4(),
      user_id: user.id,
      token: refreshToken,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      created_at: new Date(),
    })

    // Get user's households
    const households = await db('household_members')
      .join('households', 'household_members.household_id', 'households.id')
      .where({ 'household_members.user_id': user.id, 'household_members.is_active': true })
      .select('households.id', 'households.name', 'household_members.role', 'household_members.permissions')

    logger.info(`User logged in: ${user.email}`)

    res.json({
      message: 'Login successful',
      tokens: {
        accessToken,
        refreshToken,
        tokenType: 'Bearer',
        expiresIn: 900, // 15 minutes
      },
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        mfaEnabled: user.mfa_enabled,
        households,
      },
    })
  } catch (error) {
    logger.error('Login error:', error)
    res.status(500).json({ error: 'Login failed' })
  }
})

// Refresh token
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body

    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token is required' })
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET)
    const db = getDatabase()

    // Check if refresh token exists in database
    const storedToken = await db('user_refresh_tokens')
      .where({ token: refreshToken, user_id: decoded.id })
      .where('expires_at', '>', new Date())
      .first()

    if (!storedToken) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' })
    }

    // Get user
    const user = await db('users').where({ id: decoded.id, is_active: true }).first()
    if (!user) {
      return res.status(401).json({ error: 'User not found' })
    }

    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user)

    // Update refresh token in database
    await db('user_refresh_tokens')
      .where({ id: storedToken.id })
      .update({
        token: newRefreshToken,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })

    res.json({
      tokens: {
        accessToken,
        refreshToken: newRefreshToken,
        tokenType: 'Bearer',
        expiresIn: 900,
      },
    })
  } catch (error) {
    logger.error('Token refresh error:', error)
    res.status(401).json({ error: 'Invalid or expired refresh token' })
  }
})

// Logout
router.post('/logout', authenticateJWT, async (req, res) => {
  try {
    const { refreshToken } = req.body
    const db = getDatabase()

    if (refreshToken) {
      // Remove refresh token from database
      await db('user_refresh_tokens').where({ token: refreshToken }).del()
    }

    logger.info(`User logged out: ${req.user.email}`)

    res.json({ message: 'Logout successful' })
  } catch (error) {
    logger.error('Logout error:', error)
    res.status(500).json({ error: 'Logout failed' })
  }
})

// Setup MFA
router.post('/mfa/setup', authenticateJWT, async (req, res) => {
  try {
    const user = req.user

    if (user.mfa_enabled) {
      return res.status(400).json({ error: 'MFA is already enabled' })
    }

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `Fire Finance (${user.email})`,
      issuer: 'Fire Finance',
    })

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url)

    // Generate backup codes
    const backupCodes = Array.from({ length: 10 }, () => 
      Math.random().toString(36).substring(2, 10).toUpperCase()
    )

    res.json({
      secret: secret.base32,
      qrCode: qrCodeUrl,
      backupCodes,
    })
  } catch (error) {
    logger.error('MFA setup error:', error)
    res.status(500).json({ error: 'MFA setup failed' })
  }
})

// Enable MFA
router.post('/mfa/enable', authenticateJWT, async (req, res) => {
  try {
    const { secret, token, backupCodes } = req.body
    const user = req.user

    if (user.mfa_enabled) {
      return res.status(400).json({ error: 'MFA is already enabled' })
    }

    // Verify token
    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 2,
    })

    if (!verified) {
      return res.status(400).json({ error: 'Invalid verification code' })
    }

    // Enable MFA
    const db = getDatabase()
    await db('users').where({ id: user.id }).update({
      mfa_secret: secret,
      mfa_enabled: true,
      mfa_recovery_codes: JSON.stringify(backupCodes),
    })

    logger.info(`MFA enabled for user: ${user.email}`)

    res.json({ message: 'MFA enabled successfully' })
  } catch (error) {
    logger.error('MFA enable error:', error)
    res.status(500).json({ error: 'Failed to enable MFA' })
  }
})

// Verify email
router.get('/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    if (decoded.type !== 'email_verification') {
      return res.status(400).json({ error: 'Invalid verification token' })
    }

    const db = getDatabase()
    await db('users').where({ id: decoded.userId }).update({
      email_verified: true,
    })

    logger.info(`Email verified for user: ${decoded.userId}`)

    res.json({ message: 'Email verified successfully' })
  } catch (error) {
    logger.error('Email verification error:', error)
    res.status(400).json({ error: 'Invalid or expired verification token' })
  }
})

// Request password reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({ error: 'Email is required' })
    }

    const db = getDatabase()
    const user = await db('users').where({ email: email.toLowerCase(), is_active: true }).first()

    if (!user) {
      // Don't reveal if user exists or not
      return res.json({ message: 'If an account exists with this email, a password reset link has been sent' })
    }

    // Generate reset token
    const resetToken = jwt.sign(
      { userId: user.id, type: 'password_reset' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    )

    // Send reset email
    await sendEmail({
      to: user.email,
      subject: 'Password Reset Request',
      template: 'password-reset',
      data: {
        firstName: user.first_name,
        resetToken,
        appUrl: process.env.FRONTEND_WEB_URL,
      },
    })

    logger.info(`Password reset requested for user: ${user.email}`)

    res.json({ message: 'If an account exists with this email, a password reset link has been sent' })
  } catch (error) {
    logger.error('Password reset request error:', error)
    res.status(500).json({ error: 'Failed to process password reset request' })
  }
})

// Reset password
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { token } = req.params
    const { password } = req.body

    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    if (decoded.type !== 'password_reset') {
      return res.status(400).json({ error: 'Invalid reset token' })
    }

    const db = getDatabase()
    const user = await db('users').where({ id: decoded.userId, is_active: true }).first()

    if (!user) {
      return res.status(400).json({ error: 'Invalid reset token' })
    }

    // Hash new password
    const saltRounds = 12
    const passwordHash = await bcrypt.hash(password, saltRounds)

    // Update password
    await db('users').where({ id: user.id }).update({
      password_hash: passwordHash,
    })

    // Invalidate all existing refresh tokens
    await db('user_refresh_tokens').where({ user_id: user.id }).del()

    logger.info(`Password reset completed for user: ${user.email}`)

    res.json({ message: 'Password reset successful' })
  } catch (error) {
    logger.error('Password reset error:', error)
    res.status(400).json({ error: 'Invalid or expired reset token' })
  }
})

module.exports = router