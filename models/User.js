const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const UserSchema = new mongoose.Schema({
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  password: { type: String, required: true },

  companyName: { type: String, trim: true },
  industry: { type: String, trim: true },
  annualRevenue: { type: String },
  googleId: { type: String, unique: true, sparse: true },
  selectedPlatforms: { type: [String], default: [] },
  agreedToTerms: { type: Boolean, default: false },
  subscribeToUpdates: { type: Boolean, default: false },

  connectedChannels: {
    googleAds: {
      accessToken: String,
      refreshToken: String,
      connected: { type: Boolean, default: false },
    },
    metaAds: {
      accessToken: String,
      refreshToken: String,
      connected: { type: Boolean, default: false },
    },
    facebookAds: {
      accessToken: String,
      connected: { type: Boolean, default: false },
      connectedAt: Date,
    },
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// 🔒 Hash password before saving
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare passwords
// UserSchema.methods.comparePassword = async function (candidatePassword) {
//   return bcrypt.compare(candidatePassword, this.password);
// };

module.exports = mongoose.model("User", UserSchema);
