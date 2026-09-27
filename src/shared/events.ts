// Kinds of events caretakers put on his timeline, each with a default picture. The family can give a
// kind its own default photo (the real paediatrician's office); one event can still use its own photo.
export const EVENT_TEMPLATES = [
  { id: 'doctor', emoji: '🩺', label: 'Doctor' },
  { id: 'dentist', emoji: '🦷', label: 'Dentist' },
  { id: 'playdate', emoji: '🧸', label: 'Play date' },
  { id: 'birthday', emoji: '🎂', label: 'Birthday' },
  { id: 'haircut', emoji: '💇', label: 'Haircut' },
  { id: 'school_trip', emoji: '🏫', label: 'School trip' },
  { id: 'trip', emoji: '✈️', label: 'Trip' },
  { id: 'other', emoji: '⭐', label: 'Other' },
] as const;

export type EventTemplateId = (typeof EVENT_TEMPLATES)[number]['id'];
export const EVENT_TEMPLATE_IDS = EVENT_TEMPLATES.map((t) => t.id) as EventTemplateId[];
