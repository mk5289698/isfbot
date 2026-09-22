const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const jalaali = require('jalaali-js');

const config = require('./config');
const { sendSms } = require('./sms');
const { addReservation, getAll, updateReservation } = require('./store');

const bot = new TelegramBot(config.telegramBotToken, { polling: true });

// وضعیت مکالمه‌ی هر چت (مرحله فعلی و اطلاعات جمعآوریشده)
const sessions = {};

function resetSession(chatId) {
  sessions[chatId] = { step: null, data: {} };
}

function jalaliToGregorianDate(jy, jm, jd, hh, mm) {
  const g = jalaali.toGregorian(jy, jm, jd);
  return new Date(g.gy, g.gm - 1, g.gd, hh, mm, 0);
}

// فرمت ورودی مورد انتظار: 1403/07/15 16:30  (تاریخ شمسی)
function parseJalaliDateTime(text) {
  const match = text.trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const jy = Number(match[1]);
  const jm = Number(match[2]);
  const jd = Number(match[3]);
  const hh = Number(match[4]);
  const mm = Number(match[5]);
  try {
    const date = jalaliToGregorianDate(jy, jm, jd, hh, mm);
    if (isNaN(date.getTime())) return null;
    return date;
  } catch (e) {
    return null;
  }
}

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  resetSession(chatId);
  bot.sendMessage(
    chatId,
