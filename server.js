/**
 * PediaSense — Render & Local Web Server
 * Zero external dependencies: pure Node.js built-in modules (http, fs, path, crypto)
 * Runs instantly on Render, Windows, Linux, and macOS.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'pediasense_data.json');
const SALT = 'pediasense_clinical_salt_2026';

// -------------------------------------------------------------
// ХРАНИЛИЩЕ ДАННЫХ (АВТОМАТИЧЕСКОЕ СОХРАНЕНИЕ В JSON)
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
            console.log('📂 База данных загружена из', DB_FILE);
            return;
        }
    } catch (e) {
        console.error('Ошибка чтения БД, создание новой:', e.message);
    }

    // Демо-данные по умолчанию
    const demoUserId = 'u_demo_' + Date.now();
    const demoUser = {
        id: demoUserId,
        username: 'demo',
        name: 'Родитель (Демо)',
        passwordHash: hashPassword('demo123'),
        theme: 'dark',
        createdAt: new Date().toISOString()
    };

    const child1Id = 'c_leo_' + Date.now();
    const child1 = {
        id: child1Id,
        userId: demoUserId,
        name: 'Лев',
        age: 8,
        weight: 26,
        allergies: 'Нет',
        doctorPhone: '+7 (999) 000-00-00',
        episode: 'Кашель, 4-й день',
        points48h: [
            { id: 'p1', temp: 38.4, drink: '150 мл', med: 'Ибупрофен 10 мл', note: 'Вечерний подъём температуры, сухой кашель', hours_ago: 40, timestamp: '40 ч назад' },
            { id: 'p2', temp: 37.8, drink: '200 мл', med: null, note: 'Спал спокойно после жаропонижающего', hours_ago: 30, timestamp: '30 ч назад' },
            { id: 'p3', temp: 38.6, drink: '100 мл', med: null, note: 'Приступы кашля днём, слабость', hours_ago: 21, timestamp: '21 ч назад' },
            { id: 'p4', temp: 39.1, drink: '120 мл', med: 'Ибупрофен 10 мл', note: 'Ночной пик 39.1 °C, дан Ибупрофен 10 мл', hours_ago: 12, timestamp: '12 ч назад' },
            { id: 'p5', temp: 38.2, drink: '150 мл', med: null, note: 'Температура снизилась, отдыхает', hours_ago: 8, timestamp: '8 ч назад' },
            { id: 'p6', temp: 38.2, drink: '180 мл', med: null, note: 'Утренний замер, кашель сохраняется', hours_ago: 3, timestamp: '3 ч назад' }
        ],
        reminders: [
            { id: 'r1', title: 'Ибупрофен 10 мл (при t > 38.5 °C)', time: 'Каждые 6–8 часов', done: true },
            { id: 'r2', title: 'Теплое питье / компот (150 мл)', time: 'Каждые 2 часа', done: false },
            { id: 'r3', title: 'Визит педиатра с QR-отчётом', time: 'Сегодня в 16:30', done: false }
        ],
        createdAt: new Date().toISOString()
    };

    const child2Id = 'c_sofia_' + (Date.now() + 1);
    const child2 = {
        id: child2Id,
        userId: demoUserId,
        name: 'София',
        age: 4,
        weight: 16,
        allergies: 'Аллергия на пенициллин',
        doctorPhone: '',
        episode: 'Температура, 2-й день',
        points48h: [
            { id: 's1', temp: 37.5, drink: '120 мл', med: null, note: 'Усталость после садика', hours_ago: 36, timestamp: '36 ч назад' },
            { id: 's2', temp: 38.4, drink: '100 мл', med: 'Парацетамол 5 мл', note: 'Ночная температура', hours_ago: 24, timestamp: '24 ч назад' },
            { id: 's3', temp: 37.7, drink: '150 мл', med: null, note: 'Играет, бодрая', hours_ago: 1, timestamp: '1 ч назад' }
        ],
        reminders: [
            { id: 'r4', title: 'Парацетамол 5 мл (при необходимости)', time: 'Не чаще раза в 6 часов', done: true },
            { id: 'r5', title: 'Вода мелкими глотками', time: 'Каждые 30 мин', done: false }
        ],
        createdAt: new Date().toISOString()
    };

    db.users[demoUserId] = demoUser;
    db.usersByUsername['demo'] = demoUserId;
    db.children[child1Id] = child1;
    db.children[child2Id] = child2;
    db.childrenByUser[demoUserId] = [child1Id, child2Id];

    saveDatabase();
    console.log('✨ Создана начальная база с демо-данными (пользователь demo / demo123)');
}

function saveDatabase() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
    } catch (e) {
        console.error('Ошибка сохранения БД:', e.message);
    }
}

loadDatabase();

// -------------------------------------------------------------
// ХЕЛПЕРЫ ДЛЯ HTTP ЗАПРОСОВ
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
            if (body.length > 2 * 1024 * 1024) { // 2MB limit
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
// ОСНОВНОЙ HTTP СЕРВЕР
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

    // Health check endpoint (для мониторинга Render)
    if (pathname === '/api/health' || pathname === '/healthz') {
        return sendJson(res, 200, { status: 'ok', service: 'pediasense', uptime: process.uptime() });
    }

    // ---------------- API МАРШРУТЫ ----------------
    if (pathname.startsWith('/api/')) {
        try {
            // POST /api/register
            if (pathname === '/api/register' && method === 'POST') {
                const body = await parseJsonBody(req);
                const username = (body.username || '').trim().toLowerCase();
                const password = body.password || '';
                const name = (body.name || '').trim();

                if (!username || !password || !name) {
                    return sendJson(res, 400, { success: false, message: 'Заполните все поля' });
                }

                if (db.usersByUsername[username]) {
                    return sendJson(res, 409, { success: false, message: 'Пользователь с таким логином уже существует' });
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

                const childId = 'c_' + Date.now();
                const defaultChild = {
                    id: childId,
                    userId,
                    name: 'Мой ребёнок',
                    age: 5,
                    weight: 19,
                    allergies: 'Нет',
                    doctorPhone: '',
                    episode: 'Начало наблюдения',
                    points48h: [{
                        id: 'p_' + Date.now(),
                        temp: 36.8,
                        drink: '150 мл',
                        med: null,
                        note: 'Профиль создан. Начните вести дневник.',
                        hours_ago: 0,
                        timestamp: 'Только что'
                    }],
                    reminders: [{
                        id: 'r_' + Date.now(),
                        title: 'Контроль температуры и питьевой режим',
                        time: 'Каждые 3 часа',
                        done: false
                    }],
                    createdAt: new Date().toISOString()
                };

                const token = 'ps_' + crypto.randomBytes(16).toString('hex');
                db.users[userId] = user;
                db.usersByUsername[username] = userId;
                db.sessions[token] = userId;
                db.children[childId] = defaultChild;
                db.childrenByUser[userId] = [childId];
                saveDatabase();

                const safeUser = { ...user };
                delete safeUser.passwordHash;

                return sendJson(res, 200, {
                    success: true,
                    data: { token, user: safeUser, children: [defaultChild] }
                });
            }

            // POST /api/login
            if (pathname === '/api/login' && method === 'POST') {
                const body = await parseJsonBody(req);
                const username = (body.username || '').trim().toLowerCase();
                const password = body.password || '';

                const userId = db.usersByUsername[username];
                if (!userId || !db.users[userId]) {
                    return sendJson(res, 401, { success: false, message: 'Неверный логин или пароль' });
                }

                const user = db.users[userId];
                if (user.passwordHash !== hashPassword(password)) {
                    return sendJson(res, 401, { success: false, message: 'Неверный логин или пароль' });
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
                return sendJson(res, 200, { success: true, message: 'Успешный выход' });
            }

            // Авторизованные маршруты
            const authUserId = getAuthUserId(req);
            if (!authUserId) {
                return sendJson(res, 401, { success: false, message: 'Требуется авторизация' });
            }

            // GET /api/me
            if (pathname === '/api/me' && method === 'GET') {
                const user = db.users[authUserId];
                if (!user) return sendJson(res, 404, { success: false, message: 'Пользователь не найден' });

                const childIds = db.childrenByUser[authUserId] || [];
                const userChildren = childIds.map(cid => db.children[cid]).filter(Boolean);

                const safeUser = { ...user };
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

            // POST /api/children
            if (pathname === '/api/children' && method === 'POST') {
                const body = await parseJsonBody(req);
                const name = (body.name || '').trim();
                if (!name) return sendJson(res, 400, { success: false, message: 'Имя обязательно' });

                const childId = 'c_' + Date.now();
                const newChild = {
                    id: childId,
                    userId: authUserId,
                    name,
                    age: parseInt(body.age, 10) || 5,
                    weight: parseFloat(body.weight) || 18,
                    allergies: (body.allergies || 'Нет').trim(),
                    doctorPhone: (body.doctorPhone || '').trim(),
                    episode: (body.episode || 'Начало наблюдения').trim(),
                    points48h: [{
                        id: 'p_' + Date.now(),
                        temp: 36.6,
                        drink: '150 мл',
                        med: null,
                        note: 'Профиль создан. Начните вести дневник.',
                        hours_ago: 0,
                        timestamp: 'Только что'
                    }],
                    reminders: [{
                        id: 'r_' + Date.now(),
                        title: 'Контроль температуры',
                        time: 'Каждые 3–4 часа',
                        done: false
                    }],
                    createdAt: new Date().toISOString()
                };

                db.children[childId] = newChild;
                db.childrenByUser[authUserId] = db.childrenByUser[authUserId] || [];
                db.childrenByUser[authUserId].push(childId);
                saveDatabase();

                return sendJson(res, 200, { success: true, data: newChild });
            }

            // DELETE /api/children/:id
            const childDelMatch = pathname.match(/^\/api\/children\/([^/]+)$/);
            if (childDelMatch && method === 'DELETE') {
                const childId = childDelMatch[1];
                const child = db.children[childId];
                if (!child || child.userId !== authUserId) {
                    return sendJson(res, 404, { success: false, message: 'Профиль не найден' });
                }

                delete db.children[childId];
                if (db.childrenByUser[authUserId]) {
                    db.childrenByUser[authUserId] = db.childrenByUser[authUserId].filter(id => id !== childId);
                }
                saveDatabase();
                return sendJson(res, 200, { success: true, message: 'Профиль удален' });
            }

            // POST /api/children/:id/entries
            const entryAddMatch = pathname.match(/^\/api\/children\/([^/]+)\/entries$/);
            if (entryAddMatch && method === 'POST') {
                const childId = entryAddMatch[1];
                const child = db.children[childId];
                if (!child || child.userId !== authUserId) {
                    return sendJson(res, 404, { success: false, message: 'Ребёнок не найден' });
                }

                const body = await parseJsonBody(req);
                const temp = parseFloat(body.temp) || 37.0;

                child.points48h.forEach(p => { p.hours_ago = Math.min(48, (p.hours_ago || 0) + 2); });

                const newEntry = {
                    id: 'p_' + Date.now(),
                    temp,
                    drink: body.drink ? body.drink.trim() : null,
                    med: body.med ? body.med.trim() : null,
                    note: (body.note || 'Замер').trim(),
                    hours_ago: 0,
                    timestamp: 'Только что'
                };

                child.points48h.push(newEntry);
                saveDatabase();

                return sendJson(res, 200, { success: true, data: newEntry });
            }

            // DELETE /api/children/:id/entries/:entryId
            const entryDelMatch = pathname.match(/^\/api\/children\/([^/]+)\/entries\/([^/]+)$/);
            if (entryDelMatch && method === 'DELETE') {
                const [, childId, entryId] = entryDelMatch;
                const child = db.children[childId];
                if (!child || child.userId !== authUserId) {
                    return sendJson(res, 404, { success: false, message: 'Ребёнок не найден' });
                }

                child.points48h = child.points48h.filter(p => p.id !== entryId);
                saveDatabase();
                return sendJson(res, 200, { success: true, message: 'Запись удалена' });
            }

            // POST /api/children/:id/reminders
            const remAddMatch = pathname.match(/^\/api\/children\/([^/]+)\/reminders$/);
            if (remAddMatch && method === 'POST') {
                const childId = remAddMatch[1];
                const child = db.children[childId];
                if (!child || child.userId !== authUserId) {
                    return sendJson(res, 404, { success: false, message: 'Ребёнок не найден' });
                }

                const body = await parseJsonBody(req);
                const newRem = {
                    id: 'r_' + Date.now(),
                    title: (body.title || 'Напоминание').trim(),
                    time: (body.time || 'По расписанию').trim(),
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
                if (!child || child.userId !== authUserId) {
                    return sendJson(res, 404, { success: false, message: 'Ребёнок не найден' });
                }

                const rem = child.reminders.find(r => r.id === remId);
                if (!rem) return sendJson(res, 404, { success: false, message: 'Напоминание не найдено' });

                rem.done = !rem.done;
                saveDatabase();
                return sendJson(res, 200, { success: true, data: rem.done });
            }

            // DELETE /api/children/:id/reminders/:remId
            const remDelMatch = pathname.match(/^\/api\/children\/([^/]+)\/reminders\/([^/]+)$/);
            if (remDelMatch && method === 'DELETE') {
                const [, childId, remId] = remDelMatch;
                const child = db.children[childId];
                if (!child || child.userId !== authUserId) {
                    return sendJson(res, 404, { success: false, message: 'Ребёнок не найден' });
                }

                child.reminders = child.reminders.filter(r => r.id !== remId);
                saveDatabase();
                return sendJson(res, 200, { success: true, message: 'Напоминание удалено' });
            }

            return sendJson(res, 404, { success: false, message: 'API маршрут не найден' });
        } catch (err) {
            console.error('API Error:', err);
            return sendJson(res, 500, { success: false, message: 'Внутренняя ошибка сервера' });
        }
    }

    // ---------------- РАЗДАЧА СТАТИКИ (HTML) ----------------
    let indexPath = path.join(__dirname, 'static', 'index.html');
    if (!fs.existsSync(indexPath)) {
        indexPath = path.join(__dirname, 'index.html');
    }

    if (fs.existsSync(indexPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        fs.createReadStream(indexPath).pipe(res);
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('index.html не найден');
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log('===========================================================');
    console.log('🏥  PediaSense — Сервер готов к работе (Render / Local Node)');
    console.log('===========================================================');
    console.log(`⚡ Сервер запущен на порту: ${PORT}`);
    console.log(`👉 Откройте в браузере:      http://localhost:${PORT}`);
    console.log(`🌐 Для проверки Render:     http://localhost:${PORT}/api/health`);
    console.log('===========================================================');
});
