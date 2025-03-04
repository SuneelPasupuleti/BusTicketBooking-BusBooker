// server.js - Backend for Bus Ticket Reservation System
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const app = express();
const PORT = 5001; // Change this to the port you are using

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Data storage paths
const DATA_DIR = path.join(__dirname, 'data');
const BUSES_FILE = path.join(DATA_DIR, 'buses.json');
const BOOKINGS_FILE = path.join(DATA_DIR, 'bookings.json');
const EMERGENCY_ALERTS_FILE = path.join(DATA_DIR, 'emergency_alerts.json');

// Create data directory if it doesn't exist
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

if (!fs.existsSync(BOOKINGS_FILE)) {
    fs.writeFileSync(BOOKINGS_FILE, JSON.stringify([], null, 2));
}

// Create emergency alerts file if it doesn't exist
if (!fs.existsSync(EMERGENCY_ALERTS_FILE)) {
    fs.writeFileSync(EMERGENCY_ALERTS_FILE, JSON.stringify([], null, 2));
}

// Helper functions to read/write data
const readData = (file) => {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
};

const writeData = (file, data) => {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
};


// ROUTES

// Get all buses
app.get('/api/buses', (req, res) => {
    try {
        const buses = readData(BUSES_FILE);
        res.json(buses);
    } catch (error) {
        res.status(500).json({ message: "Error fetching buses", error: error.message });
    }
});

// Search buses
app.get('/api/buses/search', (req, res) => {
    try {
        const { from, to, date } = req.query;
        const buses = readData(BUSES_FILE);
        
        const filteredBuses = buses.filter(bus => {
            const matchFrom = !from || bus.from.toLowerCase().includes(from.toLowerCase());
            const matchTo = !to || bus.to.toLowerCase().includes(to.toLowerCase());
            const matchDate = !date || bus.date === date;
            
            return matchFrom && matchTo && matchDate;
        });
        
        res.json(filteredBuses);
    } catch (error) {
        res.status(500).json({ message: "Error searching buses", error: error.message });
    }
});

// Get bus by ID
app.get('/api/buses/:id', (req, res) => {
    try {
        const buses = readData(BUSES_FILE);
        const bus = buses.find(b => b.id === parseInt(req.params.id));
        
        if (!bus) {
            return res.status(404).json({ message: "Bus not found" });
        }
        
        res.json(bus);
    } catch (error) {
        res.status(500).json({ message: "Error fetching bus", error: error.message });
    }
});

// Book a ticket
app.post('/api/bookings', (req, res) => {
    try {
        const { busId, passengerName, email, phone, seats } = req.body;
        
        if (!busId || !passengerName || !email || !seats || seats < 1) {
            return res.status(400).json({ message: "Missing required fields" });
        }
        
        const buses = readData(BUSES_FILE);
        const bus = buses.find(b => b.id === parseInt(busId));
        
        if (!bus) {
            return res.status(404).json({ message: "Bus not found" });
        }
        
        if (bus.availableSeats < seats) {
            return res.status(400).json({ message: "Not enough seats available" });
        }
        
        // Update bus available seats
        bus.availableSeats -= seats;
        writeData(BUSES_FILE, buses);
        
        // Create booking record
        const bookings = readData(BOOKINGS_FILE);
        const newBooking = {
            id: Date.now(),
            busId: bus.id,
            busName: bus.name,
            from: bus.from,
            to: bus.to,
            date: bus.date,
            departureTime: bus.departureTime,
            passengerName,
            email,
            phone,
            seats,
            totalFare: seats * bus.fare,
            bookingTime: new Date().toISOString()
        };
        
        bookings.push(newBooking);
        writeData(BOOKINGS_FILE, bookings);
        
        res.status(201).json(newBooking);
    } catch (error) {
        res.status(500).json({ message: "Error creating booking", error: error.message });
    }
});

// Get all bookings
app.get('/api/bookings', (req, res) => {
    try {
        const bookings = readData(BOOKINGS_FILE);
        res.status(200).json(bookings);
    } catch (error) {
        console.error('Error fetching bookings:', error);
        res.status(500).json({ message: "Error fetching bookings", error: error.message });
    }
});

// Get booking by ID
app.get('/api/bookings/:id', (req, res) => {
    try {
        const bookings = readData(BOOKINGS_FILE);
        const booking = bookings.find(b => b.id === parseInt(req.params.id));

        if (!booking) {
            return res.status(404).json({ message: "Booking not found" });
        }

        res.json(booking);
    } catch (error) {
        res.status(500).json({ message: "Error fetching booking", error: error.message });
    }
});

// Cancel booking
app.delete('/api/bookings/:id', (req, res) => {
    try {
        const bookingId = parseInt(req.params.id);
        const bookings = readData(BOOKINGS_FILE);
        const bookingIndex = bookings.findIndex(b => b.id === bookingId);
        
        if (bookingIndex === -1) {
            return res.status(404).json({ message: "Booking not found" });
        }
        
        const booking = bookings[bookingIndex];
        
        // Restore bus available seats
        const buses = readData(BUSES_FILE);
        const bus = buses.find(b => b.id === booking.busId);
        
        if (bus) {
            bus.availableSeats += booking.seats;
            writeData(BUSES_FILE, buses);
        }
        
        // Remove booking
        bookings.splice(bookingIndex, 1);
        writeData(BOOKINGS_FILE, bookings);
        
        res.json({ message: "Booking cancelled successfully" });
    } catch (error) {
        res.status(500).json({ message: "Error cancelling booking", error: error.message });
    }
});

// Add a new bus route (admin functionality)
app.post('/api/buses', (req, res) => {
    try {
        const { name, from, to, departureTime, arrivalTime, date, fare, totalSeats } = req.body;
        
        if (!name || !from || !to || !departureTime || !arrivalTime || !date || !fare || !totalSeats) {
            return res.status(400).json({ message: "Missing required fields" });
        }
        
        const buses = readData(BUSES_FILE);
        const newBus = {
            id: Date.now(),
            name,
            from,
            to,
            departureTime,
            arrivalTime,
            date,
            fare: parseFloat(fare),
            totalSeats: parseInt(totalSeats),
            availableSeats: parseInt(totalSeats)
        };
        
        buses.push(newBus);
        writeData(BUSES_FILE, buses);
        
        res.status(201).json(newBus);
    } catch (error) {
        res.status(500).json({ message: "Error adding bus", error: error.message });
    }
});

// Send emergency alert
app.post('/api/emergency-alerts', (req, res) => {
    try {
        const { bookingId, message } = req.body;

        if (!bookingId || !message) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const emergencyAlerts = readData(EMERGENCY_ALERTS_FILE);
        const newAlert = { bookingId, message, timestamp: new Date().toISOString() };
        emergencyAlerts.push(newAlert);
        writeData(EMERGENCY_ALERTS_FILE, emergencyAlerts);

        res.status(200).json({ message: "Emergency alert stored successfully", alert: newAlert });
    } catch (error) {
        console.error('Error storing emergency alert:', error);
        res.status(500).json({ message: "Error storing emergency alert", error: error.message });
    }
});

// Get all emergency alerts
app.get('/api/emergency-alerts', (req, res) => {
    try {
        const emergencyAlerts = readData(EMERGENCY_ALERTS_FILE);
        res.status(200).json(emergencyAlerts);
    } catch (error) {
        console.error('Error fetching emergency alerts:', error);
        res.status(500).json({ message: "Error fetching emergency alerts", error: error.message });
    }
});

// Server setup with auto-shutdown after 24 hours
const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Server will automatically shut down after 24 hours`);
    
    // Set server to shutdown after 24 hours
    setTimeout(() => {
        console.log('24 hours have passed. Shutting down server...');
        server.close(() => {
            console.log('Server has been shut down.');
            process.exit(0);
        });
    }, 24 * 60 * 60 * 1000); // 24 hours in milliseconds
});