const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const jalaali = require('jalaali-js');

const config = require('./config');
const { sendSms } = require('./sms');
const { addReservation, getAll, updateReservation } = require('./store');

const bot = new TelegramBot(config.telegramBotToken, { polling: true });

// وضعیت مکالمه‌ی هر چت (مرحله فعلی و اطلاعات جمع‌آوری‌شده)
const sessions = {};

// متن دکمه‌های ثابت پایین صفحه
const BUTTON_NEW = '📝 ثبت درخواست جدید';
const BUTTON_LIST = '📋 نمایش رزروها';

const mainKeyboard = {
  reply_markup: {
    keyboard: [[BUTTON_NEW, BUTTON_LIST]],
    resize_keyboard: true
  }
};

function formatReservationLine(r, index) {
  return `${index + 1}. 👤 ${r.name}\n   💼 ${r.service}\n   📅 ${r.datetimeText}\n   📞 ${r.phone}`;
}

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
    'سلام! 👋\nبرای ثبت رزرو جدید روی دکمه‌ی زیر بزنید یا دستور /new را وارد کنید.\n\nآیدی عددی این چت: ' + chatId,
    mainKeyboard
  );
});

bot.onText(/\/new/, (msg) => {
  const chatId = msg.chat.id;
  sessions[chatId] = { step: 'name', data: {} };
  bot.sendMessage(chatId, 'اسم مشتری را وارد کنید:');
});

bot.onText(/\/cancel/, (msg) => {
  const chatId = msg.chat.id;
  resetSession(chatId);
  bot.sendMessage(chatId, 'عملیات لغو شد.', mainKeyboard);
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text) return;

  if (text === BUTTON_NEW) {
    sessions[chatId] = { step: 'name', data: {} };
    bot.sendMessage(chatId, 'اسم مشتری را وارد کنید:');
    return;
  }

  if (text === BUTTON_LIST) {
    const all = getAll();
    if (all.length === 0) {
      bot.sendMessage(chatId, 'هنوز رزروی ثبت نشده.', mainKeyboard);
      return;
    }
    const list = all.map(formatReservationLine).join('\n\n');
    bot.sendMessage(chatId, `📋 لیست رزروهای ثبت‌شده:\n\n${list}`, mainKeyboard);
    return;
  }

  if (text.startsWith('/')) return;

  const session = sessions[chatId];
  if (!session || !session.step) return;

  if (session.step === 'name') {
    session.data.name = text.trim();
    session.step = 'phone';
    bot.sendMessage(chatId, 'شماره تماس مشتری را وارد کنید (مثال: 09121234567):');
    return;
  }

  if (session.step === 'phone') {
    const digitsOnly = text.trim().replace(/[^0-9]/g, '');
    if (!/^0?9\d{9}$/.test(digitsOnly)) {
      bot.sendMessage(chatId, 'شماره معتبر نیست. دوباره وارد کنید (مثال: 09121234567):');
      return;
    }
    session.data.phone = text.trim();
    session.step = 'datetime';
    bot.sendMessage(chatId, 'تاریخ و ساعت رزرو را وارد کنید.\nفرمت: 1403/07/15 16:30');
    return;
  }

  if (session.step === 'datetime') {
    const date = parseJalaliDateTime(text);
    if (!date) {
      bot.sendMessage(chatId, 'فرمت درست نیست. دوباره وارد کنید.\nمثال: 1403/07/15 16:30');
      return;
    }
    if (date.getTime() < Date.now()) {
      bot.sendMessage(chatId, 'این تاریخ گذشته است. دوباره وارد کنید:');
      return;
    }
    session.data.datetime = date;
    session.data.datetimeText = text.trim();
    session.step = 'service';
    bot.sendMessage(chatId, 'نوع خدمت را وارد کنید (مثلا: طراحی بنر تبلیغاتی):');
    return;
  }

  if (session.step === 'service') {
    session.data.service = text.trim();
    session.step = 'confirm';
    const d = session.data;
    bot.sendMessage(
      chatId,
      `تأیید رزرو زیر؟\n\nاسم: ${d.name}\nشماره: ${d.phone}\nتاریخ: ${d.datetimeText}\nخدمت: ${d.service}\n\nبرای تأیید و ارسال پیامک بنویسید: بله\nبرای لغو: /cancel`
    );
    return;
  }

  if (session.step === 'confirm') {
    if (text.trim() === 'بله') {
      const d = session.data;
      const reminderTime = new Date(
        d.datetime.getTime() - config.reminder.hoursBefore * 60 * 60 * 1000
      );

      const reservation = {
        id: Date.now().toString(),
        name: d.name,
        phone: d.phone,
        datetime: d.datetime.toISOString(),
        datetimeText: d.datetimeText,
        service: d.service,
        reminderTime: reminderTime.toISOString(),
        confirmSent: false,
        reminderSent: false,
        telegramChatId: chatId
      };
      addReservation(reservation);

      const [dayPart, hourPart] = d.datetimeText.split(' ');
      const confirmText = `${d.name} عزیز 🎬
رزرو شما برای ${d.service} در تاریخ ${dayPart} از ساعت ${hourPart} با موفقیت انجام شد. ✅

«اصفهان مدیا،همراه شما در دل اصفهان»
لغو11`;

      try {
        await sendSms(d.phone, confirmText);
        updateReservation(reservation.id, { confirmSent: true });
        bot.sendMessage(chatId, '✅ رزرو ثبت شد و پیامک تأیید ارسال شد.', mainKeyboard);
      } catch (err) {
        bot.sendMessage(
          chatId,
          '⚠️ رزرو ذخیره شد اما ارسال پیامک با خطا مواجه شد:\n' + err.message,
          mainKeyboard
        );
      }
      resetSession(chatId);
    } else {
      bot.sendMessage(chatId, 'برای تأیید بنویسید «بله» یا /cancel برای لغو.');
    }
    return;
  }
});

// هر دقیقه بررسی می‌کند که آیا زمان ارسال یادآوری کسی رسیده یا نه
cron.schedule('* * * * *', async () => {
  const now = Date.now();
  const all = getAll();
  for (const r of all) {
    if (r.reminderSent) continue;
    const reminderTime = new Date(r.reminderTime).getTime();
    const appointmentTime = new Date(r.datetime).getTime();
    if (now >= reminderTime && now < appointmentTime) {
      const hourPart = r.datetimeText.split(' ')[1] || '';
      const text = `سلام،
امروز ساعت ${hourPart} برای ${r.service} خدمت میرسیم ${r.name} عزیز🙏🏻🤩

«اصفهان مدیا،همراه شما در دل اصفهان»
لغو11`;
      try {
        await sendSms(r.phone, text);
        updateReservation(r.id, { reminderSent: true });
        if (r.telegramChatId) {
          bot.sendMessage(r.telegramChatId, `⏰ پیامک یادآوری برای ${r.name} ارسال شد.`);
        }
      } catch (err) {
        console.error('خطا در ارسال یادآوری:', err.message);
      }
    }
  }
});

console.log('بات رزرواسیون فعال است...');
