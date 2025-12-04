/* ========================================
   Hangzhou Inundation Reporting Tool
   JavaScript Application
   ======================================== */

// ========================================
// Global Variables
// ========================================

// Map instance
let map;

// Layer groups
const layers = {
    roads: null,
    water: null,
    parks: null,
    amenities: null,
    metro: null,
    floods: null,
    boundary: null
};

// Current report marker
let currentMarker = null;
let selectedLocation = null;

// Report data storage
let floodReports = [];

// Form state
let formState = {
    location: null,
    depth: null,
    situation: null
};

// Uploaded photo
let uploadedPhoto = null;

// ========================================
// Initialization
// ========================================

document.addEventListener('DOMContentLoaded', function() {
    initializeMap();
    initializeLayerGroups();
    loadGeoJSONData();
    initializeEventListeners();
    setDefaultDateTime();
    addDemoData();
});

// Initialize Leaflet map
function initializeMap() {
    map = L.map('map', {
        center: [30.25, 120.15],
        zoom: 11,
        zoomControl: true
    });
    
    // Add dark theme base tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 19
    }).addTo(map);
    
    // Map click handler
    map.on('click', handleMapClick);
}

// Initialize layer groups
function initializeLayerGroups() {
    layers.roads = L.layerGroup().addTo(map);
    layers.water = L.layerGroup().addTo(map);
    layers.parks = L.layerGroup().addTo(map);
    layers.amenities = L.layerGroup().addTo(map);
    layers.metro = L.layerGroup().addTo(map);
    layers.floods = L.layerGroup().addTo(map);
    layers.boundary = L.layerGroup().addTo(map);
}

// ========================================
// Data Loading
// ========================================

async function loadGeoJSONData() {
    // Helper to load a single GeoJSON layer without breaking others if one fails
    async function loadLayer(url, name, options, targetLayer) {
        try {
            console.log(`Loading ${name} from ${url}...`);
            const res = await fetch(url);
            if (!res.ok) {
                throw new Error(`HTTP ${res.status} when fetching ${url}`);
            }
            const data = await res.json();
            L.geoJSON(data, options).addTo(targetLayer);
            const featureCount = data && data.features ? data.features.length : 'unknown';
            console.log(`✓ Loaded ${name} (${featureCount} features).`);
        } catch (error) {
            console.error(`✗ Failed to load ${name} from ${url}:`, error);
        }
    }

    // Load boundary outline
    await loadLayer(
        'HZ_Center.geojson',
        'boundary',
        {
            style: {
                color: '#00A5D6',
                weight: 3,
                fillColor: '#00A5D6',
                fillOpacity: 0.05,
                dashArray: '10, 5'
            }
        },
        layers.boundary
    );

    // Load simplified roads
    await loadLayer(
        'roads_simplified.geojson',
        'roads',
        {
            style: {
                color: '#4a4a4a',
                weight: 1,
                opacity: 0.6
            }
        },
        layers.roads
    );

    // Load water bodies
    await loadLayer(
        'water.geojson',
        'water',
        {
            style: {
                color: '#3498DB',
                weight: 1,
                fillColor: '#3498DB',
                fillOpacity: 0.4
            }
        },
        layers.water
    );

    // Load parks/green space
    await loadLayer(
        'park.geojson',
        'parks',
        {
            style: {
                color: '#27AE60',
                weight: 1,
                fillColor: '#27AE60',
                fillOpacity: 0.3
            }
        },
        layers.parks
    );

    // Load amenities (points of interest)
    await loadLayer(
        'amenity.geojson',
        'amenities',
        {
            pointToLayer: (feature, latlng) => {
                return L.circleMarker(latlng, {
                    radius: 4,
                    fillColor: '#E67E22',
                    color: '#E67E22',
                    weight: 1,
                    opacity: 0.8,
                    fillOpacity: 0.6
                });
            },
            onEachFeature: (feature, layer) => {
                if (feature.properties && feature.properties.name) {
                    layer.bindPopup(createAmenityPopup(feature.properties));
                }
            }
        },
        layers.amenities
    );

    // Load metro stations
    await loadLayer(
        'metrostation.geojson',
        'metro',
        {
            pointToLayer: (feature, latlng) => {
                return L.circleMarker(latlng, {
                    radius: 6,
                    fillColor: '#9B59B6',
                    color: '#ffffff',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.9
                });
            },
            onEachFeature: (feature, layer) => {
                if (feature.properties && feature.properties.name) {
                    layer.bindPopup(createMetroPopup(feature.properties));
                }
            }
        },
        layers.metro
    );
}


// ========================================
// Popup Creators
// ========================================

function createAmenityPopup(props) {
    return `
        <div class="popup-content">
            <div class="popup-header">
                <div class="popup-icon">🏢</div>
                <div>
                    <div class="popup-title">${props.name}</div>
                    <div class="popup-subtitle">${props.category || ''}</div>
                </div>
            </div>
            ${props.address ? `<div class="popup-detail"><span class="popup-detail-label">地址:</span> ${props.address}</div>` : ''}
        </div>
    `;
}

function createMetroPopup(props) {
    return `
        <div class="popup-content">
            <div class="popup-header">
                <div class="popup-icon">🚇</div>
                <div>
                    <div class="popup-title">${props.name}</div>
                    <div class="popup-subtitle">${props.address || ''}</div>
                </div>
            </div>
        </div>
    `;
}

function createFloodPopup(report) {
    const depthLabels = {
        shallow: '浅 <10cm',
        moderate: '中 10-30cm',
        deep: '深 30-50cm',
        severe: '严重 >50cm'
    };
    
    const situationLabels = {
        home: '家附近',
        commute: '通勤路上',
        work: '工作地点',
        other: '其他'
    };
    
    return `
        <div class="popup-content">
            <div class="popup-header">
                <div class="popup-icon">🌊</div>
                <div>
                    <div class="popup-title">内涝上报 Flood Report</div>
                    <div class="popup-subtitle">${report.date} ${report.time}</div>
                </div>
            </div>
            <div class="popup-detail">
                <span class="popup-detail-label">深度 Depth:</span>
                <span>${depthLabels[report.depth]}</span>
            </div>
            <div class="popup-detail">
                <span class="popup-detail-label">类型 Type:</span>
                <span>${situationLabels[report.situation]}</span>
            </div>
            ${report.description ? `<div class="popup-detail"><span class="popup-detail-label">描述:</span> ${report.description}</div>` : ''}
            ${report.photo ? `<img src="${report.photo}" class="popup-image" alt="Flood photo">` : ''}
        </div>
    `;
}

// ========================================
// Marker Icons
// ========================================

function createFloodIcon(depth) {
    const colors = {
        shallow: '#85C1E9',
        moderate: '#3498DB',
        deep: '#1A5276',
        severe: '#C0392B'
    };
    
    return L.divIcon({
        className: 'flood-marker',
        html: `<div style="
            width: 28px;
            height: 28px;
            background: ${colors[depth]};
            border: 3px solid white;
            border-radius: 50%;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
        ">💧</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
    });
}

function createTempMarkerIcon() {
    return L.divIcon({
        className: 'temp-marker',
        html: `<div style="
            width: 32px;
            height: 32px;
            background: linear-gradient(135deg, #E67E22 0%, #C0392B 100%);
            border: 3px solid white;
            border-radius: 50%;
            box-shadow: 0 4px 15px rgba(0,0,0,0.4);
            animation: pulse 1.5s ease-in-out infinite;
        "></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });
}

// ========================================
// Event Handlers
// ========================================

function initializeEventListeners() {
    // Depth selection
    document.querySelectorAll('.depth-option').forEach(option => {
        option.addEventListener('click', handleDepthSelect);
    });
    
    // Situation selection
    document.querySelectorAll('.situation-chip').forEach(chip => {
        chip.addEventListener('click', handleSituationSelect);
    });
    
    // Photo upload
    const photoUpload = document.getElementById('photoUpload');
    const photoInput = document.getElementById('photoInput');
    photoUpload.addEventListener('click', () => photoInput.click());
    photoInput.addEventListener('change', handlePhotoUpload);
    
    // Form validation on input change
    document.getElementById('eventDate').addEventListener('change', validateForm);
    document.getElementById('eventTime').addEventListener('change', validateForm);
    
    // Form submission
    document.getElementById('reportForm').addEventListener('submit', handleFormSubmit);
    
    // Layer toggles
    document.querySelectorAll('.layer-item').forEach(item => {
        item.addEventListener('click', handleLayerToggle);
    });
    
    // Mode toggle
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', handleModeToggle);
    });
    
    // Filter functionality
    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', handleFilterChipClick);
    });
    document.getElementById('filterDateFrom').addEventListener('change', filterReports);
    document.getElementById('filterDateTo').addEventListener('change', filterReports);
    
    // Close instructions
    document.getElementById('closeInstructions').addEventListener('click', () => {
        document.getElementById('instructions').style.display = 'none';
    });
}

function handleMapClick(e) {
    const latlng = e.latlng;
    
    // Remove existing marker
    if (currentMarker) {
        map.removeLayer(currentMarker);
    }
    
    // Add new marker
    currentMarker = L.marker(latlng, {
        icon: createTempMarkerIcon()
    }).addTo(map);
    
    // Update form state
    selectedLocation = latlng;
    formState.location = latlng;
    
    // Update location display
    updateLocationDisplay(latlng);
    
    // Hide instructions
    document.getElementById('instructions').style.display = 'none';
    
    // Validate form
    validateForm();
}

function handleDepthSelect() {
    document.querySelectorAll('.depth-option').forEach(o => o.classList.remove('selected'));
    this.classList.add('selected');
    formState.depth = this.dataset.depth;
    validateForm();
}

function handleSituationSelect() {
    document.querySelectorAll('.situation-chip').forEach(c => c.classList.remove('selected'));
    this.classList.add('selected');
    formState.situation = this.dataset.situation;
    validateForm();
}

function handlePhotoUpload(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            uploadedPhoto = e.target.result;
            const photoUpload = document.getElementById('photoUpload');
            photoUpload.innerHTML = `<img src="${uploadedPhoto}" class="photo-preview" alt="Preview">`;
            photoUpload.classList.add('has-image');
        };
        reader.readAsDataURL(file);
    }
}

function handleFormSubmit(e) {
    e.preventDefault();
    
    const report = {
        id: Date.now(),
        location: {
            lat: formState.location.lat,
            lng: formState.location.lng
        },
        date: document.getElementById('eventDate').value,
        time: document.getElementById('eventTime').value,
        depth: formState.depth,
        situation: formState.situation,
        description: document.getElementById('locationDesc').value,
        photo: uploadedPhoto,
        timestamp: new Date().toISOString()
    };
    
    // Add to reports array
    floodReports.push(report);
    
    // Add marker to flood layer
    addFloodMarker(report);
    
    // Update stats
    updateStats();
    
    // Show success toast
    showToast();
    
    // Reset form
    resetForm();
    
    // Update report list
    updateReportList();
}

function handleLayerToggle() {
    const layerName = this.dataset.layer;
    this.classList.toggle('active');
    
    if (this.classList.contains('active')) {
        map.addLayer(layers[layerName]);
    } else {
        map.removeLayer(layers[layerName]);
    }
}

function handleModeToggle() {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    
    const mode = this.dataset.mode;
    if (mode === 'report') {
        document.getElementById('reportForm').style.display = 'block';
        document.getElementById('reportList').style.display = 'none';
    } else {
        document.getElementById('reportForm').style.display = 'none';
        document.getElementById('reportList').style.display = 'block';
    }
}

function handleFilterChipClick() {
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    this.classList.add('active');
    filterReports();
}

// ========================================
// UI Updates
// ========================================

function updateLocationDisplay(latlng) {
    const locationDisplay = document.getElementById('locationDisplay');
    locationDisplay.innerHTML = `
        <div class="location-icon">📍</div>
        <div class="location-coords">
            <div class="location-coords-label">选择的位置 Selected Location</div>
            <div class="location-coords-value">${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}</div>
        </div>
    `;
}

function updateStats() {
    document.getElementById('totalReports').textContent = floodReports.length;
    
    const today = new Date().toISOString().split('T')[0];
    const todayCount = floodReports.filter(r => r.date === today).length;
    document.getElementById('todayReports').textContent = todayCount;
}

function updateReportList() {
    const container = document.getElementById('reportItems');
    const depthLabels = {
        shallow: '浅',
        moderate: '中',
        deep: '深',
        severe: '严重'
    };
    
    container.innerHTML = floodReports.slice().reverse().map(report => `
        <div class="report-item" data-id="${report.id}">
            <div class="report-header">
                <div class="report-time">${report.date} ${report.time}</div>
                <div class="report-depth-badge badge-${report.depth}">${depthLabels[report.depth]}</div>
            </div>
            <div class="report-location">${report.description || `${report.location.lat.toFixed(4)}, ${report.location.lng.toFixed(4)}`}</div>
        </div>
    `).join('');
    
    // Add click handlers to zoom to report
    container.querySelectorAll('.report-item').forEach(item => {
        item.addEventListener('click', function() {
            const report = floodReports.find(r => r.id === parseInt(this.dataset.id));
            if (report) {
                map.setView([report.location.lat, report.location.lng], 15);
            }
        });
    });
}

function showToast() {
    const toast = document.getElementById('toast');
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// ========================================
// Form Helpers
// ========================================

function validateForm() {
    const date = document.getElementById('eventDate').value;
    const time = document.getElementById('eventTime').value;
    const submitBtn = document.getElementById('submitBtn');
    
    if (formState.location && formState.depth && formState.situation && date && time) {
        submitBtn.disabled = false;
    } else {
        submitBtn.disabled = true;
    }
}

function setDefaultDateTime() {
    const now = new Date();
    document.getElementById('eventDate').value = now.toISOString().split('T')[0];
    document.getElementById('eventTime').value = now.toTimeString().slice(0, 5);
}

function resetForm() {
    // Remove temp marker
    if (currentMarker) {
        map.removeLayer(currentMarker);
        currentMarker = null;
    }
    
    // Reset state
    selectedLocation = null;
    formState = { location: null, depth: null, situation: null };
    
    // Reset location display
    document.getElementById('locationDisplay').innerHTML = `
        <div class="location-icon">📍</div>
        <div class="location-placeholder">请在地图上点击选择位置<br>Click on the map to select location</div>
    `;
    
    // Reset selections
    document.querySelectorAll('.depth-option').forEach(o => o.classList.remove('selected'));
    document.querySelectorAll('.situation-chip').forEach(c => c.classList.remove('selected'));
    document.getElementById('locationDesc').value = '';
    
    // Reset photo
    const photoUpload = document.getElementById('photoUpload');
    photoUpload.innerHTML = `
        <div class="photo-upload-icon">📷</div>
        <div class="photo-upload-text">点击或拖拽上传照片<br>Click or drag to upload</div>
    `;
    photoUpload.classList.remove('has-image');
    uploadedPhoto = null;
    document.getElementById('photoInput').value = '';
    
    // Disable submit button
    document.getElementById('submitBtn').disabled = true;
    
    // Reset date/time to now
    setDefaultDateTime();
}

// ========================================
// Flood Markers
// ========================================

function addFloodMarker(report) {
    const marker = L.marker([report.location.lat, report.location.lng], {
        icon: createFloodIcon(report.depth)
    });
    
    marker.bindPopup(createFloodPopup(report));
    marker.reportData = report;
    marker.addTo(layers.floods);
}

// ========================================
// Filter Functionality
// ========================================

function filterReports() {
    const depthFilter = document.querySelector('.filter-chip.active').dataset.depth;
    const dateFrom = document.getElementById('filterDateFrom').value;
    const dateTo = document.getElementById('filterDateTo').value;
    
    // Clear flood layer
    layers.floods.clearLayers();
    
    // Re-add filtered markers
    floodReports.forEach(report => {
        let show = true;
        
        if (depthFilter !== 'all' && report.depth !== depthFilter) {
            show = false;
        }
        
        if (dateFrom && report.date < dateFrom) {
            show = false;
        }
        
        if (dateTo && report.date > dateTo) {
            show = false;
        }
        
        if (show) {
            addFloodMarker(report);
        }
    });
}

// ========================================
// Demo Data
// ========================================

function addDemoData() {
    const demoReports = [
        {
            id: 1,
            location: { lat: 30.2574, lng: 120.1583 },
            date: '2025-06-15',
            time: '08:30',
            depth: 'moderate',
            situation: 'commute',
            description: '中河北路与庆春路交叉口',
            photo: null,
            timestamp: new Date().toISOString()
        },
        {
            id: 2,
            location: { lat: 30.2456, lng: 120.1789 },
            date: '2025-06-15',
            time: '09:15',
            depth: 'deep',
            situation: 'work',
            description: '凤起路地铁站附近',
            photo: null,
            timestamp: new Date().toISOString()
        },
        {
            id: 3,
            location: { lat: 30.2312, lng: 120.1456 },
            date: '2025-06-14',
            time: '16:45',
            depth: 'shallow',
            situation: 'home',
            description: '西湖文化广场周边',
            photo: null,
            timestamp: new Date().toISOString()
        },
        {
            id: 4,
            location: { lat: 30.2689, lng: 120.1234 },
            date: '2025-06-14',
            time: '07:20',
            depth: 'severe',
            situation: 'commute',
            description: '文三路与学院路路口',
            photo: null,
            timestamp: new Date().toISOString()
        },
        {
            id: 5,
            location: { lat: 30.1923, lng: 120.2134 },
            date: '2025-06-13',
            time: '14:30',
            depth: 'moderate',
            situation: 'other',
            description: '滨江区江南大道',
            photo: null,
            timestamp: new Date().toISOString()
        }
    ];
    
    demoReports.forEach(report => {
        floodReports.push(report);
        addFloodMarker(report);
    });
    
    updateStats();
    updateReportList();
}
