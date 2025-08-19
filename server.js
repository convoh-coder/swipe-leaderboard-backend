// server.js - Improved Backend with Profile Pictures & Better Ranking
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'your_connection_string_here';

mongoose.connect(MONGODB_URI)
.then(() => console.log('✅ Connected to MongoDB Atlas'))
.catch(err => console.error('❌ MongoDB connection failed:', err));

// Player Schema with Profile Picture Support
const PlayerSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 50
  },
  level: {
    type: Number,
    required: true,
    min: 1,
    max: 1000
  },
  profilePicture: {
    type: String,
    default: null
  },
  gamesPlayed: {
    type: Number,
    default: 1
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Create indexes for fast queries
PlayerSchema.index({ level: -1, lastUpdated: 1 });

const Player = mongoose.model('Player', PlayerSchema);

// Routes

// Home endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Swipe Leaderboard API is running!',
    status: 'OK',
    timestamp: new Date().toISOString(),
    endpoints: {
      leaderboard: '/api/leaderboard',
      updateScore: '/api/leaderboard/update',
      playerStats: '/api/player/:username',
      stats: '/api/stats'
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// Get top 20 players with profile pictures
app.get('/api/leaderboard', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    
    const players = await Player.find()
      .sort({ level: -1, lastUpdated: 1 })
      .limit(limit)
      .select('username level profilePicture gamesPlayed lastUpdated');

    const leaderboard = players.map((player, index) => ({
      rank: index + 1,
      username: player.username,
      level: player.level,
      gamesPlayed: player.gamesPlayed || 1,
      lastUpdated: player.lastUpdated,
      avatar: player.profilePicture || `https://images.unsplash.com/photo-1494790108755-2616b612b1c5?w=150&h=150&fit=crop&crop=face`
    }));

    console.log(`📊 Leaderboard requested - returning ${leaderboard.length} players`);

    res.json({
      success: true,
      data: leaderboard,
      total: players.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error fetching leaderboard:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch leaderboard',
      message: error.message
    });
  }
});

// Update player score with proper ranking system
app.post('/api/leaderboard/update', async (req, res) => {
  try {
    const { username, level, profilePicture } = req.body;

    // Validation
    if (!username || !level) {
      return res.status(400).json({
        success: false,
        error: 'Username and level are required'
      });
    }

    if (typeof level !== 'number' || level < 1 || level > 1000) {
      return res.status(400).json({
        success: false,
        error: 'Level must be a number between 1 and 1000'
      });
    }

    // Clean username
    const cleanUsername = username.trim().substring(0, 50);

    // Find existing player
    const existingPlayer = await Player.findOne({ username: cleanUsername });
    
    if (existingPlayer) {
      // Only update if new level is higher
      if (level > existingPlayer.level) {
        await Player.updateOne(
          { username: cleanUsername },
          { 
            level: level,
            profilePicture: profilePicture || existingPlayer.profilePicture,
            gamesPlayed: (existingPlayer.gamesPlayed || 0) + 1,
            lastUpdated: new Date()
          }
        );

        // Calculate new rank by counting players with higher levels
        const playersAbove = await Player.countDocuments({ 
          level: { $gt: level } 
        });
        const newRank = playersAbove + 1;

        // Check if player is in top 20
        const isInTop20 = newRank <= 20;

        console.log(`🏆 RECORD UPDATE: ${cleanUsername} reached level ${level} (rank #${newRank}) ${isInTop20 ? '- IN TOP 20!' : ''}`);
        
        res.json({
          success: true,
          newRecord: true,
          message: isInTop20 ? 'New record in top 20!' : 'New personal best!',
          data: {
            username: cleanUsername,
            level: level,
            previousBest: existingPlayer.level,
            newRank: newRank,
            isInTop20: isInTop20,
            gamesPlayed: (existingPlayer.gamesPlayed || 0) + 1
          }
        });
      } else {
        // Update games played and profile picture but not level
        await Player.updateOne(
          { username: cleanUsername },
          { 
            profilePicture: profilePicture || existingPlayer.profilePicture,
            gamesPlayed: (existingPlayer.gamesPlayed || 0) + 1,
            lastUpdated: new Date()
          }
        );
        
        // Get current rank
        const playersAbove = await Player.countDocuments({ 
          level: { $gt: existingPlayer.level } 
        });
        const currentRank = playersAbove + 1;
        
        res.json({
          success: true,
          newRecord: false,
          message: 'Score not high enough for new record',
          data: {
            username: cleanUsername,
            currentBest: existingPlayer.level,
            submittedLevel: level,
            currentRank: currentRank,
            isInTop20: currentRank <= 20,
            gamesPlayed: (existingPlayer.gamesPlayed || 0) + 1
          }
        });
      }
    } else {
      // New player
      await Player.create({
        username: cleanUsername,
        level: level,
        profilePicture: profilePicture,
        gamesPlayed: 1,
        lastUpdated: new Date()
      });

      // Calculate rank for new player
      const playersAbove = await Player.countDocuments({ 
        level: { $gt: level } 
      });
      const rank = playersAbove + 1;
      const isInTop20 = rank <= 20;

      console.log(`🎯 NEW PLAYER: ${cleanUsername} joined at level ${level} (rank #${rank}) ${isInTop20 ? '- IN TOP 20!' : ''}`);
      
      res.json({
        success: true,
        newRecord: true,
        message: isInTop20 ? 'Welcome to top 20!' : 'Welcome to the leaderboard!',
        data: {
          username: cleanUsername,
          level: level,
          rank: rank,
          isInTop20: isInTop20,
          gamesPlayed: 1
        }
      });
    }
  } catch (error) {
    console.error('❌ Error updating leaderboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update score',
      message: error.message
    });
  }
});

// Get specific player stats
app.get('/api/player/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const cleanUsername = username.trim();

    const player = await Player.findOne({ username: cleanUsername });
    
    if (player) {
      // Get rank
      const playersAbove = await Player.countDocuments({ 
        level: { $gt: player.level } 
      });
      const rank = playersAbove + 1;

      res.json({
        success: true,
        data: {
          username: player.username,
          level: player.level,
          rank: rank,
          isInTop20: rank <= 20,
          profilePicture: player.profilePicture,
          gamesPlayed: player.gamesPlayed || 1,
          joinedAt: player.createdAt,
          lastPlayed: player.lastUpdated
        }
      });
    } else {
      res.json({
        success: true,
        data: {
          username: cleanUsername,
          level: 0,
          rank: null,
          isInTop20: false,
          profilePicture: null,
          gamesPlayed: 0,
          message: 'Player not found'
        }
      });
    }
  } catch (error) {
    console.error('❌ Error fetching player:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch player data'
    });
  }
});

// Get leaderboard statistics
app.get('/api/stats', async (req, res) => {
  try {
    const [totalPlayers, topPlayer, avgLevelResult, top20Count] = await Promise.all([
      Player.countDocuments(),
      Player.findOne().sort({ level: -1 }),
      Player.aggregate([
        { $group: { _id: null, avgLevel: { $avg: '$level' } } }
      ]),
      Player.countDocuments({ level: { $gte: 1 } }) // Just for stats
    ]);

    res.json({
      success: true,
      data: {
        totalPlayers,
        highestLevel: topPlayer ? topPlayer.level : 0,
        topPlayer: topPlayer ? topPlayer.username : null,
        averageLevel: avgLevelResult[0] ? Math.round(avgLevelResult[0].avgLevel * 10) / 10 : 0,
        competitorsInTop20: Math.min(totalPlayers, 20)
      }
    });
  } catch (error) {
    console.error('❌ Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics'
    });
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /',
      'GET /health', 
      'GET /api/leaderboard',
      'POST /api/leaderboard/update',
      'GET /api/player/:username',
      'GET /api/stats'
    ]
  });
});

// Error handling
app.use((error, req, res, next) => {
  console.error('💥 Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Leaderboard API running on port ${PORT}`);
  console.log(`📊 Endpoints available:`);
  console.log(`   GET  / - API info`);
  console.log(`   GET  /health - Health check`);
  console.log(`   GET  /api/leaderboard - Get top players`);
  console.log(`   POST /api/leaderboard/update - Update score`);
  console.log(`   GET  /api/player/:username - Get player stats`);
  console.log(`   GET  /api/stats - Get leaderboard stats`);
});
