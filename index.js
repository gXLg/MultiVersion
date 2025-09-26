const fs = require("fs");
const { root, package } = JSON.parse(fs.readFileSync("./multi-version.json"));

console.log("Welcome to MultiVersion!");

/* ------------------------------------------------------------------------------------ */
console.log("Creating Reflection Stub...");
fs.writeFileSync("src/" + root + "/Reflection.java", "package " + package + ";\n\n" + fs.readFileSync("./MultiVersion/Reflection.java", "utf-8"));

/* ------------------------------------------------------------------------------------ */
console.log("Importing MultiVersion gradle configuration...");
const gradle = fs.readFileSync("./build.gradle", "utf-8");
const apply = "apply from: './MultiVersion/multi-version.gradle'";
if (!gradle.includes(apply)) {
  fs.writeFileSync("./build.gradle", gradle + "\n\n\n" + apply);
}

/* ------------------------------------------------------------------------------------ */
console.log("You're all set up, enjoy the development!");
