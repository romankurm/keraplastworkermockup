import fs from "fs";
const p = "index.html";
let s = fs.readFileSync(p, "utf8");
const nl = s.includes("\r\n") ? "\r\n" : "\n";
const rep = (a, b) => { if (!s.includes(a)) throw new Error("ei leia: " + a.slice(0, 60)); s = s.replace(a, b); };

// loendur elab state-is, mis on olemas enne kui boot() jookseb
rep("        clock: null", "        clock: null," + nl + "        clockRead: 0");

// deklaratsioon kaob, viited state-i peale
rep(
"    let clockRead = 0;" + nl + nl + "    async function readClock(task) {" + nl + "        const seq = ++clockRead;",
"    async function readClock(task) {" + nl + "        const seq = ++state.clockRead;");

s = s.split("if (seq === clockRead)").join("if (seq === state.clockRead)");
s = s.split("if (seq !== clockRead)").join("if (seq !== state.clockRead)");

fs.writeFileSync(p, s);
console.log("ok");
