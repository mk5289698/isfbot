const MelipayamakApi = require('melipayamak-api');
const config = require('./config');

const api = new MelipayamakApi(config.melipayamak.username, config.melipayamak.password);
const sms = api.sms();

function normalizePhone(phone) {
  phone = String(phone).replace(/[^0-9]/g, '');
  if (phone.startsWith('98')) phone = '0' + phone.slice(2);
  return phone;
}

async function sendSms(to, text) {
  const phone = normalizePhone(to);
  return sms.send(phone, config.melipayamak.sender, text);
}

module.exports = { sendSms };
