const fs = require("fs");
const { root, stub, package } = JSON.load(fs.readFileSync("./multi-version.json"));

const ref = "package " + package + ";\n\n" + fs.readFileSync("./MultiVersion/Reflection.java", "utf8");
fs.writeFileSync(root + "/Reflection.java", ref);
