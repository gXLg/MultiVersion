const fs = require("fs");
const { root } = JSON.parse(fs.readFileSync("./multi-version.json"));

console.log("Welcome to MultiVersion!");

/* ------------------------------------------------------------------------------------ */
console.log("Importing Reflection files...");
const projectDir = "src/" + root + "/dev/gxlg/multiversion";
if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir);
fs.writeFileSync(projectDir + "/R.java", fs.readFileSync("./MultiVersion/java/R.java", "utf-8"));
if (!fs.existsSync(projectDir + "/multi-version.mapping")) fs.writeFileSync(projectDir + "/multi-version.mapping", "# MultiVersion mapping, see LibrGetter for reference");
fs.writeFileSync(projectDir + "/V.java", fs.readFileSync("./MultiVersion/java/V.java", "utf-8"));

/* ------------------------------------------------------------------------------------ */
console.log("Importing MultiVersion gradle configuration...");
const gradle = fs.readFileSync("./build.gradle", "utf-8");
const apply = "apply from: './MultiVersion/multi-version.gradle'";
if (!gradle.includes(apply)) {
  fs.writeFileSync("./build.gradle", gradle + "\n\n\n" + apply);
}

/* ------------------------------------------------------------------------------------ */
console.log("You're all set up, enjoy the development!");
