# Fire Finance Branding Guide

## Brand Assets Overview

This guide ensures consistent branding across all Fire Finance platforms and applications.

### Primary Logo

**Main Logo (Square)**
- File: `logos/firefinance-logo-main.png`
- Size: 1024x1024px
- Usage: Application splash screens, profile images, social media
- Background: White or transparent

**Horizontal Logo**
- File: `logos/firefinance-logo-horizontal.png` 
- Size: 1536x1024px
- Usage: Website headers, business cards, documentation headers
- Background: White

### Watermarks

**Light Watermark**
- File: `watermarks/firefinance-watermark-light.png`
- Size: 1024x1024px
- Usage: Dark document backgrounds, reports, PDFs
- Opacity: 10-15%

**Dark Watermark**
- File: `watermarks/firefinance-watermark-dark.png`
- Size: 1024x1024px
- Usage: Light document backgrounds, reports, PDFs
- Opacity: 10-15%

### Icons

**Favicon**
- File: `icons/favicon.ico` (contains 16x16 and 32x32 variants)
- Usage: Browser tabs, bookmarks
- Format: ICO with PNG source

**iOS App Icon**
- File: `icons/app-icon-ios.png`
- Size: 1024x1024px (iOS will generate all required sizes)
- Usage: iPhone/iPad home screen, App Store
- Style: Rounded corners, no transparency

**Windows App Icon**
- File: `icons/app-icon-windows.png`
- Size: 1024x1024px
- Usage: Windows taskbar, start menu, desktop shortcuts
- Style: Subtle transparency, optimized for Windows 11

**Web App Icon (PWA)**
- File: `icons/logo512.png` (existing)
- Size: 512x512px
- Usage: Progressive Web App manifest, web app installations

## Brand Colors

### Primary Colors
- **Flame Orange**: #FF6B35
- **Fire Red**: #F7931E
- **Gradient**: Orange to Red (#FF6B35 to #F7931E)

### Supporting Colors
- **Dark Text**: #2C3E50 (for light backgrounds)
- **Light Text**: #FFFFFF (for dark backgrounds)
- **Neutral Gray**: #95A5A6
- **Success Green**: #27AE60
- **Warning Orange**: #F39C12
- **Error Red**: #E74C3C

## Usage Guidelines

### Logo Usage

**Do:**
- Use the complete logo with flame icon
- Maintain proper spacing around the logo
- Use high-resolution versions for print
- Ensure sufficient contrast with background

**Don't:**
- Stretch or distort the logo
- Change logo colors
- Use on busy backgrounds
- Remove or alter the flame element

### Icon Usage

**Application Icons:**
- Use the flame icon with gradient
- Maintain consistent styling across platforms
- Ensure readability at small sizes
- Follow platform-specific guidelines (iOS rounded corners, etc.)

**Favicon:**
- Use the 32x32 ICO version for best compatibility
- Ensure visibility on browser tabs
- Test on both light and dark browser themes

### Watermark Usage

**Document Watermarks:**
- Apply at 10-15% opacity
- Position in background, not over text
- Use light watermark on dark backgrounds
- Use dark watermark on light backgrounds
- Center or tile pattern for full coverage

## Platform-Specific Implementation

### iOS Implementation
```swift
// App Icon
Assets.xcassets/AppIcon.appiconset/
├── app-icon-ios-20x20@2x.png
├── app-icon-ios-20x20@3x.png
├── app-icon-ios-29x29@2x.png
├── app-icon-ios-29x29@3x.png
├── app-icon-ios-40x40@2x.png
├── app-icon-ios-40x40@3x.png
├── app-icon-ios-60x60@2x.png
├── app-icon-ios-60x60@3x.png
└── app-icon-ios-1024x1024.png

// Splash Screen
LaunchScreen.storyboard - Use firefinance-logo-main.png
```

### Windows Implementation
```xml
<!-- App Icon in Package.appxmanifest -->
<Applications>
  <Application Id="App"
    Executable="FireWindows.exe"
    EntryPoint="FireWindows.App">
    <uap:VisualElements
      DisplayName="Fire Finance"
      Square150x150Logo="Assets/app-icon-windows-150.png"
      Square44x44Logo="Assets/app-icon-windows-44.png"
      Description="Fire Finance - Personal & Business Finance"
      BackgroundColor="#FFFFFF"/>
  </Application>
</Applications>
```

### Web Implementation
```html
<!-- Favicon in index.html -->
<link rel="icon" href="/branding/icons/favicon.ico" type="image/x-icon">
<link rel="shortcut icon" href="/branding/icons/favicon.ico" type="image/x-icon">

<!-- PWA Manifest -->
{
  "name": "Fire Finance",
  "short_name": "FireFinance",
  "icons": [
    {
      "src": "/branding/icons/logo512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ],
  "theme_color": "#FF6B35",
  "background_color": "#FFFFFF"
}
```

## File Structure

```
branding/
├── logos/
│   ├── firefinance-logo-main.png          # Primary logo (1024x1024)
│   └── firefinance-logo-horizontal.png    # Logo with text (1536x1024)
├── icons/
│   ├── favicon.png                        # Source favicon (1024x1024)
│   ├── favicon.ico                        # Browser favicon (16/32px)
│   ├── app-icon-ios.png                   # iOS app icon (1024x1024)
│   ├── app-icon-windows.png               # Windows app icon (1024x1024)
│   └── logo512.png                        # PWA icon (512x512)
├── watermarks/
│   ├── firefinance-watermark-light.png    # Light watermark
│   └── firefinance-watermark-dark.png     # Dark watermark
└── BRANDING_GUIDE.md                      # This guide
```

## Quality Assurance

### Logo Testing
- [ ] Logo displays correctly at all sizes
- [ ] Gradient renders properly on all backgrounds
- [ ] Text remains readable at small sizes
- [ ] Watermarks don't interfere with content

### Cross-Platform Testing
- [ ] Icons display correctly on iOS devices
- [ ] Icons display correctly on Windows 11
- [ ] Favicon works in all major browsers
- [ ] PWA icons install correctly

### Accessibility
- [ ] Sufficient contrast ratios maintained
- [ ] Icons recognizable for color-blind users
- [ ] Alternative text provided for images
- [ ] High contrast mode compatibility

## Maintenance

### Updating Brand Assets
1. Replace files in respective directories
2. Update version numbers in filenames if needed
3. Test on all platforms
4. Update documentation

### Adding New Assets
1. Follow naming convention: `firefinance-[type]-[variant].png`
2. Use appropriate dimensions for intended use
3. Test across platforms and sizes
4. Update this guide

## Support

For questions about brand usage or asset creation, refer to:
- Design team guidelines
- Platform-specific documentation
- Accessibility standards (WCAG 2.1 AA)

---

**Version**: 1.0  
**Last Updated**: 2026-01-07  
**Approved By**: Fire Finance Development Team