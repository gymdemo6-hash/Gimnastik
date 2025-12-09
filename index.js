// index.js

lucide.createIcons();

// --- CONFIGURACIÓN MAESTRA ---
// Tu UID Real (Confirmado)
const ADMIN_UID = "OjfYLNPfIHQJZsGDsOd00fq24HK2"; 

let disciplines = [], students = [], isAdminAuthenticated = false, gymChartInstance = null;
let autoCloseTimer = null;

const views = { access: document.getElementById('view-access'), admin: document.getElementById('view-admin') };
const navBtns = { 
    access: document.getElementById('btn-nav-access'), 
    admin: document.getElementById('btn-nav-admin'),
    logout: document.getElementById('btn-logout'),
    themeToggle: document.getElementById('btn-theme-toggle')
};

function init() {
    const theme = JSON.parse(localStorage.getItem('gimnastik_theme'));
    if (theme) setTheme(theme.rgb, false);
    const dniInput = document.getElementById('access-dni');
    if(dniInput) dniInput.addEventListener('keypress', (e) => { if(e.key==='Enter') handleAccess(); });

    waitForFirebase();
}

function waitForFirebase() {
    if (window.auth && window.onAuthStateChanged) {
        window.onAuthStateChanged(window.auth, (user) => {
            if (user) {
                console.log("Usuario:", user.uid);
                // Si el UID coincide, es admin
                if (user.uid === ADMIN_UID) {
                    isAdminAuthenticated = true;
                    navBtns.logout.classList.remove('hidden');
                    navBtns.themeToggle.classList.remove('hidden');
                } else {
                    isAdminAuthenticated = false;
                    navBtns.logout.classList.add('hidden');
                    navBtns.themeToggle.classList.add('hidden');
                }
                subscribeToData();
            } else {
                window.signInAnonymously(window.auth).catch(console.error);
            }
        });
    } else {
        setTimeout(waitForFirebase, 100);
    }
}

// LOGIN: ADMIN -> admin@... pero deja ADMIN2025 tal cual
function performLogin() {
    const u = document.getElementById('login-user').value.trim();
    const p = document.getElementById('login-pass').value.trim();
    let email = u.toLowerCase();
    if (!email.includes('@')) email += '@gimnastik.com';

    window.signInWithEmailAndPassword(window.auth, email, p).then(() => {
        closeLoginModal();
        showView('admin');
        setTimeout(renderChart, 500);
    }).catch((e) => {
        console.error(e);
        document.getElementById('login-error').classList.remove('hidden');
        document.querySelector('#login-modal > div').classList.add('animate-shake');
        setTimeout(()=>document.querySelector('#login-modal > div').classList.remove('animate-shake'), 500);
    });
}

function subscribeToData() {
    if (!window.db) return;
    try {
        window.onSnapshot(window.collection(window.db, "disciplines"), (snap) => {
            if (snap.empty && disciplines.length === 0 && isAdminAuthenticated) { restoreDefaultDisciplines(); return; }
            disciplines = [];
            snap.forEach(doc => disciplines.push({id: doc.id, ...doc.data()}));
            disciplines.sort((a,b) => (a.name||"").localeCompare(b.name||""));
            updateUI();
        });
        window.onSnapshot(window.collection(window.db, "students"), (snap) => {
            students = [];
            snap.forEach(doc => students.push({id: doc.id, ...doc.data()}));
            updateUI();
        });
    } catch(e) { console.error(e); }
}

async function restoreDefaultDisciplines() {
    const defs = ['Musculación', 'Crossfit', 'Boxeo', 'Yoga'];
    const uid = window.auth.currentUser.uid;
    for (const name of defs) await window.addDoc(window.collection(window.db, "disciplines"), {name, createdBy: uid});
}

function updateUI() { renderDisciplinesTags(); updateDisciplineSelect(); renderStats(); renderChart(); }

function requestAdminAccess() { isAdminAuthenticated ? showView('admin') : (document.getElementById('login-modal').classList.remove('hidden'), document.getElementById('login-user').focus()); }
function closeLoginModal() { document.getElementById('login-modal').classList.add('hidden'); }
function logoutAdmin() { if(confirm("¿Salir?")) window.signOut(window.auth).then(() => showView('access')); }

// CRUD
async function registerStudent() {
    if (!isAdminAuthenticated) return alert("Solo Admin");
    const name = document.getElementById('reg-name').value;
    const dni = document.getElementById('reg-dni').value;
    const disc = document.getElementById('reg-discipline').value;
    const visits = parseInt(document.getElementById('reg-visits').value);
    
    if (!name || !dni || !disc) return alert("Datos incompletos");
    if (students.find(s => s.dni == dni)) return alert("DNI existe");

    const st = {
        dni, name, discipline: disc,
        isUnlimited: document.getElementById('reg-unlimited').checked,
        isMonthPack: document.getElementById('reg-month-pack').checked,
        lastRenewal: new Date().toISOString(),
        maxVisits: visits, visitsLog: [], 
        createdBy: window.auth.currentUser.uid 
    };
    await window.addDoc(window.collection(window.db, "students"), st);
    document.getElementById('form-register').reset();
    alert("Guardado");
}

async function addDiscipline() {
    if (!isAdminAuthenticated) return;
    const name = document.getElementById('new-discipline-name').value.trim();
    if (name && !disciplines.some(d => d.name === name)) {
        await window.addDoc(window.collection(window.db, "disciplines"), { name, createdBy: window.auth.currentUser.uid });
        document.getElementById('new-discipline-name').value = '';
    }
}

// Helpers
function renderDisciplinesTags() {
    const c = document.getElementById('disciplines-tags'); c.innerHTML = '';
    disciplines.forEach(d => {
        const b = document.createElement('button');
        b.className = 'text-xs bg-black/40 border border-gray-700 px-2 py-1 rounded text-white mr-1 mb-1';
        b.textContent = d.name;
        b.onclick = () => { document.getElementById('new-discipline-name').value = d.name; document.getElementById('reg-discipline').value = d.name; };
        c.appendChild(b);
    });
}
function updateDisciplineSelect() {
    const s = document.getElementById('reg-discipline'); s.innerHTML = '';
    disciplines.forEach(d => {
        const o = document.createElement('option');
        o.value = d.name; o.textContent = d.name; o.className = "text-black";
        s.appendChild(o);
    });
    if (disciplines.some(d => d.name === currentValue)) select.value = currentValue;
}
function toggleVisitsInput() {
    const dis = document.getElementById('reg-unlimited').checked;
    document.getElementById('reg-visits').disabled = dis;
    document.getElementById('reg-visits').style.opacity = dis ? 0.5 : 1;
}
function renderStats() {
    const c = document.getElementById('stats-container'); c.innerHTML = '';
    document.getElementById('total-students-badge').textContent = `${students.length} Alumnos`;
    disciplines.forEach(d => {
        const count = students.filter(s => s.discipline === d.name).length;
        const div = document.createElement('div');
        div.className = "glass-panel p-5 rounded-xl flex justify-between items-center border border-white/5 hover:border-gimnastik-primary cursor-pointer group";
        div.innerHTML = `<div class="flex items-center gap-3"><div class="w-2 h-8 bg-gimnastik-primary rounded-full"></div><span class="font-bold text-lg">${d.name}</span></div><div class="flex items-center gap-4"><span class="text-3xl font-bold text-white">${count}</span><button onclick="deleteDiscipline('${d.id}', event)" class="text-red-500 hover:text-white"><i data-lucide="trash-2"></i></button></div>`;
        div.onclick = () => openModal(d.name);
        c.appendChild(div);
    });
    lucide.createIcons();
    renderChart();
}
function renderChart() {
    const ctx = document.getElementById('gymChart'); if(!ctx) return;
    if(gymChartInstance) gymChartInstance.destroy();
    const data = disciplines.map(d => students.filter(s => s.discipline === d.name).length);
    gymChartInstance = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: { labels: disciplines.map(d=>d.name), datasets: [{ data, backgroundColor: ['#FF0055','#00E5FF','#7C4DFF','#FFD600'], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'right', labels: { color: '#fff' } } } }
    });
}
function setTheme(rgb, save) {
    document.documentElement.style.setProperty('--bg-theme-rgb', rgb);
    if(save) localStorage.setItem('gimnastik_theme', JSON.stringify({rgb}));
    document.getElementById('theme-menu').classList.add('hidden');
}
function toggleThemeMenu() { document.getElementById('theme-menu').classList.toggle('hidden'); }

// Access
function handleAccess() {
    const dni = document.getElementById('access-dni').value.trim();
    if(!dni) return;
    document.getElementById('access-result').classList.add('hidden');
    document.getElementById('access-loader').classList.remove('hidden');
    setTimeout(() => showAccessResult(dni), 2000);
    document.getElementById('access-dni').value = '';
}
async function showAccessResult(dni) {
    document.getElementById('access-loader').classList.add('hidden');
    const res = document.getElementById('access-result');
    res.classList.remove('hidden', 'slide-up-out');
    
    // Loose match for number vs string
    const s = students.find(st => st.dni == dni);
    const icon = document.getElementById('access-icon');
    
    if(!s) {
        icon.innerHTML = '<i data-lucide="x-circle"></i>';
        document.getElementById('access-name').textContent = "No Encontrado";
        document.getElementById('access-discipline').textContent = "-";
        return;
    }
    
    const now = new Date();
    const key = `${now.getFullYear()}-${now.getMonth()}`;
    const visits = (s.visitsLog||[]).filter(d => new Date(d).toISOString().startsWith(key.slice(0,7))).length;
    
    let ok = true;
    if(s.isMonthPack) {
        const exp = new Date(s.lastRenewal); exp.setMonth(exp.getMonth()+1);
        if(now > exp) ok = false;
    } else if (!s.isUnlimited && visits >= s.maxVisits) ok = false;

    if(ok) {
        const today = now.toDateString();
        if(!(s.visitsLog||[]).some(d => new Date(d).toDateString() === today)) {
             window.updateDoc(window.doc(window.db, "students", s.id), { visitsLog: [...(s.visitsLog||[]), now.toISOString()] });
        }
        icon.innerHTML = '<i data-lucide="check-circle"></i>';
    } else {
        icon.innerHTML = '<i data-lucide="alert-triangle"></i>';
    }
    
    document.getElementById('access-name').textContent = s.name;
    document.getElementById('access-discipline').textContent = ok ? "Bienvenido" : "Acceso Denegado";
    lucide.createIcons();

    if(autoCloseTimer) clearTimeout(autoCloseTimer);
    autoCloseTimer = setTimeout(() => res.classList.add('slide-up-out'), 20000);
}

function showView(v) { 
    views.access.classList.add('hidden'); views.admin.classList.add('hidden');
    views[v].classList.remove('hidden');
}
async function deleteDiscipline(id, e) {
    if(e) e.stopPropagation();
    if(confirm("Borrar?")) await window.deleteDoc(window.doc(window.db, "disciplines", id));
}

function openModal(disc) {
    const m = document.getElementById('modal-overlay'); m.classList.remove('hidden');
    const b = document.getElementById('modal-body'); b.innerHTML = '';
    document.getElementById('modal-title').textContent = disc;
    students.filter(s => s.discipline === disc).forEach(s => {
        const d = document.createElement('div');
        d.className = "glass-panel p-4 mb-2 flex justify-between items-center";
        d.innerHTML = `<span>${s.name}</span><div><button onclick="renew('${s.id}')" class="text-green-400 mr-2">Renovar</button><button onclick="delStudent('${s.id}')" class="text-red-400">Borrar</button></div>`;
        b.appendChild(d);
    });
}
function closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); }
async function renew(id) { if(confirm("Renovar mes?")) await window.updateDoc(window.doc(window.db, "students", id), { lastRenewal: new Date().toISOString(), visitsLog: [] }); closeModal(); }
async function delStudent(id) { if(confirm("Borrar?")) await window.deleteDoc(window.doc(window.db, "students", id)); closeModal(); }

init();