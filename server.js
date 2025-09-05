const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Database connection
const db = new sqlite3.Database('./telegram_catalog (1).db', (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database');
        initializeDatabase();
    }
});

// Initialize database with new tables
function initializeDatabase() {
    // Create users table
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telegram_id INTEGER UNIQUE NOT NULL,
            username TEXT,
            first_name TEXT,
            last_name TEXT,
            language_code TEXT,
            is_premium BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Create user_sessions table
    db.run(`
        CREATE TABLE IF NOT EXISTS user_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            session_token TEXT UNIQUE,
            user_agent TEXT,
            ip_address TEXT,
            country TEXT,
            city TEXT,
            device_type TEXT,
            browser TEXT,
            os TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    `);

    // Create user_stats table
    db.run(`
        CREATE TABLE IF NOT EXISTS user_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            action_type TEXT,
            action_data TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    `);

    // Update channels table to include user_id
    db.run(`
        ALTER TABLE channels ADD COLUMN user_id INTEGER
    `, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('Error adding user_id to channels:', err);
        }
    });

    // Update reviews table to include user_id
    db.run(`
        ALTER TABLE reviews ADD COLUMN user_id INTEGER
    `, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('Error adding user_id to reviews:', err);
        }
    });

    // Update tags table to include user_id
    db.run(`
        ALTER TABLE tags ADD COLUMN user_id INTEGER
    `, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('Error adding user_id to tags:', err);
        }
    });

    // Add created_at column to admins table if it doesn't exist
    db.run(`
        ALTER TABLE admins ADD COLUMN created_at DATETIME
    `, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('Error adding created_at to admins:', err);
        } else {
            // Update existing records with current timestamp
            db.run(`
                UPDATE admins SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL
            `, (updateErr) => {
                if (updateErr) {
                    console.error('Error updating admin timestamps:', updateErr);
                }
            });
        }
    });

    // Create main admin if not exists
    db.run(`
        INSERT OR IGNORE INTO admins (username, password) 
        VALUES ('sberiq', 'MTMxMTA4Um9tYQ==')
    `);
}

// Helper function to calculate average rating
function calculateAverageRating(reviews) {
    if (!reviews || reviews.length === 0) return 0;
    const sum = reviews.reduce((acc, review) => acc + (review.rating || 5), 0);
    return Math.round((sum / reviews.length) * 10) / 10;
}

// Helper function to generate star rating HTML
function generateStars(rating) {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
    
    let stars = '';
    for (let i = 0; i < fullStars; i++) {
        stars += '<svg class="star" width="16" height="16" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#fbbf24"/></svg>';
    }
    if (hasHalfStar) {
        stars += '<svg class="star half" width="16" height="16" viewBox="0 0 24 24"><defs><linearGradient id="half-star"><stop offset="50%" stop-color="#fbbf24"/><stop offset="50%" stop-color="#4b5563"/></linearGradient></defs><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="url(#half-star)"/></svg>';
    }
    for (let i = 0; i < emptyStars; i++) {
        stars += '<svg class="star" width="16" height="16" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#4b5563"/></svg>';
    }
    return stars;
}

// Routes

// Telegram WebApp Authentication
app.post('/api/telegram/auth', (req, res) => {
    const { initData } = req.body;
    
    if (!initData) {
        res.status(400).json({ error: 'Telegram init data required' });
        return;
    }
    
    try {
        // Parse Telegram init data (simplified - in production use proper validation)
        const urlParams = new URLSearchParams(initData);
        const userData = JSON.parse(urlParams.get('user') || '{}');
        
        if (!userData.id) {
            res.status(400).json({ error: 'Invalid Telegram user data' });
            return;
        }
        
        // Create or update user
        const userQuery = `
            INSERT OR REPLACE INTO users 
            (telegram_id, username, first_name, last_name, language_code, is_premium, last_seen)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `;
        
        db.run(userQuery, [
            userData.id,
            userData.username || null,
            userData.first_name || null,
            userData.last_name || null,
            userData.language_code || null,
            userData.is_premium || 0
        ], function(err) {
            if (err) {
                console.error('Error creating/updating user:', err);
                res.status(500).json({ error: 'Database error' });
                return;
            }
            
            // Create session
            const sessionToken = generateSessionToken();
            const sessionQuery = `
                INSERT INTO user_sessions 
                (user_id, session_token, user_agent, ip_address, created_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            `;
            
            db.run(sessionQuery, [
                this.lastID,
                sessionToken,
                req.get('User-Agent') || '',
                req.ip || req.connection.remoteAddress || ''
            ], (err) => {
                if (err) {
                    console.error('Error creating session:', err);
                }
                
                res.json({
                    success: true,
                    session_token: sessionToken,
                    user: {
                        id: userData.id,
                        username: userData.username,
                        first_name: userData.first_name,
                        last_name: userData.last_name
                    }
                });
            });
        });
        
    } catch (error) {
        console.error('Error processing Telegram auth:', error);
        res.status(500).json({ error: 'Authentication error' });
    }
});

// Telegram Widget Authentication
app.post('/api/telegram/widget-auth', (req, res) => {
    const { user, sessionToken } = req.body;
    
    if (!user || !user.id) {
        res.status(400).json({ error: 'Invalid user data' });
        return;
    }
    
    try {
        // Create or update user
        const userQuery = `
            INSERT OR REPLACE INTO users 
            (telegram_id, username, first_name, last_name, language_code, is_premium, last_seen)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `;
        
        db.run(userQuery, [
            user.id,
            user.username || null,
            user.first_name || null,
            user.last_name || null,
            user.language_code || null,
            user.is_premium || 0
        ], function(err) {
            if (err) {
                console.error('Error creating/updating user:', err);
                res.status(500).json({ error: 'Database error' });
                return;
            }
            
            // Create session
            const sessionQuery = `
                INSERT INTO user_sessions 
                (user_id, session_token, user_agent, ip_address, created_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            `;
            
            db.run(sessionQuery, [
                this.lastID,
                sessionToken,
                req.get('User-Agent') || '',
                req.ip || req.connection.remoteAddress || ''
            ], (err) => {
                if (err) {
                    console.error('Error creating session:', err);
                }
                
                res.json({
                    success: true,
                    message: 'User authenticated successfully',
                    user: {
                        id: user.id,
                        username: user.username,
                        first_name: user.first_name,
                        last_name: user.last_name
                    }
                });
            });
        });
        
    } catch (error) {
        console.error('Error processing Telegram widget auth:', error);
        res.status(500).json({ error: 'Authentication error' });
    }
});

// Get current user from session
app.get('/api/user/me', (req, res) => {
    const sessionToken = req.headers.authorization?.replace('Bearer ', '');
    
    if (!sessionToken) {
        res.status(401).json({ error: 'No session token' });
        return;
    }
    
    const query = `
        SELECT u.*, s.session_token
        FROM users u
        JOIN user_sessions s ON u.id = s.user_id
        WHERE s.session_token = ?
    `;
    
    db.get(query, [sessionToken], (err, row) => {
        if (err) {
            console.error('Error getting user:', err);
            res.status(500).json({ error: 'Database error' });
            return;
        }
        
        if (!row) {
            res.status(401).json({ error: 'Invalid session' });
            return;
        }
        
        res.json({
            id: row.telegram_id,
            username: row.username,
            first_name: row.first_name,
            last_name: row.last_name,
            language_code: row.language_code,
            is_premium: row.is_premium
        });
    });
});

// Helper function to generate session token
function generateSessionToken() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Get all approved channels with ratings
app.get('/api/channels', (req, res) => {
    const query = `
        SELECT 
            c.id,
            c.title,
            c.description,
            c.link,
            c.created_at,
            COALESCE(AVG(r.rating), 5) as avg_rating,
            COUNT(r.id) as review_count
        FROM channels c
        LEFT JOIN reviews r ON c.id = r.channel_id AND r.status = 'approved'
        WHERE c.status = 'approved'
        GROUP BY c.id
        ORDER BY c.created_at DESC
    `;
    
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('Error fetching channels:', err);
            res.status(500).json({ error: 'Database error' });
            return;
        }
        
        const channels = rows.map(row => ({
            ...row,
            avg_rating: Math.round(row.avg_rating * 10) / 10,
            stars: generateStars(row.avg_rating)
        }));
        
        res.json(channels);
    });
});

// Search channels
// Enhanced search functions
function convertKeyboardLayout(text) {
    const ruToEn = {
        'й': 'q', 'ц': 'w', 'у': 'e', 'к': 'r', 'е': 't', 'н': 'y', 'г': 'u', 'ш': 'i', 'щ': 'o', 'з': 'p',
        'х': '[', 'ъ': ']', 'ф': 'a', 'ы': 's', 'в': 'd', 'а': 'f', 'п': 'g', 'р': 'h', 'о': 'j', 'л': 'k',
        'д': 'l', 'ж': ';', 'э': "'", 'я': 'z', 'ч': 'x', 'с': 'c', 'м': 'v', 'и': 'b', 'т': 'n', 'ь': 'm',
        'б': ',', 'ю': '.', 'ё': '`', 'Й': 'Q', 'Ц': 'W', 'У': 'E', 'К': 'R', 'Е': 'T', 'Н': 'Y', 'Г': 'U',
        'Ш': 'I', 'Щ': 'O', 'З': 'P', 'Х': '[', 'Ъ': ']', 'Ф': 'A', 'Ы': 'S', 'В': 'D', 'А': 'F', 'П': 'G',
        'Р': 'H', 'О': 'J', 'Л': 'K', 'Д': 'L', 'Ж': ';', 'Э': "'", 'Я': 'Z', 'Ч': 'X', 'С': 'C', 'М': 'V',
        'И': 'B', 'Т': 'N', 'Ь': 'M', 'Б': ',', 'Ю': '.', 'Ё': '`'
    };
    
    const enToRu = {
        'q': 'й', 'w': 'ц', 'e': 'у', 'r': 'к', 't': 'е', 'y': 'н', 'u': 'г', 'i': 'ш', 'o': 'щ', 'p': 'з',
        '[': 'х', ']': 'ъ', 'a': 'ф', 's': 'ы', 'd': 'в', 'f': 'а', 'g': 'п', 'h': 'р', 'j': 'о', 'k': 'л',
        'l': 'д', ';': 'ж', "'": 'э', 'z': 'я', 'x': 'ч', 'c': 'с', 'v': 'м', 'b': 'и', 'n': 'т', 'm': 'ь',
        ',': 'б', '.': 'ю', '`': 'ё', 'Q': 'Й', 'W': 'Ц', 'E': 'У', 'R': 'К', 'T': 'Е', 'Y': 'Н', 'U': 'Г',
        'I': 'Ш', 'O': 'Щ', 'P': 'З', '[': 'Х', ']': 'Ъ', 'A': 'Ф', 'S': 'Ы', 'D': 'В', 'F': 'А', 'G': 'П',
        'H': 'Р', 'J': 'О', 'K': 'Л', 'L': 'Д', ';': 'Ж', "'": 'Э', 'Z': 'Я', 'X': 'Ч', 'C': 'С', 'V': 'М',
        'B': 'И', 'N': 'Т', 'M': 'Ь', ',': 'Б', '.': 'Ю', '`': 'Ё'
    };
    
    let result = text;
    
    // Convert RU to EN
    for (const [ru, en] of Object.entries(ruToEn)) {
        result = result.replace(new RegExp(ru, 'g'), en);
    }
    
    // If no conversion happened, try EN to RU
    if (result === text) {
        for (const [en, ru] of Object.entries(enToRu)) {
            result = result.replace(new RegExp(en, 'g'), ru);
        }
    }
    
    return result;
}

// Generate all possible search variations
function generateSearchVariations(query) {
    const variations = new Set();
    
    // Original query
    variations.add(query.toLowerCase());
    variations.add(query.toUpperCase());
    
    // Keyboard layout conversions
    const layoutConverted = convertKeyboardLayout(query);
    variations.add(layoutConverted.toLowerCase());
    variations.add(layoutConverted.toUpperCase());
    
    // Transliterations
    const transliterated = transliterate(query);
    variations.add(transliterated.toLowerCase());
    variations.add(transliterated.toUpperCase());
    
    const reverseTransliterated = reverseTransliterate(query);
    variations.add(reverseTransliterated.toLowerCase());
    variations.add(reverseTransliterated.toUpperCase());
    
    // Combined conversions
    const layoutThenTranslit = transliterate(layoutConverted);
    variations.add(layoutThenTranslit.toLowerCase());
    variations.add(layoutThenTranslit.toUpperCase());
    
    const layoutThenReverseTranslit = reverseTransliterate(layoutConverted);
    variations.add(layoutThenReverseTranslit.toLowerCase());
    variations.add(layoutThenReverseTranslit.toUpperCase());
    
    // Fuzzy variations (common typos)
    const fuzzyVariations = generateFuzzyVariations(query);
    fuzzyVariations.forEach(variation => {
        variations.add(variation.toLowerCase());
        variations.add(variation.toUpperCase());
    });
    
    // Remove empty strings and return unique variations
    return Array.from(variations).filter(v => v && v.trim().length > 0);
}

// Generate fuzzy search variations for common typos
function generateFuzzyVariations(text) {
    const variations = new Set();
    
    // Common character substitutions
    const substitutions = {
        'а': ['a', 'o'], 'о': ['a', 'o', '0'], 'е': ['e', 'ё'], 'ё': ['e', 'е'],
        'и': ['i', '1'], 'й': ['i', 'y'], 'у': ['u', 'y'], 'ы': ['i', 'y'],
        'ш': ['sh', 'w'], 'щ': ['sch', 'w'], 'ч': ['ch', '4'], 'ж': ['zh', 'g'],
        'ц': ['ts', 'c'], 'х': ['h', 'x'], 'ъ': ['', '`'], 'ь': ['', '`'],
        'з': ['z', '3'], 'с': ['s', 'c'], 'в': ['v', 'w'], 'б': ['b', '6'],
        'п': ['p', 'n'], 'р': ['r', 'p'], 'т': ['t', '7'], 'д': ['d', 'g'],
        'л': ['l', '1'], 'к': ['k', 'g'], 'м': ['m', 'n'], 'н': ['n', 'm'],
        'г': ['g', 'h'], 'ф': ['f', 'ph'], 'я': ['ya', 'ia'], 'ю': ['yu', 'iu']
    };
    
    // Generate variations with character substitutions
    for (let i = 0; i < text.length; i++) {
        const char = text[i].toLowerCase();
        if (substitutions[char]) {
            substitutions[char].forEach(sub => {
                const variation = text.substring(0, i) + sub + text.substring(i + 1);
                variations.add(variation);
            });
        }
    }
    
    // Generate variations with missing characters
    for (let i = 0; i < text.length; i++) {
        const variation = text.substring(0, i) + text.substring(i + 1);
        if (variation.length > 0) {
            variations.add(variation);
        }
    }
    
    // Generate variations with extra characters
    const commonChars = 'аеиоуыэюяabcdefghijklmnopqrstuvwxyz';
    for (let i = 0; i <= text.length; i++) {
        for (const char of commonChars) {
            const variation = text.substring(0, i) + char + text.substring(i);
            variations.add(variation);
        }
    }
    
    return Array.from(variations);
}

// Helper function for transliteration
function transliterate(text) {
    const translitMap = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh', 'з': 'z',
        'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r',
        'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
        'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
        'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo', 'Ж': 'Zh', 'З': 'Z',
        'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M', 'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R',
        'С': 'S', 'Т': 'T', 'У': 'U', 'Ф': 'F', 'Х': 'H', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Sch',
        'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya'
    };
    
    let result = text;
    for (const [ru, en] of Object.entries(translitMap)) {
        result = result.replace(new RegExp(ru, 'g'), en);
    }
    return result;
}

// Helper function to reverse transliteration
function reverseTransliterate(text) {
    const reverseTranslitMap = {
        'a': 'а', 'b': 'б', 'v': 'в', 'g': 'г', 'd': 'д', 'e': 'е', 'yo': 'ё', 'zh': 'ж', 'z': 'з',
        'i': 'и', 'y': 'й', 'k': 'к', 'l': 'л', 'm': 'м', 'n': 'н', 'o': 'о', 'p': 'п', 'r': 'р',
        's': 'с', 't': 'т', 'u': 'у', 'f': 'ф', 'h': 'х', 'ts': 'ц', 'ch': 'ч', 'sh': 'ш', 'sch': 'щ',
        'yu': 'ю', 'ya': 'я'
    };
    
    let result = text.toLowerCase();
    
    // Sort by length to handle multi-character transliterations first
    const sortedKeys = Object.keys(reverseTranslitMap).sort((a, b) => b.length - a.length);
    
    for (const key of sortedKeys) {
        result = result.replace(new RegExp(key, 'g'), reverseTranslitMap[key]);
    }
    
    return result;
}

app.get('/api/channels/search', (req, res) => {
    const { q } = req.query;
    
    if (!q || q.trim() === '') {
        res.json([]);
        return;
    }
    
    const originalQuery = q.trim();
    
    // Generate enhanced search variations
    const searchVariations = generateSearchVariations(originalQuery);
    
    // Limit variations to prevent too many parameters (max 50)
    const limitedVariations = searchVariations.slice(0, 50);
    
    // Create search terms for SQL LIKE
    const searchTerms = limitedVariations.map(term => `%${term}%`);
    
    // Create LIKE conditions for each search term
    const titleConditions = searchTerms.map(() => 'LOWER(c.title) LIKE LOWER(?)').join(' OR ');
    const descriptionConditions = searchTerms.map(() => 'LOWER(c.description) LIKE LOWER(?)').join(' OR ');
    const tagConditions = searchTerms.map(() => 'LOWER(t.name) LIKE LOWER(?)').join(' OR ');
    
    const query = `
        SELECT DISTINCT
            c.id,
            c.title,
            c.description,
            c.link,
            c.created_at,
            COALESCE(AVG(r.rating), 5) as avg_rating,
            COUNT(r.id) as review_count,
            GROUP_CONCAT(DISTINCT t.name) as tags,
            -- Calculate relevance score
            (
                CASE WHEN LOWER(c.title) LIKE LOWER(?) THEN 10 ELSE 0 END +
                CASE WHEN LOWER(c.description) LIKE LOWER(?) THEN 5 ELSE 0 END +
                CASE WHEN LOWER(t.name) LIKE LOWER(?) THEN 3 ELSE 0 END +
                -- Bonus for exact matches
                CASE WHEN LOWER(c.title) = LOWER(?) THEN 20 ELSE 0 END +
                CASE WHEN LOWER(t.name) = LOWER(?) THEN 15 ELSE 0 END
            ) as relevance_score
        FROM channels c
        LEFT JOIN reviews r ON c.id = r.channel_id AND r.status = 'approved'
        LEFT JOIN channel_tags ct ON c.id = ct.channel_id
        LEFT JOIN tags t ON ct.tag_id = t.id
        WHERE c.status = 'approved' 
        AND (
            (${titleConditions}) OR 
            (${descriptionConditions}) OR
            (${tagConditions})
        )
        GROUP BY c.id
        ORDER BY 
            relevance_score DESC,
            avg_rating DESC,
            review_count DESC,
            c.created_at DESC
    `;
    
    // Flatten search terms for the query (3 times for title, description, tags)
    const queryParams = [
        ...searchTerms, // for title conditions
        ...searchTerms, // for description conditions  
        ...searchTerms, // for tag conditions
        `%${originalQuery}%`, // for title priority
        `%${originalQuery}%`, // for description priority
        `%${originalQuery}%`, // for tags priority
        originalQuery, // for exact title match
        originalQuery  // for exact tag match
    ];
    
    db.all(query, queryParams, (err, rows) => {
        if (err) {
            console.error('Error searching channels:', err);
            res.status(500).json({ error: 'Database error' });
            return;
        }
        
        const channels = rows.map(row => ({
            ...row,
            avg_rating: Math.round(row.avg_rating * 10) / 10,
            stars: generateStars(row.avg_rating),
            tags: row.tags ? row.tags.split(',') : []
        }));
        
        res.json(channels);
    });
});

// Search by tags
app.get('/api/tags/search', (req, res) => {
    const { q } = req.query;
    
    if (!q || q.trim() === '') {
        res.json([]);
        return;
    }
    
    const originalQuery = q.trim();
    
    // Generate enhanced search variations
    const searchVariations = generateSearchVariations(originalQuery);
    
    // Limit variations to prevent too many parameters (max 30 for tags)
    const limitedVariations = searchVariations.slice(0, 30);
    
    // Create search terms for SQL LIKE
    const searchTerms = limitedVariations.map(term => `%${term}%`);
    
    // Create LIKE conditions for each search term
    const tagConditions = searchTerms.map(() => 'LOWER(t.name) LIKE LOWER(?)').join(' OR ');
    
    const query = `
        SELECT DISTINCT
            t.id,
            t.name,
            COUNT(ct.channel_id) as channel_count,
            -- Calculate relevance score
            (
                CASE WHEN LOWER(t.name) LIKE LOWER(?) THEN 10 ELSE 0 END +
                CASE WHEN LOWER(t.name) = LOWER(?) THEN 20 ELSE 0 END
            ) as relevance_score
        FROM tags t
        LEFT JOIN channel_tags ct ON t.id = ct.tag_id
        LEFT JOIN channels c ON ct.channel_id = c.id AND c.status = 'approved'
        WHERE (${tagConditions})
        GROUP BY t.id, t.name
        ORDER BY 
            relevance_score DESC,
            channel_count DESC,
            t.name ASC
    `;
    
    const queryParams = [
        ...searchTerms, // for tag conditions
        `%${originalQuery}%`, // for tag priority
        originalQuery // for exact tag match
    ];
    
    db.all(query, queryParams, (err, rows) => {
        if (err) {
            console.error('Error searching tags:', err);
            res.status(500).json({ error: 'Database error' });
            return;
        }
        
        res.json(rows);
    });
});

// Search channels by tag name
app.get('/api/channels/by-tag', (req, res) => {
    const { tag } = req.query;
    
    if (!tag || tag.trim() === '') {
        res.json([]);
        return;
    }
    
    const originalTag = tag.trim();
    
    // Generate enhanced search variations for tag
    const searchVariations = generateSearchVariations(originalTag);
    const limitedVariations = searchVariations.slice(0, 30);
    const searchTerms = limitedVariations.map(term => `%${term}%`);
    
    const tagConditions = searchTerms.map(() => 'LOWER(t.name) LIKE LOWER(?)').join(' OR ');
    
    const query = `
        SELECT DISTINCT
            c.id,
            c.title,
            c.description,
            c.link,
            c.created_at,
            COALESCE(AVG(r.rating), 5) as avg_rating,
            COUNT(r.id) as review_count,
            GROUP_CONCAT(DISTINCT t.name) as tags,
            -- Calculate relevance score
            (
                CASE WHEN LOWER(t.name) LIKE LOWER(?) THEN 10 ELSE 0 END +
                CASE WHEN LOWER(t.name) = LOWER(?) THEN 20 ELSE 0 END
            ) as relevance_score
        FROM channels c
        LEFT JOIN reviews r ON c.id = r.channel_id AND r.status = 'approved'
        LEFT JOIN channel_tags ct ON c.id = ct.channel_id
        LEFT JOIN tags t ON ct.tag_id = t.id
        WHERE c.status = 'approved' 
        AND (${tagConditions})
        GROUP BY c.id
        ORDER BY 
            relevance_score DESC,
            avg_rating DESC,
            review_count DESC,
            c.created_at DESC
    `;
    
    const queryParams = [
        ...searchTerms, // for tag conditions
        `%${originalTag}%`, // for tag priority
        originalTag // for exact tag match
    ];
    
    db.all(query, queryParams, (err, rows) => {
        if (err) {
            console.error('Error searching channels by tag:', err);
            res.status(500).json({ error: 'Database error' });
            return;
        }
        
        const channels = rows.map(row => ({
            ...row,
            avg_rating: Math.round(row.avg_rating * 10) / 10,
            stars: generateStars(row.avg_rating),
            tags: row.tags ? row.tags.split(',') : []
        }));
        
        res.json(channels);
    });
});

// Get random channel
app.get('/api/channels/random', (req, res) => {
    const query = `
        SELECT 
            c.id,
            c.title,
            c.description,
            c.link,
            c.created_at,
            COALESCE(AVG(r.rating), 5) as avg_rating,
            COUNT(r.id) as review_count,
            GROUP_CONCAT(DISTINCT t.name) as tags
        FROM channels c
        LEFT JOIN reviews r ON c.id = r.channel_id AND r.status = 'approved'
        LEFT JOIN channel_tags ct ON c.id = ct.channel_id
        LEFT JOIN tags t ON ct.tag_id = t.id
        WHERE c.status = 'approved'
        GROUP BY c.id
        ORDER BY RANDOM()
        LIMIT 1
    `;
    
    db.get(query, [], (err, row) => {
        if (err) {
            console.error('Error getting random channel:', err);
            res.status(500).json({ error: 'Database error' });
            return;
        }
        
        if (!row) {
            res.status(404).json({ error: 'No channels found' });
            return;
        }
        
        const channel = {
            ...row,
            avg_rating: Math.round(row.avg_rating * 10) / 10,
            stars: generateStars(row.avg_rating),
            tags: row.tags ? row.tags.split(',') : []
        };
        
        res.json(channel);
    });
});

// Get channels by tag
app.get('/api/tags/:tagId/channels', (req, res) => {
    const tagId = req.params.tagId;
    
    const query = `
        SELECT 
            c.id,
            c.title,
            c.description,
            c.link,
            c.created_at,
            COALESCE(AVG(r.rating), 5) as avg_rating,
            COUNT(r.id) as review_count,
            GROUP_CONCAT(DISTINCT t.name) as tags
        FROM channels c
        LEFT JOIN reviews r ON c.id = r.channel_id AND r.status = 'approved'
        LEFT JOIN channel_tags ct ON c.id = ct.channel_id
        LEFT JOIN tags t ON ct.tag_id = t.id
        WHERE c.status = 'approved' 
        AND c.id IN (
            SELECT channel_id 
            FROM channel_tags 
            WHERE tag_id = ?
        )
        GROUP BY c.id
        ORDER BY c.created_at DESC
    `;
    
    db.all(query, [tagId], (err, rows) => {
        if (err) {
            console.error('Error getting channels by tag:', err);
            res.status(500).json({ error: 'Database error' });
            return;
        }
        
        const channels = rows.map(row => ({
            ...row,
            avg_rating: Math.round(row.avg_rating * 10) / 10,
            stars: generateStars(row.avg_rating),
            tags: row.tags ? row.tags.split(',') : []
        }));
        
        res.json(channels);
    });
});

// Get channel details with reviews
app.get('/api/channels/:id', (req, res) => {
    const channelId = req.params.id;
    
    // Get channel info
    const channelQuery = 'SELECT * FROM channels WHERE id = ? AND status = ?';
    db.get(channelQuery, [channelId, 'approved'], (err, channel) => {
        if (err) {
            console.error('Error fetching channel:', err);
            res.status(500).json({ error: 'Database error' });
            return;
        }
        
        if (!channel) {
            res.status(404).json({ error: 'Channel not found' });
            return;
        }
        
        // Get reviews
        const reviewsQuery = `
            SELECT * FROM reviews 
            WHERE channel_id = ? AND status = 'approved'
            ORDER BY created_at DESC
        `;
        
        db.all(reviewsQuery, [channelId], (err, reviews) => {
            if (err) {
                console.error('Error fetching reviews:', err);
                res.status(500).json({ error: 'Database error' });
                return;
            }
            
            const avgRating = calculateAverageRating(reviews);
            
            res.json({
                ...channel,
                reviews,
                avg_rating: avgRating,
                review_count: reviews.length,
                stars: generateStars(avgRating)
            });
        });
    });
});

// Get all tags
app.get('/api/tags', (req, res) => {
    const query = 'SELECT * FROM tags WHERE status = ? ORDER BY name';
    
    db.all(query, ['approved'], (err, rows) => {
        if (err) {
            console.error('Error fetching tags:', err);
            res.status(500).json({ error: 'Database error' });
            return;
        }
        
        res.json(rows);
    });
});

// Add new channel
app.post('/api/channels', (req, res) => {
    const { title, description, link, tags } = req.body;
    const sessionToken = req.headers.authorization?.replace('Bearer ', '');
    
    if (!title || !description || !link) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
    }
    
    // Validate Telegram link format
    if (!link.match(/^https:\/\/t\.me\/[a-zA-Z0-9_]+$/)) {
        res.status(400).json({ error: 'Invalid Telegram link format' });
        return;
    }
    
    // Get user ID from session
    let userId = null;
    if (sessionToken) {
        const userQuery = 'SELECT user_id FROM user_sessions WHERE session_token = ?';
        db.get(userQuery, [sessionToken], (err, row) => {
            if (!err && row) {
                userId = row.user_id;
            }
            insertChannel();
        });
    } else {
        insertChannel();
    }
    
    function insertChannel() {
        const insertQuery = `
            INSERT INTO channels (title, description, link, status, user_id)
            VALUES (?, ?, ?, 'pending', ?)
        `;
        
        db.run(insertQuery, [title, description, link, userId], function(err) {
        if (err) {
            console.error('Error inserting channel:', err);
            res.status(500).json({ error: 'Database error' });
            return;
        }
        
        const channelId = this.lastID;
        
        // Add tags if provided
        if (tags && tags.length > 0) {
            const tagInsertQuery = `
                INSERT INTO channel_tags (channel_id, tag_id)
                VALUES (?, ?)
            `;
            
            tags.forEach(tagId => {
                db.run(tagInsertQuery, [channelId, tagId], (err) => {
                    if (err) {
                        console.error('Error inserting channel tag:', err);
                    }
                });
            });
        }
        
        res.json({ 
            success: true, 
            message: 'Канал добавлен и отправлен на модерацию',
            channel_id: channelId 
        });
        });
    }
});

// Add review
app.post('/api/channels/:id/reviews', (req, res) => {
    const channelId = req.params.id;
    const { text, rating, is_anonymous } = req.body;
    const sessionToken = req.headers.authorization?.replace('Bearer ', '');
    
    if (!text || !rating) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
    }
    
    if (rating < 1 || rating > 5) {
        res.status(400).json({ error: 'Rating must be between 1 and 5' });
        return;
    }
    
    // Get user info from session
    let userId = null;
    let userDisplayName = 'Анонимный пользователь';
    let isAnonymousReview = is_anonymous || false;
    
    if (sessionToken) {
        const userQuery = `
            SELECT u.id, u.first_name, u.last_name, u.username
            FROM users u
            JOIN user_sessions s ON u.id = s.user_id
            WHERE s.session_token = ?
        `;
        db.get(userQuery, [sessionToken], (err, user) => {
            if (!err && user) {
                userId = user.id;
                if (isAnonymousReview) {
                    userDisplayName = 'Анонимный пользователь';
                } else {
                    userDisplayName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
                    if (user.username) {
                        userDisplayName += ` (@${user.username})`;
                    }
                }
            }
            insertReview();
        });
    } else {
        insertReview();
    }
    
    function insertReview() {
        // Check if channel exists
        const channelQuery = 'SELECT id FROM channels WHERE id = ? AND status = ?';
        db.get(channelQuery, [channelId, 'approved'], (err, channel) => {
            if (err) {
                console.error('Error checking channel:', err);
                res.status(500).json({ error: 'Database error' });
                return;
            }
            
            if (!channel) {
                res.status(404).json({ error: 'Channel not found' });
                return;
            }
            
            const insertQuery = `
                INSERT INTO reviews (channel_id, text, nickname, is_anonymous, rating, status, user_id)
                VALUES (?, ?, ?, ?, ?, 'pending', ?)
            `;
            
            db.run(insertQuery, [channelId, text, userDisplayName, isAnonymousReview, rating, userId], function(err) {
                if (err) {
                    console.error('Error inserting review:', err);
                    res.status(500).json({ error: 'Database error' });
                    return;
                }
                
                res.json({ 
                    success: true, 
                    message: 'Отзыв добавлен и отправлен на модерацию',
                    review_id: this.lastID 
                });
            });
        });
    }
});

// User API Routes

// Get current user info
app.get('/api/user/me', (req, res) => {
    const sessionToken = req.headers.authorization?.replace('Bearer ', '');
    
    if (!sessionToken) {
        res.status(401).json({ error: 'No session token provided' });
        return;
    }
    
    const query = `
        SELECT u.*, us.session_token
        FROM users u
        JOIN user_sessions us ON u.id = us.user_id
        WHERE us.session_token = ?
        ORDER BY us.created_at DESC
        LIMIT 1
    `;
    
    db.get(query, [sessionToken], (err, user) => {
        if (err) {
            console.error('Error getting user info:', err);
            res.status(500).json({ error: 'Database error' });
            return;
        }
        
        if (!user) {
            res.status(401).json({ error: 'Invalid session' });
            return;
        }
        
        res.json({
            id: user.telegram_id,
            username: user.username,
            first_name: user.first_name,
            last_name: user.last_name,
            language_code: user.language_code,
            is_premium: user.is_premium
        });
    });
});

// Admin API Routes

// Admin login
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        res.status(400).json({ error: 'Missing credentials' });
        return;
    }
    
    // Encode password to Base64 for comparison
    const encodedPassword = Buffer.from(password).toString('base64');
    
    const query = 'SELECT * FROM admins WHERE username = ? AND password = ?';
    db.get(query, [username, encodedPassword], (err, admin) => {
        if (err) {
            console.error('Error checking admin credentials:', err);
            res.status(500).json({ error: 'Database error' });
            return;
        }
        
        if (!admin) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }
        
        res.json({ success: true, message: 'Login successful' });
    });
});

// Get all channels for admin
app.get('/api/admin/channels', (req, res) => {
    const query = 'SELECT * FROM channels ORDER BY created_at DESC';
    
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('Error fetching admin channels:', err);
            res.status(500).json({ error: 'Database error' });
            return;
        }
        
        res.json(rows);
    });
});

// Get all reviews for admin
app.get('/api/admin/reviews', (req, res) => {
    const query = `
        SELECT r.*, c.title as channel_title 
        FROM reviews r 
        LEFT JOIN channels c ON r.channel_id = c.id 
        ORDER BY r.created_at DESC
    `;
    
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('Error fetching admin reviews:', err);
            res.status(500).json({ error: 'Database error' });
            return;
        }
        
        res.json(rows);
    });
});

// Get all tags for admin
app.get('/api/admin/tags', (req, res) => {
    const query = 'SELECT * FROM tags ORDER BY name';
    
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('Error fetching admin tags:', err);
            res.status(500).json({ error: 'Database error' });
            return;
        }
        
        res.json(rows);
    });
});

// Admin search
app.get('/api/admin/search', (req, res) => {
    const { q } = req.query;
    
    if (!q || q.trim() === '') {
        res.json([]);
        return;
    }
    
    const searchTerm = `%${q.trim()}%`;
    const query = `
        SELECT 'channel' as type, id, title, description, status, created_at
        FROM channels 
        WHERE title LIKE ? OR description LIKE ?
        UNION ALL
        SELECT 'review' as type, id, text as title, '' as description, status, created_at
        FROM reviews 
        WHERE text LIKE ?
        UNION ALL
        SELECT 'tag' as type, id, name as title, '' as description, status, created_at
        FROM tags 
        WHERE name LIKE ?
        ORDER BY created_at DESC
    `;
    
    db.all(query, [searchTerm, searchTerm, searchTerm, searchTerm], (err, rows) => {
        if (err) {
            console.error('Error performing admin search:', err);
            res.status(500).json({ error: 'Database error' });
            return;
        }
        
        res.json(rows);
    });
});

// Approve channel
app.post('/api/admin/channels/:id/approve', (req, res) => {
    const channelId = req.params.id;
    
    const query = 'UPDATE channels SET status = ? WHERE id = ?';
    db.run(query, ['approved', channelId], function(err) {
        if (err) {
            console.error('Error approving channel:', err);
            res.status(500).json({ error: 'Database error' });
            return;
        }
        
        res.json({ success: true, message: 'Channel approved' });
    });
});

// Delete channel
app.delete('/api/admin/channels/:id', (req, res) => {
    const channelId = req.params.id;
    
    // Delete related reviews first
    const deleteReviewsQuery = 'DELETE FROM reviews WHERE channel_id = ?';
    db.run(deleteReviewsQuery, [channelId], (err) => {
        if (err) {
            console.error('Error deleting channel reviews:', err);
            res.status(500).json({ error: 'Database error' });
            return;
        }
        
        // Delete channel tags
        const deleteChannelTagsQuery = 'DELETE FROM channel_tags WHERE channel_id = ?';
        db.run(deleteChannelTagsQuery, [channelId], (err) => {
            if (err) {
                console.error('Error deleting channel tags:', err);
                res.status(500).json({ error: 'Database error' });
                return;
            }
            
            // Delete channel
            const deleteChannelQuery = 'DELETE FROM channels WHERE id = ?';
            db.run(deleteChannelQuery, [channelId], function(err) {
                if (err) {
                    console.error('Error deleting channel:', err);
                    res.status(500).json({ error: 'Database error' });
                    return;
                }
                
                res.json({ success: true, message: 'Channel deleted' });
            });
        });
    });
});

// Approve review
app.post('/api/admin/reviews/:id/approve', (req, res) => {
    const reviewId = req.params.id;
    
    const query = 'UPDATE reviews SET status = ? WHERE id = ?';
    db.run(query, ['approved', reviewId], function(err) {
        if (err) {
            console.error('Error approving review:', err);
            res.status(500).json({ error: 'Database error' });
            return;
        }
        
        res.json({ success: true, message: 'Review approved' });
    });
});

// Delete review
app.delete('/api/admin/reviews/:id', (req, res) => {
    const reviewId = req.params.id;
    
    const query = 'DELETE FROM reviews WHERE id = ?';
    db.run(query, [reviewId], function(err) {
        if (err) {
            console.error('Error deleting review:', err);
            res.status(500).json({ error: 'Database error' });
            return;
        }
        
        res.json({ success: true, message: 'Review deleted' });
    });
});

// Add tag (admin only, no moderation)
app.post('/api/admin/tags', (req, res) => {
    const { name } = req.body;
    
    if (!name || name.trim() === '') {
        res.status(400).json({ error: 'Tag name is required' });
        return;
    }
    
    const insertQuery = `
        INSERT INTO tags (name, status)
        VALUES (?, 'approved')
    `;
    
    db.run(insertQuery, [name.trim()], function(err) {
        if (err) {
            if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                res.status(400).json({ error: 'Tag already exists' });
                return;
            }
            console.error('Error inserting tag:', err);
            res.status(500).json({ error: 'Database error' });
            return;
        }
        
        res.json({ 
            success: true, 
            message: 'Tag added successfully',
            tag_id: this.lastID 
        });
    });
});

// Delete tag
app.delete('/api/admin/tags/:id', (req, res) => {
    const tagId = req.params.id;
    
    // Delete from channel_tags first
    const deleteChannelTagsQuery = 'DELETE FROM channel_tags WHERE tag_id = ?';
    db.run(deleteChannelTagsQuery, [tagId], (err) => {
        if (err) {
            console.error('Error deleting tag from channels:', err);
            res.status(500).json({ error: 'Database error' });
            return;
        }
        
        // Delete tag
        const deleteTagQuery = 'DELETE FROM tags WHERE id = ?';
        db.run(deleteTagQuery, [tagId], function(err) {
            if (err) {
                console.error('Error deleting tag:', err);
                res.status(500).json({ error: 'Database error' });
                return;
            }
            
            res.json({ success: true, message: 'Tag deleted' });
        });
    });
});

// Admin Management API
// Get all admins
app.get('/api/admin/admins', (req, res) => {
    const query = 'SELECT id, username, created_at FROM admins ORDER BY created_at DESC';
    
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('Error fetching admins:', err);
            res.status(500).json({ error: 'Database error' });
            return;
        }
        
        res.json(rows);
    });
});

// Add new admin
app.post('/api/admin/admins', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        res.status(400).json({ error: 'Username and password are required' });
        return;
    }
    
    // Check if admin already exists
    const checkQuery = 'SELECT id FROM admins WHERE username = ?';
    db.get(checkQuery, [username], (err, row) => {
        if (err) {
            console.error('Error checking admin:', err);
            res.status(500).json({ error: 'Database error' });
            return;
        }
        
        if (row) {
            res.status(400).json({ error: 'Admin with this username already exists' });
            return;
        }
        
        // Hash password (simple hash for demo - in production use bcrypt)
        const hashedPassword = Buffer.from(password).toString('base64');
        
        const insertQuery = 'INSERT INTO admins (username, password) VALUES (?, ?)';
        db.run(insertQuery, [username, hashedPassword], function(err) {
            if (err) {
                console.error('Error inserting admin:', err);
                res.status(500).json({ error: 'Database error' });
                return;
            }
            
            res.json({ 
                success: true, 
                message: 'Admin added successfully',
                admin_id: this.lastID 
            });
        });
    });
});

// Delete admin
app.delete('/api/admin/admins/:id', (req, res) => {
    const adminId = req.params.id;
    
    // Prevent deleting the last admin
    const countQuery = 'SELECT COUNT(*) as count FROM admins';
    db.get(countQuery, [], (err, row) => {
        if (err) {
            console.error('Error counting admins:', err);
            res.status(500).json({ error: 'Database error' });
            return;
        }
        
        if (row.count <= 1) {
            res.status(400).json({ error: 'Cannot delete the last admin' });
            return;
        }
        
        const deleteQuery = 'DELETE FROM admins WHERE id = ?';
        db.run(deleteQuery, [adminId], function(err) {
            if (err) {
                console.error('Error deleting admin:', err);
                res.status(500).json({ error: 'Database error' });
                return;
            }
            
            if (this.changes === 0) {
                res.status(404).json({ error: 'Admin not found' });
                return;
            }
            
            res.json({ 
                success: true, 
                message: 'Admin deleted successfully' 
            });
        });
    });
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Admin Users API
app.get('/api/admin/users', (req, res) => {
    const query = `
        SELECT 
            u.id,
            u.telegram_id,
            u.username,
            u.first_name,
            u.last_name,
            u.language_code,
            u.is_premium,
            u.created_at,
            u.last_seen,
            COUNT(DISTINCT c.id) as channels_count,
            COUNT(DISTINCT r.id) as reviews_count,
            COUNT(DISTINCT t.id) as tags_count
        FROM users u
        LEFT JOIN channels c ON u.id = c.user_id
        LEFT JOIN reviews r ON u.id = r.user_id
        LEFT JOIN tags t ON u.id = t.user_id
        GROUP BY u.id
        ORDER BY u.created_at DESC
    `;
    
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('Error fetching users:', err);
            res.status(500).json({ error: 'Database error' });
            return;
        }
        
        res.json(rows);
    });
});

// Admin Statistics API
app.get('/api/admin/statistics', (req, res) => {
    const stats = {};
    
    // Get total counts
    const totalQuery = `
        SELECT 
            (SELECT COUNT(*) FROM users) as total_users,
            (SELECT COUNT(*) FROM channels) as total_channels,
            (SELECT COUNT(*) FROM reviews) as total_reviews,
            (SELECT COUNT(*) FROM tags) as total_tags
    `;
    
    db.get(totalQuery, [], (err, totals) => {
        if (err) {
            console.error('Error fetching totals:', err);
            res.status(500).json({ error: 'Database error' });
            return;
        }
        
        stats.totals = totals;
        
        // Get top countries
        const countriesQuery = `
            SELECT country, COUNT(*) as count
            FROM user_sessions
            WHERE country IS NOT NULL
            GROUP BY country
            ORDER BY count DESC
            LIMIT 10
        `;
        
        db.all(countriesQuery, [], (err, countries) => {
            if (err) {
                console.error('Error fetching countries:', err);
                res.status(500).json({ error: 'Database error' });
                return;
            }
            
            stats.topCountries = countries;
            
            // Get top browsers
            const browsersQuery = `
                SELECT browser, COUNT(*) as count
                FROM user_sessions
                WHERE browser IS NOT NULL
                GROUP BY browser
                ORDER BY count DESC
                LIMIT 10
            `;
            
            db.all(browsersQuery, [], (err, browsers) => {
                if (err) {
                    console.error('Error fetching browsers:', err);
                    res.status(500).json({ error: 'Database error' });
                    return;
                }
                
                stats.topBrowsers = browsers;
                
                // Get top devices
                const devicesQuery = `
                    SELECT device_type, COUNT(*) as count
                    FROM user_sessions
                    WHERE device_type IS NOT NULL
                    GROUP BY device_type
                    ORDER BY count DESC
                    LIMIT 10
                `;
                
                db.all(devicesQuery, [], (err, devices) => {
                    if (err) {
                        console.error('Error fetching devices:', err);
                        res.status(500).json({ error: 'Database error' });
                        return;
                    }
                    
                    stats.topDevices = devices;
                    
                    // Get daily registrations (last 30 days)
                    const dailyQuery = `
                        SELECT DATE(created_at) as date, COUNT(*) as count
                        FROM users
                        WHERE created_at >= datetime('now', '-30 days')
                        GROUP BY DATE(created_at)
                        ORDER BY date DESC
                    `;
                    
                    db.all(dailyQuery, [], (err, daily) => {
                        if (err) {
                            console.error('Error fetching daily stats:', err);
                            res.status(500).json({ error: 'Database error' });
                            return;
                        }
                        
                        stats.dailyRegistrations = daily;
                        res.json(stats);
                    });
                });
            });
        });
    });
});

// Update admin channels query to include user info
app.get('/api/admin/channels', (req, res) => {
    const query = `
        SELECT 
            c.id,
            c.title,
            c.description,
            c.link,
            c.status,
            c.created_at,
            u.telegram_id,
            u.username,
            u.first_name,
            u.last_name
        FROM channels c
        LEFT JOIN users u ON c.user_id = u.id
        ORDER BY c.created_at DESC
    `;
    
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('Error fetching admin channels:', err);
            res.status(500).json({ error: 'Database error' });
            return;
        }
        
        res.json(rows);
    });
});

// Update admin reviews query to include user info
app.get('/api/admin/reviews', (req, res) => {
    const query = `
        SELECT 
            r.id,
            r.text,
            r.rating,
            r.status,
            r.created_at,
            c.title as channel_title,
            u.telegram_id,
            u.username,
            u.first_name,
            u.last_name
        FROM reviews r
        LEFT JOIN channels c ON r.channel_id = c.id
        LEFT JOIN users u ON r.user_id = u.id
        ORDER BY r.created_at DESC
    `;
    
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('Error fetching admin reviews:', err);
            res.status(500).json({ error: 'Database error' });
            return;
        }
        
        res.json(rows);
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err);
        } else {
            console.log('Database connection closed');
        }
        process.exit(0);
    });
});