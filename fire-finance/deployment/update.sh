#!/bin/bash

# Fire Finance Update Script
# This script updates the Fire Finance application

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BACKUP_DIR="/opt/fire-finance/backups"
COMPOSE_DIR="/opt/fire-finance"

# Functions
print_header() {
    echo -e "${GREEN}"
    echo "======================================================"
    echo "     Fire Finance Update Script"
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

backup_database() {
    print_step "Backing up database..."
    
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="$BACKUP_DIR/firefinance_pre_update_$timestamp.sql.gz"
    
    mkdir -p "$BACKUP_DIR"
    
    if docker-compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T postgres pg_dump -U firefinance firefinance_db | gzip > "$backup_file"; then
        print_success "Database backed up to: $backup_file"
    else
        print_error "Failed to backup database"
        exit 1
    fi
}

pull_updates() {
    print_step "Pulling latest updates..."
    
    cd "$COMPOSE_DIR"
    
    # Pull latest Docker images
    if docker-compose pull; then
        print_success "Docker images updated"
    else
        print_error "Failed to pull Docker images"
        exit 1
    fi
}

stop_services() {
    print_step "Stopping services..."
    
    cd "$COMPOSE_DIR"
    
    # Graceful shutdown
    docker-compose down --timeout 30
    
    print_success "Services stopped"
}

update_services() {
    print_step "Updating services..."
    
    cd "$COMPOSE_DIR"
    
    # Start services with new images
    docker-compose up -d
    
    print_success "Services updated"
}

run_migrations() {
    print_step "Running database migrations..."
    
    cd "$COMPOSE_DIR"
    
    # Run migrations in API container
    docker-compose exec -T api npm run db:migrate || {
        print_error "Database migrations failed"
        exit 1
    }
    
    print_success "Database migrations completed"
}

check_health() {
    print_step "Checking service health..."
    
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f http://localhost:3000/health > /dev/null 2>&1; then
            print_success "API is healthy"
            return 0
        fi
        
        echo "Waiting for API to be ready... (Attempt $attempt/$max_attempts)"
        sleep 10
        ((attempt++))
    done
    
    print_error "API is not responding after $max_attempts attempts"
    return 1
}

cleanup_old_images() {
    print_step "Cleaning up old Docker images..."
    
    # Remove unused images
    docker image prune -f
    
    # Remove old backups (keep last 10)
    find "$BACKUP_DIR" -name "firefinance_pre_update_*.sql.gz" -type f | sort | head -n -10 | xargs -r rm -f
    
    print_success "Cleanup completed"
}

rollback() {
    print_error "Update failed! Initiating rollback..."
    
    cd "$COMPOSE_DIR"
    
    # Stop current services
    docker-compose down
    
    # Find latest backup
    local latest_backup=$(find "$BACKUP_DIR" -name "firefinance_pre_update_*.sql.gz" -type f | sort | tail -n 1)
    
    if [ -z "$latest_backup" ]; then
        print_error "No backup found for rollback"
        exit 1
    fi
    
    # Restore database
    print_step "Restoring database from: $latest_backup"
    docker-compose exec -T postgres psql -U firefinance -d firefinance_db < <(gunzip -c "$latest_backup") || {
        print_error "Failed to restore database"
        exit 1
    }
    
    # Start services with previous version
    docker-compose up -d
    
    print_success "Rollback completed"
}

show_logs() {
    print_step "Recent logs:"
    
    cd "$COMPOSE_DIR"
    
    echo "=== API Logs ==="
    docker-compose logs --tail=50 api
    
    echo "=== WebSocket Logs ==="
    docker-compose logs --tail=50 websocket
    
    echo "=== Database Logs ==="
    docker-compose logs --tail=50 postgres
}

main() {
    print_header
    
    # Check if running as root
    if [[ $EUID -ne 0 ]]; then
        print_error "This script must be run as root"
        exit 1
    fi
    
    # Parse arguments
    local skip_backup=false
    local skip_health_check=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-backup)
                skip_backup=true
                shift
                ;;
            --skip-health-check)
                skip_health_check=true
                shift
                ;;
            --help)
                echo "Usage: $0 [OPTIONS]"
                echo "Options:"
                echo "  --skip-backup       Skip database backup"
                echo "  --skip-health-check Skip health check after update"
                echo "  --help              Show this help message"
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Pre-update checks
    if [ ! -f "$COMPOSE_DIR/docker-compose.yml" ]; then
        print_error "Docker Compose file not found at $COMPOSE_DIR"
        exit 1
    fi
    
    # Backup database
    if [ "$skip_backup" = false ]; then
        backup_database
    else
        print_step "Skipping database backup"
    fi
    
    # Update process
    pull_updates
    stop_services
    update_services
    run_migrations
    
    # Health check
    if [ "$skip_health_check" = false ]; then
        if check_health; then
            print_success "Update completed successfully"
        else
            rollback
            exit 1
        fi
    else
        print_success "Update completed (health check skipped)"
    fi
    
    # Cleanup
    cleanup_old_images
    
    # Show recent logs
    show_logs
}

# Run main function with all arguments
main "$@"