#!/bin/bash

# Fire Finance Branding Setup Script
# This script ensures all branding assets are properly placed across all UIs

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

print_status "Setting up Fire Finance branding assets..."

# Create necessary directories
mkdir -p "$PROJECT_ROOT/fire-finance/frontend-web/public/branding/icons"
mkdir -p "$PROJECT_ROOT/fire-finance/frontend-web/public/branding/logos"
mkdir -p "$PROJECT_ROOT/fire-finance/frontend-web/public/branding/watermarks"

mkdir -p "$PROJECT_ROOT/fire-finance/frontend-ios/FireFinance/Resources/Branding"
mkdir -p "$PROJECT_ROOT/fire-finance/frontend-windows/FireWindows/Assets/Branding"

# Copy web UI assets
print_status "Setting up web UI branding..."
cp "$SCRIPT_DIR/icons/favicon.ico" "$PROJECT_ROOT/fire-finance/frontend-web/public/"
cp "$SCRIPT_DIR/icons/favicon.png" "$PROJECT_ROOT/fire-finance/frontend-web/public/branding/icons/"
cp "$SCRIPT_DIR/icons/logo512.png" "$PROJECT_ROOT/fire-finance/frontend-web/public/branding/icons/"
cp "$SCRIPT_DIR/logos/firefinance-logo-main.png" "$PROJECT_ROOT/fire-finance/frontend-web/public/branding/logos/"
cp "$SCRIPT_DIR/logos/firefinance-logo-horizontal.png" "$PROJECT_ROOT/fire-finance/frontend-web/public/branding/logos/"
cp "$SCRIPT_DIR/watermarks/firefinance-watermark-light.png" "$PROJECT_ROOT/fire-finance/frontend-web/public/branding/watermarks/"
cp "$SCRIPT_DIR/watermarks/firefinance-watermark-dark.png" "$PROJECT_ROOT/fire-finance/frontend-web/public/branding/watermarks/"

# Copy iOS assets
print_status "Setting up iOS app branding..."
cp "$SCRIPT_DIR/icons/app-icon-ios.png" "$PROJECT_ROOT/fire-finance/frontend-ios/FireFinance/Resources/AppIcon-1024.png"
cp "$SCRIPT_DIR/logos/firefinance-logo-main.png" "$PROJECT_ROOT/fire-finance/frontend-ios/FireFinance/Resources/Branding/logo-main.png"
cp "$SCRIPT_DIR/logos/firefinance-logo-horizontal.png" "$PROJECT_ROOT/fire-finance/frontend-ios/FireFinance/Resources/Branding/logo-horizontal.png"

# Copy Windows assets
print_status "Setting up Windows app branding..."
cp "$SCRIPT_DIR/icons/app-icon-windows.png" "$PROJECT_ROOT/fire-finance/frontend-windows/FireWindows/Assets/app-icon-1024.png"
cp "$SCRIPT_DIR/logos/firefinance-logo-main.png" "$PROJECT_ROOT/fire-finance/frontend-windows/FireWindows/Assets/Branding/logo-main.png"
cp "$SCRIPT_DIR/logos/firefinance-logo-horizontal.png" "$PROJECT_ROOT/fire-finance/frontend-windows/FireWindows/Assets/Branding/logo-horizontal.png"

# Create updated manifest.json for web PWA
print_status "Updating PWA manifest..."
cat > "$PROJECT_ROOT/fire-finance/frontend-web/public/manifest.json" << 'EOF'
{
  "short_name": "FireFinance",
  "name": "Fire Finance - Personal & Business Finance",
  "icons": [
    {
      "src": "branding/icons/logo512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "branding/icons/app-icon-ios.png",
      "sizes": "1024x1024",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ],
  "start_url": "/",
  "display": "standalone",
  "theme_color": "#FF6B35",
  "background_color": "#FFFFFF"
}
EOF

print_success "Branding assets setup completed!"
print_status ""
print_status "Assets have been copied to:"
print_status "- Web UI: frontend-web/public/branding/"
print_status "- iOS App: frontend-ios/FireFinance/Resources/Branding/"
print_status "- Windows App: frontend-windows/FireWindows/Assets/Branding/"
print_status ""
print_status "Next steps:"
print_status "1. Build the web UI: cd frontend-web && npm run build"
print_status "2. Build iOS app in Xcode"
print_status "3. Build Windows app in Visual Studio"
print_status "4. All apps will now use consistent Fire Finance branding!"