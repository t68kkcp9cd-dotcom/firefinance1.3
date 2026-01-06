const { checkUserCap, canAddUserToHousehold, getHouseholdUserStats } = require('../../middleware/userCap')
const { getDatabase } = require('../../config/database')

// Mock database
jest.mock('../../config/database', () => ({
  getDatabase: jest.fn()
}))

describe('User Cap Middleware', () => {
  let mockDb
  let mockReq
  let mockRes
  let mockNext

  beforeEach(() => {
    mockDb = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      count: jest.fn().mockReturnThis(),
      first: jest.fn(),
      leftJoin: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis()
    }
    
    getDatabase.mockReturnValue(mockDb)
    
    mockReq = {
      user: { id: 'user-1' },
      body: {},
      params: {},
      userCount: 0,
      maxUsers: 5
    }
    
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    }
    
    mockNext = jest.fn()
    
    // Set environment variable
    process.env.MAX_USERS = '5'
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('checkUserCap', () => {
    it('should allow user when under limit', async () => {
      mockDb.first.mockResolvedValue({ count: '3' })
      mockReq.body.householdId = 'household-1'

      await checkUserCap(mockReq, mockRes, mockNext)

      expect(mockDb.where).toHaveBeenCalledWith({
        household_id: 'household-1',
        is_active: true
      })
      expect(mockNext).toHaveBeenCalled()
      expect(mockReq.userCount).toBe(3)
      expect(mockReq.maxUsers).toBe(5)
    })

    it('should reject when at limit', async () => {
      mockDb.first.mockResolvedValue({ count: '5' })
      mockReq.body.householdId = 'household-1'

      await checkUserCap(mockReq, mockRes, mockNext)

      expect(mockRes.status).toHaveBeenCalledWith(403)
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'User limit reached',
        message: 'Maximum 5 users allowed per household. Please contact an admin to remove inactive users.',
        currentUsers: 5,
        maxUsers: 5
      })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should reject when over limit', async () => {
      mockDb.first.mockResolvedValue({ count: '6' })
      mockReq.body.householdId = 'household-1'

      await checkUserCap(mockReq, mockRes, mockNext)

      expect(mockRes.status).toHaveBeenCalledWith(403)
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should handle missing household ID', async () => {
      await checkUserCap(mockReq, mockRes, mockNext)

      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Household ID is required'
      })
    })

    it('should handle database error', async () => {
      mockDb.first.mockRejectedValue(new Error('Database error'))
      mockReq.body.householdId = 'household-1'

      await checkUserCap(mockReq, mockRes, mockNext)

      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to check user limit'
      })
    })
  })

  describe('canAddUserToHousehold', () => {
    it('should return capacity information', async () => {
      mockDb.first.mockResolvedValue({ count: '2' })

      const result = await canAddUserToHousehold('household-1')

      expect(result).toEqual({
        canAdd: true,
        currentUsers: 2,
        maxUsers: 5,
        remainingSlots: 3
      })
    })

    it('should return false when at capacity', async () => {
      mockDb.first.mockResolvedValue({ count: '5' })

      const result = await canAddUserToHousehold('household-1')

      expect(result).toEqual({
        canAdd: false,
        currentUsers: 5,
        maxUsers: 5,
        remainingSlots: 0
      })
    })

    it('should handle database error', async () => {
      mockDb.first.mockRejectedValue(new Error('Database error'))

      await expect(canAddUserToHousehold('household-1')).rejects.toThrow('Database error')
    })
  })

  describe('getHouseholdUserStats', () => {
    it('should return detailed user statistics', async () => {
      const mockUsers = [
        {
          id: 'user-1',
          email: 'admin@example.com',
          username: 'admin',
          first_name: 'Admin',
          last_name: 'User',
          last_login: new Date(),
          role: 'admin',
          permissions: 'full',
          joined_at: new Date('2024-01-01'),
          is_active: true
        },
        {
          id: 'user-2',
          email: 'member@example.com',
          username: 'member',
          first_name: 'Member',
          last_name: 'User',
          last_login: new Date(),
          role: 'member',
          permissions: 'read_write',
          joined_at: new Date('2024-01-02'),
          is_active: true
        },
        {
          id: 'user-3',
          email: 'inactive@example.com',
          username: 'inactive',
          first_name: 'Inactive',
          last_name: 'User',
          last_login: null,
          role: 'member',
          permissions: 'read_write',
          joined_at: new Date('2024-01-03'),
          is_active: false
        }
      ]

      mockDb.select.mockReturnThis()
      mockDb.where.mockReturnThis()
      mockDb.orderBy.mockReturnThis()
      mockDb.then = (callback) => callback(mockUsers)

      const result = await getHouseholdUserStats('household-1')

      expect(result).toEqual({
        totalUsers: 3,
        activeUsers: 2,
        inactiveUsers: 1,
        maxUsers: 5,
        remainingSlots: 3,
        utilization: 40,
        users: {
          active: mockUsers.filter(u => u.is_active),
          inactive: mockUsers.filter(u => !u.is_active)
        },
        warnings: {
          nearLimit: false,
          atLimit: false,
          overLimit: false
        }
      })
    })

    it('should handle empty household', async () => {
      mockDb.select.mockReturnThis()
      mockDb.where.mockReturnThis()
      mockDb.orderBy.mockReturnThis()
      mockDb.then = (callback) => callback([])

      const result = await getHouseholdUserStats('household-1')

      expect(result).toEqual({
        totalUsers: 0,
        activeUsers: 0,
        inactiveUsers: 0,
        maxUsers: 5,
        remainingSlots: 5,
        utilization: 0,
        users: { active: [], inactive: [] },
        warnings: {
          nearLimit: false,
          atLimit: false,
          overLimit: false
        }
      })
    })

    it('should detect when approaching limit', async () => {
      const mockUsers = Array(4).fill({
        id: 'user',
        email: 'user@example.com',
        username: 'user',
        first_name: 'User',
        last_name: 'Name',
        last_login: new Date(),
        role: 'member',
        permissions: 'read_write',
        joined_at: new Date(),
        is_active: true
      })

      mockDb.select.mockReturnThis()
      mockDb.where.mockReturnThis()
      mockDb.orderBy.mockReturnThis()
      mockDb.then = (callback) => callback(mockUsers)

      const result = await getHouseholdUserStats('household-1')

      expect(result.warnings.nearLimit).toBe(true)
      expect(result.warnings.atLimit).toBe(false)
      expect(result.warnings.overLimit).toBe(false)
    })

    it('should detect when at limit', async () => {
      const mockUsers = Array(5).fill({
        id: 'user',
        email: 'user@example.com',
        username: 'user',
        first_name: 'User',
        last_name: 'Name',
        last_login: new Date(),
        role: 'member',
        permissions: 'read_write',
        joined_at: new Date(),
        is_active: true
      })

      mockDb.select.mockReturnThis()
      mockDb.where.mockReturnThis()
      mockDb.orderBy.mockReturnThis()
      mockDb.then = (callback) => callback(mockUsers)

      const result = await getHouseholdUserStats('household-1')

      expect(result.warnings.nearLimit).toBe(true)
      expect(result.warnings.atLimit).toBe(true)
      expect(result.warnings.overLimit).toBe(false)
    })

    it('should detect when over limit', async () => {
      const mockUsers = Array(6).fill({
        id: 'user',
        email: 'user@example.com',
        username: 'user',
        first_name: 'User',
        last_name: 'Name',
        last_login: new Date(),
        role: 'member',
        permissions: 'read_write',
        joined_at: new Date(),
        is_active: true
      })

      mockDb.select.mockReturnThis()
      mockDb.where.mockReturnThis()
      mockDb.orderBy.mockReturnThis()
      mockDb.then = (callback) => callback(mockUsers)

      const result = await getHouseholdUserStats('household-1')

      expect(result.warnings.nearLimit).toBe(true)
      expect(result.warnings.atLimit).toBe(true)
      expect(result.warnings.overLimit).toBe(true)
    })
  })
})

describe('User Cap Integration', () => {
  it('should enforce cap across multiple operations', async () => {
    const householdId = 'household-1'
    const mockDb = {
      count: jest.fn().mockReturnThis(),
      first: jest.fn()
    }
    
    getDatabase.mockReturnValue(mockDb)
    
    // Simulate adding users until limit
    for (let i = 0; i < 5; i++) {
      mockDb.first.mockResolvedValueOnce({ count: i.toString() })
      
      const canAdd = await canAddUserToHousehold(householdId)
      expect(canAdd.canAdd).toBe(true)
    }
    
    // Try to add 6th user (should fail)
    mockDb.first.mockResolvedValueOnce({ count: '5' })
    
    const canAdd = await canAddUserToHousehold(householdId)
    expect(canAdd.canAdd).toBe(false)
    expect(canAdd.remainingSlots).toBe(0)
  })

  it('should handle concurrent user additions', async () => {
    const householdId = 'household-1'
    const mockDb = {
      count: jest.fn().mockReturnThis(),
      first: jest.fn()
    }
    
    getDatabase.mockReturnValue(mockDb)
    
    // Simulate race condition
    mockDb.first.mockResolvedValue({ count: '4' })
    
    // Multiple concurrent checks should all see 4 users
    const results = await Promise.all([
      canAddUserToHousehold(householdId),
      canAddUserToHousehold(householdId),
      canAddUserToHousehold(householdId)
    ])
    
    results.forEach(result => {
      expect(result.canAdd).toBe(true)
      expect(result.remainingSlots).toBe(1)
    })
  })
})

describe('Environment Configuration', () => {
  it('should use default max users when env var not set', async () => {
    delete process.env.MAX_USERS
    
    mockDb.first.mockResolvedValue({ count: '5' })
    
    const result = await canAddUserToHousehold('household-1')
    
    expect(result.maxUsers).toBe(5)
    expect(result.canAdd).toBe(false)
  })

  it('should use custom max users when env var is set', async () => {
    process.env.MAX_USERS = '10'
    
    mockDb.first.mockResolvedValue({ count: '5' })
    
    const result = await canAddUserToHousehold('household-1')
    
    expect(result.maxUsers).toBe(10)
    expect(result.canAdd).toBe(true)
    expect(result.remainingSlots).toBe(5)
  })
})

describe('Error Handling', () => {
  it('should handle database connection errors gracefully', async () => {
    mockDb.first.mockRejectedValue(new Error('Connection timeout'))
    
    await expect(getHouseholdUserStats('household-1')).rejects.toThrow('Connection timeout')
  })

  it('should handle malformed user data', async () => {
    const mockUsers = [
      {
        id: 'user-1',
        email: 'admin@example.com',
        // Missing required fields
        is_active: true
      }
    ]

    mockDb.select.mockReturnThis()
    mockDb.where.mockReturnThis()
    mockDb.orderBy.mockReturnThis()
    mockDb.then = (callback) => callback(mockUsers)

    const result = await getHouseholdUserStats('household-1')

    expect(result.totalUsers).toBe(1)
    expect(result.activeUsers).toBe(1)
    expect(result.users.active[0].username).toBeUndefined()
  })
})

describe('Performance', () => {
  it('should handle large numbers of users efficiently', async () => {
    const largeUserCount = 1000
    const mockUsers = Array(largeUserCount).fill({
      id: 'user',
      email: 'user@example.com',
      username: 'user',
      first_name: 'User',
      last_name: 'Name',
      last_login: new Date(),
      role: 'member',
      permissions: 'read_write',
      joined_at: new Date(),
      is_active: true
    })

    mockDb.select.mockReturnThis()
    mockDb.where.mockReturnThis()
    mockDb.orderBy.mockReturnThis()
    mockDb.then = (callback) => callback(mockUsers)

    const startTime = Date.now()
    const result = await getHouseholdUserStats('household-1')
    const endTime = Date.now()

    expect(result.totalUsers).toBe(largeUserCount)
    expect(result.activeUsers).toBe(largeUserCount)
    expect(result.warnings.overLimit).toBe(true)
    expect(endTime - startTime).toBeLessThan(100) // Should complete in under 100ms
  })
})

describe('Security', () => {
  it('should prevent SQL injection in household ID', async () => {
    const maliciousId = "'; DROP TABLE users; --"
    
    mockDb.first.mockResolvedValue({ count: '0' })
    
    await canAddUserToHousehold(maliciousId)
    
    // Verify the malicious input was properly parameterized
    expect(mockDb.where).toHaveBeenCalledWith({
      household_id: maliciousId,
      is_active: true
    })
  })

  it('should handle special characters in user data', async () => {
    const specialChars = [
      { id: 'user-1', first_name: 'O\'Reilly', last_name: 'User' },
      { id: 'user-2', first_name: 'John\nDoe', last_name: 'User' },
      { id: 'user-3', first_name: 'Jane"Doe', last_name: 'User' },
      { id: 'user-4', first_name: 'Bob\tSmith', last_name: 'User' }
    ]

    mockDb.select.mockReturnThis()
    mockDb.where.mockReturnThis()
    mockDb.orderBy.mockReturnThis()
    mockDb.then = (callback) => callback(specialChars)

    const result = await getHouseholdUserStats('household-1')

    expect(result.totalUsers).toBe(4)
    expect(result.activeUsers).toBe(4)
    expect(result.users.active[0].first_name).toBe("O'Reilly")
  })
})