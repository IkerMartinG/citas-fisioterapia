import { randomInt } from "node:crypto";

// Sin 0/O ni 1/I, para que se pueda dictar por teléfono sin confusiones.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function reservationCode(length = 6) {
  let code = "";
  for (let i = 0; i < length; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}
