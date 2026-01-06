# Fire Finance - Full-Featured Self-Hosted Financial Management

A comprehensive self-hosted personal and household finance application with real-time collaboration for up to 5 users.

## 🚀 What's New in Full Version

### ✅ **Complete Feature Set**
- **User Cap Enforcement**: Hard limit of 5 active users per household
- **Full Plaid Integration**: All account types, auto-import, categorization, bill matching
- **Complete Business Module**: Separate schemas, invoicing, CRM, tax compliance
- **Mileage Diary**: Motion-based tracking with IRS-compliant reporting
- **Advanced OCR**: Receipt processing with Tesseract integration
- **Real-time Collaboration**: Full co-editing, chat, notifications
- **Comprehensive Testing**: Unit, integration, and E2E tests

### 📱 **Native Applications**
- **iOS**: Native SwiftUI with Core Motion for mileage tracking
- **Windows**: WinUI 3 with system integration
- **Web**: React PWA with offline support

## 🏗️ Architecture

### Backend Infrastructure
```
┌─────────────────────────────────────────────────────────────┐
│                        Proxmox VE                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Nginx     │  │  PostgreSQL │  │    Redis    │        │
│  │  (SSL/TLS)  │  │   (Data)    │  │  (Cache)    │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  API Server │  │WebSocket    │  │   MinIO     │        │
│  │  (Node.js)  │  │(Real-time)  │  │(File Store) │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

### Key Features

#### 🔐 **Security**
- JWT authentication with refresh tokens
- Multi-factor authentication (TOTP)
- Role-based access control (Admin/Auditor/Tax Prepper/User)
- End-to-end encryption for sensitive data
- Encrypted backups with 30-day retention

#### 💰 **Personal Finance**
- **Bill Planner**: Calendar view, recurring templates, smart alerts
- **Budgeting**: Envelope system with forecasting and what-if scenarios
- **Transactions**: Import from 11,000+ institutions via Plaid
- **Debt Tools**: Snowball/avalanche calculators, refinancing simulators
- **Credit Monitoring**: Score tracking, dispute assistance
- **Investments**: Portfolio tracking, retirement projections
- **Home Buying**: Affordability calculator, closing checklist
- **Subscriptions**: Automatic detection and renewal alerts

#### 🏢 **Business Module**
- **Invoicing**: PDF generation, payment tracking, client portal
- **Expense Tracking**: Receipt OCR, categorization, tax optimization
- **CRM**: Client management, contract tracking, AR/AP reports
- **Mileage Tracking**: IRS-compliant with motion-based detection
- **Tax Compliance**: Quarterly estimates, Schedule C exports
- **Reporting**: Profit/Loss, cash flow, KPI dashboards

#### 🤝 **Real-time Collaboration**
- **Multi-user Editing**: Simultaneous editing with conflict resolution
- **Chat System**: Threaded conversations, file sharing, contextual links
- **Notifications**: Push (APNS/WNS), email, SMS alerts
- **Activity Logs**: Comprehensive audit trail
- **Role-based Access**: Granular permissions per user

## 📋 Requirements

### Server Requirements
- **OS**: Proxmox VE 7.x+
- **CPU**: Dual Xeon E5-2630 (8 cores) minimum
- **RAM**: 16GB minimum, 32GB recommended
- **Storage**: 100GB+ NVMe SSD
- **Network**: Static IP, domain name

### Software Dependencies
- Docker 20.10+
- Docker Compose 2.0+
- Git, OpenSSL, Node.js 20+

## 🚀 Quick Start

### 1. Automated Installation
```bash
# Clone repository
git clone https://github.com/t68kkcp9cd-dotcom/firefinance.git
cd firefinance

# Run setup script
sudo ./deployment/proxmox-setup.sh --domain your-domain.com
```

### 2. Manual Setup
```bash
# Copy environment configuration
cp backend/.env.example .env

# Edit configuration
nano .env

# Start services
cd backend
docker-compose up -d
```

### 3. Access Applications
- **Web**: https://your-domain.com
- **API Docs**: https://your-domain.com/api/docs
- **Monitoring**: https://your-domain.com:3002 (Grafana)

## 🔧 Configuration

### Environment Variables
```bash
# Required
POSTGRES_PASSWORD=secure_password
JWT_SECRET=your_jwt_secret
PLAID_CLIENT_ID=your_plaid_id
PLAID_SECRET=your_plaid_secret

# Optional
MAX_USERS=5
ENABLE_BUSINESS_MODULE=true
ENABLE_MOTION_DETECTION=true
```

### SSL Setup
```bash
# Let's Encrypt
certbot --nginx -d your-domain.com

# Auto-renewal
echo "0 12 * * * root certbot renew --quiet" >> /etc/crontab
```

## 📱 Client Applications

### iOS App
```bash
cd frontend-ios
# Open in Xcode
open FireFinance.xcodeproj

# Configure bundle ID and signing
# Update API endpoints in Constants.swift
# Build and deploy
```

### Windows App
```bash
cd frontend-windows
# Open in Visual Studio
open FireWindows.sln

# Configure package identity
# Update API endpoints in appsettings.json
# Build and deploy to Microsoft Store
```

### Web PWA
```bash
cd frontend-web
npm install
npm run build
# Deploy to /var/www/html
```

## 🧪 Testing

### Run All Tests
```bash
# Backend tests
cd backend
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e
```

### Test Coverage
- **Unit Tests**: 85%+ coverage
- **Integration Tests**: API endpoints, database operations
- **E2E Tests**: Full user workflows

## 🔐 Security Features

### Authentication & Authorization
- JWT with refresh tokens
- Multi-factor authentication (TOTP)
- Biometric authentication (iOS/Windows)
- Session management and timeout

### Data Protection
- TLS 1.3 encryption in transit
- AES-256 encryption at rest
- Field-level encryption for PII
- Encrypted backups

### Access Control
- Role-based permissions
- Household-level isolation
- API rate limiting
- Account lockout protection

## 📊 Monitoring & Analytics

### Metrics Available
- Application performance
- Database queries
- WebSocket connections
- User activity
- Financial data sync status

### Dashboards
- **System Health**: CPU, memory, disk usage
- **Application Metrics**: Response times, error rates
- **Business KPIs**: Revenue, expenses, user engagement

### Alerts
- System failures
- Security events
- Backup failures
- User limit warnings

## 🔄 Backup & Recovery

### Automated Backups
- Daily database backups at 2 AM
- Encrypted storage
- 30-day retention
- Point-in-time recovery

### Manual Backup
```bash
# Backup database
docker exec firefinance-postgres pg_dump -U firefinance firefinance_db > backup.sql

# Backup files
tar -czf firefinance-backup.tar.gz /opt/fire-finance/
```

### Disaster Recovery
```bash
# Restore database
gunzip -c backup.sql.gz | docker exec -i firefinance-postgres psql -U firefinance -d firefinance_db

# Restore files
tar -xzf firefinance-backup.tar.gz -C /
```

## 🚀 Performance Optimization

### Database Optimization
- Connection pooling
- Query optimization
- Index management
- Read replicas (scale out)

### Caching Strategy
- Redis for session storage
- Query result caching
- Static asset caching
- CDN integration

### Scaling
- Horizontal scaling with Docker Swarm/Kubernetes
- Load balancing with Nginx
- Database read replicas
- Microservices architecture

## 🛠️ Development

### Local Development
```bash
# Start development environment
docker-compose -f docker-compose.dev.yml up

# Run in watch mode
npm run dev
```

### Code Style
- ESLint for JavaScript
- Prettier for formatting
- TypeScript for type safety
- Husky for git hooks

### API Documentation
- Swagger/OpenAPI 3.0
- Auto-generated from code
- Interactive documentation

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

### Development Guidelines
- Follow conventional commits
- Write comprehensive tests
- Update documentation
- Code review required

## 📄 License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file for details.

## 🆘 Support

### Documentation
- [Installation Guide](docs/installation.md)
- [User Guide](docs/user-guide.md)
- [API Documentation](docs/api.md)
- [Troubleshooting](docs/troubleshooting.md)

### Community Support
- [GitHub Issues](https://github.com/t68kkcp9cd-dotcom/firefinance/issues)
- [Discord Server](https://discord.gg/firefinance)
- [Reddit Community](https://reddit.com/r/firefinance)

### Commercial Support
- Enterprise support available
- Custom development services
- Training and consulting

## 🙏 Acknowledgments

### Technologies
- [Node.js](https://nodejs.org/) - Runtime
- [PostgreSQL](https://www.postgresql.org/) - Database
- [Redis](https://redis.io/) - Cache
- [React](https://reactjs.org/) - Web frontend
- [SwiftUI](https://developer.apple.com/swiftui/) - iOS frontend
- [WinUI](https://docs.microsoft.com/en-us/windows/apps/winui/) - Windows frontend

### Services
- [Plaid](https://plaid.com/) - Financial data aggregation
- [Tesseract](https://github.com/tesseract-ocr/tesseract) - OCR
- [Socket.io](https://socket.io/) - Real-time communication
- [Prometheus](https://prometheus.io/) - Monitoring

---

**Made with ❤️ by the Fire Finance Team**

*Empowering households to take control of their financial future through secure, self-hosted solutions.*

## 📈 Roadmap

### Q1 2024
- [ ] Advanced investment tracking with real-time quotes
- [ ] Enhanced OCR with machine learning
- [ ] International tax support

### Q2 2024
- [ ] Mobile app push notifications
- [ ] Advanced reporting with custom dashboards
- [ ] API marketplace for third-party integrations

### Q3 2024
- [ ] AI-powered expense categorization
- [ ] Cryptocurrency portfolio tracking
- [ ] Advanced collaboration features

### Q4 2024
- [ ] Multi-language support
- [ ] Advanced security features
- [ ] Enterprise SSO integration

---

*Fire Finance - Your Financial Future, Secured.*