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
  console.log(req.body);
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
    let user = await User.find({ email });
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
    const payload = {
      user: { id: user.id },
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: "24h" },
      (err, token) => {
        if (err) throw err;
        res.json({ token, user });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.find({ email });
    if (!user || !(await bcrypt.compare(password))) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    const payload = { user: { id: user.id } };
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' }, (err, token) => {
      if (err) throw err;
      res.json({
        token,
        connectedChannels: user.connectedChannels
      });
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
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