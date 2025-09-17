const alertSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    platform: String,
    type: {
        type: String,
        enum: [
            'connection_error',
            'sync_failed',
            'budget_alert',
            'performance_alert',
            'inventory_low',
            'new_order',
            'campaign_ended'
        ],
        required: true
    },
    severity: {
        type: String,
        enum: ['info', 'warning', 'error', 'critical'],
        default: 'info'
    },
    title: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    data: mongoose.Schema.Types.Mixed, // Additional context data
    isRead: {
        type: Boolean,
        default: false
    },
    actionRequired: {
        type: Boolean,
        default: false
    },
    actionUrl: String,
    createdAt: {
        type: Date,
        default: Date.now
    },
    readAt: Date
});

alertSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Alert', alertSchema);
