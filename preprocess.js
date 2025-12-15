const fs = require("fs");
const file = process.argv[2];
const content = fs.readFileSync(file, "utf-8");

// wrap executors
let final = content;
for (const match of content.matchAll(/\/\/\/[ ]*<%(.*?)\/\/\/[ ]*%>/gms)) {
    const lines = match[1].split("\n");
    const codel = [];
    const execl = [];
    for (const line of lines) {
        if (line.trim().startsWith("///")) execl.push(line.split("///")[1].trim());
        else codel.push(line);
    }
    const code = codel.join("\n");
    const exec = execl.join("");
    const result = ["// auto-generated {"].concat(eval(exec)).join("") + "// }";
    final = final.replace(match[0], result);
}
fs.writeFileSync(file, final);
