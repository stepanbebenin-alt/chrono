/**
 * Chrono — Render & Local Web Server
 * Zero external dependencies: pure Node.js built-in modules (http, fs, path, crypto)
 * Supports Family Multi-Access (Mom + Dad) & Real-time Sync
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'chrono_data.json');
const SALT = 'chrono_clinical_salt_2026';



// -------------------------------------------------------------
// DATA STORE (CLEAN DATABASE WITHOUT SAMPLE DATA)
// -------------------------------------------------------------
let db = {
    users: {},           // userId -> user
    usersByUsername: {}, // username -> userId
    sessions: {},        // token -> userId
    children: {},        // childId -> child
    childrenByUser: {}   // userId -> [childId]
};

function hashPassword(pass) {
    return crypto.createHash('sha256').update(SALT + pass).digest('hex');
}

function loadDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const raw = fs.readFileSync(DB_FILE, 'utf-8');
            db = JSON.parse(raw);
            console.log('📂 Database loaded from', DB_FILE);
            return;
        }
    } catch (e) {
        console.error('Failed to read DB, initializing a fresh clean database:', e.message);
    }

    db = {
        users: {},
        usersByUsername: {},
        sessions: {},
        children: {},
        childrenByUser: {}
    };
    saveDatabase();
    console.log('✨ Initialized clean database without sample data');
}

function saveDatabase() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
    } catch (e) {
        console.error('Failed to save DB:', e.message);
    }
}

loadDatabase();

// -------------------------------------------------------------
// ACCESS CHECK FOR CHILD PROFILE (PARENT 1 AND PARENT 2)
// -------------------------------------------------------------
function hasChildAccess(child, userId) {
    if (!child || !userId) return false;
    if (child.userId === userId) return true;
    if (Array.isArray(child.familyMembers)) {
        return child.familyMembers.some(m => (typeof m === 'string' ? m === userId : m.userId === userId));
    }
    return false;
}

function generateFamilyCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'FAM-';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// -------------------------------------------------------------
// HTTP REQUEST HELPERS
// -------------------------------------------------------------
function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    });
    res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 2 * 1024 * 1024) {
                req.destroy();
                reject(new Error('Payload too large'));
            }
        });
        req.on('end', () => {
            if (!body.trim()) return resolve({});
            try {
                resolve(JSON.parse(body));
            } catch (err) {
                reject(err);
            }
        });
        req.on('error', reject);
    });
}

function getAuthUserId(req) {
    const header = req.headers['authorization'];
    if (!header || !header.startsWith('Bearer ')) return null;
    const token = header.slice(7).trim();
    return db.sessions[token] || null;
}

// -------------------------------------------------------------
// MAIN HTTP SERVER
// -------------------------------------------------------------
const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
        });
        return res.end();
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const method = req.method.toUpperCase();

    // Health check endpoint (for Render monitoring)
    if (pathname === '/api/health' || pathname === '/healthz') {
        return sendJson(res, 200, { status: 'ok', service: 'chrono', uptime: process.uptime() });
    }

    // ---------------- API ROUTES ----------------
    if (pathname.startsWith('/api/')) {
        try {
            // POST /api/register
            if (pathname === '/api/register' && method === 'POST') {
                const body = await parseJsonBody(req);
                const username = (body.username || '').trim().toLowerCase();
                const password = body.password || '';
                const name = (body.name || '').trim();

                if (!username || !password || !name) {
                    return sendJson(res, 400, { success: false, message: 'Please fill in all fields' });
                }

                if (db.usersByUsername[username]) {
                    return sendJson(res, 409, { success: false, message: 'An account with this username already exists' });
                }

                const userId = 'u_' + Date.now();
                const user = {
                    id: userId,
                    username,
                    name,
                    passwordHash: hashPassword(password),
                    theme: 'dark',
                    createdAt: new Date().toISOString()
                };

                const token = 'ps_' + crypto.randomBytes(16).toString('hex');
                db.users[userId] = user;
                db.usersByUsername[username] = userId;
                db.sessions[token] = userId;
                db.childrenByUser[userId] = [];
                saveDatabase();

                const safeUser = { ...user };
                delete safeUser.passwordHash;

                return sendJson(res, 200, {
                    success: true,
                    data: { token, user: safeUser, children: [] }
                });
            }

            // POST /api/login
            if (pathname === '/api/login' && method === 'POST') {
                const body = await parseJsonBody(req);
                const username = (body.username || '').trim().toLowerCase();
                const password = body.password || '';

                const userId = db.usersByUsername[username];
                if (!userId || !db.users[userId]) {
                    return sendJson(res, 401, { success: false, message: 'Invalid username or password' });
                }

                const user = db.users[userId];
                if (user.passwordHash !== hashPassword(password)) {
                    return sendJson(res, 401, { success: false, message: 'Invalid username or password' });
                }

                const token = 'ps_' + crypto.randomBytes(16).toString('hex');
                db.sessions[token] = userId;
                saveDatabase();

                const childIds = db.childrenByUser[userId] || [];
                const userChildren = childIds.map(cid => db.children[cid]).filter(Boolean);

                const safeUser = { ...user };
                delete safeUser.passwordHash;

                return sendJson(res, 200, {
                    success: true,
                    data: { token, user: safeUser, children: userChildren }
                });
            }

            // POST /api/logout
            if (pathname === '/api/logout' && method === 'POST') {
                const header = req.headers['authorization'];
                if (header && header.startsWith('Bearer ')) {
                    const token = header.slice(7).trim();
                    delete db.sessions[token];
                    saveDatabase();
                }
                return sendJson(res, 200, { success: true, message: 'Signed out successfully' });
            }

            // Authenticated routes
            const authUserId = getAuthUserId(req);
            if (!authUserId) {
                return sendJson(res, 401, { success: false, message: 'Authentication required' });
            }
            const activeUser = db.users[authUserId];

            // GET /api/me (Sync user profile and all family children)
            if (pathname === '/api/me' && method === 'GET') {
                if (!activeUser) return sendJson(res, 404, { success: false, message: 'User not found' });

                const childIds = db.childrenByUser[authUserId] || [];
                const userChildren = childIds.map(cid => db.children[cid]).filter(Boolean);

                const safeUser = { ...activeUser };
                delete safeUser.passwordHash;
                return sendJson(res, 200, { success: true, data: { user: safeUser, children: userChildren } });
            }

            // PUT /api/user/theme
            if (pathname === '/api/user/theme' && method === 'PUT') {
                const body = await parseJsonBody(req);
                const theme = body.theme || 'dark';
                if (db.users[authUserId]) {
                    db.users[authUserId].theme = theme;
                    saveDatabase();
                }
                return sendJson(res, 200, { success: true, data: theme });
            }

            // POST /api/children (Create new child profile)
            if (pathname === '/api/children' && method === 'POST') {
                const body = await parseJsonBody(req);
                const name = (body.name || '').trim();
                if (!name) return sendJson(res, 400, { success: false, message: 'Name is required' });

                const childId = 'c_' + Date.now();
                const familyCode = generateFamilyCode();

                const newChild = {
                    id: childId,
                    userId: authUserId,
                    familyCode: familyCode,
                    familyMembers: [
                        { userId: authUserId, name: activeUser.name, role: 'Profile creator' }
                    ],
                    name,
                    age: parseInt(body.age, 10) || 5,
                    weight: parseFloat(body.weight) || 18,
                    height: parseFloat(body.height) || 110,
                    allergies: (body.allergies || 'None').trim(),
                    doctorPhone: (body.doctorPhone || '').trim(),
                    episode: (body.episode || 'Observation started').trim(),
                    points48h: [], // Clean measurement history
                    reminders: [], // Reminders
                    createdAt: new Date().toISOString()
                };

                db.children[childId] = newChild;
                db.childrenByUser[authUserId] = db.childrenByUser[authUserId] || [];
                db.childrenByUser[authUserId].push(childId);
                saveDatabase();

                return sendJson(res, 200, { success: true, data: newChild });
            }

            // POST /api/family/join (Family Multi-Access: Mom + Dad)
            if (pathname === '/api/family/join' && method === 'POST') {
                const body = await parseJsonBody(req);
                const inputCode = (body.code || '').trim().toUpperCase();

                if (!inputCode) {
                    return sendJson(res, 400, { success: false, message: 'Please enter a family invite code' });
                }

                // Find child with matching familyCode
                const matchedChild = Object.values(db.children).find(c => (c.familyCode || '').toUpperCase() === inputCode);

                if (!matchedChild) {
                    return sendJson(res, 404, { success: false, message: 'Family code not found. Please check the code (e.g. FAM-7X9K)' });
                }

                // Grant family access for this child to current user
                matchedChild.familyMembers = matchedChild.familyMembers || [];
                const alreadyMember = matchedChild.familyMembers.some(m => (typeof m === 'string' ? m === authUserId : m.userId === authUserId));

                if (!alreadyMember) {
                    matchedChild.familyMembers.push({
                        userId: authUserId,
                        name: activeUser.name,
                        role: 'Co-parent'
                    });
                }

                db.childrenByUser[authUserId] = db.childrenByUser[authUserId] || [];
                if (!db.childrenByUser[authUserId].includes(matchedChild.id)) {
                    db.childrenByUser[authUserId].push(matchedChild.id);
                }

                saveDatabase();

                return sendJson(res, 200, {
                    success: true,
                    message: `Family access connected! Profile "${matchedChild.name}" is now synced between parents.`,
                    data: matchedChild
                });
            }

            // DELETE /api/children/:id
            const childDelMatch = pathname.match(/^\/api\/children\/([^/]+)$/);
            if (childDelMatch && method === 'DELETE') {
                const childId = childDelMatch[1];
                const child = db.children[childId];
                if (!child || !hasChildAccess(child, authUserId)) {
                    return sendJson(res, 404, { success: false, message: 'Profile not found or access denied' });
                }

                delete db.children[childId];
                Object.keys(db.childrenByUser).forEach(uid => {
                    db.childrenByUser[uid] = db.childrenByUser[uid].filter(id => id !== childId);
                });
                saveDatabase();
                return sendJson(res, 200, { success: true, message: 'Profile deleted' });
            }

            // POST /api/children/:id/entries (Add temperature measurement with author)
            const entryAddMatch = pathname.match(/^\/api\/children\/([^/]+)\/entries$/);
            if (entryAddMatch && method === 'POST') {
                const childId = entryAddMatch[1];
                const child = db.children[childId];
                if (!child || !hasChildAccess(child, authUserId)) {
                    return sendJson(res, 404, { success: false, message: 'Child not found or access denied' });
                }

                const body = await parseJsonBody(req);
                const temp = parseFloat(body.temp) || 37.0;
                const nowMs = body.createdAtMs || Date.now();

                child.points48h.forEach(p => {
                    if (p.createdAtMs) p.hours_ago = +((nowMs - p.createdAtMs) / 3600000).toFixed(2);
                    else p.hours_ago = Math.min(48, (p.hours_ago || 0) + 1);
                });

                const newEntry = {
                    id: 'p_' + nowMs,
                    temp,
                    drink: body.drink ? body.drink.trim() : null,
                    med: body.med ? body.med.trim() : null,
                    note: (body.note || 'Measurement').trim(),
                    author: activeUser.name || 'Parent',
                    hours_ago: 0,
                    createdAtMs: nowMs,
                    timestamp: 'Just now'
                };

                child.points48h.push(newEntry);
                saveDatabase();

                return sendJson(res, 200, { success: true, data: newEntry });
            }

            // PUT /api/children/:id/meta (Update growth, urine logs, vaccines, archived episodes)
            const childMetaMatch = pathname.match(/^\/api\/children\/([^/]+)\/meta$/);
            if (childMetaMatch && method === 'PUT') {
                const childId = childMetaMatch[1];
                const child = db.children[childId];
                if (!child || !hasChildAccess(child, authUserId)) {
                    return sendJson(res, 404, { success: false, message: 'Child not found or access denied' });
                }

                const body = await parseJsonBody(req);
                if (body.weight !== undefined) child.weight = parseFloat(body.weight) || child.weight;
                if (body.height !== undefined) child.height = parseFloat(body.height) || child.height;
                if (body.age !== undefined) child.age = parseFloat(body.age) || child.age;
                if (body.episode !== undefined) child.episode = String(body.episode).trim();
                if (body.lastUrineMs !== undefined) child.lastUrineMs = body.lastUrineMs;
                if (Array.isArray(body.urineLogs)) child.urineLogs = body.urineLogs;
                if (Array.isArray(body.vaccines)) child.vaccines = body.vaccines;
                if (Array.isArray(body.archivedEpisodes)) child.archivedEpisodes = body.archivedEpisodes;

                saveDatabase();
                return sendJson(res, 200, { success: true, data: child });
            }

            // DELETE /api/children/:id/entries/:entryId
            const entryDelMatch = pathname.match(/^\/api\/children\/([^/]+)\/entries\/([^/]+)$/);
            if (entryDelMatch && method === 'DELETE') {
                const [, childId, entryId] = entryDelMatch;
                const child = db.children[childId];
                if (!child || !hasChildAccess(child, authUserId)) {
                    return sendJson(res, 404, { success: false, message: 'Child not found' });
                }

                child.points48h = child.points48h.filter(p => p.id !== entryId);
                saveDatabase();
                return sendJson(res, 200, { success: true, message: 'Entry deleted' });
            }

            // POST /api/children/:id/reminders
            const remAddMatch = pathname.match(/^\/api\/children\/([^/]+)\/reminders$/);
            if (remAddMatch && method === 'POST') {
                const childId = remAddMatch[1];
                const child = db.children[childId];
                if (!child || !hasChildAccess(child, authUserId)) {
                    return sendJson(res, 404, { success: false, message: 'Child not found' });
                }

                const body = await parseJsonBody(req);
                const newRem = {
                    id: 'r_' + Date.now(),
                    title: (body.title || 'Reminder').trim(),
                    time: (body.time || 'Scheduled').trim(),
                    author: activeUser.name || 'Parent',
                    done: false
                };

                child.reminders.unshift(newRem);
                saveDatabase();
                return sendJson(res, 200, { success: true, data: newRem });
            }

            // PUT /api/children/:id/reminders/:remId/toggle
            const remToggleMatch = pathname.match(/^\/api\/children\/([^/]+)\/reminders\/([^/]+)\/toggle$/);
            if (remToggleMatch && method === 'PUT') {
                const [, childId, remId] = remToggleMatch;
                const child = db.children[childId];
                if (!child || !hasChildAccess(child, authUserId)) {
                    return sendJson(res, 404, { success: false, message: 'Child not found' });
                }

                const rem = child.reminders.find(r => r.id === remId);
                if (!rem) return sendJson(res, 404, { success: false, message: 'Reminder not found' });

                rem.done = !rem.done;
                saveDatabase();
                return sendJson(res, 200, { success: true, data: rem.done });
            }

            // DELETE /api/children/:id/reminders/:remId
            const remDelMatch = pathname.match(/^\/api\/children\/([^/]+)\/reminders\/([^/]+)$/);
            if (remDelMatch && method === 'DELETE') {
                const [, childId, remId] = remDelMatch;
                const child = db.children[childId];
                if (!child || !hasChildAccess(child, authUserId)) {
                    return sendJson(res, 404, { success: false, message: 'Child not found' });
                }

                child.reminders = child.reminders.filter(r => r.id !== remId);
                saveDatabase();
                return sendJson(res, 200, { success: true, message: 'Reminder deleted' });
            }



            return sendJson(res, 404, { success: false, message: 'API route not found' });
        } catch (err) {
            console.error('API Error:', err);
            return sendJson(res, 500, { success: false, message: 'Internal server error' });
        }
    }

    // ---------------- STATIC SERVING (PWA + HTML) ----------------
    if (pathname === '/manifest.json') {
        const manifestPath = path.join(__dirname, 'static', 'manifest.json');
        if (fs.existsSync(manifestPath)) {
            res.writeHead(200, { 'Content-Type': 'application/manifest+json; charset=utf-8' });
            return fs.createReadStream(manifestPath).pipe(res);
        }
    }

    if (pathname === '/sw.js') {
        const swPath = path.join(__dirname, 'static', 'sw.js');
        if (fs.existsSync(swPath)) {
            res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
            return fs.createReadStream(swPath).pipe(res);
        }
    }

    let indexPath = path.join(__dirname, 'static', 'index.html');
    if (!fs.existsSync(indexPath)) {
        indexPath = path.join(__dirname, 'index.html');
    }

    if (fs.existsSync(indexPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        fs.createReadStream(indexPath).pipe(res);
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('index.html not found');
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log('===========================================================');
    console.log('🏥  Chrono — Server Ready (Render / Local Node)');
    console.log('===========================================================');
    console.log(`⚡ Server listening on port: ${PORT}`);
    console.log(`👉 Open in browser:          http://localhost:${PORT}`);
    console.log(`🌐 Render health check:      http://localhost:${PORT}/api/health`);
    console.log('===========================================================');
});
