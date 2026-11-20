/** Mask an email for display: local part and host both reduced to a stub. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '•••';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const labels = domain.split('.');
  const tld = labels.length > 1 ? `.${labels.pop()}` : '';
  const host = labels.join('.');
  const stub = (s: string) => (s.length <= 2 ? `${s.charAt(0)}***` : `${s.slice(0, 2)}***`);
  return `${stub(local)}@${stub(host)}${tld}`;
}
