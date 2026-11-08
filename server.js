const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');
const path = require('path');
const { db, doc, setDoc, getDoc } = require('./firebase.js');

// Configure Stealth Plugin
const stealth = StealthPlugin();
stealth.enabledEvasions.delete('user-agent-override'); 
puppeteer.use(stealth);

// Configure Adblocker Plugin to save Render CPU/RAM
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

let browser, page, cdpClient;
let autoSyncInterval;

const REAL_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function sanitizeForFirebase(obj) {
    return JSON.parse(JSON.stringify(obj || {}));
}

async function syncSessionToFirebase() {
    if (!page || page.isClosed()) return;
    
    try {
        const cookies = await page.cookies();
        const storageData = await page.evaluate(() => {
            const ls = {};
            const ss = {};
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                const val = localStorage.getItem(key);
                if (val !== null && val !== undefined) ls[key] = val;
            }
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                const val = sessionStorage.getItem(key);
                if (val !== null && val !== undefined) ss[key] = val;
            }
            return { ls, ss };
        });

        const sessionState = {
            cookies: sanitizeForFirebase(cookies),
            localStorage: sanitizeForFirebase(storageData.ls),
            sessionStorage: sanitizeForFirebase(storageData.ss)
        };

        await setDoc(doc(db, "browser_sessions", "render_os_profile"), sessionState);
        console.log("🔄 Background Sync: Full Device Profile saved to Firebase.");
        io.emit('session_saved_success');
        
    } catch (e) {
        if (!e.message.includes('Execution context was destroyed')) {
            console.error("Auto-sync error:", e.message);
        }
    }
}

async function startRemoteBrowser() {
    browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--window-size=1024,768',
            '--single-process',
            '--disable-gpu'
        ]
    });

    page = await browser.newPage();
    
    await page.setUserAgent(REAL_USER_AGENT);
    await page.setViewport({ width: 1024, height: 768, deviceScaleFactor: 1 });
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9'
    });

    page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) {
            io.emit('url_changed', frame.url());
        }
    });

    cdpClient = await page.target().createCDPSession();

    await cdpClient.send('Page.startScreencast', {
        format: 'jpeg',
        quality: 40, 
        maxWidth: 1024,
        maxHeight: 768
    });

    cdpClient.on('Page.screencastFrame', async (frameObject) => {
        io.emit('browser_frame', frameObject.data);
        try {
            await cdpClient.send('Page.screencastFrameAck', { sessionId: frameObject.sessionId });
        } catch (e) {}
    });

    try {
        const docSnap = await getDoc(doc(db, "browser_sessions", "render_os_profile"));
        if (docSnap.exists()) {
            const savedSessionData = docSnap.data();
            
            if (savedSessionData.cookies && savedSessionData.cookies.length > 0) {
                const safeCookies = savedSessionData.cookies.map(cookie => {
                    const { partitionKey, ...safeCookie } = cookie;
                    return safeCookie;
                });
                await page.setCookie(...safeCookies);
            }
            
            await page.evaluateOnNewDocument((data) => {
                if (data.localStorage) {
                    for (const key in data.localStorage) {
                        localStorage.setItem(key, data.localStorage[key]);
                    }
                }
                if (data.sessionStorage) {
                    for (const key in data.sessionStorage) {
                        sessionStorage.setItem(key, data.sessionStorage[key]);
                    }
                }
            }, savedSessionData);
            
            console.log("✅ Successfully restored complete device profile from Firebase.");
        } else {
            console.log("No saved device profile found in Firebase. Fresh start.");
        }
    } catch (e) {
        console.error("Error loading session from Firebase:", e);
    }

    await page.goto('https://google.com', { waitUntil: 'networkidle2' });

    autoSyncInterval = setInterval(syncSessionToFirebase, 15000);
}

io.on('connection', (socket) => {
    socket.on('save_session', async () => await syncSessionToFirebase());

    socket.on('mouse_down', async (data) => {
        if (!page) return;
        await page.mouse.move(data.x, data.y);
        await page.mouse.down();
    });

    socket.on('mouse_move', async (data) => {
        if (!page) return;
        await page.mouse.move(data.x, data.y);
    });

    socket.on('mouse_up', async (data) => {
        if (!page) return;
        await page.mouse.move(data.x, data.y);
        await page.mouse.up();
    });

    socket.on('mouse_up_only', async () => {
        if (!page) return;
        await page.mouse.up();
    });

    socket.on('mouse_scroll', async (data) => {
        if (!page) return;
        await page.mouse.wheel({ deltaX: data.deltaX, deltaY: data.deltaY });
    });

    socket.on('key_press', async (key) => {
        if (!page) return;
        if (key.length === 1) {
            await page.keyboard.type(key);
        } else {
            await page.keyboard.press(key);
        }
    });

    socket.on('nav_goto', async (url) => {
        if (!page) return;
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded' });
        } catch (error) {
            console.error("Navigation failed:", error.message);
        }
    });

    socket.on('nav_back', async () => { if (page) await page.goBack(); });
    socket.on('nav_forward', async () => { if (page) await page.goForward(); });
    socket.on('nav_reload', async () => { if (page) await page.reload(); });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    await startRemoteBrowser();
});