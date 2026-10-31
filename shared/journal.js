export const methods = ['Not recorded', 'Pour over', 'Espresso', 'French press', 'AeroPress', 'Cold brew', 'Moka pot'];
export const roasts = ['Not recorded', 'Light', 'Medium', 'Dark'];
export const starterCoffees = [
  { id: 'club-korean-coffee', name: 'Korean coffee' },
  { id: 'club-brazilian-coffee', name: 'Brazilian coffee' },
  { id: 'club-iced-biscoff-coffee', name: 'Iced Biscoff spread coffee' },
].map(coffee => ({ ...coffee, method: 'Not recorded', roast: 'Not recorded', date: '', roaster: '', origin: '', tags: '', notes: '' }));