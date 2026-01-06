//
//  User.swift
//  FireFinance
//
//  Created by Fire Finance Team on 1/6/24.
//

import Foundation
import SwiftUI

struct User: Codable, Identifiable {
    let id: String
    let email: String
    let username: String
    let firstName: String
    let lastName: String
    let role: UserRole
    let mfaEnabled: Bool
    let households: [Household]
    let preferences: UserPreferences?
    
    var fullName: String {
        "\(firstName) \(lastName)"
    }
    
    var displayName: String {
        if !firstName.isEmpty && !lastName.isEmpty {
            return fullName
        } else if !username.isEmpty {
            return username
        } else {
            return email
        }
    }
}

enum UserRole: String, Codable {
    case admin = "admin"
    case auditor = "auditor"
    case taxPrepper = "tax_prepper"
    case user = "user"
}

struct Household: Codable, Identifiable {
    let id: String
    let name: String
    let role: HouseholdRole
    let permissions: HouseholdPermissions
    
    var displayName: String {
        name.isEmpty ? "My Household" : name
    }
}

enum HouseholdRole: String, Codable {
    case admin = "admin"
    case member = "member"
    case viewer = "viewer"
}

enum HouseholdPermissions: String, Codable {
    case full = "full"
    case readWrite = "read_write"
    case readOnly = "read_only"
}

struct UserPreferences: Codable {
    let currency: String?
    let dateFormat: String?
    let theme: AppTheme?
    let notifications: NotificationPreferences?
    let privacy: PrivacySettings?
}

enum AppTheme: String, Codable {
    case light = "light"
    case dark = "dark"
    case system = "system"
}

struct NotificationPreferences: Codable {
    let pushEnabled: Bool
    let emailEnabled: Bool
    let smsEnabled: Bool
    let billReminders: Bool
    let budgetAlerts: Bool
    let collaborationUpdates: Bool
    let securityAlerts: Bool
}

struct PrivacySettings: Codable {
    let shareDataWithAnalytics: Bool
    let allowCrashReporting: Bool
    let dataRetentionDays: Int
}

struct AuthTokens: Codable {
    let accessToken: String
    let refreshToken: String
    let tokenType: String
    let expiresIn: Int
}

struct LoginRequest: Codable {
    let email: String
    let password: String
    let mfaToken: String?
}

struct RegisterRequest: Codable {
    let email: String
    let username: String
    let password: String
    let firstName: String
    let lastName: String
    let phone: String?
}

struct MFASecret: Codable {
    let secret: String
    let qrCode: String
    let backupCodes: [String]
}