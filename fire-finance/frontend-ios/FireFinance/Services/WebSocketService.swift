//
//  WebSocketService.swift
//  FireFinance
//
//  Created by Fire Finance Team on 1/6/24.
//

import Foundation
import Combine
import SocketIO

class WebSocketService: ObservableObject {
    static let shared = WebSocketService()
    
    @Published var isConnected: Bool = false
    @Published var onlineUsers: Set<String> = []
    @Published var notifications: [RealTimeNotification] = []
    
    private var manager: SocketManager?
    private var socket: SocketIOClient?
    private let baseURL = "https://your-firefinance-server.com"
    
    // Collaboration
    @Published var collaborators: [Collaborator] = []
    @Published var highlightedItems: [HighlightedItem] = []
    
    // Chat
    @Published var chatMessages: [ChatMessage] = []
    @Published var typingUsers: [TypingIndicator] = []
    
    private init() {
        setupSocketConnection()
    }
    
    // MARK: - Connection Management
    
    func connect() {
        guard let authToken = AuthService.shared.authTokens?.accessToken else {
            logger.debug("No auth token available for WebSocket connection")
            return
        }
        
        let config: SocketIOClientConfiguration = [
            .log(true),
            .compress,
            .connectParams(["token": authToken]),
            .reconnects(true),
            .reconnectAttempts(5),
            .reconnectWait(5),
            .forceWebsockets(true)
        ]
        
        manager = SocketManager(socketURL: URL(string: baseURL)!, config: config)
        socket = manager?.defaultSocket
        
        setupEventHandlers()
        socket?.connect()
    }
    
    func disconnect() {
        socket?.disconnect()
        manager = nil
        socket = nil
        isConnected = false
    }
    
    private func setupSocketConnection() {
        // Reconnect when auth token changes
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleAuthChange),
            name: .authTokenUpdated,
            object: nil
        )
        
        // Handle app state changes
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleAppDidBecomeActive),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
        
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleAppDidEnterBackground),
            name: UIApplication.didEnterBackgroundNotification,
            object: nil
        )
    }
    
    @objc private func handleAuthChange() {
        disconnect()
        connect()
    }
    
    @objc private func handleAppDidBecomeActive() {
        if !isConnected {
            connect()
        }
    }
    
    @objc private func handleAppDidEnterBackground() {
        // Keep connection alive for a short period
        DispatchQueue.main.asyncAfter(deadline: .now() + 30) {
            if UIApplication.shared.applicationState == .background {
                self.disconnect()
            }
        }
    }
    
    // MARK: - Event Handlers
    
    private func setupEventHandlers() {
        guard let socket = socket else { return }
        
        // Connection events
        socket.on(clientEvent: .connect) { [weak self] data, ack in
            self?.handleConnected()
        }
        
        socket.on(clientEvent: .disconnect) { [weak self] data, ack in
            self?.handleDisconnected()
        }
        
        socket.on(clientEvent: .error) { [weak self] data, ack in
            self?.handleError(data.first as? Error)
        }
        
        // User presence
        socket.on("user:online") { [weak self] data, ack in
            self?.handleUserOnline(data)
        }
        
        socket.on("user:offline") { [weak self] data, ack in
            self?.handleUserOffline(data)
        }
        
        // Notifications
        socket.on("notification") { [weak self] data, ack in
            self?.handleNotification(data)
        }
        
        // Collaboration
        socket.on("collab:user-joined") { [weak self] data, ack in
            self?.handleCollaboratorJoined(data)
        }
        
        socket.on("collab:user-left") { [weak self] data, ack in
            self?.handleCollaboratorLeft(data)
        }
        
        socket.on("collab:edit") { [weak self] data, ack in
            self?.handleCollaborativeEdit(data)
        }
        
        socket.on("collab:highlight") { [weak self] data, ack in
            self?.handleHighlight(data)
        }
        
        socket.on("collab:highlight-remove") { [weak self] data, ack in
            self?.handleHighlightRemove(data)
        }
        
        // Chat
        socket.on("chat:message") { [weak self] data, ack in
            self?.handleChatMessage(data)
        }
        
        socket.on("chat:history") { [weak self] data, ack in
            self?.handleChatHistory(data)
        }
        
        socket.on("chat:user-typing") { [weak self] data, ack in
            self?.handleUserTyping(data)
        }
        
        // Real-time data updates
        socket.on("data:update") { [weak self] data, ack in
            self?.handleDataUpdate(data)
        }
    }
    
    private func handleConnected() {
        DispatchQueue.main.async {
            self.isConnected = true
            logger.info("WebSocket connected")
        }
    }
    
    private func handleDisconnected() {
        DispatchQueue.main.async {
            self.isConnected = false
            self.onlineUsers.removeAll()
            logger.info("WebSocket disconnected")
        }
    }
    
    private func handleError(_ error: Error?) {
        logger.error("WebSocket error: \(error?.localizedDescription ?? "Unknown error")")
    }
    
    private func handleUserOnline(_ data: [Any]) {
        guard let userInfo = data.first as? [String: Any],
              let userId = userInfo["userId"] as? String else { return }
        
        DispatchQueue.main.async {
            self.onlineUsers.insert(userId)
        }
    }
    
    private func handleUserOffline(_ data: [Any]) {
        guard let userInfo = data.first as? [String: Any],
              let userId = userInfo["userId"] as? String else { return }
        
        DispatchQueue.main.async {
            self.onlineUsers.remove(userId)
        }
    }
    
    private func handleNotification(_ data: [Any]) {
        guard let notificationData = data.first as? [String: Any] else { return }
        
        do {
            let jsonData = try JSONSerialization.data(withJSONObject: notificationData)
            let notification = try JSONDecoder().decode(RealTimeNotification.self, from: jsonData)
            
            DispatchQueue.main.async {
                self.notifications.insert(notification, at: 0)
                
                // Limit notifications to 100
                if self.notifications.count > 100 {
                    self.notifications.removeLast()
                }
            }
        } catch {
            logger.error("Failed to decode notification: \(error)")
        }
    }
    
    private func handleCollaboratorJoined(_ data: [Any]) {
        guard let collaboratorData = data.first as? [String: Any] else { return }
        
        do {
            let jsonData = try JSONSerialization.data(withJSONObject: collaboratorData)
            let collaborator = try JSONDecoder().decode(Collaborator.self, from: jsonData)
            
            DispatchQueue.main.async {
                if !self.collaborators.contains(where: { $0.id == collaborator.id }) {
                    self.collaborators.append(collaborator)
                }
            }
        } catch {
            logger.error("Failed to decode collaborator: \(error)")
        }
    }
    
    private func handleCollaboratorLeft(_ data: [Any]) {
        guard let userInfo = data.first as? [String: Any],
              let userId = userInfo["userId"] as? String else { return }
        
        DispatchQueue.main.async {
            self.collaborators.removeAll { $0.id == userId }
        }
    }
    
    private func handleCollaborativeEdit(_ data: [Any]) {
        guard let editData = data.first as? [String: Any] else { return }
        
        // Broadcast the edit to interested components
        NotificationCenter.default.post(
            name: .collaborativeEdit,
            object: editData
        )
    }
    
    private func handleHighlight(_ data: [Any]) {
        guard let highlightData = data.first as? [String: Any] else { return }
        
        do {
            let jsonData = try JSONSerialization.data(withJSONObject: highlightData)
            let highlightedItem = try JSONDecoder().decode(HighlightedItem.self, from: jsonData)
            
            DispatchQueue.main.async {
                self.highlightedItems.append(highlightedItem)
                
                // Auto-remove after 30 seconds
                DispatchQueue.main.asyncAfter(deadline: .now() + 30) {
                    self.highlightedItems.removeAll { $0.itemId == highlightedItem.itemId }
                }
            }
        } catch {
            logger.error("Failed to decode highlight: \(error)")
        }
    }
    
    private func handleHighlightRemove(_ data: [Any]) {
        guard let userInfo = data.first as? [String: Any],
              let itemId = userInfo["itemId"] as? String else { return }
        
        DispatchQueue.main.async {
            self.highlightedItems.removeAll { $0.itemId == itemId }
        }
    }
    
    private func handleChatMessage(_ data: [Any]) {
        guard let messageData = data.first as? [String: Any] else { return }
        
        do {
            let jsonData = try JSONSerialization.data(withJSONObject: messageData)
            let message = try JSONDecoder().decode(ChatMessage.self, from: jsonData)
            
            DispatchQueue.main.async {
                self.chatMessages.append(message)
                
                // Remove typing indicator for this user
                self.typingUsers.removeAll { $0.userId == message.user.id }
            }
        } catch {
            logger.error("Failed to decode chat message: \(error)")
        }
    }
    
    private func handleChatHistory(_ data: [Any]) {
        guard let historyData = data.first as? [String: Any],
              let messagesData = historyData["messages"] as? [[String: Any]] else { return }
        
        do {
            let jsonData = try JSONSerialization.data(withJSONObject: messagesData)
            let messages = try JSONDecoder().decode([ChatMessage].self, from: jsonData)
            
            DispatchQueue.main.async {
                self.chatMessages = messages
            }
        } catch {
            logger.error("Failed to decode chat history: \(error)")
        }
    }
    
    private func handleUserTyping(_ data: [Any]) {
        guard let typingData = data.first as? [String: Any],
              let userId = typingData["userId"] as? String,
              let username = typingData["username"] as? String,
              let isTyping = typingData["isTyping"] as? Bool else { return }
        
        DispatchQueue.main.async {
            if isTyping {
                let typingIndicator = TypingIndicator(
                    userId: userId,
                    username: username,
                    timestamp: Date()
                )
                
                if !self.typingUsers.contains(where: { $0.userId == userId }) {
                    self.typingUsers.append(typingIndicator)
                }
                
                // Auto-remove typing indicator after 3 seconds
                DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                    self.typingUsers.removeAll { $0.userId == userId }
                }
            } else {
                self.typingUsers.removeAll { $0.userId == userId }
            }
        }
    }
    
    private func handleDataUpdate(_ data: [Any]) {
        guard let updateData = data.first as? [String: Any] else { return }
        
        // Broadcast data updates to interested components
        NotificationCenter.default.post(
            name: .dataUpdate,
            object: updateData
        )
    }
    
    // MARK: - Public Methods
    
    func joinCollaboration(documentType: String, documentId: String, householdId: String?) {
        socket?.emit("collab:join", [
            "documentType": documentType,
            "documentId": documentId,
            "householdId": householdId as Any
        ])
    }
    
    func leaveCollaboration(documentType: String, documentId: String) {
        socket?.emit("collab:leave", [
            "documentType": documentType,
            "documentId": documentId
        ])
    }
    
    func sendEdit(documentType: String, documentId: String, operation: String, data: [String: Any]) {
        socket?.emit("collab:edit", [
            "documentType": documentType,
            "documentId": documentId,
            "operation": operation,
            "data": data
        ])
    }
    
    func highlightItem(documentType: String, documentId: String, itemId: String, note: String?) {
        socket?.emit("collab:highlight", [
            "documentType": documentType,
            "documentId": documentId,
            "itemId": itemId,
            "note": note as Any
        ])
    }
    
    func joinChat(roomType: String, roomId: String) {
        socket?.emit("chat:join", [
            "roomType": roomType,
            "roomId": roomId
        ])
    }
    
    func sendChatMessage(roomType: String, roomId: String, message: String, parentMessageId: String? = nil) {
        socket?.emit("chat:message", [
            "roomType": roomType,
            "roomId": roomId,
            "message": message,
            "parentMessageId": parentMessageId as Any
        ])
    }
    
    func sendTypingIndicator(roomType: String, roomId: String, isTyping: Bool) {
        socket?.emit("chat:typing", [
            "roomType": roomType,
            "roomId": roomId,
            "isTyping": isTyping
        ])
    }
    
    func subscribeToDataUpdates(subscriptions: [[String: String]]) {
        socket?.emit("data:subscribe", [
            "subscriptions": subscriptions
        ])
    }
    
    func markNotificationAsRead(notificationId: String) {
        socket?.emit("notification:mark-read", [
            "notificationId": notificationId
        ])
    }
}

// MARK: - Data Models

struct RealTimeNotification: Codable, Identifiable {
    let id: String
    let type: String
    let title: String
    let message: String
    let data: [String: String]?
    let timestamp: Date
    let read: Bool
    let readAt: Date?
}

struct Collaborator: Codable, Identifiable {
    let id: String
    let username: String
    let firstName: String
    let lastName: String
    
    var displayName: String {
        "\(firstName) \(lastName)"
    }
}

struct HighlightedItem: Codable, Identifiable {
    let itemId: String
    let userId: String
    let username: String
    let note: String?
    let timestamp: Date
    
    var id: String { itemId }
}

struct ChatMessage: Codable, Identifiable {
    let id: String
    let roomType: String
    let roomId: String
    let user: ChatUser
    let message: String
    let parentMessageId: String?
    let timestamp: Date
}

struct ChatUser: Codable, Identifiable {
    let id: String
    let username: String
    let firstName: String
    let lastName: String
    
    var displayName: String {
        "\(firstName) \(lastName)"
    }
}

struct TypingIndicator: Codable, Identifiable {
    let userId: String
    let username: String
    let timestamp: Date
}

// MARK: - Notifications

extension Notification.Name {
    static let collaborativeEdit = Notification.Name("collaborativeEdit")
    static let dataUpdate = Notification.Name("dataUpdate")
    static let authTokenUpdated = Notification.Name("authTokenUpdated")
}