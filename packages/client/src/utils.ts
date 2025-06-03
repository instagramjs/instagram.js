import { Chance } from "chance";

export function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function temporaryGuid(seed: string, lifetimeMs: number) {
  return new Chance(`${seed}${Math.round(Date.now() / lifetimeMs)}`).guid();
}

// Based off the following code from the Instagram Web bundle:
//
// generateOfflineThreadingId()
// function h(a) {
//     a = a != null ? a : Date.now();
//     var b = c("randomInt")(0, 4294967295);
//     b = ("0000000000000000000000" + b.toString(2)).slice(-22);
//     a = a.toString(2) + b;
//     return i(a.slice(-63))
// }
//
// binaryToDecimal()
// function i(a) {
//     var b = "";
//     a = a;
//     while (a != "0") {
//         var c = 0
//           , d = "";
//         for (var e = 0; e < a.length; e++)
//             c = 2 * c + parseInt(a[e], 10),
//             c >= 10 ? (d += "1",
//             c -= 10) : d += "0";
//         b = c.toString() + b;
//         a = d.slice(d.indexOf("1"))
//     }
//     return b
// }

const OFFLINE_THREADING_ID_MAGIC_NUMBER = 4294967295;

export function generateOfflineThreadingId(timestampMs = Date.now()) {
  const int = randInt(0, OFFLINE_THREADING_ID_MAGIC_NUMBER);
  const intBinary = ("0000000000000000000000" + int.toString(2)).slice(-22);
  const timestampBinary = timestampMs.toString(2) + intBinary;

  return binaryToDecimal(timestampBinary.slice(-63));
}

function binaryToDecimal(binaryString: string) {
  let b = "";
  while (binaryString !== "0") {
    let c = 0;
    let d = "";
    for (const e of binaryString) {
      c = 2 * c + parseInt(e, 10);
      if (c >= 10) {
        d += "1";
        c -= 10;
      } else {
        d += "0";
      }
    }
    b = c.toString() + b;
    binaryString = d.slice(d.indexOf("1"));
  }
  return b;
}
