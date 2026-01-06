# Fire Finance - Quick Start Guide

## 🚀 Immediate Deployment (5-10 minutes)

This guide gets Fire Finance running on your Proxmox VE server quickly.

### Step 1: Prepare Your Server
```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Docker and Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Log out and back in to apply Docker group
exit
```

### Step 2: Extract and Configure
```bash
# Navigate to the Fire Finance directory
cd firefinance

# Create environment configuration
cp backend/.env.template backend/.env

# Edit the configuration file (use your preferred editor)
nano backend/.env
```

**Minimum Required Configuration:**
```bash
# Database (change these passwords!)
POSTGRES_USER=firefinance
POSTGRES_PASSWORD=your_secure_password_here

# JWT Secret (generate a random string)
JWT_SECRET=$(openssl rand -base64 32)

# Plaid API (get from https://dashboard.plaid.com)
PLAID_CLIENT_ID=your_plaid_client_id
PLAID_SECRET=your_plaid_secret
PLAID_ENV=sandbox
```

### Step 3: Deploy
```bash
# Make scripts executable
chmod +x deploy.sh validate.sh

# Run deployment
./deploy.sh
```

### Step 4: Validate
```bash
# Check that everything is working
./validate.sh
```

### Step 5: First Login
1. Open your browser to `https://your-server-ip`
2. Create your first admin user
3. Start adding your financial data!

## 📱 Client App Setup

### iOS App
1. Open `frontend-ios/FireFinance.xcodeproj` in Xcode
2. Update `Services/APIService.swift`:
   ```swift
   static let baseURL = "https://your-server-ip"
   ```
3. Build and run on your iPhone 15 Pro Max

### Windows App
1. Open `frontend-windows/FireWindows.sln` in Visual Studio 2022
2. Update `appsettings.json`:
   ```json
   {
     "ApiBaseUrl": "https://your-server-ip",
     "WebSocketUrl": "wss://your-server-ip:3001"
   }
   ```
3. Build and run on Windows 11

### Web App
The web app is automatically deployed with the backend and available at `https://your-server-ip`.

## 🔧 Troubleshooting

### Common Issues

**1. Services won't start**
```bash
# Check logs
docker-compose -f backend/docker-compose.yml logs

# Restart services
docker-compose -f backend/docker-compose.yml restart
```

**2. Database connection failed**
```bash
# Check PostgreSQL
docker-compose -f backend/docker-compose.yml exec postgres pg_isready

# Reset database (WARNING: This deletes all data!)
docker-compose -f backend/docker-compose.yml down -v
docker-compose -f backend/docker-compose.yml up -d
```

**3. SSL certificate issues**
```bash
# Generate new self-signed certificate
cd backend/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout firefinance.key -out firefinance.crt \
  -subj "/C=US/ST=State/L=City/O=FireFinance/CN=your-server-ip"

# Restart nginx
docker-compose -f backend/docker-compose.yml restart nginx
```

**4. Plaid API not working**
- Verify your Plaid credentials in `backend/.env`
- Check that you're using the correct environment (sandbox/production)
- Ensure your server IP is whitelisted in Plaid dashboard

**5. User cap not enforced**
```bash
# Check middleware logs
docker-compose -f backend/docker-compose.yml logs api-server | grep checkUserCap

# Verify MAX_USERS environment variable
docker-compose -f backend/docker-compose.yml exec api-server env | grep MAX_USERS
```

## 📊 Monitoring

### Quick Health Check
```bash
# All services
./validate.sh

# Individual service logs
docker-compose -f backend/docker-compose.yml logs -f api-server
docker-compose -f backend/docker-compose.yml logs -f postgres
docker-compose -f backend/docker-compose.yml logs -f redis
```

### Dashboard Access
- **Main App**: `https://your-server-ip`
- **Grafana**: `http://your-server-ip:3002` (admin/admin)
- **Prometheus**: `http://your-server-ip:9090`

## 🔐 Security Checklist

- [ ] Change all default passwords
- [ ] Use proper SSL certificates (not self-signed)
- [ ] Configure firewall rules
- [ ] Enable MFA for admin users
- [ ] Set up automated backups
- [ ] Review and update CORS settings
- [ ] Enable audit logging
- [ ] Regular security updates

## 📈 Performance Tuning

### Database Optimization
```bash
# Connect to PostgreSQL
docker-compose -f backend/docker-compose.yml exec postgres psql -U firefinance -d firefinance_db

# Run maintenance
VACUUM ANALYZE;
```

### Memory Optimization
Edit `backend/docker-compose.yml` and adjust memory limits:
```yaml
services:
  api-server:
    deploy:
      resources:
        limits:
          memory: 1G
```

### Redis Optimization
```bash
# Monitor Redis memory
docker-compose -f backend/docker-compose.yml exec redis redis-cli info memory

# Clear cache if needed
docker-compose -f backend/docker-compose.yml exec redis redis-cli FLUSHALL
```

## 🔄 Backup and Recovery

### Quick Backup
```bash
# Database backup
docker-compose -f backend/docker-compose.yml exec postgres pg_dump -U firefinance firefinance_db > backup.sql

# File storage backup
docker-compose -f backend/docker-compose.yml exec minio mc mirror minio/mybucket ./backup-files/
```

### Quick Restore
```bash
# Restore database
docker-compose -f backend/docker-compose.yml exec -T postgres psql -U firefinance -d firefinance_db < backup.sql

# Restore files
docker-compose -f backend/docker-compose.yml exec -T minio mc mirror ./backup-files/ minio/mybucket/
```

## 🆘 Getting Help

### Debug Commands
```bash
# System status
./validate.sh

# Service logs
docker-compose -f backend/docker-compose.yml logs -f [service-name]

# Resource usage
docker stats

# Network connectivity
docker-compose -f backend/docker-compose.yml exec api-server ping postgres
docker-compose -f backend/docker-compose.yml exec api-server ping redis
```

### Log Locations
- **Application logs**: `docker-compose logs`
- **System logs**: `/var/log/syslog`
- **Docker logs**: `/var/lib/docker/containers/`

### Support Resources
- **Complete documentation**: `docs/` directory
- **API documentation**: `https://your-server/api/docs`
- **Architecture overview**: `FIRE_FINANCE_COMPLETE_IMPLEMENTATION.md`

## ✅ Success Indicators

After successful deployment, you should see:

1. **All services running**:
   ```bash
   docker-compose -f backend/docker-compose.yml ps
   ```

2. **API responding**:
   ```bash
   curl https://your-server-ip/api/health
   ```

3. **Web interface accessible**:
   - Open browser to `https://your-server-ip`
   - See the Fire Finance login screen

4. **Validation passing**:
   ```bash
   ./validate.sh
   # Should show most tests passing
   ```

## 🎉 Next Steps

1. **Create your admin user** through the web interface
2. **Link your bank accounts** using Plaid integration
3. **Invite family members** (up to 5 total users)
4. **Set up your first budget** and start tracking expenses
5. **Configure mobile apps** for on-the-go access
6. **Set up automated backups** for data protection

---

**Congratulations!** You now have a fully functional, self-hosted financial management system with professional-grade features and complete data privacy.