// Compte les caractères Unicode (points de code), comme le fait Postgres
// `char_length`. À utiliser pour les validations de longueur cohérentes avec la
// base : en JavaScript, `"🍕".length === 2` (unités UTF-16), alors que Postgres
// compte 1. `[...str].length` itère par point de code → même décompte que la BDD.
export function countChars(str: string): number {
  return [...str].length;
}
