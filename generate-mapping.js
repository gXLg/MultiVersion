const fs = require("fs");
const { root, package } = JSON.parse(fs.readFileSync("./multi-version.json", "utf-8"));
const finalPackage = package + ".multiversion.gen";
const file = fs.readFileSync("src/" + root + "/multiversion/multi-version.mapping", "utf-8").trim();

if (file === "") {
  console.log("Nothing to generate!");
  process.exit(0);
}

function whitespace(line) {
  const tline = line.trimStart();
  return [line.length - tline.length, tline];
}

function processPart(children, lines, start=0) {
  while (lines.length) {
    const [ws, parent] = whitespace(lines[0]);
    if (ws < start) {
      return;
    } else if (ws == start) {
      children.push({ parent, "children": [] });
      lines.shift();
    } else if (ws > start) {
      const parent = children.slice(-1)[0];
      processPart(parent.children, lines, ws);
    }
  }
}

const lines = file.split("\n").filter(l => !l.startsWith("#") && l.length);
const classes = [];
processPart(classes, lines);

// fileName: content
const processedClasses = {};

function parseType(type) {
  let finalType;
  let castLeft;
  let castRight;
  let classGetter;
  let returnStatement;
  if (type.includes("/")) {
    classes.push({ "parent": type, "children": [] });
    finalType = finalPackage + "." + type.split("/").slice(-1)[0] + "Wrapper";
    castLeft = finalType + ".inst(";
    castRight = ")";
    classGetter = "clazz";
    returnStatement = "return ";
  } else {
    finalType = type;
    castLeft = (type === "Object" || type === "void") ? "" : "(" + type + ") ";
    castRight = "";
    classGetter = "class";
    returnStatement = type === "void" ? "" : "return "
  }
  return { finalType, castLeft, castRight, classGetter, returnStatement };
}

function processClass(clazz) {
  const { parent, children } = clazz;

  const [currentClass, extendingClass] = parent.includes(" extends ") ? parent.split(" extends ") : [parent, null];
  let extending = null;
  if (extendingClass != null) {
    const { finalType } = parseType(extendingClass);
    extending = finalType;
  }

  const classNames = currentClass.split("/");
  const fileName = classNames.slice(-1)[0].replaceAll(".", "/") + "Wrapper";
  if (fileName in processedClasses) {
    return;
  }

  const instanceMethods = [];
  const staticMethods = [];
  const instanceFields = [];
  const instanceFieldsInits = [];
  const constructors = [];

  for (const child of children) {
    if (child.children.length) {
      processClass(child);
      continue;
    }
    const line = child.parent;

    const isStatic = line.startsWith("static ");

    if (!line.endsWith(")")) {
      // then it's a field!
      const names = line.split(" ").slice(-1)[0];
      const pubName = names.split("/").slice(-1)[0];

      const returnType = line.split(" ")[isStatic ? 1 : 0];
      const { finalType, castLeft, castRight } = parseType(returnType);

      if (isStatic) {
        staticMethods.push(
`    public static ${finalType} ${pubName}() {
        return ${castLeft}clazz.fld("${names}").get()${castRight};
    }
`
        );
      } else {
        instanceFields.push(`    private final R.RField ${pubName};`);
        instanceFieldsInits.push(`        this.${pubName} = this.instance.fld("${names}");`);
        const capName = pubName.slice(0, 1).toUpperCase() + pubName.slice(1);
        instanceMethods.push(
`    public ${finalType} get${capName}() {
        return ${castLeft}this.${pubName}.get()${castRight};
    }

    public void set${capName}(${finalType} value) {
        this.${pubName}.set(value);
    }`
        );
      }
      continue;
    }

    const rawArgs = line.split("(")[1].split(")")[0];
    const args = rawArgs === "" ? [] : rawArgs.split(", ").map(a => a.split(" "));
    const finalArgs = [];
    const finalTypes = [];
    const finalNames = [];
    for (const [type, name] of args) {
      const { finalType, classGetter } = parseType(type);
      finalArgs.push(finalType + " " + name);
      finalTypes.push(finalType + "." + classGetter);
      finalNames.push(name + (classGetter == "clazz" ? ".unwrap()" : ""));
    }

    if (line.startsWith("<init>")) {
      // then it's a constructor!
      constructors.push(
`    public <init>(${finalArgs.join(", ")}) {
        this(clazz.constr(${finalTypes.join(", ")}).newInst(${finalNames.join(", ")}).self());
    }`
      );

      continue;
    }

    const returnType = line.split(" ")[isStatic ? 1 : 0];
    const { finalType, castLeft, castRight, returnStatement } = parseType(returnType);

    const methodNames = line.split("(")[0].split(" ").slice(-1)[0];
    const fileMethodName = methodNames.split("/").slice(-1)[0];

    (isStatic ? staticMethods : instanceMethods).push(
`    public ${isStatic ? "static " : ""}${finalType} ${fileMethodName}(${finalArgs.join(", ")}) {
         ${returnStatement}${castLeft}${isStatic ? "clazz" : "instance"}.mthd("${methodNames}"${finalTypes.map(t => ", " + t).join("")}).invk(${finalNames.join(", ")})${castRight};
    }`
    );
  }

  const className = fileName.split("/").slice(-1)[0];
  processedClasses[fileName] = `package ${finalPackage}.${fileName.split("/").slice(0, -1).join(".")};

import ${package}.multiversion.R;

public class ${className} extends ${extending ?? "R.RWrapper"} {
    public static final R.RClass clazz = R.clz("${currentClass}");

${instanceFields.join("\n\n")}

${constructors.map(c => c.replace("<init>", className)).join("\n\n")}

    protected ${className}(Object instance) {
        super(${extending ? "instance" : "clazz.inst(instance)"});
${instanceFieldsInits.join("\n")}
    }

${instanceMethods.join("\n\n")}

    public static ${className} inst(Object instance) {
        return new ${className}(instance);
    }

${staticMethods.join("\n\n")}
}
`.replace(/\n\n+/g, "\n\n").replace(/\n*([ ]*\})/g, "\n$1");

}

while (classes.length) {
  processClass(classes.shift());
}

const genRoot = "src/" + root + "/multiversion/gen";
if (fs.existsSync(genRoot)) {
  fs.rmSync(genRoot, { "recursive": true });
}
for (const fileName in processedClasses) {
  const folder = fileName.split("/").slice(0, -1).join("/");
  fs.mkdirSync(genRoot + "/" + folder, { "recursive": true });
  const className = fileName.split("/").slice(-1)[0];
  fs.writeFileSync(genRoot + "/" + fileName + ".java", processedClasses[fileName]);
  console.log("Generated", className);
}

console.log("Done!");
