// index.js

lucide.createIcons();

// --- CONFIGURACIÓN MAESTRA ---
// TU UID DE ADMIN REAL (Copiado de tu captura)
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

// --- INICIALIZACIÓN ROBUSTA ---
function init() {
    const savedTheme = JSON.parse(localStorage.getItem('gimnastik_theme'));
    if (savedTheme) setTheme(savedTheme.rgb, false);

    const dniInput = document.getElementById('access-dni');
    if(dniInput) {
        dniInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') handleAccess();
        });
    }

    // Esperar a que Firebase cargue
    waitForFirebase();
}

// Función de espera activa
function waitForFirebase() {
    if (window.auth && window.onAuthStateChanged) {
        // Observador de estado de sesión
        window.onAuthStateChanged(window.auth, (user) => {
            if (user) {
                console.log("Sesión detectada. UID:", user.uid);
                
                // --- VERIFICACIÓN MAESTRA POR UID ---
                // Comparamos el ID del usuario conectado con tu ID de Admin
                if (user.uid === ADMIN_UID) {
                    console.log("✅ MODO ADMIN ACTIVADO");
                    isAdminAuthenticated = true;
                    navBtns.logout.classList.remove('hidden');
                    navBtns.themeToggle.classList.remove('hidden');
                } else {
                    console.log("ℹ️ Modo Usuario/Kiosco");
                    isAdminAuthenticated = false;
                    navBtns.logout.classList.add('hidden');
                    navBtns.themeToggle.classList.add('hidden');
                }
                
                subscribeToData(); 
            } else {
                // Si no hay nadie, entrar como anónimo automáticamente
                console.log("Sin sesión, conectando como anónimo...");
                window.signInAnonymously(window.auth).catch((error) => {
                    console.error("Error conexión anónima:", error);
                });
            }
        });
    } else {
        // Reintentar en 100ms
        setTimeout(waitForFirebase, 100);
    }
}

// --- ESCUCHADORES EN TIEMPO REAL ---
function subscribeToData() {
    if (!window.db) return;

    try {
        // Disciplinas
        window.onSnapshot(window.collection(window.db, "disciplines"), (snapshot) => {
            if (snapshot.empty && disciplines.length === 0) {
                restoreDefaultDisciplines();
                return;
            }
            disciplines = [];
            snapshot.forEach((doc) => disciplines.push({ id: doc.id, ...doc.data() }));
            disciplines.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
            updateUI();
        });

        // Alumnos
        window.onSnapshot(window.collection(window.db, "students"), (snapshot) => {
            students = [];
            snapshot.forEach((doc) => students.push({ id: doc.id, ...doc.data() }));
            updateUI();
        });
    } catch (e) {
        console.error("Error suscripción:", e);
    }
}

async function restoreDefaultDisciplines() {
    // Solo el admin puede restaurar datos por defecto
    if (!isAdminAuthenticated) return;

    console.log("Base vacía. Restaurando disciplinas...");
    const defaults = ['Musculación', 'Crossfit', 'Boxeo', 'Yoga'];
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

// --- UI & TEMAS ---
function toggleThemeMenu() { document.getElementById('theme-menu').classList.toggle('hidden'); }
function setTheme(rgb, save = true) {
    document.documentElement.style.setProperty('--bg-theme-rgb', rgb);
    document.getElementById('theme-menu').classList.add('hidden');
    if (save) localStorage.setItem('gimnastik_theme', JSON.stringify({ rgb }));
}

// --- GRÁFICO ---
function renderChart() {
    const canvas = document.getElementById('gymChart');
    if (!canvas) return; 
    const ctx = canvas.getContext('2d');
    
    if (disciplines.length === 0 && students.length === 0) {
        if (gymChartInstance) gymChartInstance.destroy();
        return;
    }

    const labels = disciplines.map(d => d.name);
    const dataValues = disciplines.map(disc => students.filter(s => s.discipline === disc.name).length);
    
    if (gymChartInstance) gymChartInstance.destroy();

    const colors = ['#FF0055', '#00E5FF', '#7C4DFF', '#FFD600', '#FF9100', '#00E676', '#2979FF', '#EA80FC'];

    gymChartInstance = new Chart(ctx, {
        type: 'doughnut', 
        data: {
            labels: labels,
            datasets: [{ data: dataValues, backgroundColor: colors, borderColor: '#120509', borderWidth: 4, hoverOffset: 4 }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { color: '#e5e5e5', font: { family: 'Inter', size: 11 }, usePointStyle: true, padding: 15 } },
                tooltip: { backgroundColor: 'rgba(31, 10, 18, 0.9)', titleColor: '#FF0055', bodyColor: '#fff', borderColor: 'rgba(255, 255, 255, 0.1)', borderWidth: 1, padding: 10 }
            },
            cutout: '60%' 
        }
    });
}

// --- LOGIN ADMIN ---
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

function performLogin() {
    const userValue = document.getElementById('login-user').value.trim();
    // La contraseña se toma TAL CUAL para respetar mayúsculas
    const passValue = document.getElementById('login-pass').value.trim();
    
    // 1. Normalizar Usuario: "admin" o "ADMIN" -> "admin@gimnastik.com"
    let emailFinal = userValue.toLowerCase();
    if (!emailFinal.includes('@')) {
        emailFinal = `${emailFinal}@gimnastik.com`;
    }
    
    console.log("Intentando login con:", emailFinal);

    // 2. Login con Firebase
    window.signInWithEmailAndPassword(window.auth, emailFinal, passValue)
        .then((userCredential) => {
            console.log("Login exitoso. UID:", userCredential.user.uid);
            closeLoginModal();
            showView('admin');
        })
        .catch((error) => {
            console.error("Error login:", error.code, error.message);
            document.getElementById('login-error').classList.remove('hidden');
            const modalContent = document.querySelector('#login-modal > div');
            modalContent.classList.add('animate-shake');
            setTimeout(() => modalContent.classList.remove('animate-shake'), 500);
        });
}

function logoutAdmin() {
    if(!confirm("¿Cerrar sesión?")) return;
    window.signOut(window.auth).then(() => {
        showView('access');
        document.getElementById('theme-menu').classList.add('hidden');
    });
}

function showView(viewName) {
    Object.values(views).forEach(el => el.classList.add('hidden'));
    views[viewName].classList.remove('hidden');
    if(viewName === 'access') {
        navBtns.access.className = "text-sm font-medium text-gimnastik-primary border-b-2 border-gimnastik-primary pb-1";
        navBtns.admin.className = "text-gray-400 hover:text-white transition p-2 rounded-full hover:bg-white/10";
        navBtns.admin.innerHTML = '<i data-lucide="key-round" class="w-5 h-5"></i>';
    } else {
        navBtns.access.className = "text-sm font-medium text-gray-400 hover:text-white transition pb-1";
        navBtns.admin.className = "text-gimnastik-primary transition p-2 rounded-full bg-white/10 border border-gimnastik-primary/30";
        navBtns.admin.innerHTML = '<i data-lucide="lock-open" class="w-5 h-5"></i>';
    }
    lucide.createIcons();
}

// --- CRUD FIREBASE (CON UID) ---

async function addDiscipline() {
    const input = document.getElementById('new-discipline-name');
    const name = input.value.trim();
    
    if (name && !disciplines.some(d => d.name === name)) {
        try {
            // Guardamos con UID del creador (admin)
            const uid = window.auth.currentUser ? window.auth.currentUser.uid : "unknown";
            await window.addDoc(window.collection(window.db, "disciplines"), { 
                name: name,
                createdBy: uid,
                createdAt: new Date().toISOString()
            });
            input.value = '';
        } catch(e) { alert("Error: " + e.message); }
    }
}

async function registerStudent() {
    const name = document.getElementById('reg-name').value;
    const dni = document.getElementById('reg-dni').value;
    const discipline = document.getElementById('reg-discipline').value;
    const isUnlimited = document.getElementById('reg-unlimited').checked;
    const isMonthPack = document.getElementById('reg-month-pack').checked;
    let visits = parseInt(document.getElementById('reg-visits').value);

    if (!name || !dni || !discipline) return alert("Complete todos los campos");
    if (students.find(s => s.dni == dni)) return alert("DNI ya registrado");

    const uid = window.auth.currentUser ? window.auth.currentUser.uid : "unknown";

    const newStudent = {
        dni, name, discipline, isUnlimited, isMonthPack,
        lastRenewal: new Date().toISOString(),
        maxVisits: isUnlimited ? 999 : visits,
        visitsLog: [],
        createdBy: uid, // Guardamos el UID del admin que lo creó
        createdAt: new Date().toISOString()
    };

    try {
        await window.addDoc(window.collection(window.db, "students"), newStudent);
        document.getElementById('form-register').reset();
        toggleVisitsInput();
        alert("Alumno guardado correctamente");
    } catch(e) { 
        alert("Error al guardar: " + e.message); 
        console.error(e);
    }
}

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
        tag.className = 'text-xs bg-black/40 border border-gray-700 hover:border-gimnastik-primary hover:text-gimnastik-primary px-2 py-1 rounded text-gray-300 transition cursor-pointer';
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
        option.className = "text-black bg-white"; 
        select.appendChild(option);
    });
    if (disciplines.some(d => d.name === currentValue)) select.value = currentValue;
}
function toggleVisitsInput() {
    const isUnlimited = document.getElementById('reg-unlimited').checked;
    const input = document.getElementById('reg-visits');
    if (isUnlimited) { input.disabled = true; input.classList.add('opacity-30'); }
    else { input.disabled = false; input.classList.remove('opacity-30'); }
}
function renderStats() {
    const container = document.getElementById('stats-container');
    container.innerHTML = '';
    document.getElementById('total-students-badge').textContent = `${students.length} Alumnos`;
    disciplines.forEach(d => {
        const count = students.filter(s => s.discipline === d.name).length;
        const div = document.createElement('div');
        div.className = "glass-panel p-5 rounded-xl flex justify-between items-center border border-white/5 hover:border-gimnastik-primary hover:bg-white/5 transition cursor-pointer group relative";
        div.onclick = () => openDisciplineModal(d.name);
        div.innerHTML = `<div class="flex items-center gap-3"><div class="w-2 h-8 bg-gimnastik-primary rounded-full group-hover:bg-white transition"></div><div><span class="font-bold text-lg block">${d.name}</span><span class="text-xs text-gray-500 group-hover:text-gray-300">Ver detalles</span></div></div><div class="flex items-center gap-6"><span class="text-3xl font-bold text-white drop-shadow-lg">${count}</span><button onclick="deleteDiscipline('${d.id}', '${d.name}', event)" class="p-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-lg transition z-10 border border-red-500/20"><i data-lucide="trash-2" class="w-5 h-5"></i></button></div>`;
        container.appendChild(div);
    });
    lucide.createIcons();
    renderChart();
}
function showView(viewName) {
    Object.values(views).forEach(el => el.classList.add('hidden'));
    views[viewName].classList.remove('hidden');
    if(viewName === 'access') {
        navBtns.access.className = "text-sm font-medium text-gimnastik-primary border-b-2 border-gimnastik-primary pb-1";
        navBtns.admin.className = "text-gray-400 hover:text-white transition p-2 rounded-full hover:bg-white/10";
        navBtns.admin.innerHTML = '<i data-lucide="key-round" class="w-5 h-5"></i>';
    } else {
        navBtns.access.className = "text-sm font-medium text-gray-400 hover:text-white transition pb-1";
        navBtns.admin.className = "text-gimnastik-primary transition p-2 rounded-full bg-white/10 border border-gimnastik-primary/30";
        navBtns.admin.innerHTML = '<i data-lucide="lock-open" class="w-5 h-5"></i>';
    }
    lucide.createIcons();
}
function handleAccess() {
    const dniInput = document.getElementById('access-dni');
    const dni = dniInput.value.trim();
    const resultDiv = document.getElementById('access-result');
    const loaderDiv = document.getElementById('access-loader');
    if (!resultDiv.classList.contains('hidden')) { resultDiv.classList.add('hidden'); resultDiv.classList.remove('slide-up-out'); }
    if (autoCloseTimer) clearTimeout(autoCloseTimer);
    if (!dni) return;
    loaderDiv.classList.remove('hidden');
    setTimeout(() => { loaderDiv.classList.add('hidden'); processAccess(dni); }, 2000);
    dniInput.value = '';
}
async function processAccess(dni) {
    try {
        const resultDiv = document.getElementById('access-result');
        const expiryWarning = document.getElementById('expiry-warning');
        resultDiv.classList.remove('slide-up-out');
        expiryWarning.classList.add('hidden');
        const student = students.find(s => s.dni == dni);
        
        if (!student) {
            resultDiv.classList.remove('hidden');
            resultDiv.className = "mt-6 glass-panel rounded-2xl p-6 text-center border-l-4 border-red-500 animate-pulse";
            document.getElementById('access-icon').innerHTML = '<i data-lucide="x-circle" class="w-8 h-8"></i>';
            document.getElementById('access-name').textContent = "No Encontrado";
            document.getElementById('access-discipline').textContent = "Regístrese en Administración";
            document.getElementById('access-used').textContent = "-";
            document.getElementById('access-remaining').textContent = "-";
        } else {
            const now = new Date();
            const currentMonthKey = `${now.getFullYear()}-${now.getMonth()}`;
            const safeLog = student.visitsLog || [];
            const visitsThisMonth = safeLog.filter(d => {
                const date = new Date(d);
                return `${date.getFullYear()}-${date.getMonth()}` === currentMonthKey;
            }).length;
            const alreadyCheckedInToday = safeLog.some(d => new Date(d).toDateString() === now.toDateString());

            let canEnter = true;
            let message = student.discipline || "General";
            let rejectReason = "";
            let daysUntilExpiry = null;

            if (student.isMonthPack && student.lastRenewal) {
                const expiryDate = new Date(student.lastRenewal);
                expiryDate.setMonth(expiryDate.getMonth() + 1);
                if (now > expiryDate) {
                    canEnter = false;
                    rejectReason = "MEMBRESÍA VENCIDA";
                    expiryWarning.classList.remove('hidden');
                    expiryWarning.textContent = `Venció el ${expiryDate.toLocaleDateString()}`;
                } else {
                    daysUntilExpiry = Math.ceil(Math.abs(expiryDate - now) / (1000 * 60 * 60 * 24));
                }
            }

            if (canEnter && !student.isUnlimited && visitsThisMonth >= (student.maxVisits || 0)) {
                canEnter = false;
                rejectReason = "CUPO AGOTADO";
            }

            const safeName = student.name ? student.name.split(' ')[0] : 'Alumno';

            if (canEnter) {
                resultDiv.classList.remove('hidden');
                resultDiv.className = "mt-6 glass-panel rounded-2xl p-6 text-center border-l-4 border-gimnastik-primary fade-in";
                document.getElementById('access-icon').innerHTML = '<i data-lucide="check-circle" class="w-8 h-8"></i>';
                if (!alreadyCheckedInToday) {
                    const newLog = [...safeLog, now.toISOString()];
                    await window.updateDoc(window.doc(window.db, "students", student.id), { visitsLog: newLog });
                } else { message += " (Ya ingresó hoy)"; }
                const newUsed = alreadyCheckedInToday ? visitsThisMonth : visitsThisMonth + 1;
                let remainingText = "";
                if (student.isMonthPack) {
                    document.getElementById('label-remaining').textContent = "Vigencia";
                    remainingText = daysUntilExpiry !== null ? `${daysUntilExpiry} días` : "-";
                } else {
                    document.getElementById('label-remaining').textContent = "Clases Restantes";
                    remainingText = student.isUnlimited ? "∞" : ((student.maxVisits || 0) - newUsed);
                }
                document.getElementById('access-name').textContent = `Hola, ${safeName}`;
                document.getElementById('access-discipline').textContent = message;
                document.getElementById('access-used').textContent = newUsed;
                document.getElementById('access-remaining').textContent = remainingText;
            } else {
                resultDiv.classList.remove('hidden');
                resultDiv.className = "mt-6 glass-panel rounded-2xl p-6 text-center border-l-4 border-yellow-500 fade-in";
                document.getElementById('access-icon').innerHTML = '<i data-lucide="alert-triangle" class="w-8 h-8"></i>';
                document.getElementById('access-name').textContent = safeName;
                document.getElementById('access-discipline').textContent = rejectReason;
                document.getElementById('access-used').textContent = visitsThisMonth;
                document.getElementById('access-remaining').textContent = "0";
            }
        }
        lucide.createIcons();
    } catch (error) { console.error("Error procesando acceso:", error); } finally {
        if (autoCloseTimer) clearTimeout(autoCloseTimer);
        autoCloseTimer = setTimeout(() => {
            const resDiv = document.getElementById('access-result');
            if (resDiv && !resDiv.classList.contains('hidden')) {
                resDiv.classList.add('slide-up-out');
                setTimeout(() => { resDiv.classList.add('hidden'); resDiv.classList.remove('slide-up-out'); }, 800);
            }
        }, 20000);
    }
}

init();