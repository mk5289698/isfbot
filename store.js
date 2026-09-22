const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'reservations.json');

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

module.exports = { addReservation, getAll, updateReservation };
