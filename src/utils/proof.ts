export const studentProof =
  'Student proof: course registration form, acknowledgement slip, or GSU portal dashboard screenshot';
export const staffProof = 'Proof of Staff Status';
export const proofTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

// Only explicit labels: a course list, level, session, or faculty is not a department.
export function extractProofFields(text: string, departments: string[]) {
  const name = text
    .match(
      /^\s*(?:full name|student(?:’s|'s)? name|name of student|name)\s*[:–-]\s*([^\r\n:]{2,100})$/im,
    )?.[1]
    ?.trim();
  const matric = text.match(
    /(?:matric(?:ulation)?|reg(?:istration)?)[.\s]*(?:number|no\.?|id)?\s*[:–-]\s*([a-z\d][a-z\d/-]{2,39})(?=\s|$)/i,
  )?.[1];
  const dept = text
    .match(/^\s*(?:department(?:\/course)?|programme of study)\s*[:–-]\s*([^\r\n:]+)$/im)?.[1]
    ?.trim();
  return {
    name: name && /^[\p{L}][\p{L}'’ .-]+$/u.test(name) ? name : undefined,
    matric,
    department: departments.find((d) => d.toLowerCase() === dept?.toLowerCase()),
  };
}

export function proofFileName(path?: string | null): string {
  if (!path) return '';
  const base = path.split('/').pop() || path;
  const withoutUuid = base.replace(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i,
    ''
  );
  return withoutUuid || base;
}
