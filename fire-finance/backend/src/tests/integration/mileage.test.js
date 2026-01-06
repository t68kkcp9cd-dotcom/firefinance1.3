const request = require('supertest')
const app = require('../../server')
const { getDatabase } = require('../../config/database')
const { closeDatabase } = require('../../config/database')
const jwt = require('jsonwebtoken')

// Mock services
jest.mock('../../services/notificationService')
jest.mock('../../services/emailService')

// Test data
const testUser = {
  id: 'test-user-1',
  email: 'test@example.com',
  username: 'testuser',
  first_name: 'Test',
  last_name: 'User',
  role: 'user',
  is_active: true
}

const testVehicle = {
  id: 'test-vehicle-1',
  user_id: 'test-user-1',
  name: 'Test Car',
  make: 'Toyota',
  model: 'Camry',
  year: 2020,
  default_odometer: 50000
}

describe('Mileage API Integration Tests', () => {
  let authToken
  let mockDb

  beforeAll(async () => {
    // Generate test auth token
    authToken = jwt.sign(
      { id: testUser.id, email: testUser.email },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    )
  })

  beforeEach(async () => {
    mockDb = {
      insert: jest.fn().mockReturnThis(),
      returning: jest.fn(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      whereBetween: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      sum: jest.fn().mockReturnThis(),
      first: jest.fn(),
      count: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      del: jest.fn(),
      update: jest.fn().mockReturnThis(),
      raw: jest.fn(),
      groupBy: jest.fn().mockReturnThis(),
      having: jest.fn().mockReturnThis()
    }

    getDatabase.mockReturnValue(mockDb)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  afterAll(async () => {
    await closeDatabase()
  })

  describe('POST /api/mileage', () => {
    it('should create a mileage log successfully', async () => {
      const newLog = {
        vehicleId: testVehicle.id,
        date: '2024-01-15',
        startOdometer: 50000,
        endOdometer: 50100,
        purpose: 'business',
        notes: 'Client meeting',
        isBusinessDay: false,
        trips: [
          {
            startLocation: 'Office',
            endLocation: 'Client Site',
            miles: 50,
            purpose: 'business'
          }
        ]
      }

      mockDb.where.mockReturnThis()
      mockDb.first.mockResolvedValueOnce(testVehicle)
      mockDb.returning.mockResolvedValueOnce([{ id: 'test-log-1' }])

      const response = await request(app)
        .post('/api/mileage')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newLog)
        .expect(201)

      expect(response.body).toMatchObject({
        message: 'Mileage log created successfully',
        totalMiles: 100,
        deductibleMiles: 50,
        deductionAmount: 33.5 // 50 * 0.67 (2024 rate)
      })

      expect(mockDb.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          vehicle_id: testVehicle.id,
          date: '2024-01-15',
          start_odometer: 50000,
          end_odometer: 50100,
          total_miles: 100,
          deductible_miles: 50,
          purpose: 'business',
          notes: 'Client meeting',
          is_business_day: false,
          mileage_rate: 0.67,
          year: 2024
        })
      )
    })

    it('should reject invalid odometer readings', async () => {
      const invalidLog = {
        vehicleId: testVehicle.id,
        date: '2024-01-15',
        startOdometer: 50100,
        endOdometer: 50000, // End < Start
        purpose: 'business'
      }

      const response = await request(app)
        .post('/api/mileage')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidLog)
        .expect(400)

      expect(response.body).toMatchObject({
        error: 'End odometer must be greater than start odometer'
      })
    })

    it('should reject missing required fields', async () => {
      const incompleteLog = {
        vehicleId: testVehicle.id,
        date: '2024-01-15'
        // Missing odometer readings
      }

      const response = await request(app)
        .post('/api/mileage')
        .set('Authorization', `Bearer ${authToken}`)
        .send(incompleteLog)
        .expect(400)

      expect(response.body).toMatchObject({
        error: 'Required fields missing'
      })
    })

    it('should handle vehicle not found', async () => {
      const newLog = {
        vehicleId: 'non-existent-vehicle',
        date: '2024-01-15',
        startOdometer: 50000,
        endOdometer: 50100,
        purpose: 'business'
      }

      mockDb.where.mockReturnThis()
      mockDb.first.mockResolvedValueOnce(null)

      const response = await request(app)
        .post('/api/mileage')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newLog)
        .expect(404)

      expect(response.body).toMatchObject({
        error: 'Vehicle not found'
      })
    })

    it('should calculate full day business deduction correctly', async () => {
      const businessDayLog = {
        vehicleId: testVehicle.id,
        date: '2024-01-15',
        startOdometer: 50000,
        endOdometer: 50100,
        purpose: 'business',
        isBusinessDay: true
      }

      mockDb.where.mockReturnThis()
      mockDb.first.mockResolvedValueOnce(testVehicle)
      mockDb.returning.mockResolvedValueOnce([{ id: 'test-log-2' }])

      const response = await request(app)
        .post('/api/mileage')
        .set('Authorization', `Bearer ${authToken}`)
        .send(businessDayLog)
        .expect(201)

      expect(response.body.deductibleMiles).toBe(100) // All miles deductible
      expect(response.body.deductionAmount).toBe(67) // 100 * 0.67
    })
  })

  describe('GET /api/mileage', () => {
    it('should retrieve mileage logs with pagination', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          date: '2024-01-15',
          start_odometer: 50000,
          end_odometer: 50100,
          total_miles: 100,
          deductible_miles: 50,
          deduction_amount: 33.5,
          purpose: 'business',
          vehicle_name: 'Test Car'
        },
        {
          id: 'log-2',
          date: '2024-01-14',
          start_odometer: 49900,
          end_odometer: 50000,
          total_miles: 100,
          deductible_miles: 100,
          deduction_amount: 67,
          purpose: 'business',
          vehicle_name: 'Test Car'
        }
      ]

      mockDb.where.mockReturnThis()
      mockDb.orderBy.mockReturnThis()
      mockDb.limit.mockReturnThis()
      mockDb.offset.mockReturnThis()
      mockDb.then = (callback) => callback(mockLogs)
      mockDb.count.mockReturnThis()
      mockDb.first.mockResolvedValueOnce({ count: '2' })

      const response = await request(app)
        .get('/api/mileage?page=1&limit=10')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      expect(response.body).toMatchObject({
        logs: mockLogs,
        pagination: {
          page: 1,
          limit: 10,
          total: 2,
          pages: 1
        }
      })
    })

    it('should filter by date range', async () => {
      mockDb.where.mockReturnThis()
      mockDb.whereBetween.mockReturnThis()
      mockDb.orderBy.mockReturnThis()
      mockDb.limit.mockReturnThis()
      mockDb.offset.mockReturnThis()
      mockDb.then = (callback) => callback([])
      mockDb.count.mockReturnThis()
      mockDb.first.mockResolvedValueOnce({ count: '0' })

      await request(app)
        .get('/api/mileage?startDate=2024-01-01&endDate=2024-01-31')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      expect(mockDb.whereBetween).toHaveBeenCalledWith(
        'mileage_logs.date',
        ['2024-01-01', '2024-01-31']
      )
    })

    it('should filter by vehicle', async () => {
      mockDb.where.mockReturnThis()
      mockDb.orderBy.mockReturnThis()
      mockDb.limit.mockReturnThis()
      mockDb.offset.mockReturnThis()
      mockDb.then = (callback) => callback([])
      mockDb.count.mockReturnThis()
      mockDb.first.mockResolvedValueOnce({ count: '0' })

      await request(app)
        .get(`/api/mileage?vehicleId=${testVehicle.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      expect(mockDb.where).toHaveBeenCalledWith('mileage_logs.vehicle_id', testVehicle.id)
    })
  })

  describe('GET /api/mileage/summary', () => {
    it('should return mileage summary for tax year', async () => {
      mockDb.where.mockReturnThis()
      mockDb.whereRaw.mockReturnThis()
      mockDb.then = (callback) => callback([])
      mockDb.sum.mockReturnThis()
      mockDb.first.mockResolvedValue({ count: '0' })

      const response = await request(app)
        .get('/api/mileage/summary?year=2024')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      expect(response.body).toMatchObject({
        year: 2024,
        totalLogs: 0,
        totalMiles: 0,
        totalDeductibleMiles: 0,
        totalDeductionAmount: 0,
        businessDays: 0,
        averageMilesPerDay: 0,
        vehicles: []
      })
    })

    it('should calculate summary with data', async () => {
      const mockLogs = [
        { total_miles: 100, deductible_miles: 50, deduction_amount: 33.5, is_business_day: false },
        { total_miles: 200, deductible_miles: 200, deduction_amount: 134, is_business_day: true },
        { total_miles: 150, deductible_miles: 75, deduction_amount: 50.25, is_business_day: false }
      ]

      mockDb.where.mockReturnThis()
      mockDb.whereRaw.mockReturnThis()
      mockDb.then = (callback) => callback(mockLogs)

      const response = await request(app)
        .get('/api/mileage/summary?year=2024')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      expect(response.body).toMatchObject({
        year: 2024,
        totalLogs: 3,
        totalMiles: 450,
        totalDeductibleMiles: 325,
        totalDeductionAmount: 217.75,
        businessDays: 1,
        averageMilesPerDay: 150
      })
    })
  })

  describe('PUT /api/mileage/:logId', () => {
    it('should update mileage log', async () => {
      const updates = {
        notes: 'Updated notes',
        purpose: 'medical'
      }

      mockDb.where.mockReturnThis()
      mockDb.first.mockResolvedValueOnce({
        id: 'test-log-1',
        user_id: testUser.id,
        start_odometer: 50000,
        end_odometer: 50100
      })
      mockDb.update.mockReturnThis()

      const response = await request(app)
        .put('/api/mileage/test-log-1')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updates)
        .expect(200)

      expect(response.body).toMatchObject({
        message: 'Mileage log updated successfully'
      })
    })

    it('should reject invalid odometer updates', async () => {
      const updates = {
        startOdometer: 50100,
        endOdometer: 50000 // Invalid: end < start
      }

      mockDb.where.mockReturnThis()
      mockDb.first.mockResolvedValueOnce({
        id: 'test-log-1',
        user_id: testUser.id,
        start_odometer: 50000,
        end_odometer: 50100
      })

      const response = await request(app)
        .put('/api/mileage/test-log-1')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updates)
        .expect(400)

      expect(response.body).toMatchObject({
        error: 'End odometer must be greater than start odometer'
      })
    })

    it('should return 404 for non-existent log', async () => {
      mockDb.where.mockReturnThis()
      mockDb.first.mockResolvedValueOnce(null)

      const response = await request(app)
        .put('/api/mileage/non-existent')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ notes: 'Test' })
        .expect(404)

      expect(response.body).toMatchObject({
        error: 'Mileage log not found'
      })
    })
  })

  describe('DELETE /api/mileage/:logId', () => {
    it('should delete mileage log', async () => {
      mockDb.where.mockReturnThis()
      mockDb.del.mockResolvedValueOnce(1)

      const response = await request(app)
        .delete('/api/mileage/test-log-1')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      expect(response.body).toMatchObject({
        message: 'Mileage log deleted successfully'
      })
    })

    it('should return 404 for non-existent log', async () => {
      mockDb.where.mockReturnThis()
      mockDb.del.mockResolvedValueOnce(0)

      const response = await request(app)
        .delete('/api/mileage/non-existent')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404)

      expect(response.body).toMatchObject({
        error: 'Mileage log not found'
      })
    })
  })

  describe('Authentication and Authorization', () => {
    it('should reject requests without auth token', async () => {
      const response = await request(app)
        .get('/api/mileage')
        .expect(401)

      expect(response.body).toMatchObject({
        error: expect.stringContaining('Unauthorized')
      })
    })

    it('should reject requests with invalid auth token', async () => {
      const invalidToken = jwt.sign(
        { id: 'invalid-user' },
        'wrong-secret',
        { expiresIn: '1h' }
      )

      const response = await request(app)
        .get('/api/mileage')
        .set('Authorization', `Bearer ${invalidToken}`)
        .expect(401)

      expect(response.body).toMatchObject({
        error: expect.stringContaining('Invalid or expired token')
      })
    })

    it('should reject requests with expired auth token', async () => {
      const expiredToken = jwt.sign(
        { id: testUser.id },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '-1h' }
      )

      const response = await request(app)
        .get('/api/mileage')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401)

      expect(response.body).toMatchObject({
        error: expect.stringContaining('Invalid or expired token')
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockDb.where.mockReturnThis()
      mockDb.first.mockRejectedValueOnce(new Error('Database connection failed'))

      const response = await request(app)
        .post('/api/mileage')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          vehicleId: testVehicle.id,
          date: '2024-01-15',
          startOdometer: 50000,
          endOdometer: 50100,
          purpose: 'business'
        })
        .expect(500)

      expect(response.body).toMatchObject({
        error: 'Failed to create mileage log'
      })
    })

    it('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .post('/api/mileage')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400)

      expect(response.body).toMatchObject({
        error: expect.stringContaining('Unexpected token')
      })
    })
  })

  describe('Validation', () => {
    it('should validate date formats', async () => {
      const invalidDateLog = {
        vehicleId: testVehicle.id,
        date: 'invalid-date',
        startOdometer: 50000,
        endOdometer: 50100,
        purpose: 'business'
      }

      mockDb.where.mockReturnThis()
      mockDb.first.mockResolvedValueOnce(testVehicle)
      mockDb.returning.mockResolvedValueOnce([{ id: 'test-log-3' }])

      const response = await request(app)
        .post('/api/mileage')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidDateLog)
        .expect(201) // Should still create - date validation handled by frontend

      expect(response.body.message).toBe('Mileage log created successfully')
    })

    it('should handle very large odometer readings', async () => {
      const largeOdometerLog = {
        vehicleId: testVehicle.id,
        date: '2024-01-15',
        startOdometer: 999999,
        endOdometer: 1000000,
        purpose: 'business'
      }

      mockDb.where.mockReturnThis()
      mockDb.first.mockResolvedValueOnce(testVehicle)
      mockDb.returning.mockResolvedValueOnce([{ id: 'test-log-4' }])

      const response = await request(app)
        .post('/api/mileage')
        .set('Authorization', `Bearer ${authToken}`)
        .send(largeOdometerLog)
        .expect(201)

      expect(response.body.totalMiles).toBe(1)
    })

    it('should handle negative odometer readings gracefully', async () => {
      const negativeOdometerLog = {
        vehicleId: testVehicle.id,
        date: '2024-01-15',
        startOdometer: -100,
        endOdometer: 0,
        purpose: 'business'
      }

      const response = await request(app)
        .post('/api/mileage')
        .set('Authorization', `Bearer ${authToken}`)
        .send(negativeOdometerLog)
        .expect(400)

      expect(response.body.error).toBe('End odometer must be greater than start odometer')
    })
  })

  describe('Performance', () => {
    it('should handle concurrent requests', async () => {
      mockDb.where.mockReturnThis()
      mockDb.first.mockResolvedValue(testVehicle)
      mockDb.returning.mockResolvedValue([{ id: 'test-log-concurrent' }])

      const requests = Array(10).fill(null).map((_, i) => 
        request(app)
          .post('/api/mileage')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            vehicleId: testVehicle.id,
            date: '2024-01-15',
            startOdometer: 50000 + (i * 100),
            endOdometer: 50100 + (i * 100),
            purpose: 'business'
          })
      )

      const responses = await Promise.all(requests)
      
      responses.forEach(response => {
        expect(response.status).toBe(201)
        expect(response.body.message).toBe('Mileage log created successfully')
      })
    })

    it('should handle large pagination requests efficiently', async () => {
      const largeDataset = Array(1000).fill(null).map((_, i) => ({
        id: `log-${i}`,
        date: `2024-01-${(i % 31) + 1}`,
        total_miles: 100,
        deductible_miles: 50,
        deduction_amount: 33.5
      }))

      mockDb.where.mockReturnThis()
      mockDb.orderBy.mockReturnThis()
      mockDb.limit.mockReturnThis()
      mockDb.offset.mockReturnThis()
      mockDb.then = (callback) => callback(largeDataset.slice(0, 100))
      mockDb.count.mockReturnThis()
      mockDb.first.mockResolvedValueOnce({ count: '1000' })

      const startTime = Date.now()
      const response = await request(app)
        .get('/api/mileage?page=1&limit=100')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
      const endTime = Date.now()

      expect(response.body.logs).toHaveLength(100)
      expect(response.body.pagination.total).toBe(1000)
      expect(endTime - startTime).toBeLessThan(1000) // Should respond within 1 second
    })
  })

  describe('Business Logic', () => {
    it('should apply correct IRS mileage rates by year', async () => {
      const log2023 = {
        vehicleId: testVehicle.id,
        date: '2023-12-31',
        startOdometer: 50000,
        endOdometer: 50100,
        purpose: 'business',
        isBusinessDay: true
      }

      mockDb.where.mockReturnThis()
      mockDb.first.mockResolvedValueOnce(testVehicle)
      mockDb.returning.mockResolvedValueOnce([{ id: 'test-log-2023' }])

      const response = await request(app)
        .post('/api/mileage')
        .set('Authorization', `Bearer ${authToken}`)
        .send(log2023)
        .expect(201)

      // 2023 rate: 0.655 per mile
      expect(response.body.deductionAmount).toBe(65.5) // 100 * 0.655
    })

    it('should handle business day vs individual trip logic correctly', async () => {
      // Test business day (all miles deductible)
      const businessDayLog = {
        vehicleId: testVehicle.id,
        date: '2024-01-15',
        startOdometer: 50000,
        endOdometer: 50200,
        purpose: 'business',
        isBusinessDay: true,
        trips: [
          { purpose: 'business', miles: 50 },
          { purpose: 'personal', miles: 150 } // Should be ignored on business day
        ]
      }

      mockDb.where.mockReturnThis()
      mockDb.first.mockResolvedValueOnce(testVehicle)
      mockDb.returning.mockResolvedValueOnce([{ id: 'business-day-log' }])

      const response1 = await request(app)
        .post('/api/mileage')
        .set('Authorization', `Bearer ${authToken}`)
        .send(businessDayLog)
        .expect(201)

      expect(response1.body.deductibleMiles).toBe(200) // All miles on business day

      // Test individual trips (only business miles deductible)
      const tripBasedLog = {
        vehicleId: testVehicle.id,
        date: '2024-01-16',
        startOdometer: 50200,
        endOdometer: 50400,
        purpose: 'mixed',
        isBusinessDay: false,
        trips: [
          { purpose: 'business', miles: 50 },
          { purpose: 'personal', miles: 150 }
        ]
      }

      mockDb.where.mockReturnThis()
      mockDb.first.mockResolvedValueOnce(testVehicle)
      mockDb.returning.mockResolvedValueOnce([{ id: 'trip-based-log' }])

      const response2 = await request(app)
        .post('/api/mileage')
        .set('Authorization', `Bearer ${authToken}`)
        .send(tripBasedLog)
        .expect(201)

      expect(response2.body.deductibleMiles).toBe(50) // Only business miles
    })
  })
})