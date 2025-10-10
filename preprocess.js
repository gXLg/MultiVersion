const fs = require("fs");
const file = process.argv[2];
const content = fs.readFileSync(file, "utf-8");
const { package } = JSON.parse(fs.readFileSync("./multi-version.json"));

function error(text) {
  throw new Error("MultiVersion error in '" + file + "'\n" + text);
}

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
    const whitespace = lines.slice(-1)[0].split("///")[0];
    const result = ["// auto-generated {"].concat(eval(exec)).join("") + "// }";
    final = final.replace(match[0], result);
}

// wrap reflexion
function version(line) {
  let final = line;
  while (true) {
      const found = final.match(/Reflection\.version[(]"(?:[^"\\]|\\.)*"[)]/g);
      if (!found) break;
      const [cmp, version] = eval(found[0].slice(19, -1)).split(/[ ]+/);
      let l = [];
      for (const c of cmp) {
        const op = {"=": "equals", ">": "higher", "<": "lower"}[c] ?? "equals";
        l.push("Reflection.getVersion()." + op + "(new Reflection.MinecraftVersion(\"" + version + "\"))");
      }
      final = final.replace(found[0], "(" + l.join(" || ") + ")");
  }
  return final;
}

function reflection(line) {
  let final = line;
  while (true) {
      const found = final.match(/Reflection.wrap[(]("(?:[^"\\]|\\.)*")[)]/g);
      if (!found) break;
      const res = transform(eval(found[0].slice(16, -1)));
      final = final.replace(found[0], "(" + res + ")");
  }
  return final;
}

function transform(input) {
  let i = 0;

  function skipWhitespace() {
    while (i < input.length && /\s/.test(input[i])) i++;
  }

  function parseToken(raw) {
    let start = i;
    if (raw) {
      while (i < input.length && input[i] !== "[") i++;
    } else {
      while (i < input.length && !/[\s:/\[\]/]/.test(input[i])) i++;
    }
    return { type: raw ? "string" : "token", value: input.slice(start, i) };
  }

  function parseList() {
    const items = [];
    while (i < input.length && input[i] !== "]" && input[i] !== ":" && !/\s/.test(input[i])) {
      if (input[i] === "/") {
        i++; // skip /
        continue;
      }
      if (input[i] === "[") {
        i++;
        items.push(parseBracket());
        if (input[i] === "]") i++;
        else error("Bracket not closed");
      } else {
        items.push(parseToken());
      }
    }
    return items.length > 1 ? { type: "list", value: items } : items[0];
  }

  function parseBracket() {
    const elements = [];
    while (i < input.length && input[i] !== "]") {
      if (input[i] === "[") {
        i++;
        elements.push(parseBracket());
        if (input[i] === "]") i++;
        else error("Bracket not closed");
      } else if (input[i] === ":") {
        i++;
        const left = elements.pop();
        const right = parseExpression();
        elements.push({ type: "pair", left, right });
      } else {
        const item = parseList();
        elements.push(item);
      }
      skipWhitespace();
    }
    return { type: "bracket", value: elements };
  }

  function parseExpression() {
    let left;
    if (input[i] === "[") {
      i++;
      left = parseBracket();
      if (input[i] === "]") i++;
      else error("Bracket not closed");
    } else {
      left = parseToken();
    }
    return left;
  }

  function init(tree) {
    if (tree.type == "list") {
      let ltype = null;
      for (const { "value": v } of tree.value) {
        if (v.startsWith("method_")) ltype = "method";
        else if (v.includes(".class_")) ltype = "class";
        else if (v.startsWith("field_")) ltype = "field";
        else if (v.startsWith("comp_")) ltype = "component";
        else continue;
        break;
      }
      if (ltype == null) error("List could not be initialized: " + tree.value.map(v => v.value).join(","));
      if (ltype == "class") return { "type": "class", "value": "Reflection.clazz(" + tree.value.map(v => '"' + v.value + '"').join(", ") + ")" };
      return { "type": ltype + "list", "values": tree.value.map(v => v.value) };
    } else if (tree.type == "token") {
      const v = tree.value;
      if (["byte", "short", "int", "long", "float", "double", "char", "boolean"].includes(v) || (v.toUpperCase() != v && /^[A-Z][a-zA-Z0-9_$]+$/.test(v))) {
        return { "type": "class", "value": v + ".class" };
      } else {
        return { "type": "token", "value": v };
      }
    } else if (tree.type == "pair") {
      const left = init(tree.left);
      const right = init(tree.right);
      if (left.type != "class" && left.type != "token") error("Can't initialize typed value: invalid class " + JSON.stringify(left.value));
      if (right.type != "class" && right.type != "token") error("Can't initialize typed value: invalid value " + JSON.stringify(right.value));
      return { "type": "typed", "cls": left.value, "val": right.value }

    } else if (tree.type == "bracket") {
      const v = tree.value.map(init);
      let s = "";

      // method
      if (v[0].type == "typed" && v[1].type == "methodlist" && v.slice(2).every(w => w.type == "typed")) {
        s = "Reflection.invokeMethod(" + v[0].cls + ", " + v[0].val + ", new Object[]{" + v.slice(2).map(w => w.val).join(", ") + "}, new Class[]{" + v.slice(2).map(w => w.cls).join(", ") + "}, " + v[1].values.map(w => '"' + w + '"').join(", ") + ")";

      // field
      } else if (v[0].type == "typed" && v[1].type == "fieldlist" && v.length == 2) {
        s = "Reflection.field(" + v[0].cls + ", " + v[0].val + ", " + v[1].values.map(w => '"' + w + '"').join(", ") + ")";
        
      // set field
      } else if (v[0].type == "typed" && v[1].type == "fieldlist" && (v[2].type == "token" || v[2].type == "class")) {
        s = "Reflection.setField(" + v[0].cls + ", " + v[0].val + ", " + v[2].value + ", " + v[1].values.map(w => '"' + w + '"').join(", ") + ")";

      // component
      } else if (v[0].type == "typed" && v[1].type == "componentlist" && v.length == 2) {
        s = "Reflection.invokeMethod(" + v[0].cls + ", " + v[0].val + ", new Object[]{}, new Class[]{}, " + v[1].values.map(w => '"' + w + '"').join(", ") + ")";

      // class
      } else if (v[0].type == "class" && v.length == 1) {
        s = v[0].value;

      // construct class
      } else if ((v[0].type == "token" || v[0].type == "class") && v.slice(1).every(w => w.type == "typed")) {
        s = "Reflection.construct(" + v[0].value + ", new Object[]{" + v.slice(1).map(w => w.val) + "}, " + v.slice(1).map(w => w.cls).join(", ") + ")";

      } else {
        error("Uknown type of expression: " + v.map(w => w.type).join(", "));
      }
      
      return { "type": "token", "value": s }
    }
  }

  return init(parseBracket()).value;
}

const ref = [];
for (const line of final.split("\n")) {
  let l = line;
  if (line.includes("Reflection.wrap(")) l = reflection(line);
  if (line.includes("Reflection.version(")) l = version(line);
  ref.push(l);
}

fs.writeFileSync(file, ref.join("\n"));
