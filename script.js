import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, getDocs, addDoc, updateDoc, collection, query, where, serverTimestamp, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// Firebase configuration
const app = initializeApp({
    apiKey: "AIzaSyAicp9bxw9v0XlGKPcpLwzhHYdjcmCacT0",
    authDomain: "suremediq-8649d.firebaseapp.com",
    projectId: "suremediq-8649d",
    storageBucket: "suremediq-8649d.firebasestorage.app",
    messagingSenderId: "626863653024",
    appId: "1:626863653024:web:72297ff2f31ec23e6689c5"
});

const auth = getAuth(app);
const db = getFirestore(app);

// Global variables
let CU = null, UD = null;
let selDate = new Date(), selSlot = null;
let chatHospId = null, chatUnsub = null;
let allHospitals = [];
let hospChatPatientId = null, hospChatUnsub = null;
let _generatedOTP = '';
let _resendInterval = null;

// Helper functions
function sortDesc(docs) {
    return docs.sort((a, b) => {
        const at = a.data().createdAt?.toMillis?.() ?? 0;
        const bt = b.data().createdAt?.toMillis?.() ?? 0;
        return bt - at;
    });
}

function sortAsc(docs) {
    return docs.sort((a, b) => {
        const at = a.data().createdAt?.toMillis?.() ?? 0;
        const bt = b.data().createdAt?.toMillis?.() ?? 0;
        return at - bt;
    });
}

function toast(msg, type = 'info') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = `show ${type}`;
    setTimeout(() => { el.className = ''; }, 3500);
}

function spin(on) {
    document.getElementById('spinner').style.display = on ? 'flex' : 'none';
}

function showPage(id) {
    ['page-landing', 'page-auth', 'page-hospital', 'page-patient'].forEach(p =>
        document.getElementById(p).classList.add('hidden')
    );
    document.getElementById(id).classList.remove('hidden');
    const showHeader = (id === 'page-hospital' || id === 'page-patient');
    document.getElementById('main-header').classList.toggle('hidden', !showHeader);
    document.getElementById('main-footer').classList.toggle('hidden', !showHeader);
}

function updateHeader() {
    if (!UD) return;
    const name = UD.hospitalName || UD.name || 'User';
    document.getElementById('hdr-name').textContent = name;
    document.getElementById('hdr-role').textContent = UD.role === 'hospital' ? 'Hospital' : 'Patient';
    document.getElementById('hdr-initial').textContent = name.charAt(0).toUpperCase();
    
    if (UD.role === 'hospital') {
        document.getElementById('h-profile-photo').textContent = name.charAt(0).toUpperCase();
        const badge = document.getElementById('h-verify-badge');
        if (UD.verified) {
            badge.className = 'status verified';
            badge.innerHTML = '<i class="fas fa-check-circle"></i> Verified';
        } else {
            badge.className = 'status pending';
            badge.innerHTML = '<i class="fas fa-clock"></i> Pending';
        }
    } else {
        document.getElementById('p-profile-photo').textContent = name.charAt(0).toUpperCase();
    }
}

// Tab switching
function switchTab(portal, tabId) {
    const section = portal === 'hospital' ? 'page-hospital' : 'page-patient';
    document.querySelectorAll(`#${section} .dash-content`).forEach(d => d.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    document.querySelectorAll(`#${section} .bnav-item`).forEach(b =>
        b.classList.toggle('active', b.dataset.tab === tabId)
    );
    
    // Load data based on tab
    if (tabId === 'h-appointments') { renderHospCal(); loadHospAppts(); }
    if (tabId === 'h-queries') loadHospQueries();
    if (tabId === 'h-verification') prefillVerification();
    if (tabId === 'h-profile') prefillHospProfile();
    if (tabId === 'p-hospitals') loadHospitals();
    if (tabId === 'p-booking') {
        renderCal('p-cal-grid', 'p-cal-month', 'p-time-slots');
        fillHospSelect();
    }
    if (tabId === 'p-queries') loadChatList();
    if (tabId === 'p-medicine') medReset();
    if (tabId === 'p-profile') prefillPatProfile();
}

// Hospital verification
function prefillVerification() {
    if (!UD) return;
    document.getElementById('hd-name').value = UD.hospitalName || '';
    document.getElementById('hd-addr').value = UD.address || '';
    document.getElementById('hd-phone').value = UD.contact || '';
    document.getElementById('hd-email').value = UD.email || '';
    document.getElementById('hd-spec').value = UD.specialties || '';
    document.getElementById('hd-hours').value = UD.hours || '';
    
    const infoBox = document.getElementById('verify-info-box');
    if (UD.verified) {
        infoBox.style.background = 'rgba(5,150,105,.08)';
        infoBox.style.color = 'var(--success)';
        infoBox.innerHTML = '<i class="fas fa-check-circle"></i> Your hospital is <strong>verified</strong> and visible to patients!';
    }
}

// Hospital profile
function prefillHospProfile() {
    if (!UD) return;
    document.getElementById('hp-name').value = UD.hospitalName || '';
    document.getElementById('hp-addr').value = UD.address || '';
    document.getElementById('hp-phone').value = UD.contact || '';
    document.getElementById('hp-email').value = UD.email || '';
    document.getElementById('hp-desc').value = UD.description || '';
}

// Patient profile
function prefillPatProfile() {
    if (!UD) return;
    document.getElementById('pp-name').value = UD.name || '';
    document.getElementById('pp-email').value = CU.email || '';
    document.getElementById('pp-phone').value = UD.phone || '';
    document.getElementById('pp-dob').value = UD.dob || '';
    document.getElementById('pp-blood').value = UD.blood || 'O+';
    document.getElementById('pp-addr').value = UD.address || '';
}

// Demo data
const DEMO_APPOINTMENTS = [
    { id: 'demo1', patientName: 'Aarav Sharma', purpose: 'General Consultation', date: '2025-02-26', timeSlot: '10:00 AM', notes: 'Fever and cold since 3 days', patientEmail: 'aarav.sharma@email.com', status: 'confirmed' },
    { id: 'demo2', patientName: 'Priya Mehta', purpose: 'Cardiology Check-up', date: '2025-02-26', timeSlot: '11:30 AM', notes: 'Routine heart check-up', patientEmail: 'priya.mehta@email.com', status: 'confirmed' },
    { id: 'demo3', patientName: 'Rahul Verma', purpose: 'Orthopaedic Consultation', date: '2025-02-27', timeSlot: '09:00 AM', notes: 'Knee pain for 2 weeks', patientEmail: 'rahul.verma@email.com', status: 'pending' },
    { id: 'demo4', patientName: 'Sneha Patil', purpose: 'Dermatology', date: '2025-02-27', timeSlot: '02:00 PM', notes: 'Skin rash on arms', patientEmail: 'sneha.patil@email.com', status: 'pending' },
    { id: 'demo5', patientName: 'Karan Joshi', purpose: 'Paediatrics', date: '2025-02-28', timeSlot: '10:30 AM', notes: 'Child vaccination follow-up', patientEmail: 'karan.joshi@email.com', status: 'pending' },
];

const MOCK_HOSPITALS = [
    { 
        id: 'mock_7', 
        hospitalName: 'Ruby Hall Clinic', 
        address: '40, Sassoon Road, Pune - 411001', 
        contact: '+91-20-66455555', 
        hours: '24/7', 
        specialties: 'Cardiology, Nephrology, Oncology, Neurosciences', 
        description: 'One of Pune\'s oldest and most trusted multi-speciality hospitals since 1959.', 
        verified: true, 
        role: 'hospital' 
    },
    { 
        id: 'mock_8', 
        hospitalName: 'Sahyadri Super Speciality Hospital', 
        address: 'Plot No. 30-C, Karve Road, Pune - 411004', 
        contact: '+91-20-67210000', 
        hours: '24/7', 
        specialties: 'Bone Marrow Transplant, Cancer Care, Neurology', 
        description: 'Maharashtra\'s largest private hospital network headquartered in Pune.', 
        verified: true, 
        role: 'hospital' 
    },
    { 
        id: 'mock_9', 
        hospitalName: 'Jehangir Hospital', 
        address: '32, Sassoon Road, Pune - 411001', 
        contact: '+91-20-66810000', 
        hours: '24/7', 
        specialties: 'General Surgery, Orthopedics, Gynecology, ICU', 
        description: 'A leading 350-bed multi-speciality hospital in the heart of Pune since 1946.', 
        verified: true, 
        role: 'hospital' 
    },
    { 
        id: 'mock_10', 
        hospitalName: 'Deenanath Mangeshkar Hospital', 
        address: 'Erandwane, Pune - 411004', 
        contact: '+91-20-49150000', 
        hours: '24/7', 
        specialties: 'Cardiothoracic, Liver Transplant, Pediatrics, Oncology', 
        description: 'One of Pune\'s premier hospitals known for advanced cardiac and transplant care.', 
        verified: true, 
        role: 'hospital' 
    },
    { 
        id: 'mock_1', 
        hospitalName: 'Apollo Hospitals', 
        address: 'Sarita Vihar, New Delhi - 110076', 
        contact: '+91-11-71021021', 
        hours: '24/7', 
        specialties: 'Cardiology, Neurology, Oncology', 
        description: 'One of India\'s leading hospital chains with world-class facilities.', 
        verified: true, 
        role: 'hospital' 
    },
    { 
        id: 'mock_2', 
        hospitalName: 'Fortis Memorial Research Institute', 
        address: 'Sector 44, Gurugram, Haryana - 122002', 
        contact: '+91-124-4962200', 
        hours: '24/7', 
        specialties: 'Orthopedics, Transplant, Robotic Surgery', 
        description: 'A quaternary care multi-speciality hospital.', 
        verified: true, 
        role: 'hospital' 
    },
    { 
        id: 'mock_3', 
        hospitalName: 'AIIMS New Delhi', 
        address: 'Sri Aurobindo Marg, Ansari Nagar, New Delhi - 110029', 
        contact: '+91-11-26588500', 
        hours: 'Mon–Sat 8AM–5PM (Emergency 24/7)', 
        specialties: 'All Specialties, Research & Teaching', 
        description: 'Premier public medical institute and hospital of India.', 
        verified: true, 
        role: 'hospital' 
    },
    { 
        id: 'mock_4', 
        hospitalName: 'Max Super Speciality Hospital', 
        address: 'Press Enclave Road, Saket, New Delhi - 110017', 
        contact: '+91-11-26515050', 
        hours: '24/7', 
        specialties: 'Cardiac Sciences, Cancer Care, Pediatrics', 
        description: 'Multi-speciality hospital offering comprehensive care.', 
        verified: true, 
        role: 'hospital' 
    },
    { 
        id: 'mock_5', 
        hospitalName: 'Medanta – The Medicity', 
        address: 'Sector 38, Gurugram, Haryana - 122001', 
        contact: '+91-124-4141414', 
        hours: '24/7', 
        specialties: 'Heart Institute, Liver Transplant, Orthopedics', 
        description: 'A multi-super-speciality institute with over 1600 beds.', 
        verified: true, 
        role: 'hospital' 
    },
    { 
        id: 'mock_6', 
        hospitalName: 'Sir Ganga Ram Hospital', 
        address: 'Rajinder Nagar, New Delhi - 110060', 
        contact: '+91-11-25750000', 
        hours: '24/7', 
        specialties: 'Gastroenterology, Nephrology, Cardiology', 
        description: 'One of Delhi\'s most prestigious multi-speciality hospitals.', 
        verified: true, 
        role: 'hospital' 
    }
];

const MOCK_REPLIES = [
    "Thank you for reaching out! Our team will get back to you shortly.",
    "Hello! Please visit our OPD between 9AM–5PM or call us to book an appointment.",
    "We have specialists available for your concern. Would you like to book a consultation?",
    "For emergencies please call our helpline directly. For general queries, our team usually responds within a few hours.",
    "Thank you for your query. We recommend scheduling an in-person consultation for a proper diagnosis.",
    "Our doctors are available 24/7 for emergency care. For routine checkups, please book via the Book tab.",
];

// Hospital availability calendar
const ALL_TIME_SLOTS = ['8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM'];

const HOSP_SCHEDULE = {
    0: null,
    1: { open: true, slots: ['9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM'] },
    2: { open: true, slots: ['8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM'] },
    3: { open: true, slots: ['9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM'] },
    4: { open: true, slots: ['8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM'] },
    5: { open: true, slots: ['9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '2:00 PM', '3:00 PM', '4:00 PM'] },
    6: { open: true, slots: ['9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM'] },
};

// Pre-booked slots
const HOSP_BOOKED = (() => {
    const today = new Date();
    const y = today.getFullYear(), m = today.getMonth();
    const fmt = (yr, mo, d) => `${yr}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return {
        [fmt(y, m, today.getDate())]: ['9:00 AM', '10:00 AM', '11:00 AM', '2:00 PM'],
        [fmt(y, m, today.getDate() + 1)]: ['9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '2:00 PM', '3:00 PM'],
        [fmt(y, m, today.getDate() + 2)]: ['9:00 AM'],
        [fmt(y, m, today.getDate() + 3)]: ['9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM'],
        [fmt(y, m, today.getDate() + 5)]: ['10:00 AM', '11:00 AM', '2:00 PM', '3:00 PM'],
        [fmt(y, m, today.getDate() + 7)]: ['9:00 AM', '10:00 AM'],
        [fmt(y, m, today.getDate() + 8)]: ['9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM'],
    };
})();

// Blocked dates
const HOSP_BLOCKED = (() => {
    const today = new Date();
    const y = today.getFullYear(), m = today.getMonth();
    const fmt = (yr, mo, d) => `${yr}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return new Set([
        fmt(y, m, today.getDate() + 4),
        fmt(y, m, today.getDate() + 11),
    ]);
})();

let hCalDate = new Date();
let hSelDate = null;

function getDateKey(yr, mo, d) {
    return `${yr}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function getDayStatus(yr, mo, d) {
    const dateKey = getDateKey(yr, mo, d);
    const dayOfWeek = new Date(yr, mo, d).getDay();
    const schedule = HOSP_SCHEDULE[dayOfWeek];
    if (!schedule || HOSP_BLOCKED.has(dateKey)) return 'closed';
    const totalSlots = schedule.slots.length;
    const booked = (HOSP_BOOKED[dateKey] || []).length;
    if (booked >= totalSlots) return 'full';
    if (booked >= Math.ceil(totalSlots * 0.5)) return 'partial';
    return 'available';
}

function renderHospCal() {
    const grid = document.getElementById('h-cal-grid');
    const mnth = document.getElementById('h-cal-month');
    if (!grid || !mnth) return;
    
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const yr = hCalDate.getFullYear(), mo = hCalDate.getMonth();
    mnth.textContent = `${MONTHS[mo]} ${yr}`;
    
    const firstDay = new Date(yr, mo, 1).getDay();
    const days = new Date(yr, mo + 1, 0).getDate();
    const today = new Date();
    
    grid.innerHTML = '';

    // Day headers
    ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach(d => {
        const el = document.createElement('div');
        el.textContent = d;
        el.style.cssText = 'font-weight:700;color:var(--gray);text-align:center;font-size:.72rem;padding:4px 0;';
        grid.appendChild(el);
    });

    // Empty leading cells
    for (let i = 0; i < firstDay; i++) {
        const e = document.createElement('div');
        e.className = 'cal-day empty';
        grid.appendChild(e);
    }

    // Day cells
    for (let d = 1; d <= days; d++) {
        const el = document.createElement('div');
        el.className = 'cal-day';
        el.textContent = d;
        
        const isToday = (d === today.getDate() && mo === today.getMonth() && yr === today.getFullYear());
        const isPast = new Date(yr, mo, d) < new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const status = getDayStatus(yr, mo, d);
        const dateKey = getDateKey(yr, mo, d);
        const isSelected = hSelDate && hSelDate === dateKey;

        if (isSelected) {
            el.style.cssText = 'background:var(--primary);color:#fff;border-radius:8px;cursor:pointer;position:relative;font-weight:700;';
        } else if (isPast) {
            el.style.cssText = 'color:#cbd5e1;cursor:default;border-radius:8px;font-size:.82rem;';
        } else if (isToday) {
            el.style.cssText = 'background:var(--primary);color:#fff;border-radius:8px;cursor:pointer;font-weight:700;box-shadow:0 2px 8px rgba(37,99,235,.4);';
        } else if (status === 'available') {
            el.style.cssText = 'background:#dcfce7;color:#166534;border-radius:8px;cursor:pointer;font-weight:600;border:1px solid #86efac;';
        } else if (status === 'partial') {
            el.style.cssText = 'background:#fef9c3;color:#854d0e;border-radius:8px;cursor:pointer;font-weight:600;border:1px solid #fde047;';
        } else if (status === 'full') {
            el.style.cssText = 'background:#fee2e2;color:#991b1b;border-radius:8px;cursor:pointer;font-weight:600;border:1px solid #fca5a5;';
        } else {
            el.style.cssText = 'background:#f1f5f9;color:#94a3b8;border-radius:8px;cursor:not-allowed;font-size:.82rem;';
        }

        if (!isPast && status !== 'closed') {
            el.style.cursor = 'pointer';
            el.addEventListener('click', () => {
                hSelDate = dateKey;
                renderHospCal();
                renderHospSlots(yr, mo, d);
            });
        }

        grid.appendChild(el);
    }
}

function renderHospSlots(yr, mo, d) {
    const el = document.getElementById('h-time-slots');
    const dateLabel = document.getElementById('h-slots-date');
    const summary = document.getElementById('h-slots-summary');
    if (!el) return;

    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayOfWeek = new Date(yr, mo, d).getDay();
    const dateKey = getDateKey(yr, mo, d);
    const schedule = HOSP_SCHEDULE[dayOfWeek];
    const booked = HOSP_BOOKED[dateKey] || [];

    if (dateLabel) dateLabel.textContent = `${DAYS[dayOfWeek]}, ${d} ${MONTHS_SHORT[mo]} ${yr}`;

    el.innerHTML = '';

    if (!schedule || HOSP_BLOCKED.has(dateKey)) {
        el.innerHTML = '<div style="color:var(--gray);font-size:.85rem;padding:8px 0;width:100%"><i class="fas fa-moon" style="margin-right:6px"></i>Hospital closed on this day</div>';
        if (summary) summary.style.display = 'none';
        return;
    }

    const slots = schedule.slots;
    let availCount = 0;

    slots.forEach(s => {
        const isBooked = booked.includes(s);
        if (!isBooked) availCount++;
        const chip = document.createElement('div');
        chip.style.cssText = `
            padding:8px 12px;border-radius:20px;font-size:.82rem;font-weight:600;
            display:inline-flex;align-items:center;gap:6px;
            ${isBooked
                ? 'background:#fee2e2;color:#991b1b;cursor:not-allowed;border:1.5px solid #fca5a5;'
                : 'background:#dcfce7;color:#166534;cursor:pointer;border:1.5px solid #86efac;transition:all .15s;'}
        `;
        chip.innerHTML = `<i class="fas fa-${isBooked ? 'times-circle' : 'check-circle'}" style="font-size:.75rem"></i>${s}`;
        if (!isBooked) {
            chip.addEventListener('mouseenter', () => {
                chip.style.background = '#16a34a';
                chip.style.color = '#fff';
                chip.style.borderColor = '#16a34a';
            });
            chip.addEventListener('mouseleave', () => {
                chip.style.background = '#dcfce7';
                chip.style.color = '#166534';
                chip.style.borderColor = '#86efac';
            });
            chip.addEventListener('click', () => {
                el.querySelectorAll('div[data-sel]').forEach(x => {
                    x.removeAttribute('data-sel');
                    x.style.background = '#dcfce7';
                    x.style.color = '#166534';
                    x.style.borderColor = '#86efac';
                });
                chip.setAttribute('data-sel', '1');
                chip.style.background = 'var(--primary)';
                chip.style.color = '#fff';
                chip.style.borderColor = 'var(--primary)';
                selSlot = s;
            });
        }
        el.appendChild(chip);
    });

    if (summary) {
        const total = slots.length;
        const pct = Math.round((booked.length / total) * 100);
        summary.style.display = 'block';
        summary.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <span><strong style="color:var(--success)">${availCount}</strong> available &nbsp;·&nbsp; <strong style="color:var(--danger)">${booked.length}</strong> booked</span>
                <span style="font-weight:600;color:${pct >= 80 ? 'var(--danger)' : pct >= 50 ? 'var(--warning)' : 'var(--success)'}">${pct}% full</span>
            </div>
            <div style="background:var(--gray-light);border-radius:20px;height:6px;overflow:hidden">
                <div style="height:100%;width:${pct}%;background:${pct >= 80 ? 'var(--danger)' : pct >= 50 ? 'var(--warning)' : 'var(--success)'};border-radius:20px;transition:width .4s"></div>
            </div>`;
    }
}

function renderCal(gridId, monthId, slotsId) {
    const grid = document.getElementById(gridId);
    const mnth = document.getElementById(monthId);
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    mnth.textContent = `${MONTHS[selDate.getMonth()]} ${selDate.getFullYear()}`;
    
    const yr = selDate.getFullYear(), mo = selDate.getMonth();
    const firstDay = new Date(yr, mo, 1).getDay();
    const days = new Date(yr, mo + 1, 0).getDate();
    const today = new Date();
    
    grid.innerHTML = '';
    
    ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach(d => {
        const el = document.createElement('div');
        el.textContent = d;
        el.style.cssText = 'font-weight:600;color:var(--gray);text-align:center;font-size:.78rem';
        grid.appendChild(el);
    });
    
    for (let i = 0; i < firstDay; i++) {
        const e = document.createElement('div');
        e.className = 'cal-day empty';
        grid.appendChild(e);
    }
    
    for (let d = 1; d <= days; d++) {
        const el = document.createElement('div');
        el.className = 'cal-day';
        el.textContent = d;
        const isToday = (d === today.getDate() && mo === today.getMonth() && yr === today.getFullYear());
        if (isToday) el.classList.add('today');
        el.addEventListener('click', () => {
            grid.querySelectorAll('.cal-day').forEach(c => c.classList.remove('selected'));
            el.classList.add('selected');
            selDate = new Date(yr, mo, d);
            renderSlots(slotsId);
        });
        grid.appendChild(el);
    }
    renderSlots(slotsId);
}

function renderSlots(slotsId) {
    const el = document.getElementById(slotsId);
    el.innerHTML = '';
    ['9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM'].forEach(s => {
        const d = document.createElement('div');
        d.className = 'time-slot';
        d.textContent = s;
        d.addEventListener('click', () => {
            el.querySelectorAll('.time-slot').forEach(x => x.classList.remove('selected'));
            d.classList.add('selected');
            selSlot = s;
        });
        el.appendChild(d);
    });
}

// Hospital appointments
async function loadHospAppts() {
    const el = document.getElementById('h-appt-list');
    el.innerHTML = '<p style="color:var(--gray)">Loading...</p>';

    let appointments = [...DEMO_APPOINTMENTS];
    try {
        const raw = await getDocs(collection(db, 'appointments'));
        const realSnap = raw.docs.filter(d => d.data().hospitalId === CU.uid);
        realSnap.forEach(d => appointments.push({ id: d.id, ...d.data(), _real: true }));
    } catch (e) { }

    if (!appointments.length) {
        el.innerHTML = '<p style="color:var(--gray)">No appointment requests yet.</p>';
        return;
    }

    el.innerHTML = '';
    appointments.forEach(a => {
        const aid = a.id;
        const isDemo = !a._real;
        const div = document.createElement('div');
        div.className = 'appt-item';
        const statusClass = a.status === 'confirmed' ? 'confirmed' : a.status === 'rejected' ? 'rejected' : a.status === 'completed' ? 'completed' : 'pending';
        div.innerHTML = `
            <div>
                <strong>${a.patientName || 'Patient'}</strong>
                <div style="color:var(--gray);font-size:.85rem">${a.purpose} · ${a.date || ''} at ${a.timeSlot || ''}</div>
                ${a.notes ? `<div style="color:var(--gray);font-size:.82rem;margin-top:4px">📝 ${a.notes}</div>` : ''}
                ${a.patientEmail ? `<div style="color:var(--gray);font-size:.8rem">📧 ${a.patientEmail}</div>` : ''}
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">
                <span class="status ${statusClass}">${a.status || 'pending'}</span>
                ${a.status === 'pending' || !a.status ? `
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-secondary btn-sm appt-confirm" data-id="${aid}" data-demo="${isDemo}"><i class="fas fa-check"></i> Confirm</button>
                        <button class="btn btn-danger btn-sm appt-reject" data-id="${aid}" data-demo="${isDemo}"><i class="fas fa-times"></i> Reject</button>
                    </div>` :
                    a.status === 'confirmed' ? `<button class="btn btn-warning btn-sm appt-complete" data-id="${aid}" data-demo="${isDemo}" style="font-size:.8rem"><i class="fas fa-flag-checkered"></i> Mark Done</button>` : ''}
            </div>`;
        el.appendChild(div);
    });

    el.querySelectorAll('.appt-confirm').forEach(b => {
        b.addEventListener('click', async () => {
            if (b.dataset.demo === 'true') {
                const demo = DEMO_APPOINTMENTS.find(d => d.id === b.dataset.id);
                if (demo) demo.status = 'confirmed';
                loadHospAppts();
                toast('Appointment confirmed ✅', 'success');
                return;
            }
            spin(true);
            try {
                await updateDoc(doc(db, 'appointments', b.dataset.id), { status: 'confirmed' });
                toast('Appointment confirmed ✅', 'success');
                loadHospAppts();
            } catch (e) {
                toast('Error', 'error');
            }
            spin(false);
        });
    });

    el.querySelectorAll('.appt-reject').forEach(b => {
        b.addEventListener('click', async () => {
            if (b.dataset.demo === 'true') {
                const demo = DEMO_APPOINTMENTS.find(d => d.id === b.dataset.id);
                if (demo) demo.status = 'rejected';
                loadHospAppts();
                toast('Appointment rejected', 'info');
                return;
            }
            spin(true);
            try {
                await updateDoc(doc(db, 'appointments', b.dataset.id), { status: 'rejected' });
                toast('Appointment rejected', 'info');
                loadHospAppts();
            } catch (e) {
                toast('Error', 'error');
            }
            spin(false);
        });
    });

    el.querySelectorAll('.appt-complete').forEach(b => {
        b.addEventListener('click', async () => {
            if (b.dataset.demo === 'true') {
                const demo = DEMO_APPOINTMENTS.find(d => d.id === b.dataset.id);
                if (demo) demo.status = 'completed';
                loadHospAppts();
                toast('Marked as completed ✅', 'success');
                return;
            }
            spin(true);
            try {
                await updateDoc(doc(db, 'appointments', b.dataset.id), { status: 'completed' });
                toast('Marked as completed ✅', 'success');
                loadHospAppts();
            } catch (e) {
                toast('Error', 'error');
            }
            spin(false);
        });
    });
}

// Hospital queries
const DEMO_PATIENTS = [
    {
        id: 'demo_priya', name: 'Priya Chaudhary',
        messages: [
            { from: 'patient', text: 'Hello, I would like to know more about the Gastroenterology department. I have been experiencing persistent acidity and bloating for the past month.', time: '10:05 AM' },
            { from: 'hospital', text: 'Hello Priya! Thank you for reaching out. Our Gastroenterology department is highly specialised with experienced consultants. Persistent acidity and bloating should definitely be evaluated. How long have you had these symptoms?', time: '10:12 AM' },
            { from: 'patient', text: 'About 4 weeks now. It gets worse after meals especially at night. I have also had some mild nausea.', time: '10:15 AM' },
            { from: 'hospital', text: 'That pattern could indicate acid reflux (GERD) or gastritis. We would recommend an upper endoscopy for a definitive diagnosis. Our GI team is available Monday to Saturday, 9AM–4PM. Shall we book a consultation for you?', time: '10:18 AM' },
            { from: 'patient', text: 'Yes please. Is there anything I should avoid eating before the appointment?', time: '10:20 AM' },
            { from: 'hospital', text: 'For the consultation itself, no specific dietary restrictions are needed. However if an endoscopy is scheduled, you will need to fast for 6–8 hours beforehand. Our team will guide you fully at the time of booking. Your slot is noted — we will confirm shortly! 🙏', time: '10:24 AM' },
        ]
    },
    {
        id: 'demo_pat1', name: 'Aarav Sharma',
        messages: [
            { from: 'patient', text: 'Hello, I have been experiencing high fever and cold for the past 3 days. Should I come in?', time: '9:05 AM' },
            { from: 'hospital', text: 'Hello Aarav! Yes, it would be best to visit us for a proper check-up. Our OPD is open from 9 AM to 5 PM. Please bring your previous medical records if any.', time: '9:18 AM' },
            { from: 'patient', text: 'Thank you! Can I come tomorrow at 10 AM?', time: '9:20 AM' },
            { from: 'hospital', text: 'Absolutely, your appointment is noted for tomorrow 10 AM. Please register at the front desk on arrival. 😊', time: '9:25 AM' },
        ]
    },
    {
        id: 'demo_pat2', name: 'Priya Mehta',
        messages: [
            { from: 'patient', text: 'Hi, I recently had a heart check-up elsewhere and my ECG showed some irregularities. Should I be worried?', time: '11:00 AM' },
            { from: 'hospital', text: 'Hi Priya, ECG irregularities can have various causes. We recommend visiting our Cardiology department for a detailed evaluation. Please bring your ECG report.', time: '11:10 AM' },
            { from: 'patient', text: 'Okay. Are your cardiologists available on weekends?', time: '11:13 AM' },
            { from: 'hospital', text: 'Yes, we have cardiologists available on Saturday from 10 AM to 2 PM. Would you like to book a slot?', time: '11:17 AM' },
            { from: 'patient', text: 'Yes please, Saturday morning would be great!', time: '11:19 AM' },
            { from: 'hospital', text: 'Noted! Your slot is confirmed for Saturday 11:30 AM. See you then! 🙏', time: '11:22 AM' },
        ]
    }
];

let activeDemoPatientId = null;
const demoLocalMessages = {};

async function loadHospQueries() {
    const listEl = document.getElementById('h-chat-list');
    listEl.innerHTML = '';

    DEMO_PATIENTS.forEach((p, idx) => {
        const lastMsg = p.messages[p.messages.length - 1];
        const isHosp = lastMsg.from === 'hospital';
        const item = document.createElement('div');
        item.dataset.pid = p.id;
        item.style.cssText = 'display:flex;align-items:center;gap:12px;padding:14px 16px;cursor:pointer;border-bottom:1px solid var(--gray-light);transition:background .15s';
        item.innerHTML = `
            <div style="width:40px;height:40px;background:var(--patient);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1rem;flex-shrink:0">${p.name.charAt(0)}</div>
            <div style="min-width:0;flex:1">
                <div style="font-weight:600;font-size:.9rem;margin-bottom:2px">${p.name}</div>
                <div style="font-size:.76rem;color:var(--gray);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${isHosp ? '🏥 ' : ''}${lastMsg.text}</div>
            </div>`;
        item.addEventListener('mouseenter', () => {
            if (!item.classList.contains('hq-active')) item.style.background = '#f0f9ff';
        });
        item.addEventListener('mouseleave', () => {
            if (!item.classList.contains('hq-active')) item.style.background = '';
        });
        item.addEventListener('click', () => openHospChat(p.id, p.name, null, true));
        listEl.appendChild(item);
        if (idx === 0) setTimeout(() => item.click(), 100);
    });

    try {
        const raw = await getDocs(collection(db, 'chats'));
        const myChats = raw.docs.filter(d => d.id.includes(CU.uid));
        for (const chatDoc of myChats) {
            const chatId = chatDoc.id;
            const patientId = chatId.split('_').find(id => id !== CU.uid);
            const msgsSnap = await getDocs(collection(db, 'chats', chatId, 'messages'));
            if (!msgsSnap.empty) {
                const sorted = sortDesc(msgsSnap.docs);
                const lastMsg = sorted[0].data();
                const patientName = lastMsg.senderRole === 'patient' ? (lastMsg.senderName || 'Patient') : 'Patient';
                const item = document.createElement('div');
                item.dataset.pid = patientId;
                item.dataset.chatid = chatId;
                item.style.cssText = 'display:flex;align-items:center;gap:12px;padding:14px 16px;cursor:pointer;border-bottom:1px solid var(--gray-light);transition:background .15s';
                item.innerHTML = `
                    <div style="width:40px;height:40px;background:var(--patient);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1rem;flex-shrink:0">${patientName.charAt(0)}</div>
                    <div style="min-width:0;flex:1">
                        <div style="font-weight:600;font-size:.9rem;margin-bottom:2px">${patientName}</div>
                        <div style="font-size:.76rem;color:var(--gray);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${lastMsg.text || ''}</div>
                    </div>`;
                item.addEventListener('click', () => openHospChat(patientId, patientName, chatId, false));
                listEl.appendChild(item);
            }
        }
    } catch (err) { }
}

function openHospChat(patientId, patientName, chatId, isDemo) {
    hospChatPatientId = patientId;

    document.querySelectorAll('#h-chat-list div[data-pid]').forEach(i => {
        i.classList.remove('hq-active');
        i.style.background = '';
    });
    const activeItem = document.querySelector(`#h-chat-list div[data-pid="${patientId}"]`);
    if (activeItem) {
        activeItem.classList.add('hq-active');
        activeItem.style.background = '#eff6ff';
    }

    const hdr = document.getElementById('h-chat-hdr');
    hdr.innerHTML = `
        <div style="width:42px;height:42px;background:var(--patient);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1.1rem">${patientName.charAt(0)}</div>
        <div>
            <strong style="font-size:1rem">${patientName}</strong>
            <div style="font-size:.8rem;color:var(--gray);display:flex;align-items:center;gap:5px"><span style="width:7px;height:7px;background:#10b981;border-radius:50%;display:inline-block"></span> Patient</div>
        </div>`;

    const input = document.getElementById('h-chat-input');
    const sendBtn = document.getElementById('h-btn-send');
    input.disabled = false;
    sendBtn.disabled = false;
    sendBtn.style.opacity = '1';

    const msgs = document.getElementById('h-chat-msgs');

    if (isDemo) {
        activeDemoPatientId = patientId;
        if (hospChatUnsub) {
            hospChatUnsub();
            hospChatUnsub = null;
        }
        const demoP = DEMO_PATIENTS.find(p => p.id === patientId);

        const renderDemoMsgs = () => {
            msgs.innerHTML = '';
            const allMsgs = [...(demoP ? demoP.messages : []), ...(demoLocalMessages[patientId] || [])];
            allMsgs.forEach(m => {
                const isHosp = m.from === 'hospital';
                const wrapper = document.createElement('div');
                wrapper.style.cssText = `display:flex;flex-direction:column;align-items:${isHosp ? 'flex-end' : 'flex-start'}`;
                const bubble = document.createElement('div');
                bubble.style.cssText = `max-width:68%;padding:11px 15px;border-radius:${isHosp ? '18px 18px 4px 18px' : '18px 18px 18px 4px'};font-size:.9rem;line-height:1.5;word-wrap:break-word;${isHosp ? 'background:var(--primary);color:#fff' : 'background:#fff;color:var(--dark);box-shadow:0 1px 4px rgba(0,0,0,.08)'}`;
                bubble.textContent = m.text;
                const time = document.createElement('div');
                time.style.cssText = 'font-size:.72rem;color:var(--gray);margin-top:4px;padding:0 4px';
                time.textContent = m.time || 'Just now';
                wrapper.appendChild(bubble);
                wrapper.appendChild(time);
                msgs.appendChild(wrapper);
            });
            msgs.scrollTop = msgs.scrollHeight;
        };
        renderDemoMsgs();

        sendBtn._demoSend = () => {
            const text = input.value.trim();
            if (!text) return;
            if (!demoLocalMessages[patientId]) demoLocalMessages[patientId] = [];
            const now = new Date();
            const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            demoLocalMessages[patientId].push({ from: 'hospital', text, time });
            input.value = '';
            renderDemoMsgs();
        };
    } else {
        activeDemoPatientId = null;
        sendBtn._demoSend = null;
        if (hospChatUnsub) hospChatUnsub();
        hospChatUnsub = onSnapshot(collection(db, 'chats', chatId, 'messages'), snap => {
            const sorted = sortAsc(snap.docs);
            msgs.innerHTML = '';
            sorted.forEach(d => {
                const m = d.data();
                const isHosp = m.senderId === CU.uid;
                const wrapper = document.createElement('div');
                wrapper.style.cssText = `display:flex;flex-direction:column;align-items:${isHosp ? 'flex-end' : 'flex-start'}`;
                const bubble = document.createElement('div');
                bubble.style.cssText = `max-width:68%;padding:11px 15px;border-radius:${isHosp ? '18px 18px 4px 18px' : '18px 18px 18px 4px'};font-size:.9rem;line-height:1.5;word-wrap:break-word;${isHosp ? 'background:var(--primary);color:#fff' : 'background:#fff;color:var(--dark);box-shadow:0 1px 4px rgba(0,0,0,.08)'}`;
                bubble.textContent = m.text;
                const time = document.createElement('div');
                time.style.cssText = 'font-size:.72rem;color:var(--gray);margin-top:4px;padding:0 4px';
                time.textContent = m.createdAt?.toDate?.().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || 'Just now';
                wrapper.appendChild(bubble);
                wrapper.appendChild(time);
                msgs.appendChild(wrapper);
            });
            msgs.scrollTop = msgs.scrollHeight;
        });
    }
}

async function sendHospMsg() {
    const input = document.getElementById('h-chat-input');
    const text = input.value.trim();
    if (!text || !hospChatPatientId) return;
    
    const demoSend = document.getElementById('h-btn-send')._demoSend;
    if (activeDemoPatientId && demoSend) {
        demoSend();
        return;
    }
    
    const chatId = [CU.uid, hospChatPatientId].sort().join('_');
    input.value = '';
    input.disabled = true;
    try {
        await addDoc(collection(db, 'chats', chatId, 'messages'), {
            text,
            senderId: CU.uid,
            senderName: UD.hospitalName || 'Hospital',
            senderRole: 'hospital',
            createdAt: serverTimestamp()
        });
    } catch (e) {
        toast('Error sending message', 'error');
        console.error(e);
    }
    input.disabled = false;
    input.focus();
}

// Patient hospitals
async function loadHospitals() {
    const grid = document.getElementById('p-hosp-grid');
    grid.innerHTML = '<p style="color:var(--gray)">Loading hospitals...</p>';
    try {
        const snap = await getDocs(collection(db, 'users'));
        allHospitals = [];
        snap.forEach(d => {
            const dat = d.data();
            if (dat.role === 'hospital' && dat.verified) allHospitals.push({ id: d.id, ...dat });
        });
        MOCK_HOSPITALS.forEach(m => {
            if (!allHospitals.find(h => h.id === m.id)) allHospitals.push(m);
        });
        renderHospCards(allHospitals);
        fillHospSelect();
    } catch (err) {
        allHospitals = [...MOCK_HOSPITALS];
        renderHospCards(allHospitals);
        fillHospSelect();
    }
}

function isGangaRam(name) {
    if (!name) return false;
    const n = name.toLowerCase().replace(/[^a-z ]/g, '');
    return /gang[ar]+\s*ram/.test(n);
}

function starsHtml(n, size = '') {
    const full = Math.floor(n);
    const half = n % 1 >= 0.5;
    let h = '';
    for (let i = 0; i < 5; i++) {
        if (i < full) h += '<i class="fas fa-star"></i>';
        else if (i === full && half) h += '<i class="fas fa-star-half-alt"></i>';
        else h += '<i class="far fa-star"></i>';
    }
    return `<span class="stars" style="${size ? 'font-size:' + size : ''}">${h}</span>`;
}

// Complete MOCK_REVIEWS for all hospitals
const MOCK_REVIEWS = {
    'mock_7': {
        avg: 4.6, total: 312, dist: [5, 4, 3, 2, 1], pct: [62, 22, 10, 4, 2], reviews: [
            { name: 'Priya S.', date: 'Jan 2025', stars: 5, text: 'Excellent cardiology team! Dr. Kulkarni was extremely thorough and patient. The facilities are world-class and the nursing staff very attentive.' },
            { name: 'Rahul M.', date: 'Dec 2024', stars: 4, text: 'Good experience overall. Clean rooms, responsive staff. Waiting time at OPD could be improved but quality of care is top-notch.' },
            { name: 'Anjali K.', date: 'Nov 2024', stars: 5, text: 'My mother was admitted for a nephrology case. The doctors explained everything clearly. Discharge process was smooth. Highly recommend Ruby Hall.' },
        ]
    },
    'mock_8': {
        avg: 4.5, total: 278, dist: [5, 4, 3, 2, 1], pct: [58, 26, 10, 4, 2], reviews: [
            { name: 'Suresh P.', date: 'Feb 2025', stars: 5, text: 'Sahyadri\'s cancer care unit is outstanding. The oncology team gave my father the best possible treatment with full emotional support.' },
            { name: 'Meena R.', date: 'Jan 2025', stars: 4, text: 'Very professional staff and well-maintained hospital. Neurology department is excellent. Billing was transparent with no hidden charges.' },
            { name: 'Vikas D.', date: 'Dec 2024', stars: 5, text: 'Got bone marrow transplant done here. The BMT unit is state-of-the-art. The care and follow-up from the team throughout was remarkable.' },
        ]
    },
    'mock_9': {
        avg: 4.3, total: 195, dist: [5, 4, 3, 2, 1], pct: [48, 30, 14, 5, 3], reviews: [
            { name: 'Kavita N.', date: 'Jan 2025', stars: 4, text: 'Good orthopedic services. My knee surgery went smoothly. Physiotherapy post-surgery was well-structured. Would recommend for joint issues.' },
            { name: 'Arun T.', date: 'Dec 2024', stars: 5, text: 'Jehangir has been my family\'s go-to hospital for decades. The legacy of trust continues. ICU care during my father\'s emergency was exceptional.' },
            { name: 'Pooja L.', date: 'Nov 2024', stars: 4, text: 'Gynecology department is well-equipped. Doctors are knowledgeable and caring. The hospital could work on reducing OPD waiting times.' },
        ]
    },
    'mock_10': {
        avg: 4.8, total: 401, dist: [5, 4, 3, 2, 1], pct: [74, 18, 5, 2, 1], reviews: [
            { name: 'Deepa M.', date: 'Feb 2025', stars: 5, text: 'Best hospital in Pune for cardiac care. My husband\'s bypass surgery was performed flawlessly. The ICU nurses were incredible — caring and professional.' },
            { name: 'Sanjay K.', date: 'Jan 2025', stars: 5, text: 'Liver transplant done successfully here. The multi-disciplinary team coordination was seamless. Dr. Nagral and team gave us our life back. Forever grateful.' },
            { name: 'Ritu B.', date: 'Dec 2024', stars: 4, text: 'Paediatrics ward is excellent. Doctors are very patient with children. Hospital is clean and spacious. Slightly expensive but worth every rupee.' },
        ]
    },
    'mock_1': {
        avg: 4.7, total: 1240, dist: [5, 4, 3, 2, 1], pct: [68, 20, 8, 3, 1], reviews: [
            { name: 'Nisha G.', date: 'Feb 2025', stars: 5, text: 'Apollo Delhi is a world-class facility. The neurology team handled my father\'s stroke with incredible speed and expertise. He made a full recovery.' },
            { name: 'Karan J.', date: 'Jan 2025', stars: 5, text: 'Outstanding oncology department. Transparent about treatment options, costs, and prognosis. Felt supported throughout the entire cancer treatment journey.' },
            { name: 'Shalini V.', date: 'Dec 2024', stars: 4, text: 'Very professional and organized. International patients wing is excellent. Slightly long wait at OPD but the quality of specialists makes it worth it.' },
        ]
    },
    'mock_2': {
        avg: 4.5, total: 890, dist: [5, 4, 3, 2, 1], pct: [57, 25, 11, 5, 2], reviews: [
            { name: 'Amit S.', date: 'Jan 2025', stars: 5, text: 'Robotic knee surgery at Fortis was a game-changer. Recovery was much faster than expected. The orthopedic team is simply the best in the country.' },
            { name: 'Ravi P.', date: 'Dec 2024', stars: 4, text: 'Great transplant team. My cousin\'s kidney transplant was handled with care and precision. Post-op support and follow-up care has been consistent.' },
            { name: 'Leena H.', date: 'Nov 2024', stars: 4, text: 'Fortis Gurugram is well-equipped and modern. Staff is courteous. Pharmacy and lab services within the campus are very convenient.' },
        ]
    },
    'mock_3': {
        avg: 4.2, total: 2100, dist: [5, 4, 3, 2, 1], pct: [45, 28, 16, 7, 4], reviews: [
            { name: 'Rohan D.', date: 'Feb 2025', stars: 5, text: 'AIIMS remains unmatched for expertise. Despite being crowded, the quality of doctors is unparalleled. Got a rare diagnosis here after years of struggle.' },
            { name: 'Geeta R.', date: 'Jan 2025', stars: 4, text: 'As a public hospital, AIIMS delivers exceptional medical care at minimal cost. Waiting can be challenging but the treatment outcome is outstanding.' },
            { name: 'Manoj T.', date: 'Dec 2024', stars: 3, text: 'Good medical team but the OPD system is very crowded. It took half the day to get a consultation. If you have patience, the care is worth it.' },
        ]
    },
    'mock_4': {
        avg: 4.6, total: 760, dist: [5, 4, 3, 2, 1], pct: [63, 22, 10, 3, 2], reviews: [
            { name: 'Smita C.', date: 'Feb 2025', stars: 5, text: 'Max Saket\'s paediatric cardiac team saved my son\'s life. They are genuinely compassionate and technically brilliant. Forever indebted to them.' },
            { name: 'Vikram N.', date: 'Jan 2025', stars: 5, text: 'Cancer care at Max is top-tier. The multidisciplinary approach, personalized treatment plan, and emotional support made a tough journey manageable.' },
            { name: 'Anita R.', date: 'Nov 2024', stars: 4, text: 'Good hospital with excellent infrastructure. The nurses are very helpful. Billing clarity and insurance desk could be a bit more efficient.' },
        ]
    },
    'mock_5': {
        avg: 4.7, total: 1050, dist: [5, 4, 3, 2, 1], pct: [66, 21, 8, 3, 2], reviews: [
            { name: 'Prakash K.', date: 'Feb 2025', stars: 5, text: 'Medanta\'s heart institute is phenomenal. My bypass surgery went perfectly. The cardiologists are world-trained and the ICU care was 24/7 attentive.' },
            { name: 'Sunita B.', date: 'Jan 2025', stars: 5, text: 'Liver transplant team at Medanta is extraordinary. Everything from pre-op evaluation to post-discharge follow-up was handled with great professionalism.' },
            { name: 'Harish M.', date: 'Dec 2024', stars: 4, text: 'Superb facilities and talented doctors. The hospital campus is huge and very well-organized. Room service and food quality is also commendable.' },
        ]
    },
    'mock_6': {
        avg: 4.6, total: 874, dist: [5, 4, 3, 2, 1], pct: [61, 23, 10, 4, 2], reviews: [
            { name: 'Aarav M.', date: 'Feb 2025', stars: 5, text: 'Sir Ganga Ram is truly world-class. My father had a complex cardiac procedure and the team was exceptional — knowledgeable, compassionate, and thorough throughout.' },
            { name: 'Sunita K.', date: 'Jan 2025', stars: 5, text: 'The neurology department here is outstanding. Got a diagnosis after visiting multiple hospitals with no result. The doctors really listen and explain everything clearly.' },
            { name: 'Ramesh B.', date: 'Dec 2024', stars: 4, text: 'Very good hospital with experienced specialists. Gastroenterology unit handled my treatment with care. OPD can get busy but the clinical quality is top-notch.' },
        ]
    }
};

function reviewsHtml(hid, hname) {
    let rd = MOCK_REVIEWS[hid];
    
    // If no reviews found for this hospital ID, check if it's Ganga Ram
    if (!rd && isGangaRam(hname)) {
        rd = MOCK_REVIEWS['mock_6']; // Use mock_6 reviews for Ganga Ram
    }
    
    // If still no reviews, create default reviews
    if (!rd) {
        rd = {
            avg: 4.5, total: 100, dist: [5, 4, 3, 2, 1], pct: [50, 30, 10, 5, 5], reviews: [
                { name: 'Patient 1', date: 'Feb 2025', stars: 5, text: 'Excellent hospital with great facilities and caring staff.' },
                { name: 'Patient 2', date: 'Jan 2025', stars: 4, text: 'Good experience overall. Would recommend.' },
                { name: 'Patient 3', date: 'Dec 2024', stars: 5, text: 'Top-notch medical care and professional doctors.' },
            ]
        };
    }
    
    // Create rating bars
    const bars = rd.dist.map((star, i) => `
        <div class="rating-bar-row">
            <span>${star}★</span>
            <div class="rating-bar-bg"><div class="rating-bar-fill" style="width:${rd.pct[i]}%"></div></div>
            <span>${rd.pct[i]}%</span>
        </div>`).join('');
    
    // Create review items
    const items = rd.reviews.map(r => `
        <div class="review-item">
            <div class="review-top">
                <div class="review-avatar">${r.name.charAt(0)}</div>
                <div>
                    <div class="review-name">${r.name}</div>
                    <div class="review-stars">${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</div>
                </div>
                <div class="review-date">${r.date}</div>
            </div>
            <div class="review-text">${r.text}</div>
        </div>`).join('');
    
    return `
        <div class="reviews-section">
            <div class="reviews-summary">
                <div>
                    <div class="rating-big">${rd.avg}</div>
                    <div>${starsHtml(rd.avg)}</div>
                    <div class="rating-meta">${rd.total.toLocaleString()} reviews</div>
                </div>
                <div class="rating-bar-wrap">${bars}</div>
            </div>
            <button class="btn-toggle-reviews" data-hid="${hid}"><i class="fas fa-chevron-down"></i> Show reviews</button>
            <div class="reviews-list" id="rev-${hid}">${items}</div>
        </div>`;
}

function renderHospCards(list) {
    const grid = document.getElementById('p-hosp-grid');
    const filtered = list
        .filter(h => !(h.hospitalName || h.name || '').toLowerCase().includes('sunflower'))
        .filter(h => !(h.hospitalName || h.name || '').toLowerCase().includes('mjm'));
    
    if (!filtered.length) {
        grid.innerHTML = '<div class="card" style="text-align:center"><p>No verified hospitals found.</p></div>';
        return;
    }
    
    grid.innerHTML = '';
    filtered.forEach(h => {
        const card = document.createElement('div');
        card.className = 'hosp-card';
        card.innerHTML = `
            <div class="hosp-card-avatar">${(h.hospitalName || 'H').charAt(0)}</div>
            <div class="hosp-card-body">
                <div class="hosp-hdr">
                    <strong style="font-size:1.05rem">${h.hospitalName || h.name || 'Hospital'}</strong>
                    <span class="verified-badge"><i class="fas fa-check-circle"></i> Verified</span>
                </div>
                <div class="hosp-card-meta">
                    <span class="info-row" style="margin:0"><i class="fas fa-map-marker-alt"></i><span>${h.address || 'N/A'}</span></span>
                    <span class="info-row" style="margin:0"><i class="fas fa-stethoscope"></i><span>${h.specialties || 'N/A'}</span></span>
                    <span class="info-row" style="margin:0"><i class="fas fa-clock"></i><span>${h.hours || 'N/A'}</span></span>
                    ${h.contact ? `<span class="info-row" style="margin:0"><i class="fas fa-phone"></i><span>${h.contact}</span></span>` : ''}
                </div>
                ${h.description ? `<p style="color:var(--gray);font-size:.83rem;margin-bottom:0">${h.description}</p>` : ''}
                ${reviewsHtml(h.id, h.hospitalName || h.name || '')}
                <div class="hosp-card-actions">
                    <button class="btn btn-primary btn-sm hc-book"><i class="fas fa-calendar-plus"></i> Book</button>
                    <button class="btn btn-outline btn-sm hc-query"><i class="fas fa-comment"></i> Query</button>
                    ${h.contact ? `<a href="tel:${h.contact}" class="btn btn-outline btn-sm"><i class="fas fa-phone"></i> Call</a>` : ''}
                    <button class="btn btn-outline btn-sm hc-location"><i class="fas fa-map-marker-alt"></i> Location</button>
                </div>
            </div>`;
        grid.appendChild(card);
        
        card.querySelector('.hc-book').addEventListener('click', () => {
            document.getElementById('book-hosp').value = h.id;
            switchTab('patient', 'p-booking');
        });
        
        card.querySelector('.hc-query').addEventListener('click', () => {
            switchTab('patient', 'p-queries');
            setTimeout(() => openChat(h.id, h.hospitalName || h.name), 400);
        });
        
        card.querySelector('.hc-location').addEventListener('click', () => openMapModal(h.hospitalName || h.name, h.address || '', h.city || ''));
        
        const toggleBtn = card.querySelector('.btn-toggle-reviews');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                const list = document.getElementById(`rev-${h.id}`);
                if (list) {
                    const isOpen = list.classList.toggle('open');
                    toggleBtn.innerHTML = isOpen
                        ? '<i class="fas fa-chevron-up"></i> Hide reviews'
                        : '<i class="fas fa-chevron-down"></i> Show reviews';
                }
            });
        }
    });
}

function fillHospSelect() {
    const sel = document.getElementById('book-hosp');
    const cur = sel.value;
    sel.innerHTML = '<option value="">-- Select Hospital --</option>';
    allHospitals.forEach(h => {
        const o = document.createElement('option');
        o.value = h.id;
        o.textContent = h.hospitalName || h.name;
        sel.appendChild(o);
    });
    if (cur) sel.value = cur;
}

// Patient appointments
async function loadMyAppts() {
    const el = document.getElementById('my-appts-list');
    el.innerHTML = '<p style="color:var(--gray)">Loading...</p>';
    try {
        const raw = await getDocs(collection(db, 'appointments'));
        const snap = sortDesc(raw.docs.filter(d => d.data().patientId === CU.uid));
        if (!snap.length) {
            el.innerHTML = '<p style="color:var(--gray)">No appointments yet.</p>';
            return;
        }
        el.innerHTML = '';
        snap.forEach(d => {
            const a = d.data();
            const div = document.createElement('div');
            div.className = 'appt-item';
            const sc = a.status === 'confirmed' ? 'confirmed' : a.status === 'rejected' ? 'rejected' : a.status === 'completed' ? 'verified' : 'pending';
            div.innerHTML = `
                <div><strong>${a.hospitalName || 'Hospital'}</strong>
                <div style="color:var(--gray);font-size:.85rem">${a.purpose} · ${a.date || ''} at ${a.timeSlot || ''}</div>
                ${a.notes ? `<div style="color:var(--gray);font-size:.82rem">${a.notes}</div>` : ''}</div>
                <span class="status ${sc}">${a.status || 'pending'}</span>`;
            el.appendChild(div);
        });
    } catch (e) {
        el.innerHTML = '<p style="color:var(--danger)">Error loading.</p>';
    }
}

// Patient chat
function isMockHospital(hid) {
    return String(hid).startsWith('mock_');
}

const MOCK_CONVERSATIONS = {
    'mock_7': [
        { role: 'hospital', text: '👋 Hello! Welcome to Ruby Hall Clinic. How can we assist you today?', time: '9:02 AM' },
        { role: 'patient', text: 'Hi, I would like to know about your cardiology department and appointment availability.', time: '9:05 AM' },
        { role: 'hospital', text: 'Our Cardiology department is one of the best in Pune with a team of 12 senior cardiologists. Appointments are available Monday–Saturday, 10AM–4PM. Would you like to book one?', time: '9:06 AM' },
    ],
    'mock_8': [
        { role: 'hospital', text: '👋 Welcome to Sahyadri Super Speciality Hospital! How may we help you?', time: '10:15 AM' },
        { role: 'patient', text: 'I need information about bone marrow transplant procedures at your hospital.', time: '10:18 AM' },
        { role: 'hospital', text: 'Sahyadri has a dedicated BMT unit with state-of-the-art isolation wards and an experienced haematology team. We perform both autologous and allogeneic transplants.', time: '10:19 AM' },
    ]
};

function openChat(hid, hname) {
    chatHospId = hid;
    document.querySelectorAll('#p-chat-list .chat-item').forEach(i => i.classList.remove('active'));
    const activeItem = document.querySelector(`#p-chat-list .chat-item[data-hid="${hid}"]`);
    if (activeItem) activeItem.classList.add('active');
    
    document.getElementById('p-chat-hdr').innerHTML = `
        <div class="avatar" style="background:var(--primary)">${hname.charAt(0)}</div>
        <div><strong>${hname}</strong><div style="font-size:.82rem;color:var(--gray)">${isMockHospital(hid) ? 'Verified Hospital · Demo' : 'Verified Hospital'}</div></div>`;
    
    document.getElementById('p-chat-input').disabled = false;
    document.getElementById('btn-send-msg').disabled = false;
    
    const msgs = document.getElementById('p-chat-msgs');
    msgs.innerHTML = '';

    const treatAsMock = isMockHospital(hid) || isGangaRam(hname);
    const mockKey = isGangaRam(hname) ? 'mock_6' : hid;

    if (treatAsMock) {
        if (chatUnsub) {
            chatUnsub();
            chatUnsub = null;
        }
        const key = `chat_${CU.uid}_${hid}`;
        const stored = JSON.parse(sessionStorage.getItem(key) || 'null');
        if (stored) {
            stored.forEach(m => appendMsg(msgs, m.text, m.role === 'patient', m.time));
        } else {
            const preMsgs = MOCK_CONVERSATIONS[mockKey] || [
                { role: 'hospital', text: '👋 Hello! Welcome. How can we help you today?', time: '9:00 AM' }
            ];
            preMsgs.forEach(m => appendMsg(msgs, m.text, m.role === 'patient', m.time));
            sessionStorage.setItem(key, JSON.stringify(preMsgs));
        }
        msgs.scrollTop = msgs.scrollHeight;
    } else {
        if (chatUnsub) chatUnsub();
        const chatId = [CU.uid, hid].sort().join('_');
        chatUnsub = onSnapshot(collection(db, 'chats', chatId, 'messages'), snap => {
            const sorted = sortAsc(snap.docs);
            msgs.innerHTML = '';
            sorted.forEach(d => {
                const m = d.data();
                appendMsg(msgs, m.text, m.senderId === CU.uid, m.createdAt?.toDate?.().toLocaleTimeString() || 'Just now');
            });
            msgs.scrollTop = msgs.scrollHeight;
        });
    }
}

function appendMsg(container, text, isSent, time) {
    const div = document.createElement('div');
    div.className = `msg ${isSent ? 'sent' : 'recv'}`;
    div.innerHTML = `<div>${text}</div><div class="msg-time">${time || new Date().toLocaleTimeString()}</div>`;
    container.appendChild(div);
}

async function sendMsg() {
    const input = document.getElementById('p-chat-input');
    const text = input.value.trim();
    if (!text || !chatHospId) return;
    input.value = '';
    
    const msgs = document.getElementById('p-chat-msgs');
    const now = new Date().toLocaleTimeString();

    if (isMockHospital(chatHospId)) {
        appendMsg(msgs, text, true, now);
        msgs.scrollTop = msgs.scrollHeight;
        
        const key = `chat_${CU.uid}_${chatHospId}`;
        const stored = JSON.parse(sessionStorage.getItem(key) || '[]');
        stored.push({ text, role: 'patient', time: now });
        
        input.disabled = true;
        setTimeout(() => {
            const reply = MOCK_REPLIES[Math.floor(Math.random() * MOCK_REPLIES.length)];
            const replyTime = new Date().toLocaleTimeString();
            appendMsg(msgs, reply, false, replyTime);
            msgs.scrollTop = msgs.scrollHeight;
            stored.push({ text: reply, role: 'hospital', time: replyTime });
            sessionStorage.setItem(key, JSON.stringify(stored));
            input.disabled = false;
            input.focus();
        }, 1200);
    } else {
        input.disabled = true;
        const chatId = [CU.uid, chatHospId].sort().join('_');
        try {
            await addDoc(collection(db, 'chats', chatId, 'messages'), {
                text,
                senderId: CU.uid,
                senderName: UD.name || 'Patient',
                senderRole: 'patient',
                createdAt: serverTimestamp()
            });
        } catch (e) {
            toast('Error sending message', 'error');
            console.error(e);
        }
        input.disabled = false;
        input.focus();
    }
}

async function loadChatList() {
    if (!allHospitals.length) await loadHospitals();
    const el = document.getElementById('p-chat-list');
    el.innerHTML = '';
    
    const list = allHospitals
        .filter(h => !(h.hospitalName || h.name || '').toLowerCase().includes('sunflower'))
        .filter(h => !(h.hospitalName || h.name || '').toLowerCase().includes('mjm'));
    
    if (!list.length) {
        el.innerHTML = '<p style="padding:14px;color:var(--gray)">No hospitals available.</p>';
        return;
    }
    
    list.forEach(h => {
        const item = document.createElement('div');
        item.className = 'chat-item';
        item.dataset.hid = h.id;
        item.innerHTML = `
            <div class="avatar" style="background:var(--primary)">${(h.hospitalName || 'H').charAt(0)}</div>
            <div>
                <strong style="font-size:.9rem">${h.hospitalName || h.name}</strong>
                <div style="font-size:.78rem;color:var(--gray)">${h.specialties || 'Tap to message'}</div>
            </div>`;
        item.addEventListener('click', () => openChat(h.id, h.hospitalName || h.name));
        el.appendChild(item);
    });
}

// Medicine ordering
let medStep = 'idle', medPayment = null, medHospId = null, medHospName = null, medMedicines = null;

function medAddBot(html) {
    const area = document.getElementById('med-msgs');
    setTimeout(() => {
        area.innerHTML += `<div class="med-bubble">${html}</div><div class="med-meta">MedBot · just now</div>`;
        area.scrollTop = area.scrollHeight;
    }, 300);
}

function medAddUser(text) {
    const area = document.getElementById('med-msgs');
    area.innerHTML += `<div class="med-bubble user">${text}</div><div class="med-meta user">You · just now</div>`;
    area.scrollTop = area.scrollHeight;
}

function medReset() {
    document.getElementById('med-msgs').innerHTML = '<div class="med-bubble">👋 Click <strong>+</strong> to upload a prescription, or type medicine names directly.</div><div class="med-meta">MedBot · just now</div>';
    medStep = 'idle';
    medPayment = null;
    medHospId = null;
    medHospName = null;
    medMedicines = null;
    
    const area = document.getElementById('med-msgs');
    if (area._hospHandler) {
        area.removeEventListener('click', area._hospHandler);
        area._hospHandler = null;
    }
    if (area._payHandler) {
        area.removeEventListener('click', area._payHandler);
        area._payHandler = null;
    }
    if (area._addrHandler) {
        area.removeEventListener('click', area._addrHandler);
        area._addrHandler = null;
    }
}

function buildHospSelectHTML() {
    if (!allHospitals.length) return '<p style="color:#617e99;margin-top:8px">No hospitals available. Please visit the Hospitals tab first.</p>';
    let opts = allHospitals.map(h => `<option value="${h.id}">${h.hospitalName || h.name}</option>`).join('');
    return `<div class="hosp-sel-area" style="margin-top:10px">
        <p style="margin-bottom:8px;font-weight:500">🏥 Select Hospital/Pharmacy to deliver from:</p>
        <select id="med-hosp-sel"><option value="">-- Choose Hospital --</option>${opts}</select>
        <button class="addr-submit" id="med-hosp-confirm">Confirm Hospital ✅</button>
    </div>`;
}

function medHandleUpload(file, src) {
    if (!file) return;
    if (medStep !== 'idle') {
        medAddBot('Please reset the current order first.');
        return;
    }
    medAddUser(`📎 Uploaded from ${src}: ${file.name}`);
    medMedicines = file.name;
    medAddBot('🔍 Scanning prescription...');
    setTimeout(() => {
        medAddBot(`<div class="rx-preview"><div class="rx-icon">📋</div><div><strong>✅ Scanned</strong><br><small>Amoxicillin 500mg · Paracetamol 650mg · Vitamin D3</small></div></div>${buildHospSelectHTML()}`);
        medStep = 'hospital';
        setTimeout(attachHospListener, 100);
    }, 900);
}

function medHandleText(text) {
    if (medStep !== 'idle') {
        medAddUser(text);
        medAddBot('Reset order first to start a new one.');
        return;
    }
    medAddUser(text);
    medMedicines = text;
    medAddBot(`📝 Processing: <em>${text}</em>`);
    setTimeout(() => {
        medAddBot(`<div class="rx-preview"><div class="rx-icon">📝</div><div><strong>✅ Noted</strong><br><small>${text.substring(0, 40)}${text.length > 40 ? '…' : ''}</small></div></div>${buildHospSelectHTML()}`);
        medStep = 'hospital';
        setTimeout(attachHospListener, 100);
    }, 700);
}

function attachHospListener() {
    const area = document.getElementById('med-msgs');
    if (area._hospHandler) area.removeEventListener('click', area._hospHandler);
    area._hospHandler = function(e) {
        const btn = e.target.closest('#med-hosp-confirm');
        if (!btn) return;
        if (medStep !== 'hospital') return;
        const sel = document.getElementById('med-hosp-sel');
        if (!sel || !sel.value) {
            toast('Please select a hospital', 'error');
            return;
        }
        medHospId = sel.value;
        medHospName = allHospitals.find(h => h.id === sel.value)?.hospitalName ||
            allHospitals.find(h => h.id === sel.value)?.name || 'Hospital';
        area.removeEventListener('click', area._hospHandler);
        medAddUser(`🏥 ${medHospName}`);
        medStep = 'payment';
        medAddBot(`<p style="font-weight:500;margin-bottom:6px">Choose payment method:</p>
            <div class="pay-btns"><button class="pay-btn" id="pay-online">💳 Online</button><button class="pay-btn" id="pay-cod">💵 Cash on Delivery</button></div>`);
        setTimeout(attachPayListeners, 100);
    };
    area.addEventListener('click', area._hospHandler);
}

function attachPayListeners() {
    const area = document.getElementById('med-msgs');
    if (area._payHandler) area.removeEventListener('click', area._payHandler);
    area._payHandler = function(e) {
        const btn = e.target.closest('#pay-online, #pay-cod');
        if (!btn) return;
        if (medStep !== 'payment') return;
        area.removeEventListener('click', area._payHandler);
        selectPay(btn.id === 'pay-online' ? 'online' : 'cod');
    };
    area.addEventListener('click', area._payHandler);
}

function selectPay(method) {
    medPayment = method;
    medAddUser(method === 'online' ? '💳 Online payment' : '💵 Cash on Delivery');
    medStep = 'address';
    medAddBot(`<div>${method === 'online' ? '💳 Transfer ₹349 to <strong>medstore@okhdfcbank</strong> (demo)<br>' : '✅ Cash on delivery selected.<br>'}Enter delivery address:</div>
        <div class="addr-area"><textarea id="med-addr" class="addr-field" rows="3" placeholder="House no, street, city, pincode..."></textarea><button class="addr-submit" id="med-addr-btn">✅ Place Order</button></div>`);
    
    const area = document.getElementById('med-msgs');
    if (area._addrHandler) area.removeEventListener('click', area._addrHandler);
    area._addrHandler = function(e) {
        const btn = e.target.closest('#med-addr-btn');
        if (!btn) return;
        if (medStep !== 'address') return;
        const addr = document.getElementById('med-addr')?.value.trim();
        if (!addr) {
            toast('Enter delivery address', 'error');
            return;
        }
        area.removeEventListener('click', area._addrHandler);
        placeOrder(addr);
    };
    area.addEventListener('click', area._addrHandler);
}

async function placeOrder(address) {
    if (medStep !== 'address') return;
    medAddUser(`📍 ${address}`);
    medStep = 'placing';
    spin(true);
    try {
        await addDoc(collection(db, 'medicine_orders'), {
            patientId: CU.uid,
            patientName: UD.name || 'Patient',
            patientEmail: CU.email || '',
            hospitalId: medHospId,
            hospitalName: medHospName,
            medicines: medMedicines || 'See prescription',
            address,
            payment: medPayment,
            status: 'placed',
            createdAt: serverTimestamp()
        });
        medAddBot(`🎉 <strong>Order Placed!</strong><br><br>🏥 Hospital: <strong>${medHospName}</strong><br>📦 Delivering to: <span style="background:#eaf3fc;padding:3px 10px;border-radius:10px">${address}</span><br>💰 Payment: ${medPayment === 'online' ? 'Online' : 'Cash on Delivery'}<br>🚚 Estimated delivery: 2–3 hours.<br><br>🙏 Thank you!`);
        medStep = 'done';
    } catch (e) {
        toast('Error placing order. Please try again.', 'error');
        medStep = 'address';
        console.error(e);
    }
    spin(false);
}

// Map modal
window.openMapModal = function openMapModal(name, address, city) {
    const query = encodeURIComponent(name + ' ' + address);
    document.getElementById('map-modal-name').textContent = name;
    document.getElementById('map-modal-addr').textContent = address;
    document.getElementById('map-modal-link').href = `https://www.google.com/maps/search/?api=1&query=${query}`;
    document.getElementById('map-modal-directions').href = `https://www.google.com/maps/dir/?api=1&destination=${query}`;
    document.getElementById('map-modal-iframe').src = `https://maps.google.com/maps?q=${query}&output=embed&z=15`;
    const modal = document.getElementById('map-modal');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeMapModal() {
    const modal = document.getElementById('map-modal');
    modal.style.display = 'none';
    document.getElementById('map-modal-iframe').src = '';
    document.body.style.overflow = '';
}

// OTP verification
window.openPhoneVerifyModal = function() {
    const modal = document.getElementById('phone-verify-modal');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('otp-phone-input').focus(), 100);
}

window.closePhoneVerifyModal = function() {
    document.getElementById('phone-verify-modal').style.display = 'none';
    document.body.style.overflow = '';
}

window.sendOTP = function() {
    const phone = document.getElementById('otp-phone-input').value.trim();
    const errEl = document.getElementById('otp-send-error');
    const errSpan = errEl.querySelector('span');
    errEl.style.display = 'none';

    if (!/^[6-9]\d{9}$/.test(phone)) {
        errSpan.textContent = 'Please enter a valid 10-digit Indian mobile number.';
        errEl.style.display = 'flex';
        document.getElementById('modal-phone-wrap').style.borderColor = 'var(--danger)';
        setTimeout(() => document.getElementById('modal-phone-wrap').style.borderColor = 'var(--gray-light)', 1500);
        return;
    }

    _generatedOTP = String(Math.floor(100000 + Math.random() * 900000));
    document.getElementById('otp-sent-to').textContent = '+91 ' + phone.replace(/(\d{5})(\d{5})/, '$1 $2');
    document.getElementById('demo-otp-display').textContent = _generatedOTP;

    document.getElementById('modal-step-phone').style.display = 'none';
    document.getElementById('modal-step-otp').style.display = 'block';

    const hi = document.getElementById('otp-hidden-input');
    hi.value = '';
    syncOTPBoxes('');
    startResendTimer(30);
    setTimeout(() => hi.focus(), 80);
    toast('OTP sent!', 'success');
}

window.syncOTPBoxes = function(val) {
    const digits = val.replace(/\D/g, '').slice(0, 6);
    document.getElementById('otp-hidden-input').value = digits;
    for (let i = 0; i < 6; i++) {
        const box = document.getElementById('vbox-' + i);
        box.classList.remove('filled', 'active', 'error', 'dot');
        if (digits[i]) {
            box.textContent = digits[i];
            box.classList.add('filled');
        } else {
            box.textContent = '·';
            box.classList.add('dot');
            if (i === digits.length) box.classList.add('active');
        }
    }
    document.getElementById('otp-verify-error').style.display = 'none';
}

window.otpKeyDown = function(e) {
    if (e.key === 'Enter') verifyOTP();
}

window.verifyOTP = function() {
    const entered = document.getElementById('otp-hidden-input').value;
    const errEl = document.getElementById('otp-verify-error');
    const errSpan = errEl.querySelector('span');

    const shake = () => {
        const wrap = document.getElementById('otp-boxes-wrap');
        wrap.style.animation = 'otpShake .4s ease';
        setTimeout(() => wrap.style.animation = '', 450);
    };

    if (entered.length < 6) {
        errSpan.textContent = 'Please enter all 6 digits.';
        errEl.style.display = 'flex';
        shake();
        return;
    }

    if (entered !== _generatedOTP) {
        errSpan.textContent = 'Incorrect OTP. Please try again.';
        errEl.style.display = 'flex';
        for (let i = 0; i < 6; i++) {
            const box = document.getElementById('vbox-' + i);
            box.classList.remove('filled', 'active', 'dot');
            box.classList.add('error');
        }
        shake();
        setTimeout(() => {
            document.getElementById('otp-hidden-input').value = '';
            syncOTPBoxes('');
            document.getElementById('otp-hidden-input').focus();
        }, 700);
        return;
    }

    errEl.style.display = 'none';
    const phoneRaw = document.getElementById('otp-phone-input').value;
    document.getElementById('otp-verified-number').textContent = '+91 ' + phoneRaw.replace(/(\d{5})(\d{5})/, '$1 $2');
    document.getElementById('modal-step-otp').style.display = 'none';
    document.getElementById('modal-step-success').style.display = 'block';
    document.getElementById('phone-verified-badge-inline').style.display = 'inline-flex';
    document.getElementById('phone-unverified-badge-inline').style.display = 'none';

    if (_resendInterval) clearInterval(_resendInterval);
    toast('Phone number verified! ✅', 'success');
}

window.resendOTP = function() {
    _generatedOTP = String(Math.floor(100000 + Math.random() * 900000));
    document.getElementById('demo-otp-display').textContent = _generatedOTP;
    document.getElementById('otp-hidden-input').value = '';
    syncOTPBoxes('');
    document.getElementById('otp-verify-error').style.display = 'none';
    document.getElementById('otp-hidden-input').focus();
    startResendTimer(30);
    toast('OTP resent!', 'success');
}

window.resetOTPFlow = function() {
    if (_resendInterval) clearInterval(_resendInterval);
    document.getElementById('modal-step-phone').style.display = 'block';
    document.getElementById('modal-step-otp').style.display = 'none';
    document.getElementById('modal-step-success').style.display = 'none';
    document.getElementById('otp-send-error').style.display = 'none';
    document.getElementById('otp-phone-input').value = '';
    _generatedOTP = '';
    setTimeout(() => document.getElementById('otp-phone-input').focus(), 80);
}

function startResendTimer(seconds) {
    const btn = document.getElementById('btn-resend-otp');
    const timerEl = document.getElementById('resend-timer');
    btn.disabled = true;
    if (_resendInterval) clearInterval(_resendInterval);
    let remaining = seconds;
    timerEl.textContent = `(${remaining}s)`;
    _resendInterval = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
            clearInterval(_resendInterval);
            timerEl.textContent = '';
            btn.disabled = false;
        } else {
            timerEl.textContent = `(${remaining}s)`;
        }
    }, 1000);
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Auth tabs
    document.getElementById('tab-login').addEventListener('click', () => {
        document.getElementById('tab-login').classList.add('active');
        document.getElementById('tab-signup').classList.remove('active');
        document.getElementById('form-login').classList.add('active');
        document.getElementById('form-signup').classList.remove('active');
    });

    document.getElementById('tab-signup').addEventListener('click', () => {
        document.getElementById('tab-signup').classList.add('active');
        document.getElementById('tab-login').classList.remove('active');
        document.getElementById('form-signup').classList.add('active');
        document.getElementById('form-login').classList.remove('active');
    });

    // Signup role change
    document.getElementById('su-role').addEventListener('change', function() {
        document.getElementById('su-hosp-fields').classList.toggle('hidden', this.value !== 'hospital');
        document.getElementById('su-pat-fields').classList.toggle('hidden', this.value !== 'patient');
    });

    // Signup form
    document.getElementById('form-signup').addEventListener('submit', async e => {
        e.preventDefault();
        const email = document.getElementById('su-email').value.trim();
        const password = document.getElementById('su-password').value;
        const role = document.getElementById('su-role').value;
        const name = document.getElementById('su-name').value.trim();
        if (!role) {
            toast('Please select a role', 'error');
            return;
        }
        spin(true);
        try {
            const cred = await createUserWithEmailAndPassword(auth, email, password);
            const uid = cred.user.uid;
            let data = { name, email, role, createdAt: serverTimestamp() };
            
            if (role === 'hospital') {
                data.hospitalName = document.getElementById('su-hname').value.trim();
                data.address = document.getElementById('su-haddr').value.trim();
                data.specialties = document.getElementById('su-hspec').value.trim();
                data.contact = document.getElementById('su-hphone').value.trim();
                data.hours = document.getElementById('su-hhours').value.trim();
                data.verified = false;
                data.verificationRequested = false;
                data.description = '';
            } else {
                data.phone = document.getElementById('su-pphone').value.trim();
                data.dob = '';
                data.blood = 'O+';
                data.address = '';
            }
            await setDoc(doc(db, 'users', uid), data);
            toast('Account created! Welcome 🎉', 'success');
            e.target.reset();
            document.getElementById('su-hosp-fields').classList.add('hidden');
            document.getElementById('su-pat-fields').classList.add('hidden');
        } catch (err) {
            toast(err.message, 'error');
        }
        spin(false);
    });

    // Login form
    document.getElementById('form-login').addEventListener('submit', async e => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        const role = document.getElementById('login-role').value;
        if (!role) {
            toast('Please select your role', 'error');
            return;
        }
        spin(true);
        try {
            const cred = await signInWithEmailAndPassword(auth, email, password);
            const snap = await getDoc(doc(db, 'users', cred.user.uid));
            if (!snap.exists()) {
                await signOut(auth);
                toast('Account not found.', 'error');
                spin(false);
                return;
            }
            if (snap.data().role !== role) {
                await signOut(auth);
                toast(`This account is a ${snap.data().role}, not ${role}.`, 'error');
                spin(false);
                return;
            }
        } catch (err) {
            toast('Wrong email or password.', 'error');
        }
        spin(false);
    });

    // Logout
    document.getElementById('btn-logout').addEventListener('click', async () => {
        if (chatUnsub) chatUnsub();
        if (hospChatUnsub) hospChatUnsub();
        await signOut(auth);
        toast('Logged out', 'info');
    });

    // Hospital details save
    document.getElementById('form-hdetails').addEventListener('submit', async e => {
        e.preventDefault();
        spin(true);
        try {
            const u = {
                hospitalName: document.getElementById('hd-name').value.trim(),
                address: document.getElementById('hd-addr').value.trim(),
                contact: document.getElementById('hd-phone').value.trim(),
                email: document.getElementById('hd-email').value.trim(),
                specialties: document.getElementById('hd-spec').value.trim(),
                hours: document.getElementById('hd-hours').value.trim(),
            };
            await updateDoc(doc(db, 'users', CU.uid), u);
            UD = { ...UD, ...u };
            updateHeader();
            toast('Details saved ✅', 'success');
        } catch (err) {
            toast('Error saving', 'error');
        }
        spin(false);
    });

    // Hospital profile save
    document.getElementById('form-hprofile').addEventListener('submit', async e => {
        e.preventDefault();
        spin(true);
        try {
            const u = {
                hospitalName: document.getElementById('hp-name').value.trim(),
                address: document.getElementById('hp-addr').value.trim(),
                contact: document.getElementById('hp-phone').value.trim(),
                email: document.getElementById('hp-email').value.trim(),
                description: document.getElementById('hp-desc').value.trim(),
            };
            await updateDoc(doc(db, 'users', CU.uid), u);
            UD = { ...UD, ...u };
            updateHeader();
            toast('Profile updated ✅', 'success');
        } catch (err) {
            toast('Error saving', 'error');
        }
        spin(false);
    });

    // Patient profile save
    document.getElementById('form-pprofile').addEventListener('submit', async e => {
        e.preventDefault();
        spin(true);
        try {
            const u = {
                name: document.getElementById('pp-name').value.trim(),
                phone: document.getElementById('pp-phone').value.trim(),
                dob: document.getElementById('pp-dob').value,
                blood: document.getElementById('pp-blood').value,
                address: document.getElementById('pp-addr').value.trim()
            };
            await updateDoc(doc(db, 'users', CU.uid), u);
            UD = { ...UD, ...u };
            updateHeader();
            toast('Profile saved ✅', 'success');
        } catch (err) {
            toast('Error saving', 'error');
        }
        spin(false);
    });

    // Calendar navigation
    document.getElementById('h-cal-prev')?.addEventListener('click', () => {
        hCalDate.setMonth(hCalDate.getMonth() - 1);
        renderHospCal();
    });
    document.getElementById('h-cal-next')?.addEventListener('click', () => {
        hCalDate.setMonth(hCalDate.getMonth() + 1);
        renderHospCal();
    });
    document.getElementById('p-cal-prev')?.addEventListener('click', () => {
        selDate.setMonth(selDate.getMonth() - 1);
        renderCal('p-cal-grid', 'p-cal-month', 'p-time-slots');
    });
    document.getElementById('p-cal-next')?.addEventListener('click', () => {
        selDate.setMonth(selDate.getMonth() + 1);
        renderCal('p-cal-grid', 'p-cal-month', 'p-time-slots');
    });

    // Refresh buttons
    document.getElementById('btn-refresh-happts')?.addEventListener('click', loadHospAppts);
    document.getElementById('btn-refresh-hqueries')?.addEventListener('click', loadHospQueries);

    // Send message buttons
    document.getElementById('h-btn-send')?.addEventListener('click', sendHospMsg);
    document.getElementById('h-chat-input')?.addEventListener('keypress', e => {
        if (e.key === 'Enter') sendHospMsg();
    });

    document.getElementById('btn-send-msg')?.addEventListener('click', sendMsg);
    document.getElementById('p-chat-input')?.addEventListener('keypress', e => {
        if (e.key === 'Enter') sendMsg();
    });

    // Hospital search
    document.getElementById('p-search')?.addEventListener('input', function() {
        const t = this.value.toLowerCase();
        renderHospCards(allHospitals.filter(h =>
            (h.hospitalName || '').toLowerCase().includes(t) ||
            (h.address || '').toLowerCase().includes(t) ||
            (h.specialties || '').toLowerCase().includes(t)
        ));
    });

    // My appointments toggle
    document.getElementById('btn-my-appts')?.addEventListener('click', async () => {
        const panel = document.getElementById('my-appts-panel');
        panel.classList.toggle('hidden');
        if (!panel.classList.contains('hidden')) loadMyAppts();
    });

    // Confirm booking
    document.getElementById('btn-confirm-book')?.addEventListener('click', async () => {
        const hid = document.getElementById('book-hosp').value;
        const purp = document.getElementById('book-purpose').value;
        const note = document.getElementById('book-notes').value.trim();
        if (!hid) {
            toast('Please select a hospital', 'error');
            return;
        }
        if (!selSlot) {
            toast('Please select a time slot', 'error');
            return;
        }
        const hosp = allHospitals.find(h => h.id === hid);
        spin(true);
        try {
            await addDoc(collection(db, 'appointments'), {
                hospitalId: hid,
                hospitalName: hosp?.hospitalName || hosp?.name || 'Hospital',
                patientId: CU.uid,
                patientName: UD.name || 'Patient',
                patientEmail: CU.email,
                purpose: purp,
                notes: note,
                date: selDate.toLocaleDateString(),
                timeSlot: selSlot,
                status: 'pending',
                createdAt: serverTimestamp()
            });
            toast('Appointment booked! The hospital will confirm shortly 🎉', 'success');
            document.getElementById('book-notes').value = '';
            selSlot = null;
            document.querySelectorAll('#p-time-slots .time-slot').forEach(s => s.classList.remove('selected'));
        } catch (err) {
            toast('Error booking. Try again.', 'error');
            console.error(err);
        }
        spin(false);
    });

    // Medicine ordering
    document.getElementById('med-plus')?.addEventListener('click', e => {
        e.stopPropagation();
        document.getElementById('med-menu').classList.toggle('open');
    });
    
    document.addEventListener('click', () => document.getElementById('med-menu').classList.remove('open'));
    
    document.getElementById('med-camera')?.addEventListener('click', () => {
        document.getElementById('med-menu').classList.remove('open');
        document.getElementById('inp-camera').click();
    });
    
    document.getElementById('med-photos')?.addEventListener('click', () => {
        document.getElementById('med-menu').classList.remove('open');
        document.getElementById('inp-photos').click();
    });
    
    document.getElementById('med-files')?.addEventListener('click', () => {
        document.getElementById('med-menu').classList.remove('open');
        document.getElementById('inp-files').click();
    });
    
    document.getElementById('inp-camera')?.addEventListener('change', function() {
        if (this.files[0]) medHandleUpload(this.files[0], 'camera');
        this.value = '';
    });
    
    document.getElementById('inp-photos')?.addEventListener('change', function() {
        if (this.files[0]) medHandleUpload(this.files[0], 'photos');
        this.value = '';
    });
    
    document.getElementById('inp-files')?.addEventListener('change', function() {
        if (this.files[0]) medHandleUpload(this.files[0], 'files');
        this.value = '';
    });
    
    document.getElementById('med-send')?.addEventListener('click', () => {
        const t = document.getElementById('med-text').value.trim();
        if (t) {
            medHandleText(t);
            document.getElementById('med-text').value = '';
        }
    });
    
    document.getElementById('med-text')?.addEventListener('keypress', e => {
        if (e.key === 'Enter') document.getElementById('med-send').click();
    });
    
    document.getElementById('btn-med-reset')?.addEventListener('click', medReset);

    // Map modal controls
    document.getElementById('map-back-btn')?.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        closeMapModal();
    });
    
    document.getElementById('map-modal')?.addEventListener('click', function(e) {
        if (e.target === this) closeMapModal();
    });
    
    document.getElementById('map-modal-sheet')?.addEventListener('click', function(e) {
        e.stopPropagation();
    });
    
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeMapModal();
    });

    // OTP boxes click
    document.getElementById('otp-boxes-wrap')?.addEventListener('click', () => {
        document.getElementById('otp-hidden-input').focus();
    });

    // Landing page buttons
    document.getElementById('land-login-btn')?.addEventListener('click', () => {
        showPage('page-auth');
        document.getElementById('tab-login').click();
    });
    
    document.getElementById('land-signup-btn')?.addEventListener('click', () => {
        showPage('page-auth');
        document.getElementById('tab-signup').click();
    });
    
    document.getElementById('btn-back-landing')?.addEventListener('click', () => showPage('page-landing'));
    
    document.getElementById('land-hero-getstarted')?.addEventListener('click', () => {
        showPage('page-auth');
        document.getElementById('tab-signup').click();
    });
    
    document.getElementById('land-hero-login')?.addEventListener('click', () => {
        showPage('page-auth');
        document.getElementById('tab-login').click();
    });
    
    document.getElementById('land-cta-patient')?.addEventListener('click', () => {
        showPage('page-auth');
        document.getElementById('tab-signup').click();
    });
    
    document.getElementById('land-cta-hospital')?.addEventListener('click', () => {
        showPage('page-auth');
        document.getElementById('tab-signup').click();
    });

    // Bottom navigation
    document.querySelectorAll('.bnav-item').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.portal, btn.dataset.tab));
    });

    // Sticky nav scroll effect
    window.addEventListener('scroll', () => {
        const hdr = document.getElementById('land-header');
        if (hdr) hdr.classList.toggle('scrolled', window.scrollY > 40);
    }, { passive: true });
});

// Auth state observer
onAuthStateChanged(auth, async user => {
    if (user) {
        spin(true);
        try {
            const snap = await getDoc(doc(db, 'users', user.uid));
            if (snap.exists()) {
                CU = user;
                UD = snap.data();
                updateHeader();
                if (UD.role === 'hospital') {
                    showPage('page-hospital');
                    switchTab('hospital', 'h-verification');
                } else {
                    showPage('page-patient');
                    switchTab('patient', 'p-hospitals');
                }
                toast(`Welcome back, ${UD.hospitalName || UD.name}! 👋`, 'success');
            }
        } catch (err) {
            console.error(err);
        }
        spin(false);
    } else {
        CU = null;
        UD = null;
        showPage('page-landing');
    }
});

// Feature tab toggle on landing page
window.switchFeatureTab = function switchFeatureTab(tab) {
    const isPatient = tab === 'patient';
    document.getElementById('feat-patient').style.display = isPatient ? 'grid' : 'none';
    document.getElementById('feat-hospital').style.display = isPatient ? 'none' : 'grid';
    
    const pBtn = document.getElementById('feat-tab-patient');
    const hBtn = document.getElementById('feat-tab-hospital');
    pBtn.style.background = isPatient ? 'var(--primary)' : 'transparent';
    pBtn.style.color = isPatient ? '#fff' : 'var(--gray)';
    hBtn.style.background = isPatient ? 'transparent' : 'var(--secondary)';
    hBtn.style.color = isPatient ? 'var(--gray)' : '#fff';
}

// Initialize
showPage('page-landing');