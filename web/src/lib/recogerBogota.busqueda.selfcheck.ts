/**
 * Run: npx tsx src/lib/recogerBogota.busqueda.selfcheck.ts
 */
import { coincideBusquedaRecoger } from "./recogerBogotaBusqueda";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

const jqx = {
  placa: "JQX32I",
  nombre: "Josnely Naveda",
  cedula: "5950408",
  telefono: "3244266150",
};
const otra = {
  placa: "ABC12D",
  nombre: "Pedro",
  cedula: "111",
  telefono: "3001324567",
};

assert(coincideBusquedaRecoger(jqx, "jqx32i"), "placa con letras");
assert(coincideBusquedaRecoger(jqx, "JQX 32I"), "placa con espacio");
assert(coincideBusquedaRecoger(jqx, "josnely"), "nombre");
assert(!coincideBusquedaRecoger(otra, "jqx32i"), "32 de la placa no pega tel");
assert(coincideBusquedaRecoger(jqx, "3244266150"), "tel completo");
assert(coincideBusquedaRecoger(jqx, "5950408"), "cedula");
assert(!coincideBusquedaRecoger(otra, "32"), "dos dígitos no buscan tel");

console.log("recogerBogota.busqueda.selfcheck ok");
