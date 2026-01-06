#!/bin/bash

# Fire Finance Proxmox VE Setup Script
# This script sets up the Fire Finance application on Proxmox VE

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DEFAULT_VM_ID=9000
DEFAULT_VM_NAME="fire-finance"
DEFAULT_MEMORY=4096
DEFAULT_CORES=4
DEFAULT_STORAGE="local-lvm"
DEFAULT_BRIDGE="vmbr0"

# Functions
print_header() {
    echo -e "${GREEN}"
    echo "======================================================"
    echo "     Fire Finance Proxmox VE Setup Script"
    echo "======================================================"
    echo -e "${NC}"
}

print_step() {
    echo -e "${YELLOW}[STEP] $1${NC}"
}

print_success() {
    echo -e "${GREEN}[SUCCESS] $1${NC}"
}

print_error() {
    echo -e "${RED}[ERROR] $1${NC}"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_error "This script must be run as root"
        exit 1
    fi
}

check_proxmox() {
    if ! command -v pveversion &> /dev/null; then
        print_error "This script must be run on a Proxmox VE server"
        exit 1
    fi
}

install_dependencies() {
    print_step "Installing dependencies..."
    
    apt-get update
    apt-get install -y \
        curl \
        wget \
        git \
        unzip \
        jq \
        python3 \
        python3-pip \
        docker.io \
        docker-compose \
        nfs-common \
        cifs-utils
    
    # Start and enable Docker
    systemctl start docker
    systemctl enable docker
    
    # Add current user to docker group
    usermod -aG docker $USER
    
    print_success "Dependencies installed successfully"
}

setup_network_storage() {
    print_step "Setting up network storage..."
    
    # Create directories for persistent storage
    mkdir -p /opt/fire-finance/{data,backups,logs,certs}
    
    # Set permissions
    chown -R root:root /opt/fire-finance
    chmod -R 755 /opt/fire-finance
    
    print_success "Network storage setup completed"
}

generate_ssl_certificates() {
    print_step "Generating SSL certificates..."
    
    local domain=${1:-firefinance.local}
    
    # Create certificate directory
    mkdir -p /opt/fire-finance/certs
    
    # Generate self-signed certificate (replace with Let's Encrypt in production)
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout /opt/fire-finance/certs/firefinance.key \
        -out /opt/fire-finance/certs/firefinance.crt \
        -subj "/C=US/ST=State/L=City/O=Fire Finance/CN=$domain"
    
    print_success "SSL certificates generated"
}

create_docker_compose() {
    print_step "Creating Docker Compose configuration..."
    
    local domain=${1:-firefinance.local}
    
    cat > /opt/fire-finance/docker-compose.yml << EOF
version: '3.8'

services:
  # PostgreSQL Database
  postgres:
    image: postgres:15-alpine
    container_name: firefinance-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: firefinance_db
      POSTGRES_USER: firefinance
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:-$(openssl rand -base64 32)}
      POSTGRES_INITDB_ARGS: "--auth-host=scram-sha-256 --auth-local=scram-sha-256"
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
      - ./backups:/backups
    networks:
      - firefinance_network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U firefinance -d firefinance_db"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Redis Cache and Pub/Sub
  redis:
    image: redis:7-alpine
    container_name: firefinance-redis
    restart: unless-stopped
    command: >
      sh -c 'if [ -n "\${REDIS_PASSWORD}" ]; then
        redis-server --requirepass \${REDIS_PASSWORD} --appendonly yes
      else
        redis-server --appendonly yes
      fi'
    volumes:
      - ./data/redis:/data
    networks:
      - firefinance_network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # API Server
  api:
    build:
      context: ./backend
      dockerfile: Dockerfile.api
    container_name: firefinance-api
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: postgresql://firefinance:\${POSTGRES_PASSWORD}@postgres:5432/firefinance_db
      REDIS_URL: redis://:\${REDIS_PASSWORD}@redis:6379
      JWT_SECRET: \${JWT_SECRET}
      JWT_REFRESH_SECRET: \${JWT_REFRESH_SECRET}
      PLAID_CLIENT_ID: \${PLAID_CLIENT_ID}
      PLAID_SECRET: \${PLAID_SECRET}
      PLAID_ENV: \${PLAID_ENV:-sandbox}
      ENCRYPTION_KEY: \${ENCRYPTION_KEY}
      MFA_SECRET: \${MFA_SECRET}
    volumes:
      - ./logs/api:/app/logs
      - ./certs:/app/certs:ro
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - firefinance_network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # WebSocket Server
  websocket:
    build:
      context: ./backend
      dockerfile: Dockerfile.websocket
    container_name: firefinance-websocket
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 3001
      REDIS_URL: redis://:\${REDIS_PASSWORD}@redis:6379
      JWT_SECRET: \${JWT_SECRET}
    ports:
      - "3001:3001"
    depends_on:
      redis:
        condition: service_healthy
    networks:
      - firefinance_network

  # MinIO Object Storage
  minio:
    image: minio/minio:latest
    container_name: firefinance-minio
    restart: unless-stopped
    environment:
      MINIO_ROOT_USER: \${MINIO_USER:-firefinance}
      MINIO_ROOT_PASSWORD: \${MINIO_PASSWORD:-$(openssl rand -base64 32)}
    volumes:
      - ./data/minio:/data
    ports:
      - "9000:9000"
      - "9001:9001"
    command: server /data --console-address ":9001"
    networks:
      - firefinance_network

  # Nginx Reverse Proxy
  nginx:
    image: nginx:alpine
    container_name: firefinance-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/ssl:ro
      - ./logs/nginx:/var/log/nginx
      - ./frontend-web/build:/var/www/html:ro
    depends_on:
      - api
      - websocket
    networks:
      - firefinance_network

  # Monitoring - Prometheus
  prometheus:
    image: prom/prometheus:latest
    container_name: firefinance-prometheus
    restart: unless-stopped
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./data/prometheus:/prometheus
    ports:
      - "9090:9090"
    networks:
      - firefinance_network

  # Monitoring - Grafana
  grafana:
    image: grafana/grafana:latest
    container_name: firefinance-grafana
    restart: unless-stopped
    environment:
      GF_SECURITY_ADMIN_PASSWORD: \${GRAFANA_PASSWORD}
    volumes:
      - ./data/grafana:/var/lib/grafana
      - ./monitoring/grafana:/etc/grafana/provisioning:ro
    ports:
      - "3002:3000"
    networks:
      - firefinance_network

volumes:
  postgres_data:
  redis_data:
  minio_data:
  prometheus_data:
  grafana_data:

networks:
  firefinance_network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
EOF

    print_success "Docker Compose configuration created"
}

create_nginx_config() {
    print_step "Creating Nginx configuration..."
    
    local domain=${1:-firefinance.local}
    
    mkdir -p /opt/fire-finance/nginx
    
    cat > /opt/fire-finance/nginx/nginx.conf << EOF
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    
    # Logging
    access_log /var/log/nginx/access.log;
    error_log /var/log/nginx/error.log;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' wss: https:; frame-ancestors 'none';" always;
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied expired no-cache no-store private auth;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml application/javascript application/json;
    
    # Rate limiting
    limit_req_zone \$binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone \$binary_remote_addr zone=login:10m rate=5r/m;
    
    # Upstream servers
    upstream api_backend {
        server api:3000;
    }
    
    upstream websocket_backend {
        server websocket:3001;
    }
    
    # Main server block
    server {
        listen 80;
        server_name ${domain};
        
        # Redirect HTTP to HTTPS
        return 301 https://\$server_name\$request_uri;
    }
    
    # HTTPS server block
    server {
        listen 443 ssl http2;
        server_name ${domain};
        
        # SSL configuration
        ssl_certificate /etc/nginx/ssl/firefinance.crt;
        ssl_certificate_key /etc/nginx/ssl/firefinance.key;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384;
        ssl_prefer_server_ciphers off;
        ssl_session_cache shared:SSL:10m;
        ssl_session_timeout 10m;
        
        # Root directory for static files
        root /var/www/html;
        index index.html;
        
        # Frontend application
        location / {
            try_files \$uri \$uri/ /index.html;
            expires 1d;
            add_header Cache-Control "public, immutable";
        }
        
        # API endpoints
        location /api {
            limit_req zone=api burst=20 nodelay;
            
            proxy_pass http://api_backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
            proxy_cache_bypass \$http_upgrade;
            proxy_read_timeout 300s;
            proxy_connect_timeout 75s;
        }
        
        # WebSocket endpoints
        location /socket.io {
            proxy_pass http://websocket_backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
            proxy_read_timeout 86400s;
            proxy_send_timeout 86400s;
        }
        
        # Health check endpoint
        location /health {
            access_log off;
            return 200 "healthy\n";
            add_header Content-Type text/plain;
        }
        
        # Prometheus metrics
        location /metrics {
            proxy_pass http://api_backend/metrics;
            allow 127.0.0.1;
            allow 172.20.0.0/16;
            deny all;
        }
    }
}
EOF

    print_success "Nginx configuration created"
}

create_environment_file() {
    print_step "Creating environment file..."
    
    cat > /opt/fire-finance/.env << EOF
# Fire Finance Environment Configuration
# Copy this file and update with your values

# Database Configuration
POSTGRES_PASSWORD=$(openssl rand -base64 32)

# Redis Configuration
REDIS_PASSWORD=$(openssl rand -base64 32)

# JWT Secrets (generate strong secrets)
JWT_SECRET=$(openssl rand -base64 64)
JWT_REFRESH_SECRET=$(openssl rand -base64 64)

# Encryption Key (32 characters)
ENCRYPTION_KEY=$(openssl rand -base64 24)

# MFA Secret
MFA_SECRET=$(openssl rand -base64 32)

# Plaid API Configuration (get from https://dashboard.plaid.com)
PLAID_CLIENT_ID=your_plaid_client_id
PLAID_SECRET=your_plaid_secret
PLAID_ENV=sandbox

# MinIO Configuration
MINIO_USER=firefinance
MINIO_PASSWORD=$(openssl rand -base64 32)

# Grafana Configuration
GRAFANA_PASSWORD=$(openssl rand -base64 16)

# External URLs
API_URL=https://firefinance.local
FRONTEND_WEB_URL=https://firefinance.local

# Security Settings
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
SESSION_TIMEOUT_MINUTES=60
MAX_LOGIN_ATTEMPTS=5
ACCOUNT_LOCKOUT_DURATION_MINUTES=30

# Feature Flags
ENABLE_REALTIME_COLLABORATION=true
ENABLE_PUSH_NOTIFICATIONS=true
ENABLE_EMAIL_NOTIFICATIONS=true
ENABLE_SMS_NOTIFICATIONS=false
MAX_USERS=5
ENABLE_BUSINESS_MODULE=true
ENABLE_INVESTMENT_TRACKING=true
ENABLE_CREDIT_MONITORING=true

# Backup Configuration
BACKUP_SCHEDULE="0 2 * * *"
BACKUP_RETENTION_DAYS=30
BACKUP_LOCATION=/opt/fire-finance/backups
EOF

    print_success "Environment file created"
    print_success "Please edit /opt/fire-finance/.env with your actual values"
}

setup_backup_scripts() {
    print_step "Setting up backup scripts..."
    
    mkdir -p /opt/fire-finance/scripts
    
    # Database backup script
    cat > /opt/fire-finance/scripts/backup-database.sh << 'EOF'
#!/bin/bash

# Fire Finance Database Backup Script

BACKUP_DIR="/opt/fire-finance/backups"
RETENTION_DAYS=30
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup PostgreSQL database
docker exec firefinance-postgres pg_dump -U firefinance firefinance_db > "$BACKUP_DIR/firefinance_$DATE.sql"

# Compress backup
gzip "$BACKUP_DIR/firefinance_$DATE.sql"

# Remove old backups
find "$BACKUP_DIR" -name "firefinance_*.sql.gz" -mtime +$RETENTION_DAYS -delete

# Log backup completion
echo "$(date): Database backup completed: firefinance_$DATE.sql.gz" >> /var/log/firefinance-backup.log
EOF

    chmod +x /opt/fire-finance/scripts/backup-database.sh
    
    # Setup cron job
    (crontab -l 2>/dev/null || echo "") | grep -v "backup-database.sh" | (cat; echo "0 2 * * * /opt/fire-finance/scripts/backup-database.sh") | crontab -
    
    print_success "Backup scripts configured"
}

setup_monitoring() {
    print_step "Setting up monitoring..."
    
    mkdir -p /opt/fire-finance/monitoring/{prometheus,grafana}
    
    # Prometheus configuration
    cat > /opt/fire-finance/monitoring/prometheus.yml << EOF
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'firefinance-api'
    static_configs:
      - targets: ['api:3000']
    metrics_path: '/metrics'
    scrape_interval: 30s

  - job_name: 'firefinance-postgres'
    static_configs:
      - targets: ['postgres:5432']
    scrape_interval: 30s

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['localhost:9100']
EOF

    print_success "Monitoring setup completed"
}

start_services() {
    print_step "Starting Fire Finance services..."
    
    cd /opt/fire-finance
    
    # Load environment variables
    if [ -f .env ]; then
        export $(grep -v '^#' .env | xargs)
    fi
    
    # Start services
    docker-compose up -d
    
    # Wait for services to be ready
    print_step "Waiting for services to be ready..."
    sleep 30
    
    # Check health
    if curl -f http://localhost:3000/health > /dev/null 2>&1; then
        print_success "Fire Finance API is running"
    else
        print_error "Fire Finance API is not responding"
        docker-compose logs api
    fi
    
    print_success "Fire Finance services started"
}

show_next_steps() {
    print_success "Fire Finance installation completed!"
    echo
    echo "Next steps:"
    echo "1. Edit /opt/fire-finance/.env with your actual configuration"
    echo "2. Configure your domain and SSL certificates"
    echo "3. Set up Plaid API credentials at https://dashboard.plaid.com"
    echo "4. Access Fire Finance at https://your-domain.com"
    echo
    echo "Useful commands:"
    echo "- View logs: docker-compose logs -f"
    echo "- Stop services: docker-compose down"
    echo "- Update services: docker-compose pull && docker-compose up -d"
    echo "- Backup database: /opt/fire-finance/scripts/backup-database.sh"
    echo
    echo "Monitoring:"
    echo "- Prometheus: http://localhost:9090"
    echo "- Grafana: http://localhost:3002 (admin/password from .env)"
    echo
    echo "Support:"
    echo "- Check logs: docker-compose logs"
    echo "- Health check: curl http://localhost:3000/health"
}

# Main execution
main() {
    print_header
    
    # Parse arguments
    local domain="firefinance.local"
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --domain)
                domain="$2"
                shift 2
                ;;
            --help)
                echo "Usage: $0 [--domain DOMAIN]"
                echo "  --domain    Set the domain name (default: firefinance.local)"
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Run setup steps
    check_root
    check_proxmox
    install_dependencies
    setup_network_storage
    generate_ssl_certificates "$domain"
    create_docker_compose
    create_nginx_config "$domain"
    create_environment_file
    setup_backup_scripts
    setup_monitoring
    start_services
    show_next_steps
}

# Run main function with all arguments
main "$@"