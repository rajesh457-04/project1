const express = require('express');
const Tourist = require('./Tourist');
const Guide = require('./Guide');
const router = express.Router();
const auth = require('../middleware'); 
const Booking = require('./Booking');
const jwt = require('jsonwebtoken');

// Predefined set of options for Travel Companion
const TRAVEL_COMPANION_OPTIONS = new Set(['Family', 'Friends', 'Solo', 'Couple', 'Group']);

// Helper function to validate date format (YYYY-MM-DD)
const isValidDate = (date) => {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(date)) return false;
    const parsedDate = new Date(date);
    return parsedDate instanceof Date && !isNaN(parsedDate);
};

// Tourist registration with guide matching
router.post('/tourist-register', async (req, res) => {
    const { 
        username, 
        email, 
        destination, 
        dateFrom, 
        dateTo, 
        preferredModeOfTransport, 
        travelCompanion, 
        languagePreferences, 
        preferredGuideType 
    } = req.body;

    try {
        // Validate input
        if (!username || !email || !destination || !dateFrom || !dateTo) {
            return res.status(400).json({ message: 'Please fill all required fields' });
        }

        // Validate date format
        if (!isValidDate(dateFrom) || !isValidDate(dateTo)) {
            return res.status(400).json({ message: 'Invalid date format. Use YYYY-MM-DD.' });
        }

        // Validate travel companion option
        if (!TRAVEL_COMPANION_OPTIONS.has(travelCompanion)) {
            return res.status(400).json({ 
                message: `Invalid travel companion option. Valid options are: ${Array.from(TRAVEL_COMPANION_OPTIONS).join(', ')}` 
            });
        }

        // Check if tourist exists
        const existingTourist = await Tourist.findOne({ email });
        if (existingTourist) {
            return res.status(400).json({ message: 'Tourist Already Exists' });
        }

        // Find matching guides based on destination
        const guides = await Guide.find({ location: destination });
        console.log('Found Guides:', guides);

        let guideMessage = '';
        let assignedGuide = null;

        if (guides.length > 0) {
            // Log preferred guide type and available guide types for debugging
            console.log('Preferred Guide Type:', preferredGuideType);
            console.log('Available Guides:', guides.map(guide => guide.guideType));

            // Attempt to find a guide that matches the preferred guide type
            assignedGuide = guides.find(guide => guide.guideType === preferredGuideType);

            // If no guide matches the preferred type, assign the first available guide
            if (!assignedGuide) {
                assignedGuide = guides[0]; // Assign the first available guide
                guideMessage = 'No matching guide found for preferred type, assigned first available guide.';
            } else {
                guideMessage = `Guide found: ${assignedGuide.username}, located in ${assignedGuide.location}.`;
            }

            // Create new tourist
            const newTourist = new Tourist({ 
                username, 
                email, 
                destination, 
                dateFrom, 
                dateTo, 
                preferredModeOfTransport, 
                travelCompanion, 
                languagePreferences, 
                preferredGuideType,
                assignedGuide: assignedGuide._id, // Assign guide to the tourist
            });

            await newTourist.save();

            // Generate JWT token for the tourist
            const payload = {
                user: {
                    id: newTourist._id,
                },
            };
            const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

            // Log the successful registration
            console.log('Tourist Registration Successful:', newTourist);
            

            // Send response with guide information
            return res.status(201).json({
                message: `Registration successful! ${guideMessage}`, // Clear success message
                booking: true,
                token,
                assignedGuide: {
                    username: assignedGuide.username,
                    location: assignedGuide.location,
                },
            });
        } else {
            // If no guides available
            console.log('No guides available for the selected destination.');
            return res.status(404).json({
                message: 'Registration successful! No guide assigned.', // Clear message for no guide
                booking: false,
            });
        }
    } catch (err) {
        console.error('Error during tourist registration:', err);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
});
// Create booking (unchanged)
router.post('/create-booking', auth, async (req, res) => {
    try {
        const { guideId, dateFrom, dateTo, location } = req.body;
        const userId = req.user.id;

        const newBooking = new Booking({
            userId,
            guideDetails: guideId,
            dateFrom: new Date(dateFrom),
            dateTo: new Date(dateTo),
            status: 'pending',
            location,
            totalCost: 1000
        });

        await newBooking.save();

        res.json({ 
            message: 'Booking created successfully',
            booking: newBooking
        });
    } catch (error) {
        console.error("Error creating booking:", error);
        res.status(500).json({ message: 'Error creating booking' });
    }
});

// Get bookings (unchanged)
router.get('/my-bookings', auth, async (req, res) => {
    try {
        const bookings = await Booking.find({ userId: req.user.id })
            .populate('guideDetails', 'username email phone guideExperience languagesSpoken')
            .sort({ createdAt: -1 });

        const formattedBookings = bookings.map(booking => ({
            id: booking._id,
            guide: booking.guideDetails,
            dateFrom: booking.dateFrom,
            dateTo: booking.dateTo,
            status: booking.status,
            location: booking.location,
            totalCost: booking.totalCost,
            createdAt: booking.createdAt
        }));

        res.json(formattedBookings);
    } catch (error) {
        console.error("Error fetching bookings:", error);
        res.status(500).json({ message: 'Error fetching bookings' });
    }
});

// Cancel booking (unchanged)
router.put('/cancel-booking/:bookingId', auth, async (req, res) => {
    try {
        const booking = await Booking.findOne({
            _id: req.params.bookingId,
            userId: req.user.id
        }).populate('guideDetails');

        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }

        if (booking.status !== 'pending') {
            return res.status(400).json({ message: 'Cannot cancel a non-pending booking' });
        }

        booking.status = 'cancelled';
        booking.cancellationDate = new Date();
        booking.cancellationReason = req.body.reason || 'No reason provided';
        
        await booking.save();

        res.json({ 
            message: 'Booking cancelled successfully',
            booking: {
                id: booking._id,
                status: booking.status,
                cancellationDate: booking.cancellationDate,
                cancellationReason: booking.cancellationReason
            }
        });
    } catch (error) {
        console.error("Error cancelling booking:", error);
        res.status(500).json({ message: 'Error cancelling booking' });
    }
});

module.exports = router;
