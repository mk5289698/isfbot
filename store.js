const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'reservations.json');
const CUSTOMERS_FILE = path.join(__dirname, 'customers.json');

function load() {
  if (!fs.existsSync(DB_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function save(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function addReservation(reservation) {
  const data = load();
  data.push(reservation);
  save(data);
  return reservation;
}

function getAll() {
  return load();
}

function updateReservation(id, updates) {
  const data = load();
  const idx = data.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  data[idx] = { ...data[idx], ...updates };
  save(data);
  return data[idx];
}

// حذف کامل رزروهایی که تاریخ‌شون گذشته
function pruneExpiredReservations(now = Date.now()) {
  const data = load();
  const kept = data.filter((r) => new Date(r.datetime).getTime() >= now);
  if (kept.length !== data.length) save(kept);
  return kept;
}

// --- مشتریان (اسم و شماره به‌صورت دائمی، جدا از رزروها) ---

function loadCustomers() {
  if (!fs.existsSync(CUSTOMERS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(CUSTOMERS_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveCustomers(data) {
  fs.writeFileSync(CUSTOMERS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// اگه شماره از قبل بود، فقط اسم و تاریخ به‌روز میشه؛ وگرنه مشتری جدید اضافه میشه
function upsertCustomer(name, phone) {
  const data = loadCustomers();
  const idx = data.findIndex((c) => c.phone === phone);
  if (idx === -1) {
    data.push({ name, phone, updatedAt: new Date().toISOString() });
  } else {
    data[idx] = { ...data[idx], name, updatedAt: new Date().toISOString() };
  }
  saveCustomers(data);
}

function getAllCustomers() {
  return loadCustomers();
}

module.exports = {
  addReservation,
  getAll,
  updateReservation,
  pruneExpiredReservations,
  upsertCustomer,
  getAllCustomers
};
