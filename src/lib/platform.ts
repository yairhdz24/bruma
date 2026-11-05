/** Which desktop Bruma runs on, and the words that change with it. */
export const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);
export const isWindows = typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);

export const words = isMac ? {
  computer: 'tu Mac',
  thisComputer: 'este Mac',
  paste: '⌘V',
  keyStore: 'en un archivo privado de tu Mac',
  pillPlace: 'sobre el Dock',
} : {
  computer: 'tu PC',
  thisComputer: 'esta PC',
  paste: 'Ctrl+V',
  keyStore: 'en el Administrador de credenciales de Windows',
  pillPlace: 'sobre la barra de tareas',
};
