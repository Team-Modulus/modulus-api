// models/MetaAdsAccount.js
const mongoose = require("mongoose");

const MetaAdsAccountSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  adAccountId: String, // e.g. act_123456789
  businessId: String,  // optional, if linked to Business Manager
  accessToken: String,
  refreshToken: String,
  connectedAt: Date,
  connected: { type: Boolean, default: false },
  lastSyncedAt: Date,
});

module.exports = mongoose.model("MetaAdsAccount", MetaAdsAccountSchema);
