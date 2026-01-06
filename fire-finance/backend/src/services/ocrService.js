const Tesseract = require('tesseract.js')
const sharp = require('sharp')
const path = require('path')
const fs = require('fs').promises
const logger = require('../config/logger')

class OCRService {
  constructor() {
    this.supportedFormats = ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.pdf']
    this.receiptPatterns = {
      // Common receipt patterns
      totalAmount: [
        /total[\s:]*\$?(\d+\.\d{2})/i,
        /amount[\s:]*\$?(\d+\.\d{2})/i,
        /\$?(\d+\.\d{2})[\s]*total/i,
        /grand total[\s:]*\$?(\d+\.\d{2})/i,
        /final[\s:]*\$?(\d+\.\d{2})/i
      ],
      date: [
        /(\d{1,2}\/\d{1,2}\/\d{2,4})/,
        /(\d{1,2}-\d{1,2}-\d{2,4})/,
        /(\w+\s+\d{1,2},?\s+\d{4})/,
        /(\d{4}-\d{2}-\d{2})/
      ],
      merchant: [
        /^([a-zA-Z\s]+)$/m, // First line often contains merchant name
        /store[:\s]+([a-zA-Z\s]+)/i,
        /merchant[:\s]+([a-zA-Z\s]+)/i
      ],
      cardLast4: [
        /(?:card|cc|credit)[\s#:]*\*{0,4}(\d{4})/i,
        /ending[\s]*in[\s]*(\d{4})/i,
        /\*{0,4}(\d{4})/
      ]
    }
  }

  /**
   * Process receipt image and extract information
   * @param {string|Buffer} imagePath - Path to image file or image buffer
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Extracted receipt data
   */
  async processReceipt(imagePath, options = {}) {
    try {
      logger.info('Starting OCR processing for receipt')
      
      // Preprocess image for better OCR results
      const processedImage = await this.preprocessImage(imagePath)
      
      // Extract text using Tesseract
      const result = await Tesseract.recognize(
        processedImage,
        'eng',
        {
          logger: (m) => logger.debug(`Tesseract: ${m}`),
          tessedit_pageseg_mode: '6', // Assume single uniform block of text
          tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz$.,/-:()'
        }
      )

      const extractedText = result.data.text
      logger.debug(`Extracted text: ${extractedText}`)

      // Parse extracted text for receipt information
      const receiptData = this.parseReceiptText(extractedText)
      
      // Clean up temporary files
      if (processedImage !== imagePath) {
        await this.cleanupTempFiles(processedImage)
      }

      return {
        success: true,
        text: extractedText,
        data: receiptData,
        confidence: result.data.confidence,
        processingTime: result.data.duration
      }

    } catch (error) {
      logger.error('OCR processing error:', error)
      return {
        success: false,
        error: error.message,
        text: '',
        data: {}
      }
    }
  }

  /**
   * Preprocess image for better OCR accuracy
   * @param {string|Buffer} imagePath - Path to image file or image buffer
   * @returns {Promise<string>} Path to processed image
   */
  async preprocessImage(imagePath) {
    try {
      const isBuffer = Buffer.isBuffer(imagePath)
      const tempDir = path.join(__dirname, '../../temp')
      await fs.mkdir(tempDir, { recursive: true })
      
      let inputBuffer
      if (isBuffer) {
        inputBuffer = imagePath
      } else {
        inputBuffer = await fs.readFile(imagePath)
      }

      // Determine file type
      const fileType = this.getFileType(inputBuffer)
      
      // If PDF, convert first page to image
      if (fileType === 'pdf') {
        inputBuffer = await this.convertPDFToImage(inputBuffer)
      }

      // Image preprocessing pipeline
      const processedBuffer = await sharp(inputBuffer)
        .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
        .greyscale()
        .normalize()
        .sharpen({ sigma: 1, flat: 1, jagged: 2 })
        .threshold(180)
        .jpeg({ quality: 90 })
        .toBuffer()

      // Save processed image
      const processedPath = path.join(tempDir, `processed_${Date.now()}.jpg`)
      await fs.writeFile(processedPath, processedBuffer)

      return processedPath

    } catch (error) {
      logger.error('Image preprocessing error:', error)
      // Return original image path if preprocessing fails
      return isBuffer ? imagePath : await this.saveBufferToTempFile(imagePath)
    }
  }

  /**
   * Parse extracted text for receipt information
   * @param {string} text - Extracted OCR text
   * @returns {Object} Parsed receipt data
   */
  parseReceiptText(text) {
    const data = {
      totalAmount: null,
      date: null,
      merchant: null,
      cardLast4: null,
      items: [],
      category: 'expense',
      confidence: 0
    }

    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0)

    // Extract total amount
    for (const pattern of this.receiptPatterns.totalAmount) {
      for (const line of lines) {
        const match = line.match(pattern)
        if (match) {
          const amount = parseFloat(match[1])
          if (amount > 0) {
            data.totalAmount = amount
            break
          }
        }
      }
      if (data.totalAmount) break
    }

    // Extract date
    for (const pattern of this.receiptPatterns.date) {
      for (const line of lines) {
        const match = line.match(pattern)
        if (match) {
          const date = this.parseDate(match[1])
          if (date) {
            data.date = date
            break
          }
        }
      }
      if (data.date) break
    }

    // Extract merchant name
    if (lines.length > 0) {
      data.merchant = lines[0] // Often the first line
    }

    // Extract card last 4 digits
    for (const pattern of this.receiptPatterns.cardLast4) {
      for (const line of lines) {
        const match = line.match(pattern)
        if (match) {
          data.cardLast4 = match[1]
          break
        }
      }
      if (data.cardLast4) break
    }

    // Extract individual items (simplified)
    const itemPattern = /^(.+?)\s+\$?(\d+\.\d{2})/
    for (const line of lines) {
      const match = line.match(itemPattern)
      if (match && parseFloat(match[2]) < data.totalAmount * 0.8) { // Avoid matching total
        data.items.push({
          description: match[1].trim(),
          amount: parseFloat(match[2])
        })
      }
    }

    // Determine category based on merchant name
    data.category = this.categorizeExpense(data.merchant || '')

    // Calculate confidence based on extracted fields
    data.confidence = this.calculateConfidence(data)

    return data
  }

  /**
   * Determine expense category from merchant name
   * @param {string} merchant - Merchant name
   * @returns {string} Category
   */
  categorizeExpense(merchant) {
    const categories = {
      'gas': ['shell', 'chevron', 'exxon', 'bp', 'mobil'],
      'food': ['mcdonalds', 'starbucks', 'subway', 'pizza', 'restaurant', 'cafe'],
      'office': ['staples', 'office depot', 'office max'],
      'travel': ['hotel', 'airline', 'uber', 'lyft', 'taxi'],
      'utilities': ['electric', 'gas company', 'water', 'internet', 'phone']
    }

    const lowerMerchant = merchant.toLowerCase()
    
    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => lowerMerchant.includes(keyword))) {
        return category
      }
    }

    return 'other'
  }

  /**
   * Calculate confidence score based on extracted data
   * @param {Object} data - Extracted receipt data
   * @returns {number} Confidence score (0-100)
   */
  calculateConfidence(data) {
    let score = 0
    
    // Total amount is most important
    if (data.totalAmount) score += 40
    
    // Date is important
    if (data.date) score += 25
    
    // Merchant name
    if (data.merchant && data.merchant.length > 3) score += 20
    
    // Items found
    if (data.items.length > 0) score += 10
    
    // Card info
    if (data.cardLast4) score += 5
    
    return Math.min(score, 100)
  }

  /**
   * Parse date from various formats
   * @param {string} dateString - Date string from OCR
   * @returns {Date|null} Parsed date
   */
  parseDate(dateString) {
    try {
      // Try various date formats
      const formats = [
        'M/d/yyyy',
        'MM/dd/yyyy',
        'M-d-yyyy',
        'MM-dd-yyyy',
        'yyyy-MM-dd',
        'MMMM d, yyyy'
      ]

      for (const format of formats) {
        if (DateTime.TryParseExact(dateString, format, null, 0, out DateTime parsedDate)) {
          return parsedDate
        }
      }

      // Fallback to standard parsing
      const date = new Date(dateString)
      if (!isNaN(date.getTime())) {
        return date
      }

      return null
    } catch (error) {
      return null
    }
  }

  /**
   * Get file type from buffer
   * @param {Buffer} buffer - File buffer
   * @returns {string} File type
   */
  getFileType(buffer) {
    const header = buffer.toString('hex', 0, 8)
    
    if (header.startsWith('25504446')) return 'pdf'
    if (header.startsWith('89504e47')) return 'png'
    if (header.startsWith('ffd8ff')) return 'jpg'
    if (header.startsWith('424d')) return 'bmp'
    if (header.startsWith('49492a00') || header.startsWith('4d4d002a')) return 'tiff'
    
    return 'unknown'
  }

  /**
   * Convert PDF to image (first page)
   * @param {Buffer} pdfBuffer - PDF file buffer
   * @returns {Promise<Buffer>} Image buffer
   */
  async convertPDFToImage(pdfBuffer) {
    // In production, use a library like pdf2pic or pdf-poppler
    // For now, return empty buffer and handle gracefully
    logger.warn('PDF conversion not implemented, using placeholder')
    return Buffer.alloc(0)
  }

  /**
   * Save buffer to temporary file
   * @param {Buffer} buffer - File buffer
   * @returns {Promise<string>} Path to temporary file
   */
  async saveBufferToTempFile(buffer) {
    const tempDir = path.join(__dirname, '../../temp')
    await fs.mkdir(tempDir, { recursive: true })
    
    const tempPath = path.join(tempDir, `temp_${Date.now()}.jpg`)
    await fs.writeFile(tempPath, buffer)
    return tempPath
  }

  /**
   * Clean up temporary files
   * @param {string} filePath - Path to clean up
   */
  async cleanupTempFiles(filePath) {
    try {
      await fs.unlink(filePath)
    } catch (error) {
      logger.warn('Failed to cleanup temp file:', error.message)
    }
  }

  /**
   * Batch process multiple receipts
   * @param {Array<string|Buffer>} images - Array of image paths or buffers
   * @param {Object} options - Processing options
   * @returns {Promise<Array<Object>>} Array of results
   */
  async batchProcessReceipts(images, options = {}) {
    const results = []
    
    for (const image of images) {
      try {
        const result = await this.processReceipt(image, options)
        results.push(result)
      } catch (error) {
        results.push({
          success: false,
          error: error.message,
          text: '',
          data: {}
        })
      }
    }
    
    return results
  }

  /**
   * Train custom OCR model for better receipt recognition
   * @param {Array<Object>} trainingData - Training data with images and expected text
   * @returns {Promise<Object>} Training result
   */
  async trainCustomModel(trainingData) {
    // In production, implement model training
    // For now, return success
    return {
      success: true,
      message: 'Custom model training not implemented',
      accuracy: 0
    }
  }
}

module.exports = new OCRService()