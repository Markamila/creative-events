import { CONTACT_METHODS } from './constants.js';

const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max) : '');

/**
 * Проверка и нормализация заявки.
 * Возвращает { errors, data }. errors — объект поле → сообщение.
 */
export function validateRequest(body, validPackageCodes) {
  const errors = {};
  const b = body && typeof body === 'object' ? body : {};

  const name = str(b.name, 80);
  if (name.length < 2) errors.name = 'Укажите имя';

  const phoneRaw = str(b.phone, 30);
  const digits = phoneRaw.replace(/\D/g, '');
  if (!/^[\d+\-()\s]+$/.test(phoneRaw) || digits.length < 10 || digits.length > 15) {
    errors.phone = 'Укажите корректный номер телефона';
  }

  const contact_method = str(b.contact_method, 20);
  if (!CONTACT_METHODS[contact_method]) errors.contact_method = 'Выберите способ связи';

  const event_date = str(b.event_date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event_date) || Number.isNaN(Date.parse(event_date))) {
    errors.event_date = 'Выберите дату мероприятия';
  } else {
    const d = new Date(event_date + 'T00:00:00Z').getTime();
    const now = Date.now();
    if (d < now - 2 * 86400000) errors.event_date = 'Дата не может быть в прошлом';
    else if (d > now + 3 * 365 * 86400000) errors.event_date = 'Слишком далёкая дата';
  }

  const event_time = str(b.event_time, 5);
  if (event_time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(event_time)) errors.event_time = 'Некорректное время';

  const participants = Number.parseInt(b.participants, 10);
  if (!Number.isInteger(participants) || participants < 1 || participants > 500) {
    errors.participants = 'Укажите количество участников (от 1 до 500)';
  }

  const event_type = str(b.event_type, 60);
  if (!event_type) errors.event_type = 'Выберите формат мероприятия';

  let services = [];
  if (Array.isArray(b.services)) {
    services = [...new Set(b.services.map((s) => str(s, 120)).filter(Boolean))].slice(0, 30);
  }

  const pkg = str(b.package, 30) || 'UNDECIDED';
  if (pkg !== 'UNDECIDED' && !validPackageCodes.includes(pkg)) errors.package = 'Выберите пакет';

  const wishes = str(b.wishes, 2000);

  if (b.consent !== true) errors.consent = 'Необходимо согласие на обработку персональных данных';

  return {
    errors,
    data: { name, phone: phoneRaw, contact_method, event_date, event_time, participants, event_type, services, package: pkg, wishes },
  };
}
