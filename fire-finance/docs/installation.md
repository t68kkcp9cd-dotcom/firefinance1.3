# Fire Finance Installation Guide

This guide provides detailed instructions for installing Fire Finance on your Proxmox VE server.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Server Preparation](#server-preparation)
3. [Installation Methods](#installation-methods)
4. [Initial Configuration](#initial-configuration)
5. [SSL Setup](#ssl-setup)
6. [Verification](#verification)

## Prerequisites

### Hardware Requirements

**Minimum Requirements:**
- CPU: Dual Intel Xeon E5-2630 or equivalent (8 cores)
- RAM: 16GB
- Storage: 50GB SSD
- Network: 1Gbps connection with static IP

**Recommended Requirements:**
- CPU: Dual Intel Xeon E5-2630 v4 or better (16+ cores)
- RAM: 32GB or more
- Storage: 100GB+ NVMe SSD
- Network: 1Gbps+ connection with static IP

### Software Requirements

- **Proxmox VE**: Version 7.0 or higher
- **Docker**: Version 20.10 or higher
- **Docker Compose**: Version 2.0 or higher
- **Git**: For repository management
- **OpenSSL**: For certificate generation

### Network Requirements

- Static public IP address
- Domain name (for SSL certificates)
- Firewall configured to allow ports 80, 443, and 22
- Optional: Additional ports for monitoring (9090, 3002)

## Server Preparation

### 1. Update Proxmox VE

```bash
# Update package lists
apt update

# Upgrade installed packages
apt upgrade -y

# Update Proxmox VE
apt dist-upgrade -y
```

### 2. Install Required Packages

```bash
# Install basic utilities
apt install -y \
  curl \
  wget \
  git \
  unzip \
  jq \
  python3 \
  python3-pip \
  nfs-common \
  cifs-utils \
  open-iscsi

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
```

### 3. Configure Network Storage

```bash
# Create storage directories
mkdir -p /opt/fire-finance/{data,backups,logs,certs}

# Set permissions
chown -R root:root /opt/fire-finance
chmod -R 755 /opt/fire-finance
```

### 4. Configure Firewall

```bash
# Install UFW (Uncomplicated Firewall)
apt install -y ufw

# Set default policies
ufw default deny incoming
ufw default allow outgoing

# Allow SSH
ufw allow ssh

# Allow HTTP and HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Allow specific IP for management (optional)
ufw allow from YOUR_IP_ADDRESS to any port 22

# Enable firewall
ufw --force enable
```

## Installation Methods

### Method 1: Automated Installation (Recommended)

Use the provided setup script for automatic installation:

```bash
# Clone the repository
git clone https://github.com/yourusername/fire-finance.git
cd fire-finance

# Run the setup script
sudo ./deployment/proxmox-setup.sh --domain your-domain.com
```

The script will:
- Install all dependencies
- Configure Docker and Docker Compose
- Generate SSL certificates
- Create and start all services
- Set up monitoring and backups

### Method 2: Manual Installation

#### Step 1: Clone Repository

```bash
git clone https://github.com/yourusername/fire-finance.git /opt/fire-finance/
cd /opt/fire-finance
```

#### Step 2: Create Environment File

```bash
# Copy environment template
cp backend/.env.example .env

# Generate secure passwords
openssl rand -base64 32 > postgres_password.txt
openssl rand -base64 32 > redis_password.txt
openssl rand -base64 64 > jwt_secret.txt
openssl rand -base64 64 > jwt_refresh_secret.txt
openssl rand -base64 24 > encryption_key.txt

# Edit .env file with your values
nano .env
```

#### Step 3: Generate SSL Certificates

**Option A: Self-signed (Development)**

```bash
# Generate self-signed certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout certs/firefinance.key \
  -out certs/firefinance.crt \
  -subj "/C=US/ST=State/L=City/O=Fire Finance/CN=your-domain.com"
```

**Option B: Let's Encrypt (Production)**

```bash
# Install Certbot
apt install -y certbot

# Generate certificate
 certbot certonly --standalone \
  -d your-domain.com \
  -d www.your-domain.com \
  --email your-email@example.com \
  --agree-tos \
  --no-eff-email

# Copy certificates
 cp /etc/letsencrypt/live/your-domain.com/fullchain.pem certs/firefinance.crt
 cp /etc/letsencrypt/live/your-domain.com/privkey.pem certs/firefinance.key
```

#### Step 4: Configure Nginx

```bash
# Create Nginx configuration
mkdir -p nginx
cp deployment/nginx.conf.template nginx/nginx.conf

# Edit configuration
nano nginx/nginx.conf
```

#### Step 5: Start Services

```bash
# Load environment variables
export $(grep -v '^#' .env | xargs)

# Start services
docker-compose up -d
```

### Method 3: Proxmox LXC Container

Create a dedicated LXC container for Fire Finance:

#### Step 1: Create Container

```bash
# Create LXC container
pct create 9000 /var/lib/vz/template/cache/debian-11-standard_11.6-1_amd64.tar.gz \
  --hostname fire-finance \
  --storage local-lvm \
  --rootfs 20 \
  --memory 4096 \
  --cores 4 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp

# Start container
pct start 9000
```

#### Step 2: Enter Container

```bash
# Enter container
pct enter 9000

# Follow Method 1 or 2 inside the container
```

## Initial Configuration

### 1. Database Setup

```bash
# Run database migrations
docker-compose exec api npm run db:migrate

# Seed initial data (optional)
docker-compose exec api npm run db:seed
```

### 2. Create Admin User

```bash
# Access API container
docker-compose exec api sh

# Create admin user (replace values)
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@your-domain.com",
    "username": "admin",
    "password": "your-secure-password",
    "firstName": "Admin",
    "lastName": "User"
  }'
```

### 3. Configure Plaid Integration

1. Visit [https://dashboard.plaid.com](https://dashboard.plaid.com)
2. Create a new application
3. Get your client ID and secret
4. Update `.env` file:
   ```bash
   PLAID_CLIENT_ID=your_client_id
   PLAID_SECRET=your_secret
   PLAID_ENV=sandbox  # or development/production
   ```

### 4. Configure Push Notifications

#### iOS (APNS)

1. Create APNS key in Apple Developer Portal
2. Download the key file
3. Update environment variables:
   ```bash
   APNS_KEY_ID=your_key_id
   APNS_TEAM_ID=your_team_id
   APNS_BUNDLE_ID=com.firefinance.ios
   ```

#### Windows (WNS)

1. Register app in Microsoft Partner Center
2. Get client ID and secret
3. Update environment variables:
   ```bash
   WNS_CLIENT_ID=your_client_id
   WNS_CLIENT_SECRET=your_secret
   ```

## SSL Setup

### Automatic SSL with Let's Encrypt

```bash
# Install Certbot with Nginx plugin
apt install -y certbot python3-certbot-nginx

# Obtain certificate
 certbot --nginx \
  -d your-domain.com \
  -d www.your-domain.com \
  --email your-email@example.com \
  --agree-tos \
  --no-eff-email

# Auto-renewal
 echo "0 12 * * * root certbot renew --quiet" >> /etc/crontab
```

### Manual SSL Certificate Installation

```bash
# Copy certificates to correct location
 cp your-certificate.crt /opt/fire-finance/certs/firefinance.crt
 cp your-private-key.key /opt/fire-finance/certs/firefinance.key

# Update Nginx configuration
 sed -i 's|ssl_certificate /etc/nginx/ssl/firefinance.crt|ssl_certificate /opt/fire-finance/certs/firefinance.crt|' nginx/nginx.conf
 sed -i 's|ssl_certificate_key /etc/nginx/ssl/firefinance.key|ssl_certificate_key /opt/fire-finance/certs/firefinance.key|' nginx/nginx.conf

# Restart Nginx
 docker-compose restart nginx
```

### SSL Configuration Best Practices

```nginx
# Strong SSL configuration
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
ssl_prefer_server_ciphers off;
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;
ssl_stapling on;
ssl_stapling_verify on;

# Security headers
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

## Verification

### 1. Health Checks

```bash
# API health check
curl -f https://your-domain.com/api/health

# WebSocket connection test
wscat -c wss://your-domain.com/socket.io

# Database connectivity
docker-compose exec postgres pg_isready -U firefinance
```

### 2. Service Status

```bash
# Check all services
docker-compose ps

# View logs
docker-compose logs -f

# Check resource usage
docker stats
```

### 3. Access the Application

1. **Web Interface**: https://your-domain.com
2. **API Documentation**: https://your-domain.com/api/docs
3. **Prometheus Metrics**: https://your-domain.com:9090
4. **Grafana Dashboard**: https://your-domain.com:3002

### 4. Initial Login

1. Navigate to https://your-domain.com
2. Register a new account or login with admin credentials
3. Complete the onboarding wizard
4. Link your first financial account
5. Set up your household and invite members

## Troubleshooting

### Common Issues

#### Port Conflicts
```bash
# Check for port conflicts
netstat -tlnp | grep -E ':(80|443|3000|3001|5432|6379)'

# Change ports in docker-compose.yml if needed
```

#### SSL Certificate Issues
```bash
# Check certificate
openssl x509 -in certs/firefinance.crt -text -noout

# Test SSL connection
openssl s_client -connect your-domain.com:443
```

#### Database Connection Issues
```bash
# Check PostgreSQL logs
docker-compose logs postgres

# Test database connection
docker-compose exec postgres pg_isready -U firefinance -d firefinance_db
```

### Performance Tuning

#### PostgreSQL Optimization
```bash
# Edit PostgreSQL configuration
docker-compose exec postgres sh -c "cat >> /var/lib/postgresql/data/postgresql.conf << EOF
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 4MB
maintenance_work_mem = 64MB
EOF"

# Restart PostgreSQL
docker-compose restart postgres
```

#### Redis Optimization
```bash
# Edit Redis configuration
docker-compose exec redis sh -c "cat >> /data/redis.conf << EOF
maxmemory 256mb
maxmemory-policy allkeys-lru
EOF"

# Restart Redis
docker-compose restart redis
```

## Security Hardening

### 1. Firewall Configuration

```bash
# Configure UFW
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp  # SSH
ufw allow 80/tcp  # HTTP
ufw allow 443/tcp # HTTPS
ufw --force enable
```

### 2. Fail2ban Setup

```bash
# Install fail2ban
apt install -y fail2ban

# Configure fail2ban
cat > /etc/fail2ban/jail.local << EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[nginx-http-auth]
enabled = true

[nginx-limit-req]
enabled = true
EOF

# Start fail2ban
systemctl enable fail2ban
systemctl start fail2ban
```

### 3. Regular Security Updates

```bash
# Automated security updates
apt install -y unattended-upgrades

# Configure automatic updates
cat > /etc/apt/apt.conf.d/50unattended-upgrades << EOF
Unattended-Upgrade::Allowed-Origins {
        "\${distro_id}:\${distro_codename}-security";
};
Unattended-Upgrade::AutoFixInterruptedDpkg "true";
Unattended-Upgrade::MinimalSteps "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
EOF
```

## Next Steps

After successful installation:

1. **Configure Plaid Integration**: Set up your Plaid account and link financial institutions
2. **Invite Household Members**: Add up to 4 additional users to your household
3. **Set Up Budgets**: Create budgets using the envelope system
4. **Configure Notifications**: Set up push notifications and email alerts
5. **Explore Features**: Try out bill tracking, goal setting, and reporting

For more information, see the [User Guide](user-guide.md) and [API Documentation](api.md).