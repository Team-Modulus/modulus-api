// models/FacebookAccount.js
const mongoose = require("mongoose");

const FacebookAccountSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  pageId: String,
  pageName: String,
  accessToken: String,
  connectedAt: Date,
  connected: { type: Boolean, default: false },
});

module.exports = mongoose.model("FacebookAccount", FacebookAccountSchema);
