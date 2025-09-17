// services/BaseIntegrationService.js
const PlatformConnection = require('../models/PlatformConnection');
const UnifiedData = require('../models/UnifiedData.');
const SyncJob = require('../models/SyncJob');
const Alert = require('../models/Alert');
const encryptionUtils = require('../utils/EncryptionUtils');

class BaseIntegrationService {
    constructor(platformName) {
        this.platformName = platformName;
        this.retryCount = 3;
        this.retryDelay = 1000;
    }

    // Get user's platform connection
    async getUserConnection(userId) {
        const connection = await PlatformConnection.findOne({
            userId,
            platform: this.platformName,
            status: 'connected'
        });

        if (!connection) {
            throw new Error(`No active ${this.platformName} connection found`);
        }

        return connection;
    }

    // Store encrypted connection
    async storeConnection(userId, credentials, metadata = {}) {
        const encryptedCredentials = encryptionUtils.encryptObject(credentials);
        
        await PlatformConnection.findOneAndUpdate(
            { userId, platform: this.platformName },
            {
                userId,
                platform: this.platformName,
                credentials: encryptedCredentials,
                metadata,
                status: 'connected',
                connectedAt: new Date()
            },
            { upsert: true, new: true }
        );
    }

    // Get decrypted credentials
    async getCredentials(userId) {
        const connection = await this.getUserConnection(userId);
        return encryptionUtils.decryptObject(connection.credentials);
    }

    // Update sync status
    async updateSyncStatus(userId, lastSyncAt, error = null) {
        const update = { 'metadata.lastSyncAt': lastSyncAt };
        if (error) {
            update.lastError = {
                message: error.message,
                code: error.code || 'SYNC_ERROR',
                timestamp: new Date()
            };
        }

        await PlatformConnection.findOneAndUpdate(
            { userId, platform: this.platformName },
            update
        );
    }

    // Store unified data
    async storeUnifiedData(userId, dataType, originalId, data) {
        await UnifiedData.findOneAndUpdate(
            { userId, platform: this.platformName, dataType, originalId },
            {
                userId,
                platform: this.platformName,
                dataType,
                originalId,
                data,
                lastUpdated: new Date(),
                syncedAt: new Date()
            },
            { upsert: true, new: true }
        );
    }

    // Create alert
    async createAlert(userId, type, title, message, severity = 'info', data = {}) {
        await Alert.create({
            userId,
            platform: this.platformName,
            type,
            title,
            message,
            severity,
            data
        });
    }

    // Retry logic
    async retryApiCall(apiCall, retries = this.retryCount) {
        try {
            return await apiCall();
        } catch (error) {
            if (retries > 0 && this.isRetryableError(error)) {
                await this.sleep(this.retryDelay);
                return this.retryApiCall(apiCall, retries - 1);
            }
            throw error;
        }
    }

    isRetryableError(error) {
        return error.code === 'ECONNRESET' || 
               error.status >= 500 || 
               error.code === 'ETIMEDOUT';
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = BaseIntegrationService;