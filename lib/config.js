export function requireSettings(names) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error('Server settings are incomplete: ' + missing.join(', '));
  }
}
