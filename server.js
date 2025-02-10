// Load environment variables
require('dotenv').config();

const express = require('express');
const User = require('./model');
const multer = require('multer');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');

const Registeruser = require('./model'); // User model
const Guide = require('./work/Guide'); // Guide model
const middleware = require('./middleware'); // Authentication middleware
const touristRoutes = require('./work/Touristroute'); // Tourist routes
const guideRoutes = require('./work/Guideroute'); // Guide routes

const app = express();
const PORT = process.env.PORT || 5000;

// Database Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('DB Connection established'))
  .catch((err) => {
    console.error('DB Connection Error:', err);
    process.exit(1); // Exit the app if the database connection fails
  });

// Middleware
app.use(express.json()); // Parse JSON bodies
app.use(cors({ origin: '*' })); // Enable CORS
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // Serve uploaded files

// Multer Configuration for File Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');  // Specify upload directory
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);  // Generate unique filename
  },
});

const upload = multer({ storage });

// Registration Route
app.post('/register', async (req, res) => {
  try {
      const { username, email, password, confirmpassword } = req.body;
      let exist = await Registeruser.findOne({ email });
      if (exist) {
          return res.status(400).send('User Already Exist');
      }
      if (password !== confirmpassword) {
          return res.status(400).send('Passwords are not matching');
      }
      let newUser = new Registeruser({
          username,
          email,
          password // Only save the hashed password
      });
      await newUser.save();
      res.status(200).send('Registered Successfully');
  } catch (err) {
      console.error(err);
      return res.status(500).send('Internal Server Error');
  }
});

// Login Route
app.post('/login', async (req, res) => {
  try {
      const { email, password } = req.body;

      // Check if user exists
      let exist = await Registeruser.findOne({ email });
      if (!exist) {
          return res.status(400).send('User  Not Found');
      }

      // Compare hashed password
      const isMatch = await bcrypt.compare(password, exist.password);
      if (!isMatch) {
          return res.status(400).send('Invalid credentials');
      }

      // Create payload for JWT
      let payload = {
          user: {
              id: exist.id // Use the user's ID
          }
      };

    // Sign the token using the secret from environment variables
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' }, (err, token) => {
      if (err) {
        console.error('Error signing token:', err);
        return res.status(500).send('Server Error');
      }
      console.log('Generated Token:', token);
      return res.json({ token }); // Send the token back to the client
    });
  } catch (err) {
    console.error('Server Error:', err);
    return res.status(500).send('Server Error');
  }
});

// Get User Profile
app.get('/api/user/profile', middleware, async (req, res) => {
  try {
    const user = await Registeruser.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found.' });

    res.json(user);  // Send the user data with profile picture URL
  } catch (err) {
    res.status(500).json({ message: 'Error fetching profile.', error: err.message });
  }
});

// Update User Profile
app.put('/api/user/profile', middleware, upload.single('profilePicture'), async (req, res) => {
  try {
      const { username, email, bio, location } = req.body;
      const updateData = { username, email, bio, location };

      // Update the profile picture if a new file is uploaded
      if (req.file) {
          updateData.profilePicture = `http://localhost:5000/uploads/${req.file.filename}`; // Store image URL in database
      }

      const user = await Registeruser.findByIdAndUpdate(req.user.id, updateData, { new: true }).select('-password');
      if (!user) return res.status(404).json({ message: 'User not found.' });

      res.json(user); // Send back the updated user data
  } catch (err) {
      res.status(500).json({ message: 'Error updating profile.', error: err.message });
  }
});
// Use Tourist and Guide Routes
app.use('/api/tourist', touristRoutes);
app.use('/api/guide', guideRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Start the Server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
