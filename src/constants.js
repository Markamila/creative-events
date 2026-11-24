export const STATUSES = [
  { key: 'new', label: 'Новая' },
  { key: 'in_progress', label: 'В обработке' },
  { key: 'waiting_client', label: 'Ожидает ответа клиента' },
  { key: 'offer_sent', label: 'Коммерческое предложение отправлено' },
  { key: 'waiting_prepayment', label: 'Ожидает предоплату' },
  { key: 'confirmed', label: 'Подтверждена' },
  { key: 'done', label: 'Завершена' },
  { key: 'cancelled', label: 'Отменена' },
];
export const STATUS_KEYS = STATUSES.map((s) => s.key);
export const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.key, s.label]));

export const CONTACT_METHODS = { whatsapp: 'WhatsApp', telegram: 'Telegram', call: 'Звонок' };

export const EVENT_TYPES = [
  'День рождения',
  'Девичник',
  'Корпоратив',
  'Детский праздник',
  'Семейное мероприятие',
  'Дружеская встреча',
  'Другое',
];

export const CATEGORIES = ['Арт-живопись', 'Роспись и декор', 'Handmade'];

export const PRICE_UNITS = {
  per_person: 'за участника',
  per_group: 'за группу',
  custom: 'индивидуальный расчёт',
};
