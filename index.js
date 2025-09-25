const fs = require("fs");
const build = fs.readFileSync("./build.gradle", "utf-8");

console.log("Welcome to MultiVersion!");
console.log("Step 1: Download this module into the root of your project");
console.log("Step 2: Configure your 'multi-version.json' file");
console.log("Step 3: Add folowing to your 'build.gradle' file:");
console.log(build);
console.log("Step 4: Enjoy developing!");
