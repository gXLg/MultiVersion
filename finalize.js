const fs = require("fs");
const { root, package } = JSON.parse(fs.readFileSync("./multi-version.json"));

const ref = "package " + package + ";\n\n" + fs.readFileSync("./MultiVersion/Reflection.java", "utf-8");
fs.writeFileSync("prep/" + root + "/Reflection.java", ref);

console.log("Finished processing!");
