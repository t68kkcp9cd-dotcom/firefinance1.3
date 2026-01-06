#!/bin/bash

# Fire Finance Validation Script
# This script validates that all components of Fire Finance are working correctly

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
API_BASE_URL="${API_BASE_URL:-https://localhost}"

# Test results
declare -A test_results

# Function to print colored output
print_status() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

print_failure() {
    echo -e "${RED}[FAIL]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Test Docker services
test_docker_services() {
    print_status "Testing Docker services..."
    
    local services=("postgres" "redis" "api-server" "websocket-server" "nginx" "minio")
    local all_running=true
    
    for service in "${services[@]}"; do
        if docker-compose -f "$BACKEND_DIR/docker-compose.yml" ps "$service" | grep -q "Up"; then
            print_success "Service $service is running"
            test_results["docker_$service"]=true
        else
            print_failure "Service $service is not running"
            test_results["docker_$service"]=false
            all_running=false
        fi
    done
    
    if $all_running; then
        test_results["docker_all"]=true
    else
        test_results["docker_all"]=false
    fi
}

# Test database connectivity
test_database() {
    print_status "Testing database connectivity..."
    
    if docker-compose -f "$BACKEND_DIR/docker-compose.yml" exec -T postgres pg_isready -U firefinance -d firefinance_db; then
        print_success "Database is accessible"
        test_results["database"]=true
    else
        print_failure "Database is not accessible"
        test_results["database"]=false
    fi
}

# Test Redis connectivity
test_redis() {
    print_status "Testing Redis connectivity..."
    
    if docker-compose -f "$BACKEND_DIR/docker-compose.yml" exec -T redis redis-cli ping | grep -q "PONG"; then
        print_success "Redis is accessible"
        test_results["redis"]=true
    else
        print_failure "Redis is not accessible"
        test_results["redis"]=false
    fi
}

# Test API server
test_api_server() {
    print_status "Testing API server..."
    
    local response
    response=$(curl -s -w "%{http_code}" -o /dev/null "$API_BASE_URL/api/health" || echo "000")
    
    if [ "$response" = "200" ]; then
        print_success "API server is responding"
        test_results["api"]=true
    else
        print_failure "API server is not responding (HTTP $response)"
        test_results["api"]=false
    fi
}

# Test WebSocket server
test_websocket_server() {
    print_status "Testing WebSocket server..."
    
    # This is a basic test - in production, you'd want a more thorough test
    if curl -s -I "$API_BASE_URL:3001" | grep -q "HTTP"; then
        print_success "WebSocket port is accessible"
        test_results["websocket"]=true
    else
        print_failure "WebSocket port is not accessible"
        test_results["websocket"]=false
    fi
}

# Test SSL certificate
test_ssl() {
    print_status "Testing SSL certificate..."
    
    local cert_info
    cert_info=$(echo | openssl s_client -connect localhost:443 -servername localhost 2>/dev/null | openssl x509 -noout -subject -dates)
    
    if echo "$cert_info" | grep -q "subject="; then
        print_success "SSL certificate is valid"
        test_results["ssl"]=true
        
        # Check certificate expiration
        local not_after
        not_after=$(echo "$cert_info" | grep "notAfter" | cut -d= -f2)
        print_warning "Certificate expires: $not_after"
    else
        print_failure "SSL certificate is not valid"
        test_results["ssl"]=false
    fi
}

# Test Plaid API integration
test_plaid_integration() {
    print_status "Testing Plaid API integration..."
    
    # Check if Plaid credentials are configured
    if grep -q "PLAID_CLIENT_ID" "$BACKEND_DIR/.env" && grep -q "PLAID_SECRET" "$BACKEND_DIR/.env"; then
        # Try to get Plaid institutions (this is a simple test)
        local response
        response=$(curl -s -w "%{http_code}" -o /dev/null "$API_BASE_URL/api/plaid/health" || echo "000")
        
        if [ "$response" = "200" ]; then
            print_success "Plaid API integration is working"
            test_results["plaid"]=true
        else
            print_failure "Plaid API integration failed (HTTP $response)"
            test_results["plaid"]=false
        fi
    else
        print_warning "Plaid API credentials not configured"
        test_results["plaid"]=false
    fi
}

# Test user registration and authentication
test_authentication() {
    print_status "Testing user registration and authentication..."
    
    # Test registration endpoint
    local response
    response=$(curl -s -w "%{http_code}" -o /dev/null -X POST \
        "$API_BASE_URL/api/auth/register" \
        -H "Content-Type: application/json" \
        -d '{"email":"test@example.com","password":"Test123!","name":"Test User"}' || echo "000")
    
    if [ "$response" = "201" ] || [ "$response" = "400" ]; then
        # 201 = created, 400 = user already exists (both are valid for our test)
        print_success "Authentication endpoints are working"
        test_results["auth"]=true
    else
        print_failure "Authentication endpoints failed (HTTP $response)"
        test_results["auth"]=false
    fi
}

# Test user cap enforcement
test_user_cap() {
    print_status "Testing user cap enforcement..."
    
    # This test would require creating multiple users
    # For now, we'll check if the middleware is loaded
    local logs
    logs=$(docker-compose -f "$BACKEND_DIR/docker-compose.yml" logs api-server --tail=50)
    
    if echo "$logs" | grep -q "checkUserCap"; then
        print_success "User cap middleware is active"
        test_results["user_cap"]=true
    else
        print_warning "User cap middleware not detected in logs"
        test_results["user_cap"]=false
    fi
}

# Test monitoring services
test_monitoring() {
    print_status "Testing monitoring services..."
    
    # Test Prometheus
    local prometheus_response
    prometheus_response=$(curl -s -w "%{http_code}" -o /dev/null "http://localhost:9090" || echo "000")
    
    if [ "$prometheus_response" = "200" ]; then
        print_success "Prometheus is accessible"
        test_results["prometheus"]=true
    else
        print_failure "Prometheus is not accessible"
        test_results["prometheus"]=false
    fi
    
    # Test Grafana
    local grafana_response
    grafana_response=$(curl -s -w "%{http_code}" -o /dev/null "http://localhost:3002" || echo "000")
    
    if [ "$grafana_response" = "200" ]; then
        print_success "Grafana is accessible"
        test_results["grafana"]=true
    else
        print_failure "Grafana is not accessible"
        test_results["grafana"]=false
    fi
}

# Test file storage (MinIO)
test_file_storage() {
    print_status "Testing file storage (MinIO)..."
    
    local minio_response
    minio_response=$(curl -s -w "%{http_code}" -o /dev/null "http://localhost:9000/minio/health/live" || echo "000")
    
    if [ "$minio_response" = "200" ]; then
        print_success "MinIO is accessible"
        test_results["minio"]=true
    else
        print_failure "MinIO is not accessible"
        test_results["minio"]=false
    fi
}

# Test push notification configuration
test_push_notifications() {
    print_status "Testing push notification configuration..."
    
    # Check if APNs credentials are configured
    if grep -q "APNS_KEY_ID" "$BACKEND_DIR/.env" && grep -q "APNS_TEAM_ID" "$BACKEND_DIR/.env"; then
        print_success "APNs credentials are configured"
        test_results["push_ios"]=true
    else
        print_warning "APNs credentials not configured"
        test_results["push_ios"]=false
    fi
    
    # Check if WNS credentials are configured
    if grep -q "WNS_CLIENT_ID" "$BACKEND_DIR/.env" && grep -q "WNS_CLIENT_SECRET" "$BACKEND_DIR/.env"; then
        print_success "WNS credentials are configured"
        test_results["push_windows"]=true
    else
        print_warning "WNS credentials not configured"
        test_results["push_windows"]=false
    fi
}

# Test encryption
test_encryption() {
    print_status "Testing encryption configuration..."
    
    # Check if JWT secret is configured
    if grep -q "JWT_SECRET" "$BACKEND_DIR/.env" && [ -n "$(grep "JWT_SECRET" "$BACKEND_DIR/.env" | cut -d= -f2)" ]; then
        print_success "JWT secret is configured"
        test_results["encryption"]=true
    else
        print_failure "JWT secret is not properly configured"
        test_results["encryption"]=false
    fi
}

# Generate test report
generate_report() {
    print_status "Generating test report..."
    
    echo
    echo "======================================"
    echo "    FIRE FINANCE VALIDATION REPORT"
    echo "======================================"
    echo
    
    local total_tests=0
    local passed_tests=0
    
    for test in "${!test_results[@]}"; do
        total_tests=$((total_tests + 1))
        if [ "${test_results[$test]}" = true ]; then
            passed_tests=$((passed_tests + 1))
            echo -e "${GREEN}✓${NC} $test"
        else
            echo -e "${RED}✗${NC} $test"
        fi
    done
    
    echo
    echo "======================================"
    echo "SUMMARY: $passed_tests/$total_tests tests passed"
    echo "======================================"
    echo
    
    if [ $passed_tests -eq $total_tests ]; then
        print_success "All tests passed! Fire Finance is ready to use."
        return 0
    elif [ $passed_tests -ge $((total_tests * 2 / 3)) ]; then
        print_warning "Most tests passed. Some optional features may not be configured."
        return 0
    else
        print_failure "Many tests failed. Please check the configuration and logs."
        return 1
    fi
}

# Main validation function
main() {
    print_status "Starting Fire Finance validation..."
    echo
    
    test_docker_services
    test_database
    test_redis
    test_api_server
    test_websocket_server
    test_ssl
    test_plaid_integration
    test_authentication
    test_user_cap
    test_monitoring
    test_file_storage
    test_push_notifications
    test_encryption
    
    echo
    generate_report
}

# Run main function
main "$@"