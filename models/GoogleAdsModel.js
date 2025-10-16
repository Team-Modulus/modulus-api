const mongoose = require("mongoose");

const GoogleAdsAccountSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  accountId: String,
  accessToken: String,
  refreshToken: String,
  connected: { type: Boolean, default: false },
  connectedAt: Date,
  lastSyncedAt: Date,
});

module.exports = mongoose.model("GoogleAdsAccount", GoogleAdsAccountSchema);
