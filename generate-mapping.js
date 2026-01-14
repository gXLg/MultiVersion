const fs = require("fs");
const { root } = JSON.parse(fs.readFileSync("./multi-version.json", "utf-8"));
const file = fs.readFileSync("src/" + root + "/dev/gxlg/multiversion/multi-version.mapping", "utf-8").trim();

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

const lines = file.split("\n").filter(l => !l.startsWith("#") && l.trim().length);
const classes = [];
const additionalClasses = [];
processPart(classes, lines);

if (!classes.length) {
  console.log("Nothing to generate!");
  process.exit(0);
}

// fileName: content
const processedClasses = {};

function parseType(type) {
  let arrayDimension = 0;
  while (type.endsWith("[]")) {
    arrayDimension ++;
    type = type.slice(0, -2);
  }

  let finalType;
  let castLeft;
  let castRight;
  let classGetter;
  let returnStatement;
  if (type.includes("/") || type.startsWith("!")) {
    if (arrayDimension > 0) {
      console.log("Can't use Arrays with Wrapper classes!");
      process.exit(1);
    }

    if (type.startsWith("!")) {
      type = type.slice(1);
    }
    additionalClasses.push({ "parent": type, "children": [] });
    finalType = "dev.gxlg.multiversion.gen." + type.split("/").slice(-1)[0] + "Wrapper";
    castLeft = finalType + ".inst(";
    castRight = ")";
    classGetter = "clazz";
    returnStatement = "return ";
  } else {
    finalType = type;
    castLeft = (type === "Object" || type === "void") ? "" : "(" + type + ") ";
    castRight = "";
    classGetter = "class";
    returnStatement = type === "void" ? "" : "return ";
    finalType += "[]".repeat(arrayDimension);
  }

  return { finalType, castLeft, castRight, classGetter, returnStatement };
}

function isClass(line) {
  return line.includes(" extends ") || (!line.endsWith(")") && line.split(" ").length === 1);
}

function processClass(clazz) {
  const { parent, children } = clazz;

  const [currentClass, extendingClass] = parent.includes(" extends ") ? parent.split(" extends ") : [parent, null];
  let extending = null;
  if (extendingClass != null) {
    const { finalType, classGetter } = parseType(extendingClass);
    if (classGetter != "clazz") {
      console.log("Wrapper class can only extend other Wrapper classes!");
      process.exit(1);
    }
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

  const instanceMethodSignatures = { "unwrap()": 1, "unwrap(Class)": 1, "downcast(Class)": 1, "isNull()": 1 };
  const staticMethodSignatures = { "inst(Object)": 1 };

  function getIndexedMethodName(methodName, signature, isStatic) {
    const signatureLookup = isStatic ? staticMethodSignatures : instanceMethodSignatures;
    if (signature in signatureLookup) {
      const id = signatureLookup[signature] + 1;
      signatureLookup[signature] = id;
      return methodName + id.toString();
    } else {
      signatureLookup[signature] = 1;
      return methodName;
    }
  }

  for (const child of children) {
    const line = child.parent;
    if (isClass(line)) {
      processClass(child);
      continue;
    }

    const isStatic = line.startsWith("static ");

    if (!line.endsWith(")")) {
      // then it's a field!
      const names = line.split(" ").slice(-1)[0];
      const pubName = names.split("/").slice(-1)[0];

      const returnType = line.split(" ")[isStatic ? 1 : 0];
      const { finalType, castLeft, castRight } = parseType(returnType);

      if (isStatic) {
        const finalFieldName = getIndexedMethodName(pubName, pubName + "()", true);
        staticMethods.push(
`    public static ${finalType} ${finalFieldName}() {
        return ${castLeft}clazz.fld("${names}").get()${castRight};
    }
`
        );
      } else {
        instanceFields.push(`    private final R.RField ${pubName};`);
        instanceFieldsInits.push(`        this.${pubName} = this.instance.fld("${names}");`);
        const capName = pubName.slice(0, 1).toUpperCase() + pubName.slice(1);

        const finalGetterName = getIndexedMethodName("get" + capName, "get" + capName + "()", true);
        const finalSetterName = getIndexedMethodName("set" + capName, "set" + capName + "(" + finalType + ")", true);

        instanceMethods.push(
`    public ${finalType} ${finalGetterName}() {
        return ${castLeft}this.${pubName}.get()${castRight};
    }

    public void ${finalSetterName}(${finalType} value) {
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
    const signatureTypes = [];
    for (const [type, name] of args) {
      const { finalType, classGetter } = parseType(type);
      finalArgs.push(finalType + " " + name);
      finalTypes.push(finalType + "." + classGetter);
      signatureTypes.push(finalType);
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
    const signature = fileMethodName + "(" + signatureTypes.join(",") + ")";
    const finalMethodName = getIndexedMethodName(fileMethodName, signature, isStatic);

    (isStatic ? staticMethods : instanceMethods).push(
`    public ${isStatic ? "static " : ""}${finalType} ${finalMethodName}(${finalArgs.join(", ")}) {
        ${returnStatement}${castLeft}${isStatic ? "clazz" : "instance"}.mthd("${methodNames}"${finalTypes.map(t => ", " + t).join("")}).invk(${finalNames.join(", ")})${castRight};
    }`
    );
  }

  const className = fileName.split("/").slice(-1)[0];
  processedClasses[fileName] = `package dev.gxlg.multiversion.gen.${fileName.split("/").slice(0, -1).join(".")};

import dev.gxlg.multiversion.R;

public class ${className} extends ${extending ?? "R.RWrapper<" + className + ">"} {
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
`.replace(/\n\n+/g, "\n\n").replace(/\n+([ ]*\})/g, "\n$1");

}

while (classes.length) {
  processClass(classes.shift());
}
while (additionalClasses.length) {
  processClass(additionalClasses.shift());
}

const genRoot = "src/" + root + "/dev/gxlg/multiversion/gen";
if (fs.existsSync(genRoot)) {
  fs.rmSync(genRoot, { "recursive": true });
}
for (const fileName in processedClasses) {
  const folder = fileName.split("/").slice(0, -1).join("/");
  fs.mkdirSync(genRoot + "/" + folder, { "recursive": true });
  fs.writeFileSync(genRoot + "/" + fileName + ".java", processedClasses[fileName]);
  console.log("Generated", fileName);
}

console.log("Done!");
