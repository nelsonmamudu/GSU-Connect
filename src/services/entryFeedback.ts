// Auth may navigate away while the post-signup upload is still in flight.
const messages = new Map<string, string>();
export function reportEntryIssue(uid: string, message: string) {
  messages.set(uid, message);
  window.dispatchEvent(new CustomEvent('entry-feedback', { detail: uid }));
}
export function takeEntryIssue(uid: string) {
  const message = messages.get(uid);
  messages.delete(uid);
  return message;
}
