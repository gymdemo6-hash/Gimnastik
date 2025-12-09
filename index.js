// index.js

lucide.createIcons();

// --- CONFIGURACIÓN MAESTRA ---
// Este es el UID exacto que me pasaste.
// IMPORTANTE: Asegúrate de que este usuario exista en tu proyecto de Firebase actual.
const ADMIN_UID = "1E95I78W06ecYvKHMu038qmRLr53"; 

// --- ESTADO ---
let disciplines = [];
let students = [];
let autoCloseTimer = null; 
let isAdminAuthenticated = false; 
let gymChartInstance = null;

const views = {
    access: document.getElementById('view-access'),
    admin: document.getElementById('view-admin')
};
const navBtns = {
    access: document.getElementById('btn-nav-access'),
    admin: document.getElementById('btn-nav-admin'),
    logout: document.getElementById('btn-logout'),
    themeToggle: document.getElementById('btn-theme-toggle')
};

// --- INICIALIZACIÓN ---
function init() {
    const theme = JSON.parse(localStorage.getItem('gimnastik_theme'));
    if (theme) setTheme(theme.rgb, false);

    const dniInput = document.getElementById('access-dni');
    if(dniInput) {
        dniInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') handleAccess();
        });
    }

    waitForFirebase();
}

// --- GESTIÓN DE SESIÓN ---
function waitForFirebase() {
    if (window.auth && window.onAuthStateChanged) {
        window.onAuthStateChanged(window.auth, (user) => {
            if (user) {
                console.log("Sesión detectada. UID:", user.uid);
                
                // VALIDACIÓN ESTRICTA DE ADMIN
                if (user.uid === ADMIN_UID) {
                    console.log("✅ Acceso ADMIN concedido");
                    isAdminAuthenticated = true;
                    navBtns.logout.classList.remove('hidden');
                    navBtns.themeToggle.classList.remove('hidden');
                } else {
                    console.log("ℹ️ Acceso Usuario (No Admin)");
                    isAdminAuthenticated = false;
                    navBtns.logout.classList.add('hidden');
                    navBtns.themeToggle.classList.add('hidden');
                }
                
                subscribeToData(); 
            } else {
                console.log("Conectando modo anónimo...");
                window.signInAnonymously(window.auth).catch(console.error);
            }
        });
    } else {
        setTimeout(waitForFirebase, 100);
    }
}

// --- LOGIN "INTELIGENTE" ---
function performLogin() {
    const userField = document.getElementById('login-user').value.trim();
    const passField = document.getElementById('login-pass').value.trim();
    
    // 1. Convertir usuario "ADMIN" a email "admin@gimnastik.com"
    let email = userField.toLowerCase(); // Firebase requiere emails en minúsculas
    if (!email.includes('@')) {
        email = `${email}@gimnastik.com`;
    }
    
    console.log(`Intentando entrar con: ${email}`);

    // 2. La contraseña SE RESPETA (Firebase distingue mayúsculas/minúsculas)
    // Debes haber creado el usuario con la contraseña "ADMIN2025" exactamente así.
    window.signInWithEmailAndPassword(window.auth, email, passField)
        .then((userCredential) => {
            // Verificar si el UID coincide con el esperado
            if (userCredential.user.uid !== ADMIN_UID) {
                console.warn("Alerta: El usuario entró, pero su UID no coincide con el ADMIN_UID configurado.");
            }
            closeLoginModal();
            showView('admin');
            setTimeout(renderChart, 500);
        })
        .catch((error) => {
            console.error("Error Login:", error.code);
            const errorMsg = document.getElementById('login-error');
            errorMsg.classList.remove('hidden');
            
            // Animación de error
            const modal = document.querySelector('#login-modal > div');
            modal.classList.add('animate-shake');
            setTimeout(() => modal.classList.remove('animate-shake'), 500);
        });
}

// --- DATOS ---
function subscribeToData() {
    if (!window.db) return;

    try {
        window.onSnapshot(window.collection(window.db, "disciplines"), (snapshot) => {
            // Auto-crear si está vacío y es admin
            if (snapshot.empty && disciplines.length === 0 && isAdminAuthenticated) {
                restoreDefaultDisciplines();
                return;
            }
            disciplines = [];
            snapshot.forEach((doc) => disciplines.push({ id: doc.id, ...doc.data() }));
            disciplines.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
            updateUI();
        });

        window.onSnapshot(window.collection(window.db, "students"), (snapshot) => {
            students = [];
            snapshot.forEach((doc) => students.push({ id: doc.id, ...doc.data() }));
            updateUI();
        });
    } catch (e) {
        console.error("Error BD:", e);
    }
}

async function restoreDefaultDisciplines() {
    const defaults = ['Musculación', 'Crossfit', 'Boxeo', 'Yoga'];
    // Usamos el UID del usuario actual para el campo createdBy
    const uid = window.auth.currentUser ? window.auth.currentUser.uid : 'system';
    
    for (const name of defaults) {
        try { 
            await window.addDoc(window.collection(window.db, "disciplines"), { 
                name: name,
                createdBy: uid 
            }); 
        } catch (e) {}
    }
}

function updateUI() {
    renderDisciplinesTags();
    updateDisciplineSelect(); 
    renderStats();
    renderChart();
}

function requestAdminAccess() {
    if (isAdminAuthenticated) showView('admin');
    else {
        document.getElementById('login-modal').classList.remove('hidden');
        document.getElementById('login-user').focus();
    }
}

function closeLoginModal() {
    document.getElementById('login-modal').classList.add('hidden');
    document.getElementById('login-user').value = '';
    document.getElementById('login-pass').value = '';
    document.getElementById('login-error').classList.add('hidden');
}

function logoutAdmin() {
    if(!confirm("¿Cerrar sesión?")) return;
    window.signOut(window.auth).then(() => {
        showView('access');
        document.getElementById('theme-menu').classList.add('hidden');
    });
}

// --- CRUD: GUARDADO CON UID ---
async function registerStudent() {
    if (!isAdminAuthenticated) return alert("Acceso denegado: No eres Admin.");

    const name = document.getElementById('reg-name').value;
    const dni = document.getElementById('reg-dni').value;
    const discipline = document.getElementById('reg-discipline').value;
    const isUnlimited = document.getElementById('reg-unlimited').checked;
    const isMonthPack = document.getElementById('reg-month-pack').checked;
    let visits = parseInt(document.getElementById('reg-visits').value);

    if (!name || !dni || !discipline) return alert("Faltan datos");
    if (students.find(s => s.dni == dni)) return alert("Este DNI ya está registrado");

    // Guardar con la "firma" del administrador (UID)
    const currentUid = window.auth.currentUser.uid;

    const newStudent = {
        dni, name, discipline, isUnlimited, isMonthPack,
        lastRenewal: new Date().toISOString(),
        maxVisits: isUnlimited ? 999 : visits,
        visitsLog: [],
        createdBy: currentUid, // Guardamos quién lo creó
        createdAt: new Date().toISOString()
    };

    try {
        await window.addDoc(window.collection(window.db, "students"), newStudent);
        document.getElementById('form-register').reset();
        toggleVisitsInput();
        alert("Alumno guardado correctamente");
    } catch(e) { 
        alert("Error al guardar: " + e.message); 
    }
}

async function addDiscipline() {
    if (!isAdminAuthenticated) return;
    
    const input = document.getElementById('new-discipline-name');
    const name = input.value.trim();
    
    if (name && !disciplines.some(d => d.name === name)) {
        try {
            const currentUid = window.auth.currentUser.uid;
            await window.addDoc(window.collection(window.db, "disciplines"), { 
                name: name,
                createdBy: currentUid 
            });
            input.value = '';
        } catch(e) { alert("Error: " + e.message); }
    }
}

// --- RESTO DE FUNCIONES ---
async function deleteDiscipline(id, name, e) {
    if(e) e.stopPropagation();
    if(!confirm(`¿Borrar "${name}"?`)) return;
    try { await window.deleteDoc(window.doc(window.db, "disciplines", id)); }
    catch(e) { alert("Error: " + e.message); }
}

async function deleteStudent(id, disc) {
    if(!confirm("¿Borrar alumno?")) return;
    try { await window.deleteDoc(window.doc(window.db, "students", id)); openDisciplineModal(disc); }
    catch(e) { alert("Error: " + e.message); }
}

async function renewMonth(id, disc) {
    const s = students.find(x => x.id === id);
    if(!s || !confirm(`¿Sumar mes a ${s.name}?`)) return;
    
    const now = new Date();
    let renewal = now.toISOString();
    let logs = s.visitsLog || [];

    if (s.isMonthPack && s.lastRenewal) {
        const exp = new Date(s.lastRenewal);
        exp.setMonth(exp.getMonth() + 1);
        if (now > exp) renewal = now.toISOString();
        else {
            const next = new Date(s.lastRenewal);
            next.setMonth(next.getMonth() + 1);
            renewal = next.toISOString();
        }
    } else {
        const key = `${now.getFullYear()}-${now.getMonth()}`;
        logs = logs.filter(d => {
            const date = new Date(d);
            return `${date.getFullYear()}-${date.getMonth()}` !== key;
        });
    }

    try {
        await window.updateDoc(window.doc(window.db, "students", id), { lastRenewal: renewal, visitsLog: logs });
        openDisciplineModal(disc);
    } catch(e) { alert("Error: " + e.message); }
}

async function addExtraDays(id, disc) {
    const val = parseInt(document.getElementById(`extra-days-${id}`).value);
    if(!val) return;
    const s = students.find(x => x.id === id);
    try {
        await window.updateDoc(window.doc(window.db, "students", id), { maxVisits: (s.maxVisits || 0) + val });
        openDisciplineModal(disc);
    } catch(e) { alert("Error: " + e.message); }
}

// --- UI HELPERS ---
function fillDisciplineInput(name) {
    document.getElementById('new-discipline-name').value = name;
    document.getElementById('reg-discipline').value = name;
}
function renderDisciplinesTags() {
    const container = document.getElementById('disciplines-tags');
    container.innerHTML = '';
    disciplines.forEach(disc => {
        const tag = document.createElement('button');
        tag.type = "button"; 
        tag.className = 'text-xs bg-black/40 border border-gray-700 hover:border-gimnastik-primary hover:text-gimnastik-primary px-2 py-1 rounded text-white mr-1 mb-1';
        tag.textContent = disc.name;
        tag.onclick = () => fillDisciplineInput(disc.name);
        container.appendChild(tag);
    });
}
function updateDisciplineSelect() {
    const select = document.getElementById('reg-discipline');
    const currentValue = select.value;
    select.innerHTML = '';
    disciplines.forEach(disc => {
        const option = document.createElement('option');
        option.value = disc.name;
        option.textContent = disc.name;
        option.className = "text-black";
        select.appendChild(option);
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

// Access Logic
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