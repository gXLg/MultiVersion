const fs = require("fs");
const { root, package } = JSON.parse(fs.readFileSync("./multi-version.json"));

console.log("Welcome to MultiVersion!");

/* ------------------------------------------------------------------------------------ */
console.log("Importing Reflection files...");
const projectDir = "src/" + root + "/multiversion";
fs.writeFileSync(projectDir + "/R.java", "package " + package + ".multiversion;\n\n" + fs.readFileSync("./MultiVersion/java/R.java", "utf-8"));
if (!fs.existsSync(projectDir + "/C.java")) fs.writeFileSync(projectDir + "/C.java", "package " + package + ".multiversion;\n\n" + fs.readFileSync("./MultiVersion/java/C.java", "utf-8"));
fs.writeFileSync(projectDir + "/V.java", "package " + package + ".multiversion;\n\n" + fs.readFileSync("./MultiVersion/java/V.java", "utf-8"));

/* ------------------------------------------------------------------------------------ */
console.log("Importing MultiVersion gradle configuration...");
const gradle = fs.readFileSync("./build.gradle", "utf-8");
const apply = "apply from: './MultiVersion/multi-version.gradle'";
if (!gradle.includes(apply)) {
  fs.writeFileSync("./build.gradle", gradle + "\n\n\n" + apply);
}

/* ------------------------------------------------------------------------------------ */
console.log("You're all set up, enjoy the development!");
