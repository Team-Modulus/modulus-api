const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const authMiddleware = require('../utils/authMiddleware');
const bcrypt=require("bcryptjs")

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public

router.post("/register", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      companyName,
      industry,
      annualRevenue,
      selectedPlatforms,
      agreedToTerms,
      subscribeToUpdates,
    } = req.body;

    // Check if user already exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ msg: "User already exists" });
    }

    // Create new user
    user = new User({
      firstName,
      lastName,
      email,
      password,
      companyName,
      industry,
      annualRevenue,
      selectedPlatforms,
      agreedToTerms,
      subscribeToUpdates,
    });

    await user.save();

    // Create JWT token
    const payload = { user: { id: user._id } };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: "24h" },
      (err, token) => {
        if (err) throw err;

        // Remove password before sending
        const { password, ...userData } = user.toObject();

        res.json({ token, user: userData });
      }
    );
  } catch (err) {
    console.error("Register error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});


// @route   POST /api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if email & password provided
    if (!email || !password) {
      return res.status(400).json({ msg: "Email and password are required" });
    }

    // Find the user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ msg: "Invalid credentials" });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: "Invalid credentials" });
    }

    // Generate JWT payload
    const payload = { user: { id: user._id } };

    // Generate JWT
    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: "24h" },
      (err, token) => {
        if (err) {
          console.error("JWT Error:", err);
          return res.status(500).json({ error: "Token generation failed" });
        }

        // Remove password from response
        const { password, ...userData } = user.toObject();

        res.json({
          token,
          user: userData,
          connectedChannels: user.connectedChannels || [],
        });
      }
    );
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.get('/userDetails',authMiddleware, async (req, res) => {
  try {
    const  user = req.user;
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    res.json({
      user: {
        id: user.id,
        email: user.email,
        connectedChannels: user.connectedChannels
      }
    })
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }})

module.exports = router; 