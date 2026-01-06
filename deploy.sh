#!/bin/bash

# Fire Finance Deployment Script
# This script sets up the complete Fire Finance application on Proxmox VE

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_NAME="firefinance"
BACKEND_DIR="$SCRIPT_DIR/backend"
WEB_DIR="$SCRIPT_DIR/frontend-web"

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   print_error "This script should not be run as root for security reasons."
   exit 1
fi

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    # Check if Docker Compose is installed
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    # Check if .env file exists
    if [ ! -f "$BACKEND_DIR/.env" ]; then
        print_warning ".env file not found. Creating from template..."
        cp "$BACKEND_DIR/.env.template" "$BACKEND_DIR/.env"
        print_warning "Please edit $BACKEND_DIR/.env with your configuration before continuing."
        exit 1
    fi
    
    print_status "Prerequisites check passed."
}

# Setup SSL certificates
setup_ssl() {
    print_status "Setting up SSL certificates..."
    
    SSL_DIR="$BACKEND_DIR/ssl"
    mkdir -p "$SSL_DIR"
    
    # Generate self-signed certificates for initial setup
    # In production, replace with proper certificates from Let's Encrypt or your CA
    if [ ! -f "$SSL_DIR/firefinance.crt" ]; then
        print_warning "Generating self-signed SSL certificates..."
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout "$SSL_DIR/firefinance.key" \
            -out "$SSL_DIR/firefinance.crt" \
            -subj "/C=US/ST=State/L=City/O=FireFinance/CN=firefinance.local"
    fi
    
    print_status "SSL setup completed."
}

# Initialize database
init_database() {
    print_status "Initializing database..."
    
    # Start PostgreSQL container
    docker-compose -f "$BACKEND_DIR/docker-compose.yml" up -d postgres
    
    # Wait for PostgreSQL to be ready
    print_status "Waiting for PostgreSQL to be ready..."
    sleep 10
    
    # Run database migrations
    if [ -f "$BACKEND_DIR/init.sql" ]; then
        docker-compose -f "$BACKEND_DIR/docker-compose.yml" exec -T postgres \
            psql -U firefinance -d firefinance_db -f /docker-entrypoint-initdb.d/init.sql
    fi
    
    print_status "Database initialization completed."
}

# Deploy backend services
deploy_backend() {
    print_status "Deploying backend services..."
    
    cd "$BACKEND_DIR"
    
    # Build and start all services
    docker-compose up -d
    
    # Wait for services to be ready
    print_status "Waiting for services to be ready..."
    sleep 30
    
    # Check service health
    docker-compose ps
    
    print_status "Backend deployment completed."
}

# Build web client
build_web_client() {
    print_status "Building web client..."
    
    cd "$WEB_DIR"
    
    # Install dependencies
    if [ ! -d "node_modules" ]; then
        npm install
    fi
    
    # Build for production
    npm run build
    
    # Copy build to nginx static directory
    docker-compose -f "$BACKEND_DIR/docker-compose.yml" exec -T nginx \
        mkdir -p /usr/share/nginx/html
    
    # Note: In production, you might want to use a CDN or separate web server
    print_status "Web client build completed."
}

# Setup monitoring
setup_monitoring() {
    print_status "Setting up monitoring..."
    
    # Wait for Prometheus and Grafana to be ready
    sleep 15
    
    # Configure Grafana datasource
    curl -X POST http://admin:admin@localhost:3002/api/datasources \
        -H 'Content-Type: application/json' \
        -d '{
            "name":"Prometheus",
            "type":"prometheus",
            "url":"http://prometheus:9090",
            "access":"proxy",
            "basicAuth":false
        }' || true
    
    print_status "Monitoring setup completed."
}

# Display deployment information
display_info() {
    print_status "Fire Finance deployment completed successfully!"
    echo
    echo "Access URLs:"
    echo "- Main Application: https://localhost (or your server IP)"
    echo "- API Documentation: https://localhost/api/docs"
    echo "- Grafana Dashboard: http://localhost:3002 (admin/admin)"
    echo "- Prometheus: http://localhost:9090"
    echo
    echo "Important files:"
    echo "- Configuration: $BACKEND_DIR/.env"
    echo "- Logs: docker-compose logs -f"
    echo "- SSL Certificates: $BACKEND_DIR/ssl/"
    echo
    echo "Next steps:"
    echo "1. Configure your DNS to point to this server"
    echo "2. Replace self-signed certificates with proper SSL certificates"
    echo "3. Configure Plaid API credentials in .env"
    echo "4. Set up push notification credentials"
    echo "5. Create your first admin user"
    echo
    echo "To stop all services: docker-compose -f $BACKEND_DIR/docker-compose.yml down"
    echo "To start all services: docker-compose -f $BACKEND_DIR/docker-compose.yml up -d"
}

# Main deployment function
main() {
    print_status "Starting Fire Finance deployment..."
    echo
    
    check_prerequisites
    setup_ssl
    init_database
    deploy_backend
    build_web_client
    setup_monitoring
    
    echo
    display_info
}

# Run main function
main "$@"