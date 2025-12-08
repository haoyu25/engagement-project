import { saveFloodReport, loadFloodReports } from './firestore.js';
import { initializeHeatmap, toggleHeatmap, updateHeatmapData } from './heatmap.js'; 

let map;

// Layer groups
const layers = {
    roads: null,
    water: null,
    parks: null,
    amenities: null,
    metro: null,
    floods: null,
    boundary: null,
    heatmap: null
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

// ========================================
// Initialization
// ========================================

document.addEventListener('DOMContentLoaded', async function() {
    initializeMap();
    initializeLayerGroups();
    await loadGeoJSONData();
    initializeEventListeners();
    setDefaultDateTime();
    await reloadReports(); // 从 Firestore 加载报告
});

// ========================================
// Map & Layers
// ========================================

function initializeMap() {
    map = L.map('map', { center: [30.25, 120.15], zoom: 11, zoomControl: true });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        maxZoom: 19
    }).addTo(map);

    map.on('click', handleMapClick);
}

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
    async function loadLayer(url, name, options, targetLayer) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            L.geoJSON(data, options).addTo(targetLayer);
        } catch (error) {
            console.error(`Failed to load ${name}:`, error);
        }
    }

    await loadLayer('data/HZ_Center.geojson', 'boundary', {
        style: { color: '#00A5D6', weight: 3, fillColor: '#00A5D6', fillOpacity: 0.05, dashArray: '10,5' }
    }, layers.boundary);

    await loadLayer('data/roads_simplified.geojson', 'roads', {
        style: { color: '#4a4a4a', weight: 1, opacity: 0.6 }
    }, layers.roads);

    await loadLayer('data/water.geojson', 'water', {
        style: { color: '#3498DB', weight: 1, fillColor: '#3498DB', fillOpacity: 0.4 }
    }, layers.water);

    await loadLayer('data/park.geojson', 'parks', {
        style: { color: '#27AE60', weight: 1, fillColor: '#27AE60', fillOpacity: 0.3 }
    }, layers.parks);

    await loadLayer('data/amenity.geojson', 'amenities', {
        pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
            radius: 4, fillColor: '#E67E22', color: '#E67E22', weight: 1, opacity: 0.8, fillOpacity: 0.6
        }),
        onEachFeature: (feature, layer) => {
            if (feature.properties?.name) layer.bindPopup(createAmenityPopup(feature.properties));
        }
    }, layers.amenities);

    await loadLayer('data/metrostation.geojson', 'metro', {
        pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
            radius: 6, fillColor: '#9B59B6', color: '#ffffff', weight: 2, opacity: 1, fillOpacity: 0.9
        }),
        onEachFeature: (feature, layer) => {
            if (feature.properties?.name) layer.bindPopup(createMetroPopup(feature.properties));
        }
    }, layers.metro);
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
            ${props.address ? `<div class="popup-detail"><span>地址:</span> ${props.address}</div>` : ''}
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
    const depthLabels = { shallow: '浅 <10cm', moderate: '中 10-30cm', deep: '深 30-50cm', severe: '严重 >50cm' };
    const situationLabels = { home: '家附近', commute: '通勤路上', work: '工作地点', other: '其他' };

    return `
        <div class="popup-content">
            <div class="popup-header">
                <div class="popup-icon">🌊</div>
                <div>
                    <div class="popup-title">内涝上报 Flood Report</div>
                    <div class="popup-subtitle">${report.date} ${report.time}</div>
                </div>
            </div>
            <div class="popup-detail"><span>深度:</span> ${depthLabels[report.depth]}</div>
            <div class="popup-detail"><span>类型:</span> ${situationLabels[report.situation]}</div>
            ${report.description ? `<div class="popup-detail"><span>描述:</span> ${report.description}</div>` : ''}
        </div>
    `;
}

// ========================================
// Marker Icons
// ========================================

function createFloodIcon(depth) {
    const colors = { shallow: '#85C1E9', moderate: '#3498DB', deep: '#1A5276', severe: '#C0392B' };
    return L.divIcon({
        className: 'flood-marker',
        html: `<div style="
            width: 28px; height: 28px; background: ${colors[depth]};
            border: 3px solid white; border-radius: 50%;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            display: flex; align-items: center; justify-content: center;
            font-size: 14px;">💧</div>`,
        iconSize: [28, 28], iconAnchor: [14, 14]
    });
}

function createTempMarkerIcon() {
    return L.divIcon({
        className: 'temp-marker',
        html: `<div style="
            width: 32px; height: 32px;
            background: linear-gradient(135deg, #E67E22 0%, #C0392B 100%);
            border: 3px solid white; border-radius: 50%;
            box-shadow: 0 4px 15px rgba(0,0,0,0.4);
            animation: pulse 1.5s ease-in-out infinite;"></div>`,
        iconSize: [32, 32], iconAnchor: [16, 16]
    });
}

// ========================================
// Event Handlers
// ========================================

function initializeEventListeners() {
    document.querySelectorAll('.depth-option').forEach(o => o.addEventListener('click', handleDepthSelect));
    document.querySelectorAll('.situation-chip').forEach(c => c.addEventListener('click', handleSituationSelect));
    document.getElementById('eventDate').addEventListener('change', validateForm);
    document.getElementById('eventTime').addEventListener('change', validateForm);
    document.getElementById('reportForm').addEventListener('submit', handleFormSubmit);
    document.querySelectorAll('.layer-item').forEach(item => item.addEventListener('click', handleLayerToggle));
    document.querySelectorAll('.mode-btn').forEach(btn => btn.addEventListener('click', handleModeToggle));
    document.querySelectorAll('.filter-chip').forEach(chip => chip.addEventListener('click', handleFilterChipClick));
    document.getElementById('filterDateFrom').addEventListener('change', filterReports);
    document.getElementById('filterDateTo').addEventListener('change', filterReports);
    document.getElementById('closeInstructions').addEventListener('click', () => {
        document.getElementById('instructions').style.display = 'none';
    });
}

function handleMapClick(e) {
    const latlng = e.latlng;
    if (currentMarker) map.removeLayer(currentMarker);
    currentMarker = L.marker(latlng, { icon: createTempMarkerIcon() }).addTo(map);
    selectedLocation = latlng;
    formState.location = latlng;
    updateLocationDisplay(latlng);
    document.getElementById('instructions').style.display = 'none';
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

async function handleFormSubmit(e) {
    e.preventDefault();
    const report = {
        location: { lat: formState.location.lat, lng: formState.location.lng },
        date: document.getElementById('eventDate').value,
        time: document.getElementById('eventTime').value,
        depth: formState.depth,
        situation: formState.situation,
        description: document.getElementById('locationDesc').value,
        timestamp: new Date().toISOString()
    };
    await saveFloodReport(report);
    await reloadReports();
    showToast();
    resetForm();
}

function handleLayerToggle() {
    const layerName = this.dataset.layer;
    this.classList.toggle('active');

    if (layerName === 'heatmap') {
        toggleHeatmap(map, floodReports, this.classList.contains('active'));
        return;
    }

    if (this.classList.contains('active')) map.addLayer(layers[layerName]);
    else map.removeLayer(layers[layerName]);
}

function handleModeToggle() {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    const mode = this.dataset.mode;
    document.getElementById('reportForm').style.display = mode === 'report' ? 'block' : 'none';
    document.getElementById('reportList').style.display = mode === 'report' ? 'none' : 'block';
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
    const depthLabels = { shallow: '浅', moderate: '中', deep: '深', severe: '严重' };
    container.innerHTML = floodReports.slice().reverse().map((report, index) => `
        <div class="report-item" data-id="${index}">
            <div class="report-header">
                <div class="report-time">${report.date} ${report.time}</div>
                <div class="report-depth-badge badge-${report.depth}">${depthLabels[report.depth]}</div>
            </div>
            <div class="report-location">${report.description || `${report.location.lat.toFixed(4)}, ${report.location.lng.toFixed(4)}`}</div>
        </div>
    `).join('');

    container.querySelectorAll('.report-item').forEach(item => {
        item.addEventListener('click', function() {
            const report = floodReports[parseInt(this.dataset.id)];
            if (report) map.setView([report.location.lat, report.location.lng], 15);
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
    document.getElementById('submitBtn').disabled = !(formState.location && formState.depth && formState.situation && date && time);
}

function setDefaultDateTime() {
    const now = new Date();
    document.getElementById('eventDate').value = now.toISOString().split('T')[0];
    document.getElementById('eventTime').value = now.toTimeString().slice(0, 5);
}

function resetForm() {
    if (currentMarker) { map.removeLayer(currentMarker); currentMarker = null; }
    selectedLocation = null;
    formState = { location: null, depth: null, situation: null };
    document.getElementById('locationDisplay').innerHTML = `
        <div class="location-icon">📍</div>
        <div class="location-placeholder">请在地图上点击选择位置<br>Click on the map to select location</div>
    `;
    document.querySelectorAll('.depth-option').forEach(o => o.classList.remove('selected'));
    document.querySelectorAll('.situation-chip').forEach(c => c.classList.remove('selected'));
    document.getElementById('locationDesc').value = '';
    document.getElementById('submitBtn').disabled = true;
    setDefaultDateTime();
}

// ========================================
// Flood Markers
// ========================================

function addFloodMarker(report) {
    const marker = L.marker([report.location.lat, report.location.lng], { icon: createFloodIcon(report.depth) });
    marker.bindPopup(createFloodPopup(report));
    marker.reportData = report;
    marker.addTo(layers.floods);
}

// ========================================
// Filter Functionality
// ========================================

function filterReports() {
    const depthFilter = document.querySelector('.filter-chip.active')?.dataset.depth || 'all';
    const dateFrom = document.getElementById('filterDateFrom').value;
    const dateTo = document.getElementById('filterDateTo').value;

    layers.floods.clearLayers();

    const filteredReports = [];

    floodReports.forEach(report => {
        let show = true;
        if (depthFilter !== 'all' && report.depth !== depthFilter) show = false;
        if (dateFrom && report.date < dateFrom) show = false;
        if (dateTo && report.date > dateTo) show = false;
        
        if (show) {
            addFloodMarker(report);
            filteredReports.push(report); 
        }
    });

    const heatmapToggle = document.querySelector('.layer-item[data-layer="heatmap"]');
    if (heatmapToggle && heatmapToggle.classList.contains('active')) {
        initializeHeatmap(map, filteredReports);
    }
}

// ========================================
// Firestore Integration
// ========================================

async function reloadReports() {
    floodReports = await loadFloodReports(); 
    layers.floods.clearLayers();
    floodReports.forEach(report => addFloodMarker(report));
    updateStats();
    updateReportList();
    
    const heatmapToggle = document.querySelector('.layer-item[data-layer="heatmap"]');
    if (heatmapToggle && heatmapToggle.classList.contains('active')) {
        initializeHeatmap(map, floodReports);
    }
}
