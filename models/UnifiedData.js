const unifiedDataSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    platform: {
        type: String,
        required: true
    },
    dataType: {
        type: String,
        required: true,
        enum: [
            'campaign',
            'product',
            'order',
            'analytics',
            'inventory',
            'customer',
            'transaction'
        ]
    },
    originalId: String, // Platform-specific ID
    data: {
        // Flexible schema for different data types
        name: String,
        status: String,
        metrics: {
            revenue: Number,
            spend: Number,
            impressions: Number,
            clicks: Number,
            orders: Number,
            units: Number,
            sessions: Number,
            conversions: Number,
            ctr: Number,
            cpc: Number,
            cpm: Number,
            roas: Number,
            acos: Number
        },
        attributes: mongoose.Schema.Types.Mixed,
        dateRange: {
            start: Date,
            end: Date
        }
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    },
    syncedAt: {
        type: Date,
        default: Date.now
    }
});

unifiedDataSchema.index({ userId: 1, platform: 1, dataType: 1 });
unifiedDataSchema.index({ userId: 1, lastUpdated: -1 });

module.exports = mongoose.model('UnifiedData', unifiedDataSchema);