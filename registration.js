

const firebaseConfig = {
  apiKey: "AIzaSyDMNqYb2V90qdPUTCOkW6EiFuCHvI9JT2s",
  authDomain: "smart-attend-d476c.firebaseapp.com",
  projectId: "smart-attend-d476c",
  storageBucket: "smart-attend-d476c.appspot.com",
  messagingSenderId: "834025214336",
  appId: "1:834025214336:web:6e62ddf29f440f68c5f165",
  measurementId: "G-N46BB4YHQ3"
};


// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Global variables
let currentCamp = null;
let currentSponsor = null;
let editingPatient = null;
let todayStats = { registrations: 0, totalPatients: 0 };

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
});

// Initialize application
async function initializeApp() {
    try {
        const campExists = await checkForActiveCamp();
        if (!campExists) {
            showCampSetupModal();
        } else {
            await loadCurrentCamp();
            await generateNextRegistrationNumber();
            await loadRecentPatients();
            await updateStatistics();
        }
    } catch (error) {
        console.error('Initialization error:', error);
        showAlert('Failed to initialize application', 'error');
    }
}

// Setup event listeners
function setupEventListeners() {
    // Search functionality
    document.getElementById('searchBtn').addEventListener('click', searchPatients);
    document.getElementById('clearSearchBtn').addEventListener('click', clearSearch);
    document.getElementById('searchInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchPatients();
        }
    });
    
    // Form functionality
    document.getElementById('registrationForm').addEventListener('submit', handleFormSubmit);
    document.getElementById('clearFormBtn').addEventListener('click', clearForm);
    
    // Phone number validation
    document.getElementById('patientPhone').addEventListener('input', function(e) {
        e.target.value = e.target.value.replace(/\D/g, '').substring(0, 10);
        validatePhone(e.target.value);
    });
    
    // Age validation
    document.getElementById('patientAge').addEventListener('input', function(e) {
        validateAge(e.target.value);
    });
    
    // Sponsor code uppercase
    const sponsorCodeField = document.getElementById('sponsorCode');
    if (sponsorCodeField) {
        sponsorCodeField.addEventListener('input', function(e) {
            e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        });
    }
    
    // Quick actions
    document.getElementById('newCampBtn').addEventListener('click', showCampSetupModal);
    document.getElementById('refreshDataBtn').addEventListener('click', refreshAllData);
    
    // Camp setup modal
    document.getElementById('createCampBtn').addEventListener('click', createNewCamp);
    document.getElementById('cancelSetupBtn').addEventListener('click', hideCampSetupModal);
    
    // Patient modal functionality
    document.querySelector('.modal-close').addEventListener('click', closeModal);
    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    document.getElementById('editPatientBtn').addEventListener('click', editPatient);
    
    // Close modal on outside click
    document.getElementById('patientModal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeModal();
        }
    });
    
    // Set default date for camp setup
    const campDateField = document.getElementById('campDate');
    if (campDateField) {
        campDateField.value = new Date().toISOString().split('T')[0];
    }
}

// Check for active camp
async function checkForActiveCamp() {
    try {
        const campsRef = db.collection('camps');
        const activeCamps = await campsRef.where('status', '==', 'active').get();
        return !activeCamps.empty;
    } catch (error) {
        console.error('Error checking for active camp:', error);
        return false;
    }
}

// Show camp setup modal
function showCampSetupModal() {
    document.getElementById('campSetupModal').style.display = 'block';
}

// Hide camp setup modal
function hideCampSetupModal() {
    document.getElementById('campSetupModal').style.display = 'none';
    document.getElementById('campSetupForm').reset();
}

// Create new camp
async function createNewCamp() {
    const createBtn = document.getElementById('createCampBtn');
    const btnText = createBtn.querySelector('.btn-text');
    const btnLoading = createBtn.querySelector('.btn-loading');
    
    if (!validateCampSetupForm()) {
        return;
    }
    
    createBtn.disabled = true;
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline';
    
    try {
        const form = document.getElementById('campSetupForm');
        const formData = new FormData(form);
        
        // Create or update sponsor
        const sponsorData = {
            name: formData.get('sponsorName').trim(),
            code: formData.get('sponsorCode').trim().toUpperCase(),
            isActive: true,
            updatedAt: firebase.firestore.Timestamp.now()
        };
        
        // Check if sponsor exists
        const existingSponsor = await db.collection('sponsors')
            .where('code', '==', sponsorData.code)
            .get();
        
        let sponsorId;
        if (!existingSponsor.empty) {
            // Update existing sponsor
            sponsorId = existingSponsor.docs[0].id;
            await db.collection('sponsors').doc(sponsorId).update(sponsorData);
        } else {
            // Create new sponsor
            sponsorData.createdAt = firebase.firestore.Timestamp.now();
            const sponsorRef = await db.collection('sponsors').add(sponsorData);
            sponsorId = sponsorRef.id;
        }
        
        // Create camp
        const campData = {
            name: formData.get('campName').trim(),
            sponsorId: sponsorId,
            location: formData.get('campLocation').trim(),
            date: firebase.firestore.Timestamp.fromDate(new Date(formData.get('campDate'))),
            status: 'active',
            createdBy: 'registration-user',
            createdAt: firebase.firestore.Timestamp.now()
        };
        
        // Deactivate any existing active camps
        const activeCamps = await db.collection('camps').where('status', '==', 'active').get();
        const batch = db.batch();
        
        activeCamps.forEach(doc => {
            batch.update(doc.ref, { status: 'completed' });
        });
        
        // Add new camp
        const newCampRef = db.collection('camps').doc();
        batch.set(newCampRef, campData);
        
        await batch.commit();
        
        showAlert('Camp created successfully!', 'success');
        hideCampSetupModal();
        
        // Reload the application
        await initializeApp();
        
    } catch (error) {
        console.error('Error creating camp:', error);
        showAlert('Failed to create camp: ' + error.message, 'error');
    } finally {
        createBtn.disabled = false;
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
    }
}

// Validate camp setup form
function validateCampSetupForm() {
    const requiredFields = ['sponsorName', 'sponsorCode', 'campName', 'campLocation', 'campDate'];
    let isValid = true;
    
    requiredFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (!field.value.trim()) {
            field.style.borderColor = 'var(--error-red)';
            isValid = false;
        } else {
            field.style.borderColor = 'var(--gray-200)';
        }
    });
    
    if (!isValid) {
        showAlert('Please fill all required fields', 'warning');
    }
    
    return isValid;
}

// Load current active camp
async function loadCurrentCamp() {
    try {
        const campsRef = db.collection('camps');
        const activeCamps = await campsRef.where('status', '==', 'active').get();
        
        if (!activeCamps.empty) {
            const campDoc = activeCamps.docs[0];
            currentCamp = { id: campDoc.id, ...campDoc.data() };
            
            // Load sponsor information
            const sponsorDoc = await db.collection('sponsors').doc(currentCamp.sponsorId).get();
            if (sponsorDoc.exists) {
                currentSponsor = { id: sponsorDoc.id, ...sponsorDoc.data() };
            }
            
            displayCampInfo();
        } else {
            displayNoCampState();
        }
    } catch (error) {
        console.error('Error loading camp:', error);
        showAlert('Failed to load camp information', 'error');
    }
}

// Display camp information
function displayCampInfo() {
    if (!currentCamp || !currentSponsor) return;
    
    const campDate = currentCamp.date.toDate().toLocaleDateString();
    
    document.getElementById('campCard').innerHTML = `
        <h3>🏥 Current Camp</h3>
        <div class="camp-detail">
            <label>Camp Name</label>
            <span>${currentCamp.name}</span>
        </div>
        <div class="camp-detail">
            <label>Sponsor</label>
            <span>${currentSponsor.name}</span>
        </div>
        <div class="camp-detail">
            <label>Location</label>
            <span>${currentCamp.location}</span>
        </div>
        <div class="camp-detail">
            <label>Date</label>
            <span>${campDate}</span>
        </div>
        <div class="camp-detail">
            <label>Status</label>
            <span class="camp-status">
                <span>🟢</span>
                Active
            </span>
        </div>
    `;
}

// Display no camp state
function displayNoCampState() {
    document.getElementById('campCard').innerHTML = `
        <div class="no-camp-state">
            <h3>⚠️ No Active Camp</h3>
            <p>Please create a new camp to start registering patients</p>
            <button onclick="showCampSetupModal()" class="btn-primary" style="margin-top: 0.5rem;">
                Setup New Camp
            </button>
        </div>
    `;
}

// Generate next registration number
async function generateNextRegistrationNumber() {
    try {
        if (!currentSponsor) {
            document.getElementById('nextRegNumber').textContent = 'No active camp';
            return;
        }
        
        const today = new Date();
        const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
        const prefix = `${dateStr}_`;
        
        // Query existing registrations for today
        const patientsRef = db.collection('patients');
        const todayPatients = await patientsRef
            .where('registrationNo', '>=', prefix + '000')
            .where('registrationNo', '<=', prefix + '999')
            .orderBy('registrationNo', 'desc')
            .limit(1)
            .get();
        
        let nextSequence = 1;
        if (!todayPatients.empty) {
            const lastRegNo = todayPatients.docs[0].data().registrationNo;
            const lastSequence = parseInt(lastRegNo.split('_')[1]);
            nextSequence = lastSequence + 1;
        }
        
        const nextRegNumber = `${prefix}${nextSequence.toString().padStart(3, '0')}`;
        document.getElementById('nextRegNumber').textContent = nextRegNumber;
        
    } catch (error) {
        console.error('Error generating registration number:', error);
        document.getElementById('nextRegNumber').textContent = 'Error';
    }
}

// Update statistics
async function updateStatistics() {
    try {
        const today = new Date();
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
        
        // Today's registrations
        const todayRegistrations = await db.collection('patients')
            .where('createdAt', '>=', firebase.firestore.Timestamp.fromDate(todayStart))
            .where('createdAt', '<', firebase.firestore.Timestamp.fromDate(todayEnd))
            .get();
        
        // Total patients
        const totalPatients = await db.collection('patients').get();
        
        todayStats.registrations = todayRegistrations.size;
        todayStats.totalPatients = totalPatients.size;
        
        // Update UI
        document.getElementById('todayRegistrations').textContent = todayStats.registrations;
        document.getElementById('totalPatients').textContent = todayStats.totalPatients;
        
    } catch (error) {
        console.error('Error updating statistics:', error);
    }
}

// Search patients
async function searchPatients() {
    const searchTerm = document.getElementById('searchInput').value.trim();
    if (!searchTerm) {
        showAlert('Please enter a search term', 'warning');
        return;
    }
    
    const resultsContainer = document.getElementById('searchResults');
    resultsContainer.innerHTML = '<div class="loading">Searching patients...</div>';
    
    try {
        const patientsRef = db.collection('patients');
        let results = [];
        
        // Search by phone number (exact match)
        if (/^\d{10}$/.test(searchTerm)) {
            const phoneQuery = await patientsRef.where('phone', '==', searchTerm).get();
            phoneQuery.forEach(doc => {
                results.push({ id: doc.id, ...doc.data() });
            });
        }
        
        // Search by registration number (exact match)
        if (searchTerm.includes('_')) {
            const regQuery = await patientsRef.where('registrationNo', '==', searchTerm.toUpperCase()).get();
            regQuery.forEach(doc => {
                results.push({ id: doc.id, ...doc.data() });
            });
        }
        
        // Search by name (partial match)
        if (searchTerm.length >= 3) {
            const nameQuery = await patientsRef
                .where('name', '>=', searchTerm)
                .where('name', '<=', searchTerm + '\uf8ff')
                .get();
            nameQuery.forEach(doc => {
                const patient = { id: doc.id, ...doc.data() };
                if (!results.find(p => p.id === patient.id)) {
                    results.push(patient);
                }
            });
        }
        
        displaySearchResults(results);
        
    } catch (error) {
        console.error('Search error:', error);
        resultsContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">❌</div>
                <h3>Search Failed</h3>
                <p>Unable to search patients. Please try again.</p>
            </div>
        `;
    }
}

// Display search results
function displaySearchResults(patients) {
    const resultsContainer = document.getElementById('searchResults');
    
    if (patients.length === 0) {
        resultsContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🔍</div>
                <h3>No Patients Found</h3>
                <p>Try searching with a different term</p>
            </div>
        `;
        return;
    }
    
    resultsContainer.innerHTML = patients.map(patient => `
        <div class="patient-card" onclick="showPatientDetails('${patient.id}')">
            <h4>${patient.name}</h4>
            <p><strong>Reg No:</strong> <span class="reg-number">${patient.registrationNo}</span></p>
            <p><strong>Phone:</strong> ${patient.phone}</p>
            <p><strong>Age:</strong> ${patient.age} | <strong>Gender:</strong> ${patient.sex}</p>
            <p><strong>Category:</strong> ${patient.category}</p>
        </div>
    `).join('');
}

// Clear search
function clearSearch() {
    document.getElementById('searchInput').value = '';
    document.getElementById('searchResults').innerHTML = '';
}

// Handle form submission
async function handleFormSubmit(e) {
    e.preventDefault();
    
    if (!validateForm()) {
        return;
    }
    
    const submitBtn = document.getElementById('submitBtn');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoading = submitBtn.querySelector('.btn-loading');
    
    submitBtn.disabled = true;
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline';
    
    try {
        const formData = new FormData(e.target);
        const patientData = {
            registrationNo: document.getElementById('nextRegNumber').textContent,
            name: formData.get('name').trim(),
            age: parseInt(formData.get('age')),
            sex: formData.get('sex'),
            phone: formData.get('phone'),
            address: formData.get('address').trim(),
            category: formData.get('category'),
            education: formData.get('education').trim() || '',
            occupation: formData.get('occupation').trim() || '',
            createdAt: firebase.firestore.Timestamp.now(),
            createdBy: 'registration-user', // Replace with actual user ID
            isActive: true
        };
        
        // Check for duplicate phone number
        const duplicateCheck = await db.collection('patients').where('phone', '==', patientData.phone).get();
        if (!duplicateCheck.empty && !editingPatient) {
            throw new Error('A patient with this phone number already exists');
        }
        
        let patientId;
        if (editingPatient) {
            // Update existing patient
            await db.collection('patients').doc(editingPatient.id).update({
                ...patientData,
                updatedAt: firebase.firestore.Timestamp.now()
            });
            patientId = editingPatient.id;
            showAlert('Patient updated successfully!', 'success');
        } else {
            // Create new patient
            const docRef = await db.collection('patients').add(patientData);
            patientId = docRef.id;
            showAlert('Patient registered successfully!', 'success');
        }
        
        // Create initial patient visit record
        const visitData = {
            patientId: patientId,
            campId: currentCamp.id,
            visitDate: firebase.firestore.Timestamp.now(),
            visitType: 'new',
            journeyStatus: {
                registration: {
                    status: 'completed',
                    timestamp: firebase.firestore.Timestamp.now(),
                    by: 'registration-user'
                },
                vitals: {
                    status: 'pending'
                },
                doctor: {
                    status: 'pending'
                },
                pharmacy: {
                    status: 'pending'
                }
            },
            presentComplaint: formData.get('presentComplaint') || '',
            currentTreatment: formData.get('currentTreatment') || '',
            createdAt: firebase.firestore.Timestamp.now(),
            isCompleted: false
        };
        
        await db.collection('patient_visits').add(visitData);
        
        // Reset form and refresh data
        clearForm();
        await generateNextRegistrationNumber();
        await loadRecentPatients();
        await updateStatistics();
        
    } catch (error) {
        console.error('Registration error:', error);
        showAlert(error.message || 'Registration failed', 'error');
    } finally {
        submitBtn.disabled = false;
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
        editingPatient = null;
    }
}

// Validate form
function validateForm() {
    let isValid = true;
    
    // Clear previous errors
    document.querySelectorAll('.form-group.error').forEach(group => {
        group.classList.remove('error');
    });
    
    // Validate required fields
    const requiredFields = ['patientName', 'patientAge', 'patientSex', 'patientPhone', 'patientCategory', 'patientAddress'];
    
    requiredFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (!field.value.trim()) {
            showFieldError(fieldId, 'This field is required');
            isValid = false;
        }
    });
    
    // Validate phone number
    const phone = document.getElementById('patientPhone').value;
    if (phone && !/^\d{10}$/.test(phone)) {
        showFieldError('patientPhone', 'Please enter a valid 10-digit phone number');
        isValid = false;
    }
    
    // Validate age
    const age = parseInt(document.getElementById('patientAge').value);
    if (age && (age < 1 || age > 120)) {
        showFieldError('patientAge', 'Please enter a valid age between 1 and 120');
        isValid = false;
    }
    
    return isValid;
}

// Show field error
function showFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    const formGroup = field.closest('.form-group');
    formGroup.classList.add('error');
    
    let errorElement = formGroup.querySelector('.error-message');
    if (!errorElement) {
        errorElement = document.createElement('div');
        errorElement.className = 'error-message';
        formGroup.appendChild(errorElement);
    }
    errorElement.textContent = message;
}

// Validate phone number
function validatePhone(phone) {
    const phoneField = document.getElementById('patientPhone');
    const formGroup = phoneField.closest('.form-group');
    
    if (phone.length === 10) {
        formGroup.classList.remove('error');
        checkDuplicatePhone(phone);
    } else if (phone.length > 0) {
        showFieldError('patientPhone', 'Phone number must be 10 digits');
    }
}

// Check for duplicate phone number
async function checkDuplicatePhone(phone) {
    try {
        const duplicateCheck = await db.collection('patients').where('phone', '==', phone).get();
        if (!duplicateCheck.empty && !editingPatient) {
            showFieldError('patientPhone', 'A patient with this phone number already exists');
        }
    } catch (error) {
        console.error('Duplicate check error:', error);
    }
}

// Validate age
function validateAge(age) {
    const ageValue = parseInt(age);
    if (age && (ageValue < 1 || ageValue > 120)) {
        showFieldError('patientAge', 'Age must be between 1 and 120');
    }
}

// Clear form
function clearForm() {
    document.getElementById('registrationForm').reset();
    document.querySelectorAll('.form-group.error').forEach(group => {
        group.classList.remove('error');
    });
    editingPatient = null;
    
    // Update form header
    document.getElementById('formTitle').innerHTML = '👤 New Patient Registration';
}

// Load recent patients
async function loadRecentPatients() {
    try {
        const recentContainer = document.getElementById('recentPatients');
        recentContainer.innerHTML = '<div class="loading">Loading recent registrations...</div>';
        
        const patientsRef = db.collection('patients');
        const recentPatients = await patientsRef
            .orderBy('createdAt', 'desc')
            .limit(10)
            .get();
        
        if (recentPatients.empty) {
            recentContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📋</div>
                    <h3>No Registrations</h3>
                    <p>No recent patient registrations found</p>
                </div>
            `;
            return;
        }
        
        recentContainer.innerHTML = recentPatients.docs.map(doc => {
            const patient = doc.data();
            const createdDate = patient.createdAt.toDate().toLocaleDateString();
            const createdTime = patient.createdAt.toDate().toLocaleTimeString();
            
            return `
                <div class="recent-item" onclick="showPatientDetails('${doc.id}')">
                    <h4>${patient.name}</h4>
                    <p class="reg-no">${patient.registrationNo}</p>
                    <p><strong>Phone:</strong> ${patient.phone}</p>
                    <p><strong>Age:</strong> ${patient.age} | <strong>Gender:</strong> ${patient.sex}</p>
                    <p><strong>Time:</strong> ${createdDate} ${createdTime}</p>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading recent patients:', error);
        document.getElementById('recentPatients').innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">❌</div>
                <h3>Loading Failed</h3>
                <p>Failed to load recent registrations</p>
            </div>
        `;
    }
}

// Show patient details in modal
async function showPatientDetails(patientId) {
    try {
        const patientDoc = await db.collection('patients').doc(patientId).get();
        if (!patientDoc.exists) {
            showAlert('Patient not found', 'error');
            return;
        }
        
        const patient = patientDoc.data();
        const createdDate = patient.createdAt.toDate().toLocaleDateString();
        const createdTime = patient.createdAt.toDate().toLocaleTimeString();
        
        document.getElementById('modalBody').innerHTML = `
            <div class="patient-detail">
                <div class="detail-group">
                    <label>Registration Number</label>
                    <span style="font-family: 'Courier New', monospace; font-weight: 700; color: var(--success-green);">${patient.registrationNo}</span>
                </div>
                <div class="detail-group">
                    <label>Registration Date</label>
                    <span>${createdDate} ${createdTime}</span>
                </div>
                <div class="detail-group">
                    <label>Full Name</label>
                    <span>${patient.name}</span>
                </div>
                <div class="detail-group">
                    <label>Age</label>
                    <span>${patient.age} years</span>
                </div>
                <div class="detail-group">
                    <label>Gender</label>
                    <span>${patient.sex}</span>
                </div>
                <div class="detail-group">
                    <label>Phone Number</label>
                    <span>${patient.phone}</span>
                </div>
                <div class="detail-group">
                    <label>Category</label>
                    <span>${patient.category}</span>
                </div>
                <div class="detail-group">
                    <label>Education</label>
                    <span>${patient.education || 'Not specified'}</span>
                </div>
                <div class="detail-group">
                    <label>Occupation</label>
                    <span>${patient.occupation || 'Not specified'}</span>
                </div>
                <div class="detail-group full-width">
                    <label>Address</label>
                    <span>${patient.address}</span>
                </div>
            </div>
        `;
        
        // Store patient data for editing
        editingPatient = { id: patientId, ...patient };
        
        // Show modal
        document.getElementById('patientModal').style.display = 'block';
        
    } catch (error) {
        console.error('Error loading patient details:', error);
        showAlert('Failed to load patient details', 'error');
    }
}

// Edit patient
function editPatient() {
    if (!editingPatient) return;
    
    // Populate form with patient data
    document.getElementById('patientName').value = editingPatient.name;
    document.getElementById('patientAge').value = editingPatient.age;
    document.getElementById('patientSex').value = editingPatient.sex;
    document.getElementById('patientPhone').value = editingPatient.phone;
    document.getElementById('patientCategory').value = editingPatient.category;
    document.getElementById('patientAddress').value = editingPatient.address;
    document.getElementById('patientEducation').value = editingPatient.education || '';
    document.getElementById('patientOccupation').value = editingPatient.occupation || '';
    
    // Update form header
    document.getElementById('formTitle').innerHTML = '✏️ Edit Patient Registration';
    document.getElementById('nextRegNumber').textContent = editingPatient.registrationNo;
    
    // Close modal
    closeModal();
    
    // Scroll to form
    document.querySelector('.form-card').scrollIntoView({ behavior: 'smooth' });
}

// Close modal
function closeModal() {
    document.getElementById('patientModal').style.display = 'none';
    editingPatient = null;
}

// Refresh all data
async function refreshAllData() {
    try {
        showAlert('Refreshing data...', 'info');
        await loadCurrentCamp();
        await generateNextRegistrationNumber();
        await loadRecentPatients();
        await updateStatistics();
        showAlert('Data refreshed successfully!', 'success');
    } catch (error) {
        console.error('Error refreshing data:', error);
        showAlert('Failed to refresh data', 'error');
    }
}

// Show alert notification
function showAlert(message, type = 'info') {
    const alertContainer = document.getElementById('alertContainer');
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert ${type}`;
    
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    alertDiv.innerHTML = `
        <span>${icons[type] || icons.info}</span>
        <span>${message}</span>
    `;
    
    alertContainer.appendChild(alertDiv);
    
    // Show alert
    setTimeout(() => alertDiv.classList.add('show'), 100);
    
    // Auto hide after 5 seconds
    setTimeout(() => {
        alertDiv.classList.remove('show');
        setTimeout(() => {
            if (alertContainer.contains(alertDiv)) {
                alertContainer.removeChild(alertDiv);
            }
        }, 300);
    }, 5000);
}

// Utility function to format date
function formatDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Utility function to format time
function formatTime(date) {
    return new Date(date).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
    });
}