//
//  AuthService.swift
//  FireFinance
//
//  Created by Fire Finance Team on 1/6/24.
//

import Foundation
import Combine
import KeychainSwift
import LocalAuthentication

class AuthService: ObservableObject {
    static let shared = AuthService()
    
    @Published var isAuthenticated: Bool = false
    @Published var currentUser: User?
    @Published var authTokens: AuthTokens?
    @Published var isLoading: Bool = false
    @Published var error: AuthError?
    
    private let keychain = KeychainSwift()
    private let baseURL = "https://your-firefinance-server.com/api"
    private var refreshTimer: Timer?
    
    private init() {
        loadStoredAuth()
    }
    
    // MARK: - Authentication Methods
    
    func login(email: String, password: String, mfaToken: String? = nil) async -> Bool {
        await MainActor.run { isLoading = true }
        
        do {
            let loginRequest = LoginRequest(email: email, password: password, mfaToken: mfaToken)
            let tokens = try await performLogin(request: loginRequest)
            
            await MainActor.run {
                self.authTokens = tokens
                self.isAuthenticated = true
                self.storeAuthTokens(tokens)
                self.scheduleTokenRefresh()
                self.isLoading = false
                self.error = nil
            }
            
            // Fetch user details
            await fetchCurrentUser()
            
            return true
            
        } catch let authError as AuthError {
            await MainActor.run {
                self.error = authError
                self.isLoading = false
            }
            return false
        } catch {
            await MainActor.run {
                self.error = .networkError(error.localizedDescription)
                self.isLoading = false
            }
            return false
        }
    }
    
    func register(email: String, username: String, password: String, 
                  firstName: String, lastName: String, phone: String? = nil) async -> Bool {
        await MainActor.run { isLoading = true }
        
        do {
            let registerRequest = RegisterRequest(
                email: email,
                username: username,
                password: password,
                firstName: firstName,
                lastName: lastName,
                phone: phone
            )
            
            let tokens = try await performRegister(request: registerRequest)
            
            await MainActor.run {
                self.authTokens = tokens
                self.isAuthenticated = true
                self.storeAuthTokens(tokens)
                self.scheduleTokenRefresh()
                self.isLoading = false
                self.error = nil
            }
            
            await fetchCurrentUser()
            
            return true
            
        } catch let authError as AuthError {
            await MainActor.run {
                self.error = authError
                self.isLoading = false
            }
            return false
        } catch {
            await MainActor.run {
                self.error = .networkError(error.localizedDescription)
                self.isLoading = false
            }
            return false
        }
    }
    
    func logout() {
        // Clear stored credentials
        keychain.clear()
        
        // Reset state
        authTokens = nil
        currentUser = nil
        isAuthenticated = false
        
        // Cancel refresh timer
        refreshTimer?.invalidate()
        refreshTimer = nil
        
        // Notify other services
        NotificationCenter.default.post(name: .userDidLogout, object: nil)
    }
    
    func refreshTokens() async -> Bool {
        guard let refreshToken = authTokens?.refreshToken else {
            return false
        }
        
        do {
            let newTokens = try await performTokenRefresh(refreshToken: refreshToken)
            
            await MainActor.run {
                self.authTokens = newTokens
                self.storeAuthTokens(newTokens)
                self.scheduleTokenRefresh()
            }
            
            return true
        } catch {
            await MainActor.run {
                self.logout()
            }
            return false
        }
    }
    
    // MARK: - User Management
    
    func fetchCurrentUser() async {
        do {
            let user = try await performGetCurrentUser()
            await MainActor.run {
                self.currentUser = user
            }
        } catch {
            logger.error("Failed to fetch current user: \(error)")
        }
    }
    
    func updateProfile(firstName: String, lastName: String, phone: String?) async -> Bool {
        do {
            let updatedUser = try await performUpdateProfile(firstName: firstName, 
                                                           lastName: lastName, 
                                                           phone: phone)
            await MainActor.run {
                self.currentUser = updatedUser
            }
            return true
        } catch {
            await MainActor.run {
                self.error = .serverError(error.localizedDescription)
            }
            return false
        }
    }
    
    // MARK: - MFA Methods
    
    func setupMFA() async -> MFASecret? {
        do {
            return try await performSetupMFA()
        } catch {
            await MainActor.run {
                self.error = .serverError(error.localizedDescription)
            }
            return nil
        }
    }
    
    func enableMFA(secret: String, token: String, backupCodes: [String]) async -> Bool {
        do {
            try await performEnableMFA(secret: secret, token: token, backupCodes: backupCodes)
            await fetchCurrentUser()
            return true
        } catch {
            await MainActor.run {
                self.error = .serverError(error.localizedDescription)
            }
            return false
        }
    }
    
    // MARK: - Biometric Authentication
    
    func authenticateWithBiometrics() async -> Bool {
        let context = LAContext()
        var error: NSError?
        
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            return false
        }
        
        do {
            try await context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, 
                                           localizedReason: "Authenticate to access Fire Finance")
            return true
        } catch {
            return false
        }
    }
    
    // MARK: - Push Notifications
    
    func updatePushToken(_ token: String) async {
        do {
            try await performUpdatePushToken(token)
        } catch {
            logger.error("Failed to update push token: \(error)")
        }
    }
    
    // MARK: - Private Methods
    
    private func loadStoredAuth() {
        if let accessToken = keychain.get("accessToken"),
           let refreshToken = keychain.get("refreshToken") {
            let tokens = AuthTokens(
                accessToken: accessToken,
                refreshToken: refreshToken,
                tokenType: "Bearer",
                expiresIn: 900
            )
            self.authTokens = tokens
            self.isAuthenticated = true
            self.scheduleTokenRefresh()
            
            // Fetch user in background
            Task {
                await fetchCurrentUser()
            }
        }
    }
    
    private func storeAuthTokens(_ tokens: AuthTokens) {
        keychain.set(tokens.accessToken, forKey: "accessToken")
        keychain.set(tokens.refreshToken, forKey: "refreshToken")
    }
    
    private func scheduleTokenRefresh() {
        refreshTimer?.invalidate()
        
        // Refresh token 5 minutes before expiry
        let refreshInterval = TimeInterval(tokens.expiresIn - 300)
        refreshTimer = Timer.scheduledTimer(withTimeInterval: refreshInterval, repeats: false) { _ in
            Task {
                await self.refreshTokens()
            }
        }
    }
    
    private func performLogin(request: LoginRequest) async throws -> AuthTokens {
        let url = URL(string: "\(baseURL)/auth/login")!
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "POST"
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let jsonData = try JSONEncoder().encode(request)
        urlRequest.httpBody = jsonData
        
        let (data, response) = try await URLSession.shared.data(for: urlRequest)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw AuthError.networkError("Invalid response")
        }
        
        switch httpResponse.statusCode {
        case 200:
            let authResponse = try JSONDecoder().decode(AuthResponse.self, from: data)
            return authResponse.tokens
        case 401:
            if let errorResponse = try? JSONDecoder().decode(ErrorResponse.self, from: data) {
                if errorResponse.error == "MFA_REQUIRED" {
                    throw AuthError.mfaRequired
                }
            }
            throw AuthError.invalidCredentials
        default:
            throw AuthError.serverError("Login failed")
        }
    }
    
    private func performRegister(request: RegisterRequest) async throws -> AuthTokens {
        let url = URL(string: "\(baseURL)/auth/register")!
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "POST"
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let jsonData = try JSONEncoder().encode(request)
        urlRequest.httpBody = jsonData
        
        let (data, response) = try await URLSession.shared.data(for: urlRequest)
        
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 201 else {
            throw AuthError.serverError("Registration failed")
        }
        
        let authResponse = try JSONDecoder().decode(AuthResponse.self, from: data)
        return authResponse.tokens
    }
    
    private func performTokenRefresh(refreshToken: String) async throws -> AuthTokens {
        let url = URL(string: "\(baseURL)/auth/refresh")!
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "POST"
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let request = RefreshRequest(refreshToken: refreshToken)
        let jsonData = try JSONEncoder().encode(request)
        urlRequest.httpBody = jsonData
        
        let (data, response) = try await URLSession.shared.data(for: urlRequest)
        
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw AuthError.sessionExpired
        }
        
        let authResponse = try JSONDecoder().decode(AuthResponse.self, from: data)
        return authResponse.tokens
    }
    
    private func performGetCurrentUser() async throws -> User {
        let url = URL(string: "\(baseURL)/users/me")!
        var urlRequest = URLRequest(url: url)
        urlRequest.setValue("Bearer \(authTokens?.accessToken ?? "")", forHTTPHeaderField: "Authorization")
        
        let (data, response) = try await URLSession.shared.data(for: urlRequest)
        
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw AuthError.serverError("Failed to fetch user")
        }
        
        return try JSONDecoder().decode(User.self, from: data)
    }
    
    private func performUpdateProfile(firstName: String, lastName: String, phone: String?) async throws -> User {
        let url = URL(string: "\(baseURL)/users/me")!
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "PUT"
        urlRequest.setValue("Bearer \(authTokens?.accessToken ?? "")", forHTTPHeaderField: "Authorization")
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let request = UpdateProfileRequest(firstName: firstName, lastName: lastName, phone: phone)
        let jsonData = try JSONEncoder().encode(request)
        urlRequest.httpBody = jsonData
        
        let (data, response) = try await URLSession.shared.data(for: urlRequest)
        
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw AuthError.serverError("Failed to update profile")
        }
        
        return try JSONDecoder().decode(User.self, from: data)
    }
    
    private func performSetupMFA() async throws -> MFASecret {
        let url = URL(string: "\(baseURL)/auth/mfa/setup")!
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "POST"
        urlRequest.setValue("Bearer \(authTokens?.accessToken ?? "")", forHTTPHeaderField: "Authorization")
        
        let (data, response) = try await URLSession.shared.data(for: urlRequest)
        
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw AuthError.serverError("Failed to setup MFA")
        }
        
        return try JSONDecoder().decode(MFASecret.self, from: data)
    }
    
    private func performEnableMFA(secret: String, token: String, backupCodes: [String]) async throws {
        let url = URL(string: "\(baseURL)/auth/mfa/enable")!
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "POST"
        urlRequest.setValue("Bearer \(authTokens?.accessToken ?? "")", forHTTPHeaderField: "Authorization")
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let request = EnableMFARequest(secret: secret, token: token, backupCodes: backupCodes)
        let jsonData = try JSONEncoder().encode(request)
        urlRequest.httpBody = jsonData
        
        let (_, response) = try await URLSession.shared.data(for: urlRequest)
        
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw AuthError.serverError("Failed to enable MFA")
        }
    }
    
    private func performUpdatePushToken(_ token: String) async throws {
        let url = URL(string: "\(baseURL)/users/push-token")!
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "POST"
        urlRequest.setValue("Bearer \(authTokens?.accessToken ?? "")", forHTTPHeaderField: "Authorization")
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let request = UpdatePushTokenRequest(token: token)
        let jsonData = try JSONEncoder().encode(request)
        urlRequest.httpBody = jsonData
        
        let (_, response) = try await URLSession.shared.data(for: urlRequest)
        
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw AuthError.serverError("Failed to update push token")
        }
    }
}

// MARK: - Supporting Types

struct AuthResponse: Codable {
    let tokens: AuthTokens
    let user: User
}

struct RefreshRequest: Codable {
    let refreshToken: String
}

struct UpdateProfileRequest: Codable {
    let firstName: String
    let lastName: String
    let phone: String?
}

struct EnableMFARequest: Codable {
    let secret: String
    let token: String
    let backupCodes: [String]
}

struct UpdatePushTokenRequest: Codable {
    let token: String
}

struct ErrorResponse: Codable {
    let error: String
    let message: String?
}

// MARK: - Error Types

enum AuthError: Error, LocalizedError {
    case invalidCredentials
    case mfaRequired
    case sessionExpired
    case networkError(String)
    case serverError(String)
    case biometricsFailed
    
    var errorDescription: String? {
        switch self {
        case .invalidCredentials:
            return "Invalid email or password"
        case .mfaRequired:
            return "Multi-factor authentication is required"
        case .sessionExpired:
            return "Session expired. Please log in again."
        case .networkError(let message):
            return "Network error: \(message)"
        case .serverError(let message):
            return "Server error: \(message)"
        case .biometricsFailed:
            return "Biometric authentication failed"
        }
    }
}

// MARK: - Notifications

extension Notification.Name {
    static let userDidLogout = Notification.Name("userDidLogout")
}