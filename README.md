# Fire Finance - Self-Hosted Personal & Business Finance Application

![Fire Finance Logo](branding/logos/firefinance-logo-main.png)

## Overview

Fire Finance is a comprehensive, self-hosted financial management application designed for personal and household use with integrated business features. Built for deployment on Proxmox VE, it supports up to 5 users with real-time collaboration and includes native applications for iOS, Windows, and web browsers.

## 🚀 Quick Start

### Prerequisites
- Proxmox VE environment (tested on Dell PowerEdge R630)
- Docker and Docker Compose installed
- SSL certificates (self-signed for testing, proper certificates for production)
- Plaid API credentials (for bank integration)

### Deployment
```bash
# Clone or extract the Fire Finance package
cd firefinance

# Configure environment variables
cp backend/.env.template backend/.env
# Edit backend/.env with your configuration

# Run the deployment script
./deploy.sh

# Validate the installation
./validate.sh
```

### Environment Configuration
Key variables in `backend/.env`:
```bash
# Required
POSTGRES_PASSWORD=your_secure_password
JWT_SECRET=your_jwt_secret_key
PLAID_CLIENT_ID=your_plaid_client_id
PLAID_SECRET=your_plaid_secret

# Optional (for push notifications)
APNS_KEY_ID=your_apns_key_id
APNS_TEAM_ID=your_apns_team_id
WNS_CLIENT_ID=your_wns_client_id
WNS_CLIENT_SECRET=your_wns_client_secret
```

## 📱 Client Applications

### iOS App (SwiftUI)
- **Target Device**: iPhone 15 Pro Max
- **Features**: Native SwiftUI interface, Core Motion integration, APNs notifications
- **Build**: Open `frontend-ios/FireFinance.xcodeproj` in Xcode
- **Configuration**: Update API endpoints in `Services/APIService.swift`

### Windows App (WinUI 3)
- **Target OS**: Windows 11
- **Features**: Native WinUI 3 interface, Windows Sensors, WNS notifications
- **Build**: Open `frontend-windows/FireWindows.sln` in Visual Studio 2022
- **Configuration**: Update API endpoints in `appsettings.json`

### Web PWA (React)
- **Features**: Progressive Web App, responsive design, offline support
- **Build**: `cd frontend-web && npm install && npm run build`
- **Development**: `npm start` for hot-reload development

## 🏗️ Architecture

### Backend Services
```
┌─────────────────────────────────────────────────────────────┐
│                        Load Balancer                        │
│                         (Nginx)                             │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
      ┌───────▼───────┐ ┌─────▼─────┐ ┌───────▼───────┐
      │  API Server   │ │WebSocket  │ │  Web Client   │
      │  (Node.js)    │ │(Socket.io)│ │   (React)     │
      └───────┬───────┘ └─────┬─────┘ └───────────────┘
              │               │                       │
      ┌───────▼───────────────▼───────────────────────▼───────┐
      │                Database (PostgreSQL)                  │
      │                Cache (Redis)                          │
      │                File Storage (MinIO)                   │
      └───────────────────────────────────────────────────────┘
```

### Security Features
- **End-to-End Encryption**: AES-256 for sensitive data
- **JWT Authentication**: With refresh token mechanism
- **MFA Support**: TOTP-based two-factor authentication
- **Role-Based Access**: Admin, Auditor, and Tax Prepper roles
- **User Cap**: Hard limit of 5 active users per household

## 💰 Personal Finance Features

### Bill Planner
- Monthly calendar view for bills and due dates
- Recurring bill templates with automatic scheduling
- Payment status tracking with transaction matching
- Smart alerts and notifications

### Budgeting & Goals
- Envelope-based budgeting system
- Progress tracking with visual indicators
- Goal setting (e.g., house down payment, vacation)
- What-if scenario planning

### Transaction Management
- Automatic import from linked bank accounts
- AI-powered categorization and rule creation
- Receipt OCR with automatic data extraction
- Transaction splitting and editing

### Debt Tools
- Snowball and avalanche payoff calculators
- Refinancing and consolidation simulators
- Credit building strategies
- Progress tracking and motivation

### Credit Monitoring
- Score tracking from multiple bureaus
- Trend analysis and alerts
- Dispute management tools
- Credit utilization monitoring

### Investment Tracking
- Portfolio performance analysis
- Retirement planning projections
- Tax optimization strategies
- Risk assessment tools

## 🏢 Business Module Features

### Income & Expense Management
- Custom business categories
- Invoice creation, sending, and tracking
- Receipt OCR for expense documentation
- Profit and loss projections

### Client & Vendor Management (CRM)
- Contact information and communication history
- Contract and milestone tracking
- Accounts receivable/payable reporting
- Payment reminder automation

### Tax Compliance
- IRS-compliant mileage tracking
- Quarterly estimated tax calculations
- Schedule C export for tax preparation
- Deduction optimization

### Mileage Diary
- Motion-based driving detection (no GPS required)
- Manual odometer entry with business day flagging
- Vehicle profiles for mixed-use tracking
- IRS rate calculations and reporting

### Business Reporting
- Profit and loss statements
- Cash flow analysis
- Key performance indicators (KPIs)
- Scenario planning and projections

## 🤝 Collaboration Features

### Real-Time Sync
- Multiple users can edit simultaneously
- WebSocket-based instant updates
- Operational transform for conflict resolution
- Activity history and audit trails

### Communication
- Dedicated chat rooms for different topics
- @mentions and threaded conversations
- File sharing with automatic organization
- Contextual links to application elements

### Attention Highlighting
- Visual cues to direct team attention
- Temporary highlights that fade automatically
- Note attachments for context
- No shared cursors for privacy

## 🎨 Customization & Themes

### Color Schemes
- **Classic Finance**: Professional greens and blues
- **Household Warm**: Friendly oranges and yellows
- **Business Pro**: Neutral grays with accent colors
- **High Contrast**: Accessibility-focused design

### Theme Variants
- Light, dark, and auto (system-matched) modes
- Minimalist, vibrant, and retro styling options
- Large text and monochrome accessibility modes
- Module-specific color overrides

### User Settings
- Customizable dashboard widgets
- Notification preferences and quiet hours
- Privacy and sharing controls
- Import/export and backup management

## 🔧 API Documentation

The Fire Finance API is documented and accessible at `https://your-server/api/docs` after deployment.

### Key Endpoints
```
GET    /api/health              - Health check
POST   /api/auth/register       - User registration
POST   /api/auth/login          - User authentication
GET    /api/accounts            - List linked accounts
POST   /api/transactions        - Create transaction
GET    /api/budgets             - Get budget information
POST   /api/invoices            - Create invoice
GET    /api/mileage             - Mileage tracking
WebSocket /ws                  - Real-time collaboration
```

## 📊 Monitoring & Analytics

### Built-in Monitoring
- **Prometheus**: Metrics collection and storage
- **Grafana**: Visualization dashboards
- **Health Checks**: Automated service monitoring
- **Performance Metrics**: Response times and throughput

### Dashboards Include
- System resource utilization
- API performance metrics
- User activity analytics
- Error rate monitoring
- Database performance

## 🔐 Security Considerations

### Data Protection
- All sensitive data encrypted at rest
- TLS encryption for all communications
- Secure session management
- Regular security audits recommended

### Access Control
- Role-based permissions
- User access logging
- Session timeout management
- IP-based access restrictions (optional)

### Backup & Recovery
- Automated database backups
- Point-in-time recovery capability
- Encrypted backup storage
- Regular disaster recovery testing

## 🚀 Performance Optimization

### Database Optimization
- Indexed queries for common operations
- Connection pooling for efficiency
- Automated maintenance tasks
- Query performance monitoring

### Caching Strategy
- Redis for session management
- API response caching
- Static asset caching
- Database query caching

### Scaling Considerations
- Horizontal scaling for API servers
- Load balancing with health checks
- Database read replicas (if needed)
- CDN for static assets

## 🛠️ Development

### Local Development Setup
```bash
# Backend
cd backend
npm install
cp .env.template .env
# Edit .env for local development
npm run dev

# Web Client
cd frontend-web
npm install
npm start

# iOS App
# Open frontend-ios/FireFinance.xcodeproj in Xcode
# Configure development API endpoints

# Windows App
# Open frontend-windows/FireWindows.sln in Visual Studio
# Configure development API endpoints
```

### Testing
```bash
# Backend tests
cd backend
npm test

# Web client tests
cd frontend-web
npm test

# Validation script
./validate.sh
```

## 📚 Documentation

- **Deployment Guide**: `docs/DEPLOYMENT.md`
- **API Documentation**: `docs/API.md`
- **User Guide**: `docs/USER_GUIDE.md`
- **Architecture Overview**: `FIRE_FINANCE_COMPLETE_IMPLEMENTATION.md`

## 🤝 Contributing

This is a self-hosted application designed for personal use. The codebase is provided as-is for deployment on your own infrastructure.

## 📄 License

This project is provided for self-hosted use and is protected under a Proprietary License. Please review the included documentation for deployment and usage guidelines. 

## 🔧 Support

### Troubleshooting
1. Check service logs: `docker-compose logs -f`
2. Run validation script: `./validate.sh`
3. Review configuration in `backend/.env`
4. Check system resources and logs

### Common Issues
- **Database Connection**: Verify PostgreSQL is running and credentials are correct
- **SSL Certificates**: Ensure proper certificates are installed
- **API Access**: Check firewall settings and port configurations
- **Client Sync**: Verify WebSocket connectivity

## 🎯 Roadmap

### Future Enhancements
- Additional tax software integrations
- Advanced AI-powered insights
- Mobile app enhancements
- Performance optimizations
- Additional language support

---

**Fire Finance** - Empowering personal and household financial management with professional-grade features and complete data privacy.
