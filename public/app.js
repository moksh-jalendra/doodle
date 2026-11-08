const socket = io();
const screen = document.getElementById('screen');
const urlBar = document.getElementById('url-bar');
const btnSave = document.getElementById('btn-save');

// 1. Receive and display video frames
socket.on('browser_frame', (base64Data) => {
    screen.src = 'data:image/jpeg;base64,' + base64Data;
});

// 2. Update the URL bar when the remote browser navigates
socket.on('url_changed', (url) => {
    urlBar.value = url;
});

// --- Mouse Drag & Drop Logic ---
function getCoords(e) {
    const rect = screen.getBoundingClientRect();
    const scaleX = 1024 / rect.width;
    const scaleY = 768 / rect.height;
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
}

screen.addEventListener('dragstart', (e) => e.preventDefault());

let isDragging = false;

screen.addEventListener('mousedown', (e) => {
    isDragging = true;
    socket.emit('mouse_down', getCoords(e));
});

screen.addEventListener('mousemove', (e) => {
    if (isDragging) {
        socket.emit('mouse_move', getCoords(e));
    }
});

window.addEventListener('mouseup', (e) => {
    if (isDragging) {
        isDragging = false;
        if (e.target === screen) {
            socket.emit('mouse_up', getCoords(e));
        } else {
            socket.emit('mouse_up_only'); 
        }
    }
});

// --- Mouse Scrolling ---
screen.addEventListener('wheel', (e) => {
    e.preventDefault(); 
    socket.emit('mouse_scroll', { 
        deltaX: e.deltaX, 
        deltaY: e.deltaY 
    });
}, { passive: false });

// --- Keyboard Logic ---
window.addEventListener('keydown', (e) => {
    if (document.activeElement === urlBar) return;

    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
    }
    
    let key = e.key;
    if (key === 'Enter') key = 'Enter';
    if (key === 'Backspace') key = 'Backspace';
    if (key === 'Escape') key = 'Escape';

    socket.emit('key_press', key);
});

// --- Navigation Logic ---
document.getElementById('btn-back').onclick = () => socket.emit('nav_back');
document.getElementById('btn-forward').onclick = () => socket.emit('nav_forward');
document.getElementById('btn-reload').onclick = () => socket.emit('nav_reload');

function goToUrl() {
    let url = urlBar.value.trim();
    if (!url) return;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }
    socket.emit('nav_goto', url);
}

document.getElementById('btn-go').onclick = goToUrl;

urlBar.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') goToUrl();
});

// --- Firebase Save Session Logic ---
btnSave.onclick = () => {
    btnSave.innerText = "Saving...";
    socket.emit('save_session');
};

socket.on('session_saved_success', () => {
    btnSave.innerText = "Saved!";
    btnSave.style.background = "#27ae60"; 
    
    setTimeout(() => {
        btnSave.innerText = "Save Login";
        btnSave.style.background = "#e67e22";
    }, 3000);
});