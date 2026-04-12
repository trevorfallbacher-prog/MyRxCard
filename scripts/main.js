const apiKey = 'ececaef7-ef6e-4101-8b44-fbe92360b3a2';
const baseUrl = 'https://phoenixapi.rxlogic.com';
const XANO_BASE = 'https://xy2f-yrzu-6a37.n7d.xano.io/api:w59maQEh';

const inputField = document.getElementById('inputDrugs');
const suggestionsDiv = document.getElementById('drugSuggestions');
const dosageDropdown = document.getElementById('dosageDropdown');
const formDropdown = document.getElementById('formDropdown');
const pharmacyListDiv = document.getElementById('pharmacyList');
const recentSearchesList = document.getElementById('recentSearchesList');

const isFirstLoading = true;
const resultsDiv = document.getElementById('results-div');

if (isFirstLoading) {
    resultsDiv.style.display = 'none';
}

let drugData = [];
let currentNDC = '';
let recentSearches = [];
let userZip = null;
let userCity = null;
let userState = null;
let userRadius = null;

// Physical location — button-triggered GPS, IP fallback, never overwritten by manual zip
let ipDetectedZip    = null;
let ipDetectedCity   = null;
let ipDetectedState  = null;
let ipDetectedSource = null; // 'gps', 'ip', 'stored', or 'fallback'

// --- TRACKING STATE ---
let currentSearchRecordId = null;
let hasPrinted = false;
let currentSelectedNpi = null;
let currentSelectedPosition = null;
let currentSelectedIsFeatured = false;
let isRecentSearch = false;
const SESSION_START = new Date();

const DEVICE_TYPE = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
const BROWSER = (() => {
    const ua = navigator.userAgent;
    if (/Edg/i.test(ua)) return 'Edge';
    if (/Chrome/i.test(ua)) return 'Chrome';
    if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) return 'Safari';
    if (/Firefox/i.test(ua)) return 'Firefox';
    if (/MSIE|Trident/i.test(ua)) return 'Internet Explorer';
    return 'Other';
})();

function getSessionDuration() {
    return Math.round((new Date() - SESSION_START) / 1000);
}

function getOrCreateSessionId() {
    let sessionId = localStorage.getItem('myrxcard_session_id');
    if (!sessionId) {
        sessionId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
        localStorage.setItem('myrxcard_session_id', sessionId);
    }
    return sessionId;
}

const SESSION_ID = getOrCreateSessionId();
const SOURCE_URL    = window.location.href;
const SOURCE_DOMAIN = window.location.hostname;
const SOURCE_PATH   = window.location.pathname;

async function trackSearch(data) {
    try {
        const response = await fetch(`${XANO_BASE}/search_events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        currentSearchRecordId = result.id || result.search_events_id || null;
        hasPrinted = false;
    } catch (e) {}
}

async function updateSearchRecord(data) {
    if (!currentSearchRecordId) return;
    try {
        await fetch(`${XANO_BASE}/search_events/${currentSearchRecordId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    } catch (e) {}
}

window.addEventListener('beforeunload', () => {
    if (currentSearchRecordId && !hasPrinted) {
        const payload = JSON.stringify({
            session_duration_seconds: getSessionDuration(),
            session_start: SESSION_START.toISOString(),
            abandoned: true
        });
        navigator.sendBeacon(
            `${XANO_BASE}/search_events/${currentSearchRecordId}`,
            new Blob([payload], { type: 'application/json' })
        );
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const printBtn = document.getElementById('print');
    if (printBtn) {
        printBtn.addEventListener('click', () => {
            hasPrinted = true;
            const pharmacyName = document.getElementById('selected-pharmacy-name1')?.textContent || '';
            const price = document.getElementById('selected-price1')?.textContent?.replace('$', '') || '';
            const cardPosition = currentSelectedPosition !== null ? currentSelectedPosition : -1;
            updateSearchRecord({
                printed: true,
                printed_pharmacy_name: pharmacyName,
                printed_pharmacy_npi: currentSelectedNpi,
                printed_pharmacy_price: parseFloat(price) || null,
                printed_is_featured: currentSelectedIsFeatured,
                printed_card_position: cardPosition,
                session_duration_seconds: getSessionDuration(),
                session_start: SESSION_START.toISOString(),
                printed_timestamp: new Date().toISOString()
            });
        });
    }
});

function saveLocationToLocalStorage(zip, city, state, radius) {
    localStorage.setItem('userZip', zip);
    localStorage.setItem('userCity', city);
    localStorage.setItem('userState', state);
    localStorage.setItem('userRadius', radius);
}

function loadLocationFromLocalStorage() {
    return {
        zip:    localStorage.getItem('userZip'),
        city:   localStorage.getItem('userCity'),
        state:  localStorage.getItem('userState'),
        radius: localStorage.getItem('userRadius')
    };
}

function displayLocation(zip, city, state, radius) {
    const zipEl   = document.getElementById('location-zip');
    const cityEl  = document.getElementById('location-city');
    const stateEl = document.getElementById('location-state');
    const radEl   = document.getElementById('radius');
    if (zipEl)   zipEl.innerText   = zip    || 'N/A';
    if (cityEl)  cityEl.innerText  = city   || 'N/A';
    if (stateEl) stateEl.innerText = state  || 'N/A';
    if (radEl)   radEl.innerText   = radius || '10';
}

// ---- Location detection helpers ----

async function reverseGeocodeToZip(lat, lng) {
    try {
        const url = `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${lng}&y=${lat}&benchmark=Public_AR_Current&vintage=Current_Current&layers=2010+Census+ZIP+Code+Tabulation+Areas&format=json`;
        const data = await (await fetch(url)).json();
        const zip = data?.result?.geographies?.['2010 Census ZIP Code Tabulation Areas']?.[0]?.ZCTA5;
        if (zip) return zip;
    } catch (e) {}
    try {
        const nom = await (await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
            { headers: { 'Accept-Language': 'en' } }
        )).json();
        const zip = nom?.address?.postcode?.substring(0, 5);
        if (zip) return zip;
    } catch (e) {}
    return null;
}

async function detectByBrowser() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) { resolve(null); return; }

        // Hard timeout on the whole operation — not just GPS acquisition
        const hardTimeout = setTimeout(() => resolve(null), 10000);

        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                try {
                    const { latitude, longitude } = pos.coords;
                    const zip = await Promise.race([
                        reverseGeocodeToZip(latitude, longitude),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('geocode timeout')), 5000))
                    ]);
                    clearTimeout(hardTimeout);
                    if (!zip) { resolve(null); return; }
                    const zData = await Promise.race([
                        fetch(`https://api.zippopotam.us/us/${zip}`).then(r => r.json()),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('zip timeout')), 4000))
                    ]);
                    resolve({
                        zip,
                        city:   zData?.places?.[0]?.['place name']         || '',
                        state:  zData?.places?.[0]?.['state abbreviation'] || '',
                        source: 'gps'
                    });
                } catch {
                    clearTimeout(hardTimeout);
                    resolve(null);
                }
            },
            () => { clearTimeout(hardTimeout); resolve(null); },
            { timeout: 6000, maximumAge: 300000, enableHighAccuracy: true }
        );
    });
}

async function detectByIp() {
    try {
        const loc = await (await fetch('https://ipapi.co/json/')).json();
        return {
            zip:    loc.postal      || '00000',
            city:   loc.city        || 'Default City',
            state:  loc.region_code || loc.region || 'Default State',
            source: 'ip'
        };
    } catch (e) {
        return { zip: '00000', city: 'Default City', state: 'Default State', source: 'fallback' };
    }
}

async function detectLocation() {
    // IP only on first load — no GPS prompt on page load
    const result = await detectByIp();

    userZip    = result.zip;
    userCity   = result.city;
    userState  = result.state;
    userRadius = '10';

    ipDetectedZip    = result.zip;
    ipDetectedCity   = result.city;
    ipDetectedState  = result.state;
    ipDetectedSource = result.source;

    saveLocationToLocalStorage(userZip, userCity, userState, userRadius);
    displayLocation(userZip, userCity, userState, userRadius);
}

// ---- Boot ----

document.addEventListener('DOMContentLoaded', function () {
    const storedLocation = loadLocationFromLocalStorage();
    userZip    = storedLocation.zip;
    userCity   = storedLocation.city;
    userState  = storedLocation.state;
    userRadius = storedLocation.radius;

    // Seed ip_ fields from stored location as fallback
    ipDetectedZip    = userZip;
    ipDetectedCity   = userCity;
    ipDetectedState  = userState;
    ipDetectedSource = 'stored';

    if (!userZip || !userCity || !userState || !userRadius) {
        detectLocation(); // IP only — no GPS prompt
    } else {
        displayLocation(userZip, userCity, userState, userRadius);
    }

    // ---- Use My Location button ----
    const locationBtn = document.getElementById('use-my-location');
    if (locationBtn) {
        locationBtn.addEventListener('click', async () => {
            const originalText = locationBtn.innerHTML;
            locationBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                Detecting...`;
            locationBtn.disabled = true;

            const result = await detectByBrowser();

            if (result) {
                // Update both search location AND frozen ip fields
                userZip    = result.zip;
                userCity   = result.city;
                userState  = result.state;
                userRadius = userRadius || '10';

                ipDetectedZip    = result.zip;
                ipDetectedCity   = result.city;
                ipDetectedState  = result.state;
                ipDetectedSource = 'gps';

                saveLocationToLocalStorage(userZip, userCity, userState, userRadius);
                displayLocation(userZip, userCity, userState, userRadius);

                // Re-run search with new location if a drug is already selected
                triggerSearch();

                locationBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    Location updated`;
                setTimeout(() => {
                    locationBtn.innerHTML = originalText;
                    locationBtn.disabled = false;
                }, 2500);
            } else {
                locationBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    Could not detect location`;
                setTimeout(() => {
                    locationBtn.innerHTML = originalText;
                    locationBtn.disabled = false;
                }, 2500);
            }
        });
    }

    // Inject spinner keyframe once
    if (!document.getElementById('location-btn-styles')) {
        const s = document.createElement('style');
        s.id = 'location-btn-styles';
        s.textContent = `@keyframes spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }`;
        document.head.appendChild(s);
    }

    // ---- Location form ----
    const form = document.getElementById('update-location-form');
    if (form) {
        form.addEventListener('submit', async function (event) {
            event.preventDefault();
            const zip = document.getElementById('zip').value.trim();
            let radius = document.getElementById('search-radius').value.trim();
            const errorMessage = document.querySelector('.w-form-fail');
            if (!zip) return;
            if (!radius) radius = '10';
            errorMessage.innerText = '';
            errorMessage.style.display = 'none';
            let errors = [];
            if (!zip.match(/^\d{5}(-\d{4})?$/)) errors.push('Invalid ZIP code format. Use 12345 or 12345-6789.');
            const radiusNum = Number(radius);
            if (!/^\d+$/.test(radius) || isNaN(radiusNum) || radiusNum < 1 || radiusNum > 500) errors.push('Invalid radius. Enter a number between 1 and 500.');
            if (errors.length > 0) {
                errorMessage.innerText = errors.join('\n');
                errorMessage.style.display = 'block';
                return;
            }
            try {
                const response = await fetch(`https://api.zippopotam.us/us/${zip}`);
                const data = await response.json();
                // Update search location only — ipDetected fields remain unchanged
                userCity   = data.places[0]['place name'];
                userState  = data.places[0]['state abbreviation'];
                userZip    = zip;
                userRadius = radius;
                saveLocationToLocalStorage(userZip, userCity, userState, userRadius);
                displayLocation(userZip, userCity, userState, userRadius);
            } catch (error) {
                console.error('Error fetching ZIP code data:', error);
                displayLocation('Error', 'Error', 'Error', 'Error');
            }
        });
    }
});

async function fetchDrugs(query) {
    try {
        const response = await fetch(`${baseUrl}/CacheDrugData?name=${query}`, { headers: { apiKey } });
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching drugs:', error);
        return [];
    }
}

async function fetchPharmacies(payload) {
    try {
        const response = await fetch(`${baseUrl}/PharmacyRadiusPricing`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apiKey },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            const errorText = await response.text();
            document.getElementById('loader').style.display = 'none';
            console.error('Server Error:', errorText);
            document.getElementById('errorMessage').textContent = 'Server error occurred: ' + errorText;
            return [];
        }
        const data = await response.json();
        document.getElementById('loader').style.display = 'none';
        return data.Response || [];
    } catch (error) {
        document.getElementById('loader').style.display = 'none';
        console.error('Error fetching pharmacies:', error);
        document.getElementById('errorMessage').textContent = 'Failed to fetch pharmacies.';
        return [];
    }
}

inputField.addEventListener('input',       () => { document.getElementById('errorMessage').textContent = ''; });
dosageDropdown.addEventListener('change',  () => { document.getElementById('errorMessage').textContent = ''; });
formDropdown.addEventListener('change',    () => { document.getElementById('errorMessage').textContent = ''; });

function storeAndDisplayRecent5Search(drugName, drugDetails) {
    storeRecentSearch(drugName, drugDetails);
    displayRecentSearches();
}

function storeRecentSearch(drugName, drugDetails) {
    let items = localStorage.getItem('recentSearches');
    recentSearches = items ? JSON.parse(items) : [];
    if (!recentSearches.some(item => item.name === drugName)) {
        recentSearches.unshift({ name: drugName, details: drugDetails });
        if (recentSearches.length > 5) recentSearches.pop();
        localStorage.setItem('recentSearches', JSON.stringify(recentSearches));
    }
}

const recentSearchesDataFetch = async (query, drugDetails) => {
    isRecentSearch = true;
    showLoader();
    const drugs = await fetchDrugs(query);
    suggestionsDiv.innerHTML = '';
    drugData = drugs;
    const uniqueDrugNames = new Set(), selectedDrugDosages = new Set(),
          selectedDrugForms = new Set(), selectedDrugQuantities = new Set();
    const storedSearches = JSON.parse(localStorage.getItem('recentSearches')) || [];
    const storedDrug     = storedSearches.find(s => s.name === query);
    const storedQuantity = storedDrug?.details?.quantity;
    drugs.forEach((drug) => {
        if (!uniqueDrugNames.has(drug.MedDrugName)) {
            uniqueDrugNames.add(drug.MedDrugName);
            if (drug.MedDrugName.toLowerCase() === query.toLowerCase()) {
                currentNDC = drug.Ndc;
                drugs.forEach((d) => {
                    if (d.MedDrugName.toLowerCase() === query.toLowerCase() ||
                        (d.MedDrugName.toLowerCase().startsWith(query.toLowerCase()) && !d.MedDrugName.includes('-'))) {
                        selectedDrugDosages.add(`${d.MedStrength} ${d.Uom}`);
                        selectedDrugForms.add(d.DosageForm);
                        if (d.Quantity) selectedDrugQuantities.add(d.Quantity);
                    }
                });
                renderDropdown(dosageDropdown, [...selectedDrugDosages], drugDetails.dosages[0]);
                renderDropdown(formDropdown,   [...selectedDrugForms],   drugDetails.forms[0]);
                const selectedQuantity = storedQuantity || drugDetails.Quantity || [...selectedDrugQuantities][0] || 30;
                document.getElementById('quantity').value = selectedQuantity;
                handleDrugSearch(drugDetails?.overallData?.MedDrugName, drugDetails.dosages[0], drugDetails.forms[0], selectedQuantity);
            }
        }
    });
};

function displayRecentSearches(removeAllOptions = true) {
    recentSearchesList.innerHTML = recentSearches
        .map(s => `<div class="search-item" data-drug="${s.name}" data-details='${JSON.stringify(s.details)}'>${s.name}<div class="clear-search">x</div></div>`)
        .join('');
    document.querySelectorAll('.search-item').forEach(item => item.replaceWith(item.cloneNode(true)));
    const searchItems = document.querySelectorAll('.search-item');
    searchItems.forEach((item) => {
        item.addEventListener('click', (event) => {
            const drugName    = event.target.dataset.drug;
            const drugDetails = JSON.parse(event.target.dataset.details);
            inputField.value  = drugName;
            if (removeAllOptions) {
                dosageDropdown.innerHTML = '<option value="">Select dosage</option>';
                formDropdown.innerHTML   = '<option value="">Select form</option>';
            }
            const stored      = JSON.parse(localStorage.getItem('recentSearches')) || [];
            const match       = stored.find(s => s.name === drugName);
            const selectedQty = match?.details?.quantity || drugDetails.quantity || 30;
            recentSearchesDataFetch(drugName, { ...drugDetails, quantity: selectedQty });
            const qDisplay = document.getElementById('selected-quantity');
            if (qDisplay) qDisplay.textContent = selectedQty;
        });
    });
    document.querySelectorAll('.clear-search').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const drugName = btn.closest('.search-item').dataset.drug;
            recentSearches = recentSearches.filter(s => s.name !== drugName);
            let stored = JSON.parse(localStorage.getItem('recentSearches')) || [];
            stored = stored.filter(s => s.name !== drugName);
            localStorage.setItem('recentSearches', JSON.stringify(stored));
            displayRecentSearches();
        });
    });
}

function loadRecentSearches() {
    recentSearches = JSON.parse(localStorage.getItem('recentSearches')) || [];
    displayRecentSearches();
}

function debounce(func, delay) {
    let timeoutId;
    return function (...args) { clearTimeout(timeoutId); timeoutId = setTimeout(() => func.apply(this, args), delay); };
}

const triggerInputFieldChange = async (event) => {
    const query = event.target.value.trim();
    if (query.length >= 3) {
        const drugs = await fetchDrugs(query);
        suggestionsDiv.innerHTML = '';
        drugData = drugs;
        const uniqueDrugNames = new Set();
        drugs.forEach((drug) => {
            if (!uniqueDrugNames.has(drug.MedDrugName)) {
                uniqueDrugNames.add(drug.MedDrugName);
                const option = document.createElement('div');
                option.className = 'drug-option';
                option.textContent = drug.MedDrugName;
                option.dataset.dosage = `${drug.MedStrength} ${drug.Uom}`;
                option.dataset.form   = drug.DosageForm;
                option.dataset.ndc    = drug.Ndc;
                option.addEventListener('click', () => {
                    inputField.value = drug.MedDrugName;
                    currentNDC = drug.Ndc;
                    const dSet = new Set(), fSet = new Set();
                    drugs.filter(d => d.MedDrugName === drug.MedDrugName).forEach(d => {
                        dSet.add(`${d.MedStrength} ${d.Uom}`); fSet.add(d.DosageForm);
                    });
                    renderDropdown(dosageDropdown, [...dSet]);
                    renderDropdown(formDropdown,   [...fSet]);
                    const packSize = parseInt(drugs.find(d => d.MedDrugName === drug.MedDrugName)?.MedPackSize) || 30;
                    document.getElementById('quantity').value = packSize;
                    suggestionsDiv.innerHTML = '';
                });
                suggestionsDiv.appendChild(option);
            }
        });
    } else {
        suggestionsDiv.innerHTML = '';
    }
};

const debouncedTriggerInputFieldChange = debounce(triggerInputFieldChange, 500);
inputField.addEventListener('input', debouncedTriggerInputFieldChange);

// Close suggestions when clicking outside
document.addEventListener('click', (e) => {
    if (!inputField.contains(e.target) && !suggestionsDiv.contains(e.target)) {
        suggestionsDiv.innerHTML = '';
    }
});

function renderDropdown(dropdown, items, selectedValue = null) {
    dropdown.innerHTML = '';
    items.forEach(item => {
        const option = document.createElement('option');
        option.value = item; option.textContent = item;
        dropdown.appendChild(option);
    });
    if (selectedValue && items.includes(selectedValue)) dropdown.value = selectedValue;
    else if (items.length > 0) dropdown.value = items[0];
}

function initializeDropdowns() {
    const allForms = new Set(), allDosages = new Set();
    drugData.forEach(drug => {
        allForms.add(drug.DosageForm);
        allDosages.add(`${drug.MedStrength} ${drug.Uom}`);
    });
    renderDropdown(formDropdown,   [...allForms]);
    renderDropdown(dosageDropdown, [...allDosages]);
    const firstForm = [...allForms][0];
    formDropdown.value = firstForm;
    filterDosagesByForm(firstForm);
}

function filterDosagesByForm(selectedForm, updateDropDownOptions = true) {
    const availableDosages = new Set(), allDosages = new Set();
    drugData.forEach(drug => {
        allDosages.add(`${drug.MedStrength} ${drug.Uom}`);
        if (drug.DosageForm === selectedForm) availableDosages.add(`${drug.MedStrength} ${drug.Uom}`);
    });
    if (updateDropDownOptions) renderDropdown(dosageDropdown, [...allDosages], [...availableDosages][0]);
    if (availableDosages.size > 0) {
        if (!availableDosages.has(dosageDropdown.value)) dosageDropdown.value = [...availableDosages][0];
        triggerSearch();
    }
}

function filterFormsByDosage(selectedDosage, updateDropDownOptions = true) {
    const availableForms = new Set(), allForms = new Set();
    drugData.forEach(drug => {
        allForms.add(drug.DosageForm);
        if (`${drug.MedStrength} ${drug.Uom}` === selectedDosage) availableForms.add(drug.DosageForm);
    });
    if (updateDropDownOptions) renderDropdown(formDropdown, [...allForms], [...availableForms][0]);
    if (availableForms.size > 0) {
        if (!availableForms.has(formDropdown.value)) formDropdown.value = [...availableForms][0];
        triggerSearch();
    }
}

function triggerSearch() {
    const drugName       = inputField.value.trim();
    const selectedForm   = formDropdown.value;
    const selectedDosage = dosageDropdown.value;
    const quantity       = document.getElementById('quantity').value || 30;
    if (drugName && selectedForm && selectedDosage) {
        handleDrugSearch(drugName, selectedDosage, selectedForm, quantity);
    }
}

formDropdown.addEventListener('change',   () => filterDosagesByForm(formDropdown.value, false));
dosageDropdown.addEventListener('change', () => filterFormsByDosage(dosageDropdown.value, false));

initializeDropdowns();

document.getElementById('searchButton').addEventListener('click', async () => {
    isRecentSearch = false;
    const drugName = inputField.value.trim();
    const dosage   = dosageDropdown.value;
    const form     = formDropdown.value;
    const quantity = document.getElementById('quantity').value || 30;
    if (!drugName || !quantity || !dosage || !form) {
        document.getElementById('errorMessage').textContent = 'Please fill in all fields.';
        return;
    }
    await handleDrugSearch(drugName, dosage, form, quantity);
});

// --- Star animation ---
const starStoppers = new Map();

function animateStar(canvas) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const OR = 22, IR = 9;
    let frame = 0, rafId;
    function starPath(r, ir) {
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
            const angle = (i * Math.PI) / 5 - Math.PI / 2;
            const rad = i % 2 === 0 ? r : ir;
            i === 0 ? ctx.moveTo(cx + rad * Math.cos(angle), cy + rad * Math.sin(angle))
                    : ctx.lineTo(cx + rad * Math.cos(angle), cy + rad * Math.sin(angle));
        }
        ctx.closePath();
    }
    function draw() {
        ctx.clearRect(0, 0, W, H);
        const t = frame / 60;
        starPath(OR, IR);
        const grad = ctx.createRadialGradient(cx - 4, cy - 6, 2, cx, cy, OR);
        grad.addColorStop(0, '#fff9d0'); grad.addColorStop(0.3, '#f5d060');
        grad.addColorStop(0.7, '#c9a84c'); grad.addColorStop(1, '#8a6520');
        ctx.fillStyle = grad; ctx.fill();
        starPath(OR * 0.55, IR * 0.55);
        const innerGrad = ctx.createRadialGradient(cx, cy - 3, 0, cx, cy, OR * 0.55);
        innerGrad.addColorStop(0, 'rgba(255,255,220,0.9)');
        innerGrad.addColorStop(0.5, 'rgba(255,230,120,0.4)');
        innerGrad.addColorStop(1, 'rgba(255,200,60,0)');
        ctx.fillStyle = innerGrad; ctx.fill();
        starPath(OR, IR);
        ctx.strokeStyle = '#a07830'; ctx.lineWidth = 1.2; ctx.stroke();
        const glowAlpha = 0.3 + 0.25 * Math.sin(t * 2.2);
        const glowScale = 1 + 0.18 * Math.sin(t * 2.2);
        ctx.save();
        ctx.translate(cx, cy); ctx.scale(glowScale, glowScale); ctx.translate(-cx, -cy);
        starPath(OR + 4, IR + 2);
        const glowGrad = ctx.createRadialGradient(cx, cy, IR, cx, cy, OR + 8);
        glowGrad.addColorStop(0, `rgba(255,220,80,${glowAlpha})`);
        glowGrad.addColorStop(0.5, `rgba(201,168,76,${glowAlpha * 0.6})`);
        glowGrad.addColorStop(1, `rgba(180,140,60,0)`);
        ctx.fillStyle = glowGrad; ctx.fill(); ctx.restore();
        const spikeAlpha = 0.5 + 0.5 * Math.abs(Math.sin(t * 1.8));
        const spikeLen   = 12 + 6 * Math.abs(Math.sin(t * 1.8));
        ctx.save(); ctx.globalAlpha = spikeAlpha;
        [[0,spikeLen],[Math.PI/2,spikeLen*0.6],[Math.PI/4,spikeLen*0.4],[3*Math.PI/4,spikeLen*0.4]].forEach(([angle, len]) => {
            const g2 = ctx.createLinearGradient(cx+Math.cos(angle)*3, cy+Math.sin(angle)*3, cx+Math.cos(angle)*len, cy+Math.sin(angle)*len);
            g2.addColorStop(0, 'rgba(255,255,255,0.95)'); g2.addColorStop(0.4, 'rgba(255,240,180,0.5)'); g2.addColorStop(1, 'rgba(255,220,100,0)');
            ctx.beginPath();
            ctx.moveTo(cx+Math.cos(angle)*2, cy+Math.sin(angle)*2);
            ctx.lineTo(cx+Math.cos(angle)*len, cy+Math.sin(angle)*len);
            ctx.lineTo(cx+Math.cos(angle+Math.PI)*len, cy+Math.sin(angle+Math.PI)*len);
            ctx.closePath(); ctx.fillStyle = g2; ctx.fill();
        });
        ctx.restore();
        const sweepPos = (t * 0.4) % 1;
        const sweepX   = cx - OR + sweepPos * (OR * 2);
        ctx.save(); starPath(OR, IR); ctx.clip();
        const sweepGrad = ctx.createLinearGradient(sweepX - 14, cy - OR, sweepX + 14, cy + OR);
        sweepGrad.addColorStop(0, 'rgba(255,255,255,0)'); sweepGrad.addColorStop(0.3, 'rgba(255,255,255,0)');
        sweepGrad.addColorStop(0.48, `rgba(255,255,255,${0.6 * Math.sin(sweepPos * Math.PI)})`);
        sweepGrad.addColorStop(0.52, `rgba(255,255,255,${0.9 * Math.sin(sweepPos * Math.PI)})`);
        sweepGrad.addColorStop(0.6, 'rgba(255,255,255,0)'); sweepGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = sweepGrad; ctx.fillRect(0, 0, W, H); ctx.restore();
        frame++; rafId = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(rafId);
}

// ── GENERIC ALTERNATIVES ────────────────────────────────────────────────────

// Use RxNorm (NIH) to check if a drug name is a brand name and return its
// generic (INN) name. Returns null if the drug is already generic or unknown.
// Only proceeds if RxNorm confirms the term type is BN (Brand Name).
async function getGenericForBrand(drugName) {
    try {
        const r1 = await fetch(
            `https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(drugName)}&search=1`
        );
        if (!r1.ok) return null;
        const d1 = await r1.json();
        const rxcui = d1?.idGroup?.rxnormId?.[0];
        if (!rxcui) return null;

        // Only continue if RxNorm says this is a Brand Name (BN)
        const r2 = await fetch(
            `https://rxnav.nlm.nih.gov/REST/rxcui/${rxcui}/properties.json`
        );
        if (!r2.ok) return null;
        const d2 = await r2.json();
        if (d2?.properties?.tty !== 'BN') return null;

        const r3 = await fetch(
            `https://rxnav.nlm.nih.gov/REST/rxcui/${rxcui}/related.json?tty=IN`
        );
        if (!r3.ok) return null;
        const d3 = await r3.json();
        const inGroup = (d3?.relatedGroup?.conceptGroup || []).find(g => g.tty === 'IN');
        return inGroup?.conceptProperties?.[0]?.name?.toLowerCase() || null;
    } catch (e) {
        return null;
    }
}

// Show a dismissible banner above the pharmacy list when a cheaper generic
// alternative appears to be available for the selected brand-name drug.
// Runs async in the background so it never delays the pharmacy list render.
async function showGenericAlternativesBanner(selectedDrug) {
    const existing = document.getElementById('generic-alt-banner');
    if (existing) existing.remove();

    // RxNorm confirms brand status and returns the generic name — returns null
    // for generics, salts, ingredients, etc. so the banner never fires falsely.
    const genericName = await getGenericForBrand(selectedDrug?.MedDrugName);
    if (!genericName) return;

    const genericDrugs = await fetchDrugs(genericName);
    if (!genericDrugs?.length) return;

    // Prefer a match with the same dosage form, otherwise use first result
    const match = genericDrugs.find(d => d.DosageForm === selectedDrug.DosageForm) || genericDrugs[0];
    const altName = match.MedDrugName;

    // Inject keyframe animation once
    if (!document.getElementById('generic-alt-style')) {
        const style = document.createElement('style');
        style.id = 'generic-alt-style';
        style.textContent = '@keyframes genericBannerFadeIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}';
        document.head.appendChild(style);
    }

    const banner = document.createElement('div');
    banner.id = 'generic-alt-banner';
    banner.style.cssText = [
        'display:flex', 'align-items:flex-start', 'gap:12px',
        'background:#eaf6f0', 'border:1.5px solid #2a7a4f', 'border-radius:12px',
        'padding:14px 18px', 'margin-bottom:16px', 'font-family:inherit',
        'animation:genericBannerFadeIn 0.35s ease'
    ].join(';');
    banner.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2a7a4f"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
             style="flex-shrink:0;margin-top:2px">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <circle cx="12" cy="16" r="0.5" fill="#2a7a4f"/>
        </svg>
        <div style="flex:1;min-width:0;">
          <div style="font-size:14px;font-weight:600;color:#1a5c39;margin-bottom:4px;">
            Generic alternative available
          </div>
          <div style="font-size:13px;color:#2c5e45;line-height:1.45;">
            <strong>${altName}</strong> is a generic version of
            <strong>${selectedDrug.MedDrugName}</strong> and may cost significantly less.
          </div>
          <button id="generic-alt-btn" style="
            margin-top:10px;background:#2a7a4f;color:#fff;border:none;
            border-radius:8px;padding:7px 14px;font-size:13px;font-weight:600;
            cursor:pointer;font-family:inherit;transition:background 0.15s ease;
          " onmouseover="this.style.background='#225f3d'"
            onmouseout="this.style.background='#2a7a4f'">
            Search for ${altName}
          </button>
        </div>
        <button aria-label="Dismiss" style="
          background:none;border:none;cursor:pointer;padding:0 0 0 4px;
          color:#2a7a4f;font-size:16px;line-height:1;flex-shrink:0;opacity:0.55;
        " onclick="document.getElementById('generic-alt-banner').remove()">&#x2715;</button>
    `;

    pharmacyListDiv.insertAdjacentElement('beforebegin', banner);

    document.getElementById('generic-alt-btn').addEventListener('click', () => {
        banner.remove();
        suggestionsDiv.innerHTML = '';

        // Populate shared state with the already-fetched generic drug data
        inputField.value = match.MedDrugName;
        drugData = genericDrugs;
        currentNDC = match.Ndc;

        // Build dosage and form dropdowns from all variants of this generic
        const dSet = new Set(), fSet = new Set();
        genericDrugs
            .filter(d => d.MedDrugName === match.MedDrugName)
            .forEach(d => { dSet.add(`${d.MedStrength} ${d.Uom}`); fSet.add(d.DosageForm); });
        renderDropdown(dosageDropdown, [...dSet]);
        renderDropdown(formDropdown,   [...fSet]);

        const packSize = parseInt(match.MedPackSize) || 30;
        document.getElementById('quantity').value = packSize;

        // Run the search immediately — no need to go through the suggestion step
        handleDrugSearch(match.MedDrugName, `${match.MedStrength} ${match.Uom}`, match.DosageForm, packSize);
    });
}

async function handleDrugSearch(drugName, dosage, form, quantity = 30) {
    quantity = parseInt(document.getElementById('quantity').value) || 30;

    let selectedDrug = drugData.find(drug =>
        drug.MedDrugName === drugName &&
        `${drug.MedStrength} ${drug.Uom}` === dosage &&
        drug.DosageForm === form
    );

    if (!selectedDrug && recentSearches) {
        const hit = recentSearches.find(drug =>
            drug.details.overallData.MedDrugName === drugName &&
            `${drug.details.overallData.MedStrength} ${drug.details.overallData.Uom}` === dosage &&
            drug.details.overallData.DosageForm === form
        );
        if (hit) selectedDrug = hit.details.overallData;
    }

    const errorMessageElement = document.getElementById('errorMessage');
    if (!selectedDrug) {
        if (errorMessageElement) errorMessageElement.textContent = 'Drug not found.';
        return;
    }

    storeAndDisplayRecent5Search(drugName, {
        dosages: [selectedDrug.MedStrength + ' ' + selectedDrug.Uom],
        forms: [selectedDrug.DosageForm],
        quantity, overallData: selectedDrug
    });

    showLoader();
    pharmacyListDiv.innerHTML = '';

    const payload = {
        memberNumber: '01',
        ndc:          selectedDrug.Ndc,
        quantity,
        daysSupply:   3,
        groupNum:     'TPD001',
        zip:          userZip,
        radius:       userRadius,
        maxRecords:   3000,
    };

    const pharmacies = await fetchPharmacies(payload);
    document.getElementById('loader').style.display = 'none';
    resultsDiv.style.display = pharmacies.length > 0 ? 'block' : 'none';

    if (pharmacies.length === 0) {
        if (errorMessageElement) errorMessageElement.textContent = 'No pharmacies found.';
        pharmacyListDiv.innerHTML = '';
        return;
    }

    if (errorMessageElement) errorMessageElement.textContent = '';
    hideLoader();

    function removeOutliersUsingSD(data, multiplier = 2) {
        const prices = data.map(p => parseFloat(p.Pricing?.PatientPay)).filter(p => !isNaN(p));
        if (prices.length < 2) return data;
        const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
        const sd   = Math.sqrt(prices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / prices.length);
        return data.filter(p => { const v = parseFloat(p.Pricing?.PatientPay); return v >= mean - multiplier * sd && v <= mean + multiplier * sd; });
    }

    const validPharmacies = pharmacies
        .filter(p => p.Pricing?.PatientPay != null && p.Pricing.PatientPay !== '')
        .map(p => ({ ...p, PatientPay: parseFloat(p.Pricing.PatientPay) }));

    if (validPharmacies.length === 0) {
        if (errorMessageElement) errorMessageElement.textContent = 'No pharmacies found with valid pricing.';
        pharmacyListDiv.innerHTML = ''; return;
    }

    const filteredPharmacies = removeOutliersUsingSD(validPharmacies, 1.5);
    filteredPharmacies.sort((a, b) => a.PatientPay - b.PatientPay);

    if (filteredPharmacies.length === 0) {
        if (errorMessageElement) errorMessageElement.textContent = 'No pharmacies found after filtering outliers.';
        pharmacyListDiv.innerHTML = ''; return;
    }

    const tier1             = filteredPharmacies.filter(p => p.Pharmacy?.Tier === '1');
    const uniqueGroups      = new Set(tier1.map(p => p.Pricing?.CostCalculatorRuleName || 'UNKNOWN'));
    const multipleGroupsPresent = uniqueGroups.size > 1;
    const seenGroups        = new Set();
    const featuredPharmacies = [];

    for (const pharmacy of filteredPharmacies) {
        if (pharmacy.Pharmacy?.Tier === '1') {
            const group = pharmacy.Pricing?.CostCalculatorRuleName || 'UNKNOWN';
            if (multipleGroupsPresent) {
                if (!seenGroups.has(group)) { seenGroups.add(group); featuredPharmacies.push(pharmacy); }
            } else {
                featuredPharmacies.push(pharmacy);
            }
        }
        if (featuredPharmacies.length === 3) break;
    }

    const featuredNpiSet    = new Set(featuredPharmacies.map(p => p.Pharmacy?.Npi));
    const regularPharmacies = filteredPharmacies.filter(p => !featuredNpiSet.has(p.Pharmacy?.Npi));
    const displayPharmacies = [...featuredPharmacies, ...regularPharmacies.slice(0, 9 - featuredPharmacies.length)];

    const resolvedDrugName = selectedDrug?.MedDrugName || 'Unknown Drug';
    const resolvedDosage   = selectedDrug?.MedStrength ? `${selectedDrug.MedStrength} ${selectedDrug.Uom}` : 'Unknown Dosage';
    const resolvedForm     = selectedDrug?.DosageForm  || 'Unknown Form';

    document.getElementById('selected-drug-name').textContent = resolvedDrugName;
    document.getElementById('selected-dosage').textContent    = resolvedDosage;
    document.getElementById('selected-quantity').textContent  = quantity;
    document.getElementById('selected-form').textContent      = resolvedForm;

    const firstPharmacy           = displayPharmacies[0];
    const firstPharmacyName       = firstPharmacy ? toTitleCaseWithSpecialRule(trimLastWordIfEndsWithNumber(firstPharmacy.Pharmacy?.Name || '')) : null;
    const firstPharmacyNpi        = firstPharmacy?.Pharmacy?.Npi || null;
    const firstPharmacyIsFeatured = featuredPharmacies.length > 0 && firstPharmacy === featuredPharmacies[0];

    trackSearch({
        session_id:             SESSION_ID,
        source_url:             SOURCE_URL,
        source_domain:          SOURCE_DOMAIN,
        source_path:            SOURCE_PATH,
        device_type:            DEVICE_TYPE,
        browser:                BROWSER,
        zip:                    userZip,
        city:                   userCity,
        state:                  userState,
        ip_zip:                 ipDetectedZip,
        ip_city:                ipDetectedCity,
        ip_state:               ipDetectedState,
        ip_source:              ipDetectedSource,
        drug_name:              resolvedDrugName,
        dosage:                 resolvedDosage,
        form:                   resolvedForm,
        quantity,
        ndc:                    selectedDrug?.Ndc  || null,
        gpi:                    selectedDrug?.Gpi  || null,
        npi:                    filteredPharmacies[0]?.Pharmacy?.Npi || null,
        result_count:           displayPharmacies.length,
        featured_count:         featuredPharmacies.length,
        has_featured:           featuredPharmacies.length > 0,
        top_price:              filteredPharmacies[0]?.PatientPay || null,
        group_conflict:         multipleGroupsPresent,
        printed:                false,
        abandoned:              false,
        recent_search:          isRecentSearch,
        session_start:          SESSION_START.toISOString(),
        search_timestamp:       new Date().toISOString(),
        selected_pharmacy_name: firstPharmacyName,
        selected_pharmacy_npi:  firstPharmacyNpi,
        selected_is_featured:   firstPharmacyIsFeatured,
        selected_card_position: 0,
        result_pharmacies:      JSON.stringify(
            displayPharmacies.filter(p => p.Pharmacy?.Name).map((p, i) => ({
                position:    i,
                npi:         p.Pharmacy?.Npi  || null,
                name:        p.Pharmacy?.Name || null,
                is_featured: i < featuredPharmacies.length,
                price:       p.PatientPay     || null
            }))
        )
    });

    isRecentSearch = false;

    pharmacyListDiv.innerHTML = displayPharmacies
        .filter(p => p.Pricing?.PatientPay && p.Pharmacy?.Name)
        .map((pharmacy, index) => {
            const isFeatured     = index < featuredPharmacies.length;
            const formattedPrice = formatNumberWithCommas(pharmacy.Pricing.PatientPay);
            const formattedName  = toTitleCaseWithSpecialRule(trimLastWordIfEndsWithNumber(pharmacy.Pharmacy.Name));
            const formattedAddr1 = toTitleCaseWithSpecialRule(trimLastWordIfEndsWithNumber(pharmacy.Pharmacy.Address1));
            const formattedAddr2 = toTitleCaseWithSpecialRule(trimLastWordIfEndsWithNumber(pharmacy.Pharmacy.Address2));
            return `
                <div class="pharmacy-card${isFeatured ? ' featured-pharmacy' : ''}"
                     data-npi="${pharmacy.Pharmacy.Npi}"
                     data-pharmacy-name="${formattedName}"
                     data-price="${formattedPrice}"
                     data-drug-name="${resolvedDrugName}"
                     data-dosage="${resolvedDosage}"
                     data-quantity="${quantity || 'Unknown Quantity'}"
                     data-form="${resolvedForm}"
                     data-index="${index}">
                  ${isFeatured ? `
                    <div class="holo-sheen"></div>
                    <div class="featured-badge"><span class="shimmer-bar"></span>Featured</div>
                    <canvas class="star-canvas" width="56" height="56"></canvas>
                  ` : ''}
                  <div class="dot"></div>
                  <h1 class="price">$${formattedPrice}</h1>
                  <h4>${formattedName}</h4>
                  <p>${formattedAddr1} ${formattedAddr2}</p>
                  <p>
                    ${pharmacy.Pharmacy.City ? pharmacy.Pharmacy.City.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : 'Unknown City'},
                    ${pharmacy.Pharmacy.State || 'Unknown State'}
                    ${pharmacy.Pharmacy.Zip ? pharmacy.Pharmacy.Zip.substring(0, 5) : ''}
                  </p>
                </div>`;
        }).join('');

    initializePharmacyCardListeners();
    showGenericAlternativesBanner(selectedDrug);
}

function initializePharmacyCardListeners() {
    const pharmacyCards = document.querySelectorAll('.pharmacy-card');
    let selectedId = null;

    pharmacyCards.forEach((card, i) => {
        setTimeout(() => card.classList.add('card-visible'), i * 80);
    });

    document.querySelectorAll('.pharmacy-card.featured-pharmacy').forEach(card => {
        const sheen = card.querySelector('.holo-sheen');
        if (!sheen) return;
        card.addEventListener('mousemove', (e) => {
            if (!card.classList.contains('selected')) return;
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left, y = e.clientY - rect.top;
            const dx = (x / rect.width - 0.5) * 2, dy = (y / rect.height - 0.5) * 2;
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            card.style.transition = 'box-shadow 0.08s ease, border-color 0.15s ease';
            card.style.transform  = `scale(1.075) rotateX(${dy * -13}deg) rotateY(${dx * 13}deg)`;
            sheen.style.opacity   = '1';
            sheen.style.background = `
                linear-gradient(${angle}deg,rgba(255,210,80,0) 0%,rgba(255,200,60,${0.08+Math.abs(dy)*0.06}) 25%,rgba(255,240,160,${0.13+Math.abs(dx)*0.07}) 50%,rgba(220,170,50,${0.08+Math.abs(dy)*0.06}) 75%,rgba(255,210,80,0) 100%),
                radial-gradient(ellipse 90% 80% at ${(x/rect.width)*100}% ${(y/rect.height)*100}%,rgba(255,255,220,0.11) 0%,rgba(255,220,100,0.06) 45%,transparent 75%)`;
            card.style.boxShadow   = `${dx*18}px ${dy*18+16}px 44px rgba(180,140,60,0.2),${-dx*9}px ${-dy*9}px 22px rgba(220,180,60,0.1),0 2px 12px rgba(0,0,0,0.07)`;
            card.style.borderColor = `rgba(200,160,55,${0.5+Math.abs(dx)*0.25})`;
        });
        card.addEventListener('mouseleave', () => {
            if (!card.classList.contains('selected')) return;
            card.style.transition  = 'transform 0.55s cubic-bezier(0.34,1.42,0.64,1),box-shadow 0.5s ease,border-color 0.4s ease';
            card.style.transform   = 'scale(1.075) rotateX(0deg) rotateY(0deg)';
            card.style.borderColor = ''; card.style.boxShadow = '';
            sheen.style.opacity    = '0';
        });
    });

    pharmacyCards.forEach((card) => {
        card.addEventListener('mousedown', (e) => {
            const id = card.dataset.npi;
            const ripple = document.createElement('div');
            ripple.className = 'ripple';
            const rect = card.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            ripple.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX-rect.left-size/2}px;top:${e.clientY-rect.top-size/2}px`;
            card.appendChild(ripple);
            ripple.addEventListener('animationend', () => ripple.remove(), { once: true });

            if (selectedId !== null && selectedId !== id) {
                const prev = document.querySelector(`[data-npi="${selectedId}"]`);
                if (prev) {
                    const prevSheen = prev.querySelector('.holo-sheen');
                    const prevCanvas = prev.querySelector('.star-canvas');
                    prev.classList.remove('selected', 'animate-click');
                    prev.style.transform = ''; prev.style.borderColor = ''; prev.style.boxShadow = '';
                    if (prevSheen) prevSheen.style.opacity = '0';
                    if (prevCanvas) { prevCanvas.style.opacity = '0'; if (starStoppers.get(prev)) { starStoppers.get(prev)(); starStoppers.delete(prev); } }
                    void prev.offsetWidth;
                    prev.classList.add('animate-deselect');
                    prev.addEventListener('animationend', () => prev.classList.remove('animate-deselect'), { once: true });
                }
            }

            if (selectedId === id) {
                const sh = card.querySelector('.holo-sheen');
                const canvas = card.querySelector('.star-canvas');
                card.classList.remove('selected', 'animate-click');
                card.style.transform = ''; card.style.borderColor = ''; card.style.boxShadow = '';
                if (sh) sh.style.opacity = '0';
                if (canvas) { canvas.style.opacity = '0'; if (starStoppers.get(card)) { starStoppers.get(card)(); starStoppers.delete(card); } }
                void card.offsetWidth;
                card.classList.add('animate-deselect');
                card.addEventListener('animationend', () => card.classList.remove('animate-deselect'), { once: true });
                selectedId = null;
                return;
            }

            card.classList.remove('animate-deselect');
            void card.offsetWidth;
            card.classList.add('selected', 'animate-click');
            card.addEventListener('animationend', () => card.classList.remove('animate-click'), { once: true });
            selectedId = id;

            currentSelectedNpi        = card.dataset.npi;
            currentSelectedPosition   = parseInt(card.dataset.index) || 0;
            currentSelectedIsFeatured = card.classList.contains('featured-pharmacy');

            updateSearchRecord({
                selected_pharmacy_name: card.dataset.pharmacyName,
                selected_pharmacy_npi:  currentSelectedNpi,
                selected_is_featured:   currentSelectedIsFeatured,
                selected_card_position: currentSelectedPosition
            });
            if (typeof showFeedbackBar === 'function') showFeedbackBar();
            if (card.classList.contains('featured-pharmacy')) {
                const canvas = card.querySelector('.star-canvas');
                if (canvas) {
                    canvas.style.opacity = '1';
                    const stop = animateStar(canvas);
                    starStoppers.set(card, stop);
                }
            }

            const pharmacyName = card.dataset.pharmacyName;
            const price        = card.dataset.price;
            const drugName     = card.dataset.drugName;
            const dosage       = card.dataset.dosage;
            const quantity     = card.dataset.quantity;
            const form         = card.dataset.form;

            document.getElementById('selected-pharmacy-name').textContent  = pharmacyName;
            document.getElementById('selected-price').textContent          = `$${price}`;
            document.getElementById('selected-pharmacy-name1').textContent = pharmacyName;
            document.getElementById('selected-price1').textContent         = `$${price}`;
            document.getElementById('selected-drug-name1').textContent     = drugName;
            document.getElementById('selected-dosage1').textContent        = dosage;
            document.getElementById('selected-quantity1').textContent      = quantity;
            document.getElementById('selected-form1').textContent          = form;
        });
    });

    if (pharmacyCards.length > 0) {
        pharmacyCards[0].classList.add('card-visible');
        pharmacyCards[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    }
}

function formatNumberWithCommas(num) {
    return parseFloat(num).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function trimLastWordIfEndsWithNumber(str) {
    const match = str.match(/(#?\d+)$/);
    return match ? str.replace(match[0], '').trim() : str.trim();
}

function toTitleCaseWithSpecialRule(str) {
    return str.split(' ').map(word =>
        word.length > 1 ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word.toUpperCase()
    ).join(' ');
}

window.onload = function () { console.log('Page fully loaded'); };

loadRecentSearches();

function showLoader() {
    let loader = document.getElementById('dynamic-loader');
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'dynamic-loader';
        loader.innerHTML = `
            <div class="pill-container">
                <div class="capsule"><div class="half half-left"></div><div class="half half-right"></div></div>
                <div class="sparkles"><span class="sparkle"></span><span class="sparkle"></span><span class="sparkle"></span><span class="sparkle"></span><span class="sparkle"></span></div>
                <h3 class="loading-message">Loading...</h3>
            </div>`;
        document.body.appendChild(loader);
    }
    loader.style.display = 'flex';
}

function hideLoader() {
    const loader = document.getElementById('dynamic-loader');
    if (loader) loader.remove();
}

(function () {
    if (window.__phoenixFetchPatched) return;
    window.__phoenixFetchPatched = true;
    var origFetch = window.fetch;
    var apiBase   = (typeof baseUrl === 'string' && baseUrl) || 'https://phoenixapi.rxlogic.com';
    function writeTTFB(ms) { var box = document.getElementById('ttfb'); if (box) box.textContent = ms + 'ms'; }
    window.fetch = async function (input, init) {
        init = init || {};
        var url       = (typeof input === 'string') ? input : (input && input.url) || '';
        var isPhoenix = url.indexOf(apiBase) === 0;
        var start     = performance.now();
        try {
            var res       = await origFetch(input, init);
            var headersAt = performance.now();
            if (isPhoenix) { var ttfb = (headersAt - start).toFixed(0); console.log('[APITIMING]', ttfb + 'ms'); writeTTFB(ttfb); }
            return res;
        } catch (err) { throw err; }
    };
})();
