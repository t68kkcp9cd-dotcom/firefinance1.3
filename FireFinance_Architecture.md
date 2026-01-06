# Fire Finance - High-Level Architecture

## Overview
Fire Finance is a comprehensive self-hosted personal and household finance application with native iOS, Windows, and web clients, supporting real-time collaboration for up to 5 users.

## System Architecture

### Backend Infrastructure
- **Server**: Proxmox VE on Dell PowerEdge R630 (Dual Xeon E5-2630, 32GB RAM)
- **Containerization**: Docker with Docker Compose
- **Database**: PostgreSQL 15 (Primary data store)
- **Cache/Real-time**: Redis 7 (Pub/Sub and caching)
- **API Server**: Node.js 20 with Express.js
- **WebSocket Server**: Socket.io for real-time features
- **Reverse Proxy**: Nginx with SSL termination
- **File Storage**: MinIO (S3-compatible object storage)

### Security Architecture
- **Authentication**: JWT tokens with refresh mechanism
- **Authorization**: Role-based access control (Admin, Auditor, Tax Prepper)
- **Encryption**: 
  - TLS 1.3 for data in transit
  - AES-256 for data at rest
  - End-to-end encryption for sensitive financial data
- **MFA**: TOTP-based with authenticator apps
- **Privacy**: Field-level encryption for PII and financial data
- **Backups**: Encrypted automated backups to external storage

### Client Applications

#### iOS Application (iPhone 15 Pro Max)
- **Framework**: SwiftUI 5.0
- **Architecture**: MVVM with Combine
- **Database**: Core Data with CloudKit sync
- **Push Notifications**: Apple Push Notification Service (APNs)
- **Key Features**:
  - Native iOS design with bottom tab bar
  - Haptic feedback
  - Face ID/Touch ID authentication
  - Offline-first with sync
  - Camera integration for receipt scanning
  - Motion-based mileage tracking

#### Windows 11 Application (HP Laptop)
- **Framework**: WinUI 3 with WPF
- **Architecture**: MVVM with dependency injection
- **Database**: SQLite with sync service
- **Push Notifications**: Windows Push Notification Service (WNS)
- **Key Features**:
  - Native Windows 11 design with sidebar navigation
  - Taskbar integration
  - Window management
  - Keyboard shortcuts
  - System tray notifications

#### Web Application (PWA)
- **Framework**: React 18 with TypeScript
- **State Management**: Redux Toolkit with RTK Query
- **UI Library**: Material-UI v5
- **PWA Features**: Service Worker, offline support, app manifest
- **Key Features**:
  - Responsive design for all screen sizes
  - Browser notifications
  - Installable as desktop/mobile app
  - Full-screen mode
  - Cross-platform compatibility

### Real-time Collaboration System
- **WebSocket Server**: Socket.io with Redis adapter
- **Conflict Resolution**: Operational Transform (OT) algorithm
- **Presence System**: Real-time user status and cursors
- **Notification Engine**: Real-time updates and alerts
- **Activity Logs**: Comprehensive audit trail

### Financial Integration Architecture
- **Banking API**: Plaid for account linking and transaction sync
- **Credit Monitoring**: Credit Karma integration
- **Investment Tracking**: Integration with major brokerages
- **Data Processing**: ETL pipeline for transaction categorization
- **OCR Engine**: Receipt scanning and data extraction
- **AI Categorization**: Machine learning for automatic categorization

### Data Flow Architecture
1. **Client Request** → Nginx Load Balancer
2. → API Server (Node.js/Express)
3. → PostgreSQL Database
4. → Redis Cache/PubSub
5. → WebSocket Server (real-time updates)
6. → Client Applications via Socket.io

### Scalability & Performance
- **Database**: Connection pooling, read replicas, indexing
- **Caching**: Redis for session management and data caching
- **CDN**: Static assets served via CDN
- **Rate Limiting**: API rate limiting per user
- **Monitoring**: Prometheus + Grafana for metrics

### Backup & Disaster Recovery
- **Database**: Point-in-time recovery with WAL archiving
- **File Storage**: Versioned backups to external storage
- **Configuration**: Infrastructure as Code (Terraform/Ansible)
- **Recovery**: Automated failover and restoration procedures

## Network Architecture
```
Internet → Cloudflare DNS → Proxmox VE → Nginx (SSL) → Docker Containers
                    ↓
            [API Server] [WebSocket Server] [PostgreSQL] [Redis] [MinIO]
                    ↓
            Client Applications (iOS/Windows/Web)
```

## Development & Deployment Pipeline
1. **Version Control**: Git with GitLab/GitHub
2. **CI/CD**: GitLab CI/GitHub Actions
3. **Testing**: Automated testing (unit, integration, e2e)
4. **Security**: SAST/DAST scanning
5. **Deployment**: Docker Compose to Proxmox VE
6. **Monitoring**: Centralized logging and monitoring

This architecture ensures scalability, security, and maintainability while providing a seamless experience across all platforms.